export function normalizeJavaScriptCallsite(stack) {
  const locations = [];
  for (const line of String(stack ?? "").split("\n")) {
    if (!line.includes("at ") || line.includes("<anonymous>")) continue;
    const location = line.match(
      /https?:\/\/[^/\s)]+(\/[^?\s):]+)(?:\?[^\s)]*)?:(\d+):(\d+)/,
    );
    if (location === null) continue;
    locations.push(`${location[1]}:${location[2]}:${location[3]}`);
  }
  return (
    locations.find((location) => !location.includes("/node_modules/")) ??
    locations[0] ??
    null
  );
}

export function selectBufferSampleLimit(
  label,
  defaultBytes = 128,
  criticalBytes = 32_768,
  criticalPattern = "(?:particle|light|render|frame|cascade)",
) {
  let pattern;
  try {
    pattern = new RegExp(criticalPattern, "i");
  } catch {
    pattern = /(?:particle|light|render|frame|cascade)/i;
  }
  return pattern.test(String(label ?? ""))
    ? Number(criticalBytes)
    : Number(defaultBytes);
}

export function updateCpuBufferSnapshot(
  snapshot,
  bufferSize,
  bufferOffset,
  data,
  maximumBytes = 32_768,
) {
  const size = Math.max(0, Number(bufferSize) || 0);
  if (size === 0 || size > Math.max(0, Number(maximumBytes) || 0)) return null;
  let source;
  try {
    source = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
  } catch {
    return snapshot ?? null;
  }
  const bytes =
    snapshot?.bytes?.byteLength === size
      ? snapshot.bytes
      : new Uint8Array(size);
  const start = Math.max(0, Math.min(size, Number(bufferOffset) || 0));
  const copiedBytes = Math.min(source.byteLength, size - start);
  if (copiedBytes <= 0) return snapshot ?? null;
  bytes.set(source.subarray(0, copiedBytes), start);
  const ranges = [
    ...(snapshot?.ranges ?? []).map(({ offset, size: rangeSize }) => [
      Number(offset),
      Number(offset) + Number(rangeSize),
    ]),
    [start, start + copiedBytes],
  ]
    .sort(([first], [second]) => first - second)
    .reduce((merged, range) => {
      const previous = merged.at(-1);
      if (previous === undefined || range[0] > previous[1]) {
        merged.push([...range]);
      } else {
        previous[1] = Math.max(previous[1], range[1]);
      }
      return merged;
    }, [])
    .map(([offset, end]) => ({ offset, size: end - offset }));
  const coveredBytes = ranges.reduce(
    (total, range) => total + range.size,
    0,
  );
  return {
    bytes,
    coveredBytes,
    coverageComplete: coveredBytes === size,
    ranges,
  };
}

export function compareCpuGpuBufferSnapshots(
  cpuSnapshot,
  gpuData,
  probeRanges,
  contracts = [],
) {
  if (cpuSnapshot?.bytes === undefined) return null;
  const cpuBytes = cpuSnapshot.bytes;
  const gpuBytes = ArrayBuffer.isView(gpuData)
    ? new Uint8Array(gpuData.buffer, gpuData.byteOffset, gpuData.byteLength)
    : new Uint8Array(gpuData);
  const coverage = cpuSnapshot.ranges ?? [];
  const isCovered = (offset, size = 1) =>
    coverage.some(
      (range) =>
        offset >= range.offset &&
        offset + size <= range.offset + range.size,
    );
  let changedBytes = 0;
  let comparedBytes = 0;
  let comparedValues = 0;
  let changedValues = 0;
  let totalAbsoluteDifference = 0;
  let maximumAbsoluteDifference = 0;
  const changedOffsets = [];
  const cpuView = new DataView(
    cpuBytes.buffer,
    cpuBytes.byteOffset,
    cpuBytes.byteLength,
  );
  const gpuView = new DataView(
    gpuBytes.buffer,
    gpuBytes.byteOffset,
    gpuBytes.byteLength,
  );
  for (const range of probeRanges ?? []) {
    const sourceStart = Number(range.sourceOffset ?? 0);
    const destinationStart = Number(range.destinationOffset ?? 0);
    const size = Math.min(
      Number(range.size ?? 0),
      cpuBytes.byteLength - sourceStart,
      gpuBytes.byteLength - destinationStart,
    );
    for (let index = 0; index < size; index += 1) {
      const sourceOffset = sourceStart + index;
      if (!isCovered(sourceOffset)) continue;
      comparedBytes += 1;
      if (cpuBytes[sourceOffset] !== gpuBytes[destinationStart + index]) {
        changedBytes += 1;
      }
    }
    for (let index = 0; index + 4 <= size; index += 4) {
      const sourceOffset = sourceStart + index;
      if (sourceOffset % 4 !== 0 || !isCovered(sourceOffset, 4)) continue;
      const cpuValue = cpuView.getFloat32(sourceOffset, true);
      const gpuValue = gpuView.getFloat32(destinationStart + index, true);
      if (!Number.isFinite(cpuValue) || !Number.isFinite(gpuValue)) continue;
      comparedValues += 1;
      const difference = Math.abs(gpuValue - cpuValue);
      totalAbsoluteDifference += difference;
      maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, difference);
      if (difference > 1e-6) {
        changedValues += 1;
        changedOffsets.push(sourceOffset);
      }
    }
  }
  const round = (value) => Number(value.toFixed(6));
  const strides = [
    ...new Set(
      contracts
        .map(({ stride }) => Number(stride))
        .filter((stride) => Number.isSafeInteger(stride) && stride > 0),
    ),
  ];
  return {
    changedByteFraction:
      comparedBytes === 0 ? 0 : round(changedBytes / comparedBytes),
    changedBytes,
    comparedBytes,
    float32: {
      changedOffsets,
      changedValues,
      comparedValues,
      maximumAbsoluteDifference: round(maximumAbsoluteDifference),
      meanAbsoluteDifference:
        comparedValues === 0
          ? 0
          : round(totalAbsoluteDifference / comparedValues),
    },
    recordChanges: strides.map((stride) => ({
      changedRecordIndices: [
        ...new Set(changedOffsets.map((offset) => Math.floor(offset / stride))),
      ],
      stride,
    })),
  };
}

export function attributeGpuBufferDependencies(
  commands,
  latestGpuWrites = new Map(),
) {
  for (const command of commands) {
    const writtenBufferIds = new Set();
    for (const binding of command.resourceBindings ?? []) {
      if (binding.resource?.kind !== "buffer") continue;
      const bufferId = binding.resource.bufferId;
      binding.latestGpuWriteCommandSequence =
        latestGpuWrites.get(bufferId) ?? null;
      binding.writesGpuBuffer = (binding.shaderBindings ?? []).some(
        ({ addressSpace }) =>
          /\bstorage\b.*\bread_write\b/.test(String(addressSpace)),
      );
      if (binding.writesGpuBuffer) writtenBufferIds.add(bufferId);
    }
    for (const bufferId of writtenBufferIds) {
      latestGpuWrites.set(bufferId, command.sequence);
    }
  }
  return latestGpuWrites;
}

export function decodeWgslBufferLayout(
  data,
  probeRanges,
  layout,
  maximumArrayRecords = 64,
) {
  if (layout?.members === undefined) return null;
  const decodeValue = (view, offset, type) => {
    const compact = String(type).replace(/\s+/g, "");
    const scalar = compact.match(/^(f32|i32|u32)$/);
    const vector = compact.match(/^vec([234])(?:<([^>]+)>|([fiu]))$/);
    const matrix = compact.match(/^mat([234])x([234])(?:<([^>]+)>|([f]))$/);
    const componentType =
      scalar?.[1] ??
      vector?.[2] ??
      ({ f: "f32", i: "i32", u: "u32" })[vector?.[3]] ??
      matrix?.[3] ??
      ({ f: "f32" })[matrix?.[4]];
    if (componentType === undefined) return undefined;
    const componentCount = scalar !== null
      ? 1
      : vector !== null
        ? Number(vector[1])
        : Number(matrix[1]) * Number(matrix[2]);
    const read = (byteOffset) => {
      if (componentType === "i32") return view.getInt32(byteOffset, true);
      if (componentType === "u32") return view.getUint32(byteOffset, true);
      const value = view.getFloat32(byteOffset, true);
      return Number.isFinite(value) ? Number(value.toFixed(6)) : String(value);
    };
    const values = Array.from(
      { length: componentCount },
      (_, index) => read(offset + index * 4),
    );
    return componentCount === 1 ? values[0] : values;
  };
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const elementCount = Math.max(1, Number(layout.elementCount ?? 1));
  const limit = Math.max(1, Number(maximumArrayRecords) || 64);
  const selectedIndices = elementCount <= limit
    ? Array.from({ length: elementCount }, (_, index) => index)
    : [
        ...Array.from({ length: Math.ceil(limit / 2) }, (_, index) => index),
        ...Array.from(
          { length: Math.floor(limit / 2) },
          (_, index) => elementCount - Math.floor(limit / 2) + index,
        ),
      ];
  const sourceToDestination = (sourceOffset, size) => {
    const range = (probeRanges ?? []).find(
      (candidate) =>
        sourceOffset >= Number(candidate.sourceOffset ?? 0) &&
        sourceOffset + size <=
          Number(candidate.sourceOffset ?? 0) + Number(candidate.size ?? 0),
    );
    if (range === undefined) return null;
    return (
      Number(range.destinationOffset ?? 0) +
      sourceOffset -
      Number(range.sourceOffset ?? 0)
    );
  };
  const records = [];
  for (const index of selectedIndices) {
    const values = {};
    for (const member of layout.members) {
      const sourceOffset = index * Number(layout.stride) + Number(member.offset);
      const destinationOffset = sourceToDestination(sourceOffset, member.size);
      if (destinationOffset === null) continue;
      const value = decodeValue(view, destinationOffset, member.type);
      if (value !== undefined) values[member.name] = value;
    }
    if (Object.keys(values).length > 0) records.push({ index, values });
  }
  return {
    decodedRecordCount: records.length,
    elementCount,
    records,
    truncated: records.length < elementCount,
  };
}

export function groupWgslBufferLayoutBindings(bindings) {
  const groups = new Map();
  for (const binding of bindings ?? []) {
    if (binding.layout?.members === undefined) continue;
    const key = JSON.stringify({ layout: binding.layout, type: binding.type });
    const existing = groups.get(key) ?? {
      bindingNames: new Set(),
      layout: binding.layout,
      stages: new Set(),
      type: binding.type,
    };
    existing.bindingNames.add(binding.name);
    existing.stages.add(binding.stage);
    groups.set(key, existing);
  }
  return [...groups.values()].map((group) => ({
    bindingNames: [...group.bindingNames].filter(Boolean).sort(),
    layout: group.layout,
    stages: [...group.stages].filter(Boolean).sort(),
    type: group.type,
  }));
}

export function describeWgslBindingLayout(
  type,
  structureLayouts,
  addressSpace = "",
  includeMembers = false,
) {
  const layoutByName = new Map(
    (structureLayouts ?? [])
      .filter(({ supported }) => supported === true)
      .map((layout) => [layout.name, layout]),
  );
  const compact = String(type).replace(/\s+/g, "");
  const array = compact.match(/^array<([A-Za-z_]\w*),(\d+)>$/);
  const structureName = array?.[1] ?? compact;
  const structure = layoutByName.get(structureName);
  if (structure === undefined) return null;
  const elementCount = array === null ? 1 : Number(array[2]);
  const requiredAlignment = String(addressSpace).startsWith("uniform")
    ? Math.max(16, structure.alignment)
    : structure.alignment;
  const stride =
    Math.ceil(structure.size / requiredAlignment) * requiredAlignment;
  return {
    byteSize: stride * elementCount,
    elementCount,
    kind: array === null ? "struct" : "array",
    ...(includeMembers ? { members: structure.members } : {}),
    stride,
    structureName,
    structureSize: structure.size,
  };
}

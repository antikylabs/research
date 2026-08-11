import { describeWgslBindingLayout } from "./webgpu-buffer-analysis.mjs";

export * from "./webgpu-buffer-analysis.mjs";

export function calculateWgslStructureLayouts(structures) {
  const roundUp = (alignment, value) =>
    Math.ceil(value / alignment) * alignment;
  const structureByName = new Map(
    structures.map((structure) => [structure.name, structure]),
  );
  const layouts = new Map();

  const splitArrayArguments = (value) => {
    let depth = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === "<") depth += 1;
      else if (value[index] === ">") depth -= 1;
      else if (value[index] === "," && depth === 0) {
        return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
      }
    }
    return [value.trim(), null];
  };
  const scalarLayout = (type) => {
    if (["f32", "i32", "u32"].includes(type)) {
      return { alignment: 4, size: 4 };
    }
    if (type === "f16") return { alignment: 2, size: 2 };
    return null;
  };
  const scalarFromSuffix = (suffix) =>
    ({ f: "f32", h: "f16", i: "i32", u: "u32" })[suffix] ?? null;

  const resolveType = (type, stack) => {
    const compact = String(type).replace(/\s+/g, "");
    const scalar = scalarLayout(compact);
    if (scalar !== null) return scalar;

    const vector = compact.match(/^vec([234])(?:<([^>]+)>|([fhiu]))$/);
    if (vector !== null) {
      const width = Number(vector[1]);
      const component = scalarLayout(vector[2] ?? scalarFromSuffix(vector[3]));
      if (component === null) return null;
      return {
        alignment: (width === 2 ? 2 : 4) * component.alignment,
        size: width * component.size,
      };
    }

    const matrix = compact.match(/^mat([234])x([234])(?:<([^>]+)>|([fh]))$/);
    if (matrix !== null) {
      const columns = Number(matrix[1]);
      const rows = Number(matrix[2]);
      const component = scalarLayout(matrix[3] ?? scalarFromSuffix(matrix[4]));
      if (component === null) return null;
      const columnAlignment = (rows === 2 ? 2 : 4) * component.alignment;
      const columnSize = rows * component.size;
      const stride = roundUp(columnAlignment, columnSize);
      return {
        alignment: columnAlignment,
        size: stride * (columns - 1) + columnSize,
      };
    }

    if (compact.startsWith("array<") && compact.endsWith(">")) {
      const [elementType, countText] = splitArrayArguments(
        compact.slice(6, -1),
      );
      const count = Number(countText);
      const element = resolveType(elementType, stack);
      if (
        element === null ||
        countText === null ||
        !Number.isSafeInteger(count) ||
        count < 0
      ) {
        return null;
      }
      const alignment = roundUp(16, element.alignment);
      return {
        alignment,
        size: roundUp(alignment, element.size) * count,
      };
    }

    if (!structureByName.has(compact) || stack.has(compact)) return null;
    const nested = resolveStructure(compact, new Set([...stack, compact]));
    return nested.supported
      ? { alignment: nested.alignment, size: nested.size }
      : null;
  };

  const resolveStructure = (name, stack = new Set([name])) => {
    if (layouts.has(name)) return layouts.get(name);
    const structure = structureByName.get(name);
    if (structure === undefined) {
      return { members: [], name, reason: "structure is missing", supported: false };
    }
    let cursor = 0;
    let structureAlignment = 16;
    const members = [];
    for (const member of structure.members) {
      const layout = resolveType(member.type, stack);
      if (layout === null) {
        const unsupported = {
          members,
          name,
          reason: `unsupported member type ${member.type}`,
          supported: false,
        };
        layouts.set(name, unsupported);
        return unsupported;
      }
      const offset = roundUp(layout.alignment, cursor);
      members.push({
        alignment: layout.alignment,
        name: member.name,
        offset,
        size: layout.size,
        type: member.type,
      });
      cursor = offset + layout.size;
      structureAlignment = Math.max(structureAlignment, layout.alignment);
    }
    const resolved = {
      alignment: structureAlignment,
      members,
      name,
      size: roundUp(structureAlignment, cursor),
      supported: true,
    };
    layouts.set(name, resolved);
    return resolved;
  };

  return structures.map((structure) => resolveStructure(structure.name));
}

export function analyzeWgsl(
  source,
  calculateStructureLayouts = calculateWgslStructureLayouts,
) {
  const countMatches = (text, pattern) => [...text.matchAll(pattern)].length;
  const code = String(source);
  const entryPoints = { compute: [], fragment: [], vertex: [] };
  const entryPattern =
    /@(vertex|fragment|compute)\b(?:\s*@[^{\n]+)*\s*fn\s+([A-Za-z_]\w*)/g;
  for (const match of code.matchAll(entryPattern)) {
    entryPoints[match[1]].push(match[2]);
  }

  const bindings = {
    declarations: [],
    groups: [],
    samplers: 0,
    sampledTextures: 0,
    storageBuffers: 0,
    storageTextures: 0,
    total: 0,
    uniformBuffers: 0,
  };
  const groups = new Set();
  const bindingPattern =
    /((?:@(group|binding)\s*\(\s*\d+\s*\)\s*){2})var(?:<([^>]+)>)?\s+([A-Za-z_]\w*)\s*:\s*([^;\n]+)/g;
  for (const match of code.matchAll(bindingPattern)) {
    const group = match[1].match(/@group\s*\(\s*(\d+)\s*\)/)?.[1];
    const binding = match[1].match(/@binding\s*\(\s*(\d+)\s*\)/)?.[1];
    const addressSpace = match[3] ?? "";
    const name = match[4];
    const type = match[5].trim();
    if (group !== undefined) groups.add(Number(group));
    bindings.declarations.push({
      addressSpace: addressSpace.trim(),
      binding: binding === undefined ? null : Number(binding),
      group: group === undefined ? null : Number(group),
      name,
      type,
    });
    bindings.total += 1;
    if (addressSpace.startsWith("uniform")) bindings.uniformBuffers += 1;
    if (addressSpace.startsWith("storage")) bindings.storageBuffers += 1;
    if (/^sampler(?:_comparison)?\b/.test(type)) bindings.samplers += 1;
    if (/^texture_storage_/.test(type)) bindings.storageTextures += 1;
    else if (/^texture_/.test(type)) bindings.sampledTextures += 1;
  }
  bindings.groups = [...groups].sort((first, second) => first - second);

  const declarations = (keyword) =>
    [...code.matchAll(new RegExp(`\\b${keyword}\\s+([A-Za-z_]\\w*)\\s*:\\s*([^=;\\n]+?)(?:\\s*=\\s*([^;\\n]+))?\\s*;`, "g"))]
      .map((match) => ({
        name: match[1],
        type: match[2].trim(),
        value: match[3]?.trim() ?? null,
      }));
  const structures = [...code.matchAll(/\bstruct\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g)]
    .map((match) => ({
      members: match[2]
        .split("\n")
        .map((line) => line.trim().replace(/,$/, ""))
        .filter(Boolean)
        .map((line) => line.replace(/^(?:@\w+(?:\([^)]*\))?\s*)+/, ""))
        .map((line) => {
          const separator = line.indexOf(":");
          return separator < 0
            ? null
            : {
                name: line.slice(0, separator).trim(),
                type: line.slice(separator + 1).trim(),
              };
        })
        .filter((member) => member !== null),
      name: match[1],
    }));
  const structureByName = new Map(
    structures.map((structure) => [structure.name, structure]),
  );
  const codeLines = code.split("\n");
  const escapePattern = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bindingMemberUses = bindings.declarations
    .flatMap((binding) => {
      const structureName =
        structureByName.has(binding.type)
          ? binding.type
          : binding.type.match(/^array\s*<\s*([A-Za-z_]\w*)/)?.[1];
      const structure = structureByName.get(structureName);
      if (structure === undefined) return [];
      const bindingName = escapePattern(binding.name);
      const bindingAliases = [
        ...code.matchAll(new RegExp(
          `\\blet\\s+([A-Za-z_]\\w*)\\s*=\\s*\\(?\\s*&?\\s*${bindingName}(?:\\s*\\[[^\\]\\n]+\\])*\\s*\\)?\\s*;`,
          "g",
        )),
      ].map((match) => match[1]);
      return structure.members.flatMap((member) => {
        const memberName = escapePattern(member.name);
        const directAccess =
          `\\b${bindingName}(?:\\s*\\[[^\\]\\n]+\\])*\\s*\\.\\s*${memberName}\\b`;
        const aliasNames = bindingAliases.map(escapePattern).join("|");
        const aliasAccesses = aliasNames.length === 0
          ? []
          : [
              `\\(\\s*\\*\\s*(?:${aliasNames})\\s*\\)\\s*\\.\\s*${memberName}\\b`,
              `\\b(?:${aliasNames})\\s*\\.\\s*${memberName}\\b`,
            ];
        const accessPattern = new RegExp(
          [directAccess, ...aliasAccesses].join("|"),
          "g",
        );
        let useCount = 0;
        let useSiteCount = 0;
        const useSites = [];
        for (const [lineIndex, line] of codeLines.entries()) {
          const accesses = [...line.matchAll(accessPattern)];
          if (accesses.length === 0) continue;
          useCount += accesses.length;
          useSiteCount += 1;
          if (useSites.length >= 3) continue;
          const normalizedSource = line.trim().replace(/\s+/g, " ");
          useSites.push({
            access: accesses[0][0].replace(/\s+/g, ""),
            line: lineIndex + 1,
            source:
              normalizedSource.length <= 320
                ? normalizedSource
                : `${normalizedSource.slice(0, 317)}...`,
          });
        }
        if (useCount === 0) return [];
        return [{
          binding: binding.binding,
          bindingName: binding.name,
          group: binding.group,
          member: member.name,
          type: member.type,
          useCount,
          useSites,
          useSitesTruncated: useSites.length < useSiteCount,
        }];
      });
    })
    .sort(
      (first, second) =>
        first.group - second.group ||
        first.binding - second.binding ||
        first.member.localeCompare(second.member),
    );

  const workgroupSizes = [...code.matchAll(/@workgroup_size\(([^)]+)\)/g)].map(
    (match) => {
      const values = match[1]
        .split(",")
        .map((value) => Number.parseInt(value.trim().replace(/[ui]$/, ""), 10));
      while (values.length < 3) values.push(1);
      return values.slice(0, 3);
    },
  );
  const functionCallCounts = new Map();
  const nonFunctionKeywords = new Set(["fn", "for", "if", "switch", "while"]);
  const functionCallCode = code
    .replace(/@\w+\s*\([^)]*\)/g, "")
    .replace(/\bfn\s+[A-Za-z_]\w*\s*\(/g, "fn ");
  for (const match of functionCallCode.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
    const name = match[1];
    if (nonFunctionKeywords.has(name)) continue;
    functionCallCounts.set(name, Number(functionCallCounts.get(name) ?? 0) + 1);
  }
  const numericLiteralCounts = new Map();
  for (const match of code.matchAll(/\b(?:\d+\.\d+(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)(?:[fh])?\b/g)) {
    const value = match[0].replace(/[fh]$/, "");
    numericLiteralCounts.set(
      value,
      Number(numericLiteralCounts.get(value) ?? 0) + 1,
    );
  }

  return {
    bindingMemberUses,
    bindings,
    constants: declarations("const"),
    controlFlow: {
      forLoops: countMatches(code, /\bfor\s*\(/g),
      loops: countMatches(code, /\bloop\s*\{/g),
      whileLoops: countMatches(code, /\bwhile\s*\(/g),
    },
    entryPoints,
    functions: countMatches(code, /\bfn\s+[A-Za-z_]\w*\s*\(/g),
    functionCalls: Object.fromEntries(
      [...functionCallCounts].sort(([first], [second]) =>
        first.localeCompare(second),
      ),
    ),
    numericLiterals: [...numericLiteralCounts]
      .map(([value, count]) => ({ count, value }))
      .sort((first, second) => Number(first.value) - Number(second.value)),
    overrides: declarations("override"),
    structureLayouts: calculateStructureLayouts(structures),
    structures,
    textureOperations: {
      load: countMatches(code, /\btextureLoad\s*\(/g),
      sample: countMatches(code, /\btextureSample\w*\s*\(/g),
      store: countMatches(code, /\btextureStore\s*\(/g),
    },
    workgroupSizes,
  };
}

export function attributePipelineBindGroups(pipeline, boundBindGroups) {
  if (pipeline === null || pipeline === undefined) return;
  pipeline.uses.bindGroupSlots ??= [];
  for (const [index, bindGroupId] of boundBindGroups.entries()) {
    if (
      bindGroupId !== null &&
      bindGroupId !== undefined &&
      !pipeline.uses.bindGroups.includes(bindGroupId)
    ) {
      pipeline.uses.bindGroups.push(bindGroupId);
    }
    if (
      bindGroupId !== null &&
      bindGroupId !== undefined &&
      !pipeline.uses.bindGroupSlots.some(
        (slot) => slot.index === index && slot.bindGroupId === bindGroupId,
      )
    ) {
      pipeline.uses.bindGroupSlots.push({ bindGroupId, index });
    }
  }
}

export function attributePipelineBufferBindings(
  pipeline,
  boundVertexBuffers,
  boundIndexBuffer,
) {
  if (pipeline === null || pipeline === undefined) return;
  pipeline.uses.vertexBuffers ??= [];
  pipeline.uses.vertexBufferSlots ??= [];
  pipeline.uses.indexBuffers ??= [];
  for (const [slot, binding] of boundVertexBuffers.entries()) {
    if (binding?.bufferId === null || binding?.bufferId === undefined) continue;
    if (!pipeline.uses.vertexBuffers.includes(binding.bufferId)) {
      pipeline.uses.vertexBuffers.push(binding.bufferId);
    }
    const described = {
      bufferId: binding.bufferId,
      offset: Number(binding.offset ?? 0),
      size:
        binding.size === null || binding.size === undefined
          ? null
          : Number(binding.size),
      slot: Number(slot),
    };
    if (
      !pipeline.uses.vertexBufferSlots.some(
        (existing) => JSON.stringify(existing) === JSON.stringify(described),
      )
    ) {
      pipeline.uses.vertexBufferSlots.push(described);
    }
  }
  if (
    boundIndexBuffer?.bufferId !== null &&
    boundIndexBuffer?.bufferId !== undefined
  ) {
    const described = {
      bufferId: boundIndexBuffer.bufferId,
      format: boundIndexBuffer.format ?? null,
      offset: Number(boundIndexBuffer.offset ?? 0),
      size:
        boundIndexBuffer.size === null || boundIndexBuffer.size === undefined
          ? null
          : Number(boundIndexBuffer.size),
    };
    if (
      !pipeline.uses.indexBuffers.some(
        (existing) => JSON.stringify(existing) === JSON.stringify(described),
      )
    ) {
      pipeline.uses.indexBuffers.push(described);
    }
  }
}

export function normalizeDynamicOffsets(
  offsets,
  dataStart = 0,
  dataLength,
) {
  if (offsets === null || offsets === undefined) return [];
  let values;
  try {
    values = Array.from(offsets, Number);
  } catch {
    return [];
  }
  if (dataLength === undefined) return values;
  const start = Math.max(0, Number(dataStart) || 0);
  return values.slice(start, start + Math.max(0, Number(dataLength) || 0));
}

export function describePassDescriptor(
  kind,
  descriptor,
  viewRecordFor = () => null,
) {
  const viewReference = (view) => {
    const record = viewRecordFor(view);
    return {
      textureId: record?.textureId ?? null,
      viewId: record?.id ?? null,
    };
  };
  const colorValue = (value) => [
    Number(value?.r ?? value?.[0] ?? 0),
    Number(value?.g ?? value?.[1] ?? 0),
    Number(value?.b ?? value?.[2] ?? 0),
    Number(value?.a ?? value?.[3] ?? 0),
  ];
  const colorAttachments = (descriptor.colorAttachments ?? []).map(
    (attachment) => {
      if (attachment === null) return null;
      const view = viewReference(attachment.view);
      const resolve = viewReference(attachment.resolveTarget);
      return {
        clearValue: colorValue(attachment.clearValue),
        loadOp: attachment.loadOp,
        resolveTextureId: resolve.textureId,
        resolveViewId: resolve.viewId,
        storeOp: attachment.storeOp,
        textureId: view.textureId,
        viewId: view.viewId,
      };
    },
  );
  const depthStencilAttachment =
    descriptor.depthStencilAttachment === undefined
      ? null
      : {
          depthClearValue: Number(
            descriptor.depthStencilAttachment.depthClearValue ?? 0,
          ),
          depthLoadOp:
            descriptor.depthStencilAttachment.depthLoadOp ?? null,
          depthReadOnly:
            descriptor.depthStencilAttachment.depthReadOnly === true,
          depthStoreOp:
            descriptor.depthStencilAttachment.depthStoreOp ?? null,
          stencilClearValue: Number(
            descriptor.depthStencilAttachment.stencilClearValue ?? 0,
          ),
          stencilLoadOp:
            descriptor.depthStencilAttachment.stencilLoadOp ?? null,
          stencilReadOnly:
            descriptor.depthStencilAttachment.stencilReadOnly === true,
          stencilStoreOp:
            descriptor.depthStencilAttachment.stencilStoreOp ?? null,
          ...viewReference(descriptor.depthStencilAttachment.view),
        };
  return {
    colorAttachments,
    depthStencilAttachment,
    kind,
    label: descriptor.label ?? "",
  };
}

export function describeExecutionBindings(
  boundBindGroups,
  boundVertexBuffers = new Map(),
  boundIndexBuffer = null,
  dynamicOffsets = new Map(),
) {
  const bindGroups = [...boundBindGroups.entries()]
    .filter(([, bindGroupId]) => bindGroupId !== null && bindGroupId !== undefined)
    .map(([slot, bindGroupId]) => {
      const described = { bindGroupId, slot: Number(slot) };
      const offsets = dynamicOffsets.get(slot) ?? [];
      if (offsets.length > 0) described.dynamicOffsets = [...offsets];
      return described;
    });
  const vertexBuffers = [...boundVertexBuffers.entries()]
    .filter(([, binding]) => binding?.bufferId !== null && binding?.bufferId !== undefined)
    .map(([slot, binding]) => ({
      bufferId: binding.bufferId,
      offset: Number(binding.offset ?? 0),
      size:
        binding.size === null || binding.size === undefined
          ? null
          : Number(binding.size),
      slot: Number(slot),
    }));
  const indexBuffer =
    boundIndexBuffer?.bufferId === null ||
    boundIndexBuffer?.bufferId === undefined
      ? null
      : {
          bufferId: boundIndexBuffer.bufferId,
          format: boundIndexBuffer.format ?? null,
          offset: Number(boundIndexBuffer.offset ?? 0),
          size:
            boundIndexBuffer.size === null || boundIndexBuffer.size === undefined
              ? null
              : Number(boundIndexBuffer.size),
        };
  return { bindGroups, indexBuffer, vertexBuffers };
}

export function resolveExecutionBufferBindings(
  bindings,
  bindGroups,
  bindGroupLayouts,
  buffers,
) {
  const bindGroupById = new Map(bindGroups.map((record) => [record.id, record]));
  const layoutById = new Map(
    bindGroupLayouts.map((record) => [record.id, record]),
  );
  const bufferById = new Map(buffers.map((record) => [record.id, record]));
  const resolved = [];

  for (const boundGroup of bindings?.bindGroups ?? []) {
    const bindGroup = bindGroupById.get(boundGroup.bindGroupId);
    if (bindGroup === undefined) continue;
    const layout = layoutById.get(bindGroup.layoutId);
    const dynamicBindings = (layout?.entries ?? [])
      .filter((entry) => entry.buffer?.hasDynamicOffset === true)
      .map((entry) => Number(entry.binding))
      .sort((first, second) => first - second);
    const dynamicOffsets = new Map(
      dynamicBindings.map((binding, index) => [
        binding,
        Number(boundGroup.dynamicOffsets?.[index] ?? 0),
      ]),
    );
    for (const entry of bindGroup.entries ?? []) {
      if (entry.type !== "buffer" || entry.bufferId == null) continue;
      const dynamicOffset = Number(dynamicOffsets.get(Number(entry.binding)) ?? 0);
      const offset = Number(entry.offset ?? 0) + dynamicOffset;
      const bufferSize = Number(bufferById.get(entry.bufferId)?.size ?? 0);
      resolved.push({
        bindGroupId: bindGroup.id,
        binding: Number(entry.binding),
        bufferId: entry.bufferId,
        dynamicOffset,
        group: Number(boundGroup.slot),
        offset,
        size:
          entry.size === null || entry.size === undefined
            ? Math.max(0, bufferSize - offset)
            : Number(entry.size),
        source: "bindGroup",
      });
    }
  }

  for (const binding of bindings?.vertexBuffers ?? []) {
    const offset = Number(binding.offset ?? 0);
    const bufferSize = Number(bufferById.get(binding.bufferId)?.size ?? 0);
    resolved.push({
      bufferId: binding.bufferId,
      offset,
      size:
        binding.size === null || binding.size === undefined
          ? Math.max(0, bufferSize - offset)
          : Number(binding.size),
      slot: Number(binding.slot),
      source: "vertex",
    });
  }

  if (bindings?.indexBuffer?.bufferId != null) {
    const binding = bindings.indexBuffer;
    const offset = Number(binding.offset ?? 0);
    const bufferSize = Number(bufferById.get(binding.bufferId)?.size ?? 0);
    resolved.push({
      bufferId: binding.bufferId,
      format: binding.format ?? null,
      offset,
      size:
        binding.size === null || binding.size === undefined
          ? Math.max(0, bufferSize - offset)
          : Number(binding.size),
      source: "index",
    });
  }

  return resolved;
}

export function resolveExecutionResourceBindings(
  bindings,
  bindGroups,
  textureViews,
  textures,
  samplers,
  buffers,
  pipeline,
  shaderModules,
  describeBindingLayout = describeWgslBindingLayout,
) {
  const bindGroupById = new Map(bindGroups.map((record) => [record.id, record]));
  const textureViewById = new Map(
    textureViews.map((record) => [record.id, record]),
  );
  const textureById = new Map(textures.map((record) => [record.id, record]));
  const samplerById = new Map(samplers.map((record) => [record.id, record]));
  const bufferById = new Map(buffers.map((record) => [record.id, record]));
  const shaderById = new Map(shaderModules.map((record) => [record.id, record]));
  const stages = ["compute", "fragment", "vertex"];
  const declarations = stages.flatMap((stage) => {
    const shaderId = pipeline?.[stage]?.shaderId;
    const shader = shaderById.get(shaderId);
    return (shader?.analysis?.bindings?.declarations ?? []).map(
      (declaration) => {
        const layout = describeBindingLayout(
          declaration.type,
          shader?.analysis?.structureLayouts,
          declaration.addressSpace,
          true,
        );
        return {
        addressSpace: declaration.addressSpace ?? "",
        binding: Number(declaration.binding),
        group: Number(declaration.group),
        ...(layout === null ? {} : { layout }),
        name: declaration.name,
        stage,
        type: declaration.type,
        };
      },
    );
  });
  const shaderBindingsFor = (group, binding) =>
    declarations
      .filter(
        (declaration) =>
          declaration.group === group && declaration.binding === binding,
      )
      .map(({ binding: _binding, group: _group, ...declaration }) => declaration);

  return (bindings?.bindGroups ?? []).flatMap((boundGroup) => {
    const group = Number(boundGroup.slot);
    const bindGroup = bindGroupById.get(boundGroup.bindGroupId);
    if (bindGroup === undefined) return [];
    return (bindGroup.entries ?? []).map((entry) => {
      const binding = Number(entry.binding);
      let resource;
      if (entry.type === "buffer") {
        const buffer = bufferById.get(entry.bufferId);
        const offset = Number(entry.offset ?? 0);
        resource = {
          bufferId: entry.bufferId ?? null,
          kind: "buffer",
          label: buffer?.label ?? "",
          offset,
          size:
            entry.size === null || entry.size === undefined
              ? Math.max(0, Number(buffer?.size ?? 0) - offset)
              : Number(entry.size),
        };
      } else if (entry.type === "sampler") {
        const sampler = samplerById.get(entry.samplerId);
        const { id: _id, label = "", ...settings } = sampler ?? {};
        resource = {
          kind: "sampler",
          label,
          samplerId: entry.samplerId ?? null,
          settings,
        };
      } else if (entry.type === "textureView") {
        const view = textureViewById.get(entry.textureViewId);
        const texture = textureById.get(view?.textureId);
        resource = {
          format: texture?.format ?? null,
          kind: "texture",
          label: texture?.label ?? "",
          mipLevelCount: Number(texture?.mipLevelCount ?? 1),
          size: texture?.size ?? null,
          textureId: view?.textureId ?? null,
          viewDescriptor: view?.descriptor ?? {},
          viewId: entry.textureViewId ?? null,
        };
      } else {
        resource = {
          kind: entry.type ?? "unknown",
          label: entry.label ?? "",
        };
      }
      return {
        bindGroupId: bindGroup.id,
        binding,
        group,
        resource,
        shaderBindings: shaderBindingsFor(group, binding),
      };
    });
  });
}

export function selectEffectiveBufferWrites(binding, writes) {
  const start = Number(binding.offset ?? 0);
  const end = start + Math.max(0, Number(binding.size ?? 0));
  if (end <= start) return [];
  let uncovered = [[start, end]];
  const selected = [];
  for (let index = writes.length - 1; index >= 0 && uncovered.length > 0; index -= 1) {
    const write = writes[index];
    if (write.bufferId !== binding.bufferId) continue;
    const writeStart = Number(write.bufferOffset ?? 0);
    const writeEnd = writeStart + Math.max(0, Number(write.byteLength ?? 0));
    if (
      !uncovered.some(
        ([rangeStart, rangeEnd]) =>
          writeStart < rangeEnd && writeEnd > rangeStart,
      )
    ) {
      continue;
    }
    selected.push(write);
    uncovered = uncovered.flatMap(([rangeStart, rangeEnd]) => {
      if (writeStart >= rangeEnd || writeEnd <= rangeStart) {
        return [[rangeStart, rangeEnd]];
      }
      const remaining = [];
      if (writeStart > rangeStart) {
        remaining.push([rangeStart, Math.min(writeStart, rangeEnd)]);
      }
      if (writeEnd < rangeEnd) {
        remaining.push([Math.max(writeEnd, rangeStart), rangeEnd]);
      }
      return remaining;
    });
  }
  return selected.reverse();
}

export function recordCommandSignature(
  signatures,
  signature,
  maximumSignatures = 16,
  overflow = { count: 0 },
) {
  const key = JSON.stringify(signature);
  const existing = signatures.find(({ count: _count, ...candidate }) =>
    JSON.stringify(candidate) === key,
  );
  if (existing !== undefined) {
    existing.count += 1;
    return;
  }
  if (signatures.length >= Math.max(1, Number(maximumSignatures))) {
    overflow.count += 1;
    return;
  }
  signatures.push({ count: 1, ...signature });
}

export function createBufferProbePlan(size, maximumBytes = 512) {
  const alignedSize = Math.max(0, Math.floor(Number(size) / 4) * 4);
  const alignment = 16;
  const alignedMaximum = Math.max(
    alignment * 3,
    Math.floor(Number(maximumBytes) / alignment) * alignment,
  );
  if (alignedSize === 0) return [];
  if (alignedSize <= alignedMaximum) {
    return [{ destinationOffset: 0, size: alignedSize, sourceOffset: 0 }];
  }
  const segmentSize = Math.max(
    alignment,
    Math.floor(alignedMaximum / 3 / alignment) * alignment,
  );
  const middleSourceOffset =
    Math.floor((alignedSize - segmentSize) / 2 / alignment) * alignment;
  const tailSourceOffset =
    Math.floor((alignedSize - segmentSize) / alignment) * alignment;
  return [
    { destinationOffset: 0, size: segmentSize, sourceOffset: 0 },
    {
      destinationOffset: segmentSize,
      size: segmentSize,
      sourceOffset: middleSourceOffset,
    },
    {
      destinationOffset: segmentSize * 2,
      size: segmentSize,
      sourceOffset: tailSourceOffset,
    },
  ];
}

export function selectBufferProbeTargets(
  targets,
  maximumTargets = 8,
  labelPattern = "(?:particle|light|render|frame|cascade)",
) {
  let pattern;
  try {
    pattern = new RegExp(labelPattern, "i");
  } catch {
    pattern = /(?:particle|light|render|frame|cascade)/i;
  }
  const rankedTargets = targets
    .map((target) => ({
      ...target,
      selection: {
        executionScore: Number(target.executionScore ?? 0),
        labelMatched: pattern.test(target.label ?? ""),
      },
    }))
    .filter(
      ({ selection }) =>
        selection.labelMatched || selection.executionScore > 0,
    );
  const compareTargets = (first, second) => {
    if (first.selection.labelMatched !== second.selection.labelMatched) {
      return first.selection.labelMatched ? -1 : 1;
    }
    return (
      second.selection.executionScore - first.selection.executionScore ||
      Number(first.size ?? 0) - Number(second.size ?? 0)
    );
  };
  const requestedLimit = Number(maximumTargets);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.floor(requestedLimit))
    : 1;
  const maximumExecutionScore = Math.max(
    0,
    ...rankedTargets.map(({ selection }) => selection.executionScore),
  );
  const structurallyRequired =
    maximumExecutionScore === 0
      ? []
      : rankedTargets
          .filter(
            ({ selection }) =>
              selection.executionScore === maximumExecutionScore,
          )
          .sort(compareTargets)
          .slice(0, limit);
  const selected = [...structurallyRequired];
  for (const target of rankedTargets.sort(compareTargets)) {
    if (selected.length >= limit) break;
    if (!selected.includes(target)) selected.push(target);
  }
  return selected.sort(compareTargets);
}

export function sampleBufferData(data, maximumBytes = 128) {
  const interpretBytes = (segment, byteOffset) => {
    const copy = Uint8Array.from(segment);
    const view = new DataView(copy.buffer);
    const floats = [];
    const integers = [];
    for (let offset = 0; offset + 4 <= copy.byteLength; offset += 4) {
      const float = view.getFloat32(offset, true);
      floats.push(
        Number.isFinite(float) ? Number(float.toFixed(6)) : String(float),
      );
      integers.push(view.getInt32(offset, true));
    }
    return { byteOffset, bytes: Array.from(copy), floats, integers };
  };
  let bytes;
  try {
    bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
  } catch {
    return null;
  }
  const limit = Math.max(8, Math.floor(Number(maximumBytes) || 128));
  if (bytes.byteLength <= limit) {
    return {
      byteLength: bytes.byteLength,
      sampledBytes: bytes.byteLength,
      segments: [interpretBytes(bytes, 0)],
      truncated: false,
    };
  }

  const segmentBytes = Math.max(4, Math.floor(limit / 8) * 4);
  const tailOffset = bytes.byteLength - segmentBytes;
  return {
    byteLength: bytes.byteLength,
    sampledBytes: segmentBytes * 2,
    segments: [
      interpretBytes(bytes.subarray(0, segmentBytes), 0),
      interpretBytes(bytes.subarray(tailOffset), tailOffset),
    ],
    truncated: true,
  };
}

export function describeTextureProbeFormat(format) {
  const formats = {
    bgra8unorm: { bytesPerPixel: 4, channels: 4, encoding: "unorm8" },
    "bgra8unorm-srgb": { bytesPerPixel: 4, channels: 4, encoding: "unorm8" },
    r8unorm: { bytesPerPixel: 1, channels: 1, encoding: "unorm8" },
    r16float: { bytesPerPixel: 2, channels: 1, encoding: "float16" },
    r32float: { bytesPerPixel: 4, channels: 1, encoding: "float32" },
    rg16float: { bytesPerPixel: 4, channels: 2, encoding: "float16" },
    rgba8unorm: { bytesPerPixel: 4, channels: 4, encoding: "unorm8" },
    "rgba8unorm-srgb": { bytesPerPixel: 4, channels: 4, encoding: "unorm8" },
    rgba16float: { bytesPerPixel: 8, channels: 4, encoding: "float16" },
    rgba32float: { bytesPerPixel: 16, channels: 4, encoding: "float32" },
  };
  return formats[format] ?? null;
}

export function describeTextureUpload(
  dataLayout,
  size,
  bytesPerPixel,
  sourceByteLength,
) {
  const extent = {
    depthOrArrayLayers: Number(
      size?.depthOrArrayLayers ?? size?.[2] ?? 1,
    ),
    height: Number(size?.height ?? size?.[1] ?? 1),
    width: Number(size?.width ?? size?.[0] ?? 1),
  };
  const dataOffset = Number(dataLayout?.offset ?? 0);
  const packedBytesPerRow = extent.width * Number(bytesPerPixel);
  const bytesPerRow = Number(dataLayout?.bytesPerRow ?? packedBytesPerRow);
  const rowsPerImage = Number(dataLayout?.rowsPerImage ?? extent.height);
  const requiredSourceBytes =
    dataOffset +
    Math.max(0, extent.depthOrArrayLayers - 1) * rowsPerImage * bytesPerRow +
    Math.max(0, extent.height - 1) * bytesPerRow +
    packedBytesPerRow;
  return {
    dataOffset,
    bytesPerRow,
    requiredSourceBytes,
    rowsPerImage,
    size: extent,
    sourceByteLength: Number(sourceByteLength),
    texelBytes:
      extent.width *
      extent.height *
      extent.depthOrArrayLayers *
      Number(bytesPerPixel),
  };
}

export function createTextureProbePlan() {
  const regions = {
    floor: { bounds: [0.2, 0.56, 0.8, 0.96], columns: 12, rows: 5 },
    full: { bounds: [0, 0, 1, 1], columns: 20, rows: 12 },
    leftFire: { bounds: [0.34, 0.28, 0.47, 0.58], columns: 24, rows: 20 },
    rightFire: { bounds: [0.55, 0.28, 0.68, 0.58], columns: 24, rows: 20 },
    upperGallery: { bounds: [0.34, 0.02, 0.68, 0.38], columns: 16, rows: 8 },
  };
  return Object.entries(regions).flatMap(
    ([region, { bounds: [left, top, right, bottom], columns, rows }]) =>
      Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => ({
          region,
          x: left + ((column + 0.5) / columns) * (right - left),
          y: top + ((row + 0.5) / rows) * (bottom - top),
        })),
      ).flat(),
  );
}

export function summarizeProbeValues(values) {
  const numericValues = values
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return {
      aboveOneFraction: 0,
      activeFraction: 0,
      maximum: 0,
      mean: 0,
      minimum: 0,
      p10: 0,
      p50: 0,
      p90: 0,
      p99: 0,
      positiveMean: 0,
      rms: 0,
      zeroFraction: 1,
    };
  }
  const sorted = [...numericValues].sort((first, second) => first - second);
  const quantile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  const active = numericValues.filter((value) => Math.abs(value) > 1e-5);
  const positive = numericValues.filter((value) => value > 1e-5);
  const round = (value) => Number(value.toFixed(6));
  return {
    aboveOneFraction: round(
      numericValues.filter((value) => value > 1).length / numericValues.length,
    ),
    activeFraction: round(active.length / numericValues.length),
    maximum: round(sorted.at(-1)),
    mean: round(
      numericValues.reduce((sum, value) => sum + value, 0) /
        numericValues.length,
    ),
    minimum: round(sorted[0]),
    p10: round(quantile(0.1)),
    p50: round(quantile(0.5)),
    p90: round(quantile(0.9)),
    p99: round(quantile(0.99)),
    positiveMean:
      positive.length === 0
        ? 0
        : round(
            positive.reduce((sum, value) => sum + value, 0) /
              positive.length,
          ),
    rms: round(
      Math.sqrt(
        numericValues.reduce((sum, value) => sum + value * value, 0) /
          numericValues.length,
      ),
    ),
    zeroFraction: round(
      numericValues.filter((value) => Math.abs(value) <= 1e-5).length /
        numericValues.length,
    ),
  };
}

export function createTextureProbeSubresources(
  size,
  mipLevelCount = 1,
  maximumArrayLayers = 6,
  maximumMipLevels = 3,
) {
  const width = Number(size?.width ?? size?.[0] ?? 1);
  const height = Number(size?.height ?? size?.[1] ?? 1);
  const layerCount = Math.min(
    Math.max(1, Number(size?.depthOrArrayLayers ?? size?.[2] ?? 1)),
    Math.max(1, Number(maximumArrayLayers)),
  );
  const mipCount = Math.max(1, Number(mipLevelCount));
  const selectedMipCount = Math.min(
    mipCount,
    Math.max(1, Number(maximumMipLevels)),
  );
  const mipLevels = [
    ...new Set(
      Array.from({ length: selectedMipCount }, (_, index) =>
        selectedMipCount === 1
          ? 0
          : Math.round((index * (mipCount - 1)) / (selectedMipCount - 1)),
      ),
    ),
  ];
  return Array.from({ length: layerCount }, (_, arrayLayer) =>
    mipLevels.map((mipLevel) => ({
      arrayLayer,
      height: Math.max(1, Math.floor(height / 2 ** mipLevel)),
      mipLevel,
      width: Math.max(1, Math.floor(width / 2 ** mipLevel)),
    })),
  ).flat();
}

export function describePipelineDescriptor(
  kind,
  descriptor,
  asynchronous,
  shaderIdFor = () => null,
) {
  const describeBlendComponent = (component) => {
    if (component === undefined) return null;
    return {
      dstFactor: component.dstFactor ?? "zero",
      operation: component.operation ?? "add",
      srcFactor: component.srcFactor ?? "one",
    };
  };
  const describeStage = (stage) => {
    if (stage === undefined) return null;
    return {
      constants: Object.fromEntries(
        Object.entries(stage.constants ?? {}).map(([name, value]) => [
          name,
          Number(value),
        ]),
      ),
      entryPoint: stage.entryPoint ?? null,
      shaderId: shaderIdFor(stage.module),
    };
  };
  const vertex = describeStage(descriptor.vertex);
  if (vertex !== null) {
    vertex.buffers = (descriptor.vertex?.buffers ?? []).map((buffer) =>
      buffer === null
        ? null
        : {
            arrayStride: Number(buffer.arrayStride),
            attributes: (buffer.attributes ?? []).map((attribute) => ({
              format: attribute.format,
              offset: Number(attribute.offset),
              shaderLocation: Number(attribute.shaderLocation),
            })),
            stepMode: buffer.stepMode ?? "vertex",
          },
    );
  }
  const fragment = describeStage(descriptor.fragment);
  if (fragment !== null) {
    fragment.targets = (descriptor.fragment?.targets ?? []).map((target) =>
      target === null
        ? null
        : {
            blend:
              target.blend === undefined
                ? null
                : {
                    alpha: describeBlendComponent(target.blend.alpha),
                    color: describeBlendComponent(target.blend.color),
                  },
            format: target.format,
            writeMask: Number(target.writeMask ?? 15),
          },
    );
  }

  return {
    asynchronous,
    compute: describeStage(descriptor.compute),
    depthStencil:
      descriptor.depthStencil === undefined
        ? null
        : {
            depthBias: Number(descriptor.depthStencil.depthBias ?? 0),
            depthBiasClamp: Number(
              descriptor.depthStencil.depthBiasClamp ?? 0,
            ),
            depthBiasSlopeScale: Number(
              descriptor.depthStencil.depthBiasSlopeScale ?? 0,
            ),
            depthCompare: descriptor.depthStencil.depthCompare ?? "always",
            depthWriteEnabled:
              descriptor.depthStencil.depthWriteEnabled === true,
            format: descriptor.depthStencil.format,
            stencilBack: descriptor.depthStencil.stencilBack ?? null,
            stencilFront: descriptor.depthStencil.stencilFront ?? null,
          },
    fragment,
    kind,
    label: descriptor.label ?? "",
    layout:
      typeof descriptor.layout === "string"
        ? descriptor.layout
        : descriptor.layout?.label ?? null,
    multisample: {
      alphaToCoverageEnabled:
        descriptor.multisample?.alphaToCoverageEnabled === true,
      count: Number(descriptor.multisample?.count ?? 1),
      mask: Number(descriptor.multisample?.mask ?? 0xffffffff),
    },
    primitive: {
      cullMode: descriptor.primitive?.cullMode ?? "none",
      frontFace: descriptor.primitive?.frontFace ?? "ccw",
      stripIndexFormat: descriptor.primitive?.stripIndexFormat ?? null,
      topology: descriptor.primitive?.topology ?? "triangle-list",
    },
    vertex,
  };
}

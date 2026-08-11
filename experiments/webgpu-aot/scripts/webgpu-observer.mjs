import {
  calculatePixelMetrics,
  estimateTextureBytes,
} from "./comparison-metrics.mjs";
import { calculateSampledLightingCues } from "./comparison-hdr-lighting.mjs";
import {
  createSelectedReflectionSamplePlan,
  decodeSelectedReflectionSamples,
  resolveSelectedReflectionCore,
  selectedReflectionSampleStrideBytes,
} from "./webgpu-selected-reflection.mjs";
import {
  resolveAntikySelectedReflection,
} from "./webgpu-selected-reflection-antiky.mjs";
import {
  validateAntikySelectedReflectionReconstruction,
} from "./webgpu-selected-reflection-antiky-reconstruction.mjs";
import {
  probeSelectedReflection,
  summarizeSelectedReflectionSamples,
} from "./webgpu-selected-reflection-runtime.mjs";
import {
  analyzeWgsl,
  attributeGpuBufferDependencies,
  attributePipelineBufferBindings,
  attributePipelineBindGroups,
  calculateWgslStructureLayouts,
  compareCpuGpuBufferSnapshots,
  createBufferProbePlan,
  createTextureProbePlan,
  createTextureProbeSubresources,
  decodeWgslBufferLayout,
  describePassDescriptor,
  describeExecutionBindings,
  describePipelineDescriptor,
  describeTextureProbeFormat,
  describeTextureUpload,
  describeWgslBindingLayout,
  groupWgslBufferLayoutBindings,
  normalizeDynamicOffsets,
  normalizeJavaScriptCallsite,
  recordCommandSignature,
  resolveExecutionBufferBindings,
  resolveExecutionResourceBindings,
  sampleBufferData,
  selectBufferSampleLimit,
  selectEffectiveBufferWrites,
  selectBufferProbeTargets,
  summarizeProbeValues,
  updateCpuBufferSnapshot,
} from "./webgpu-analysis.mjs";

export {
  calculatePixelMetrics,
  diffGpuCounters,
  estimateTextureBytes,
  sanitizeArtifactName,
} from "./comparison-metrics.mjs";

export function createAnimationFrameGate(
  scheduleAnimationFrame,
  cancelScheduledAnimationFrame,
) {
  const callbacks = new Map();
  let nextId = 1;
  let pausePredicate = null;
  let paused = false;

  const schedule = (id, callback) => {
    const nativeId = scheduleAnimationFrame((timestamp) => {
      const entry = callbacks.get(id);
      if (entry === undefined) return;
      entry.nativeId = null;
      if (!paused && pausePredicate?.() === true) {
        pausePredicate = null;
        paused = true;
      }
      if (paused) return;
      callbacks.delete(id);
      callback(timestamp);
    });
    callbacks.set(id, { callback, nativeId });
  };

  return {
    cancelAnimationFrame(id) {
      const entry = callbacks.get(id);
      if (entry?.nativeId !== null && entry?.nativeId !== undefined) {
        cancelScheduledAnimationFrame(entry.nativeId);
      }
      callbacks.delete(id);
    },
    pause() {
      pausePredicate = null;
      paused = true;
    },
    pauseWhen(predicate) {
      pausePredicate = predicate;
    },
    requestAnimationFrame(callback) {
      const id = nextId++;
      if (paused) callbacks.set(id, { callback, nativeId: null });
      else schedule(id, callback);
      return id;
    },
    resume() {
      if (!paused) return;
      paused = false;
      for (const [id, entry] of [...callbacks]) {
        if (entry.nativeId === null) schedule(id, entry.callback);
      }
    },
    state() {
      const entries = [...callbacks.values()];
      return {
        paused,
        pendingCallbacks: entries.filter(({ nativeId }) => nativeId === null)
          .length,
        scheduledCallbacks: entries.filter(({ nativeId }) => nativeId !== null)
          .length,
      };
    },
  };
}

export function isLiveTextureProbeTarget(target) {
  return target?.record?.destroyed !== true;
}

export function snapshotSmallBufferBinding(
  binding,
  buffer,
  submissionSequence,
  maximumBytes = 256,
) {
  const limit = Math.max(0, Number(maximumBytes) || 0);
  const offset = Number(binding?.offset);
  const size = Number(binding?.size);
  const bufferSize = Number(buffer?.size);
  const write = buffer?.lastWrite;
  const segments = write?.sample?.segments;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > limit ||
    !Number.isInteger(bufferSize) ||
    bufferSize < 1 ||
    bufferSize > limit ||
    offset + size > bufferSize ||
    !Number.isInteger(Number(submissionSequence)) ||
    write?.sample?.truncated !== false ||
    !Array.isArray(segments) ||
    segments.length < 1
  ) {
    return null;
  }
  const copiedSegments = [];
  let copiedBytes = 0;
  for (const segment of segments) {
    if (
      !Number.isInteger(Number(segment?.byteOffset)) ||
      !Array.isArray(segment?.bytes) ||
      !segment.bytes.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255,
      )
    ) {
      return null;
    }
    copiedBytes += segment.bytes.length;
    if (copiedBytes > limit) return null;
    copiedSegments.push({
      byteOffset: Number(segment.byteOffset),
      bytes: [...segment.bytes],
    });
  }
  return {
    bufferOffset: Number(write.bufferOffset ?? 0),
    byteLength: Number(write.byteLength ?? 0),
    sample: {
      byteLength: Number(write.sample.byteLength ?? copiedBytes),
      sampledBytes: copiedBytes,
      segments: copiedSegments,
      truncated: false,
    },
    source: write.source ?? null,
    submissionSequence: Number(submissionSequence),
  };
}

export function isReflectionProofSettingsBinding(resourceBinding, buffer) {
  const isSettings = (resourceBinding?.shaderBindings ?? []).some(
    ({ name, stage }) =>
      stage === "fragment" &&
      /^(?:settings|reconstructionSettings)$/i.test(String(name)),
  );
  return isSettings && /reflection/i.test(String(buffer?.label));
}

function installWebGpuObserver(
  config,
  estimateTextureBytes_,
  calculatePixelMetrics_,
  analyzeWgsl_,
  compareCpuGpuBufferSnapshots_,
  attributeGpuBufferDependencies_,
  describePipelineDescriptor_,
  describePassDescriptor_,
  describeTextureProbeFormat_,
  describeTextureUpload_,
  describeWgslBindingLayout_,
  createTextureProbeSubresources_,
  createBufferProbePlan_,
  decodeWgslBufferLayout_,
  groupWgslBufferLayoutBindings_,
  sampleBufferData_,
  selectBufferSampleLimit_,
  attributePipelineBufferBindings_,
  attributePipelineBindGroups_,
  describeExecutionBindings_,
  normalizeDynamicOffsets_,
  normalizeJavaScriptCallsite_,
  recordCommandSignature_,
  resolveExecutionBufferBindings_,
  resolveExecutionResourceBindings_,
  selectEffectiveBufferWrites_,
  snapshotSmallBufferBinding_,
  isReflectionProofSettingsBinding_,
  selectBufferProbeTargets_,
  summarizeProbeValues_,
  updateCpuBufferSnapshot_,
  isLiveTextureProbeTarget_,
  calculateSampledLightingCues_,
  createAnimationFrameGate_,
  probeSelectedReflection_,
  resolveSelectedReflection_,
  createSelectedReflectionSamplePlan_,
  decodeSelectedReflectionSamples_,
  selectedReflectionSampleStrideBytes_,
  summarizeSelectedReflectionSamples_,
) {
  if (window.top !== window || window.__WEBGPU_COMPARE__ !== undefined) {
    return;
  }
  const counters = {
    commandEncoders: 0,
    computePasses: 0,
    dispatchCalls: 0,
    drawCalls: 0,
    drawIndexedCalls: 0,
    indirectDrawCalls: 0,
    queueSubmits: 0,
    renderPasses: 0,
    submittedCommandBuffers: 0,
    totalDispatchedWorkgroups: 0,
    totalIndices: 0,
    totalInstances: 0,
    totalVertices: 0,
    writeBufferBytes: 0,
    writeBufferCalls: 0,
    writeTextureBytes: 0,
    writeTextureCalls: 0,
    writeTextureTexelBytes: 0,
    copyExternalImageToTextureCalls: 0,
    copyExternalImageToTextureTexelBytes: 0,
  };
  const records = {
    adapters: [],
    bindGroups: [],
    buffers: [],
    canvasConfigurations: [],
    devices: [],
    bindGroupLayouts: [],
    passSummaries: [],
    pipelineLayouts: [],
    pipelines: [],
    samplers: [],
    shaderModules: [],
    textureViews: [],
    textures: [],
  };
  const errors = [];
  const resourceIds = {
    buffers: new WeakMap(),
    bindGroups: new WeakMap(),
    bindGroupLayouts: new WeakMap(),
    devices: new WeakMap(),
    pipelines: new WeakMap(),
    pipelineLayouts: new WeakMap(),
    samplers: new WeakMap(),
    shaders: new WeakMap(),
    textureViews: new WeakMap(),
    textures: new WeakMap(),
  };
  const resourceRecords = {
    buffers: new WeakMap(),
    textures: new WeakMap(),
    textureViews: new WeakMap(),
  };
  const bufferRecordsById = new Map();
  const liveResources = {
    devicesByTextureId: new Map(),
    samplers: new Map(),
    textureViews: new Map(),
  };
  const pipelineRecords = new WeakMap();
  const renderPassStates = new WeakMap();
  const computePassStates = new WeakMap();
  const passSummaries = new Map();
  const mappedRanges = new WeakMap();
  const cpuBufferSnapshots = new WeakMap();
  const commandBufferTracePasses = new WeakMap();
  const commandEncoderTracePasses = new WeakMap();
  const patchedMethods = new WeakMap();
  const bufferProbeTargets = [];
  const textureProbeTargets = [];
  let nextId = 1;
  let renderWriteSequence = 0;
  let activeTrace = null;
  let lastTrace = null;
  let tracePassSequence = 0;
  let traceSubmitSequence = 0;
  let traceWriteSequence = 0;
  let traceWritesByBuffer = new Map();
  let latestGpuWrites = new Map();

  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const animationFrameGate = createAnimationFrameGate_(
    nativeRequestAnimationFrame,
    nativeCancelAnimationFrame,
  );
  window.requestAnimationFrame = animationFrameGate.requestAnimationFrame;
  window.cancelAnimationFrame = animationFrameGate.cancelAnimationFrame;

  const safeValue = (value, depth = 0) => {
    if (value === null || value === undefined || depth > 3) return value ?? null;
    if (["string", "number", "boolean"].includes(typeof value)) return value;
    if (Array.isArray(value)) return value.map((item) => safeValue(item, depth + 1));
    if (typeof value === "object") {
      const copy = {};
      for (const [key, item] of Object.entries(value)) {
        if (["device", "layout", "module", "buffer", "texture", "view"].includes(key)) continue;
        copy[key] = safeValue(item, depth + 1);
      }
      return copy;
    }
    return String(value);
  };
  const captureCallsite = () =>
    normalizeJavaScriptCallsite_(new Error().stack);
  const bufferSampleLimit = (target) =>
    selectBufferSampleLimit_(
      target?.label,
      config.bufferSampleBytes,
      config.traceBufferWriteBytes,
      config.bufferProbePattern,
    );
  const recordCpuBufferWrite = (buffer, target, offset, bytes) => {
    if (
      target === undefined ||
      bytes === null ||
      bufferSampleLimit(target) <= config.bufferSampleBytes
    ) {
      return;
    }
    const snapshot = updateCpuBufferSnapshot_(
      cpuBufferSnapshots.get(buffer) ?? null,
      target.size,
      offset,
      bytes,
      config.traceBufferWriteBytes,
    );
    if (snapshot === null) return;
    cpuBufferSnapshots.set(buffer, snapshot);
    target.cpuAuthoredSnapshot = {
      coveredBytes: snapshot.coveredBytes,
      coverageComplete: snapshot.coverageComplete,
      ranges: snapshot.ranges,
      sample: sampleBufferData_(snapshot.bytes, snapshot.bytes.byteLength),
    };
  };
  const patch = (instance, methodName, handler) => {
    if (instance === null || instance === undefined) return;
    const prototype = Object.getPrototypeOf(instance);
    const methods = patchedMethods.get(prototype) ?? new Set();
    if (methods.has(methodName) || typeof prototype?.[methodName] !== "function") return;
    const original = prototype[methodName];
    try {
      Object.defineProperty(prototype, methodName, {
        configurable: true,
        value: function (...args) {
          return handler.call(this, original, args);
        },
        writable: true,
      });
      methods.add(methodName);
      patchedMethods.set(prototype, methods);
    } catch (error) {
      errors.push(`Unable to observe ${methodName}: ${String(error)}`);
    }
  };
  const extent = (size) => ({
    depthOrArrayLayers: Number(size?.depthOrArrayLayers ?? size?.[2] ?? 1),
    height: Number(size?.height ?? size?.[1] ?? 1),
    width: Number(size?.width ?? size?.[0] ?? 1),
  });
  const origin = (value) => ({
    x: Number(value?.x ?? value?.[0] ?? 0),
    y: Number(value?.y ?? value?.[1] ?? 0),
    z: Number(value?.z ?? value?.[2] ?? 0),
  });
  const color = (value) => [
    Number(value?.r ?? value?.[0] ?? 0),
    Number(value?.g ?? value?.[1] ?? 0),
    Number(value?.b ?? value?.[2] ?? 0),
    Number(value?.a ?? value?.[3] ?? 0),
  ];
  const hashText = (text) => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  const limits = (supportedLimits) => {
    const names = [
      "maxBindGroups",
      "maxBindingsPerBindGroup",
      "maxBufferSize",
      "maxColorAttachments",
      "maxComputeInvocationsPerWorkgroup",
      "maxComputeWorkgroupsPerDimension",
      "maxStorageBufferBindingSize",
      "maxTextureDimension2D",
    ];
    return Object.fromEntries(names.map((name) => [name, Number(supportedLimits[name])]));
  };
  const writtenBytes = (data, dataOffset = 0, size) => {
    try {
      const typedArray = ArrayBuffer.isView(data) && !(data instanceof DataView);
      const elementBytes = typedArray ? Number(data.BYTES_PER_ELEMENT ?? 1) : 1;
      const sourceOffset = Number(dataOffset ?? 0) * elementBytes;
      const sourceBytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      const byteLength =
        size === undefined
          ? sourceBytes.byteLength - sourceOffset
          : Number(size) * elementBytes;
      return sourceBytes.subarray(sourceOffset, sourceOffset + byteLength);
    } catch {
      return null;
    }
  };
  const appendTraceBufferWrite = (
    target,
    bufferOffset,
    bytes,
    source,
    callsite,
  ) => {
    if (activeTrace === null || target === undefined || bytes === null) return;
    const pattern = new RegExp(config.traceBufferWritePattern, "i");
    if (!pattern.test(target.label || `buffer ${target.id}`)) return;
    traceWriteSequence += 1;
    activeTrace.bufferWriteCount += 1;
    if (activeTrace.bufferWrites.length >= config.maximumTraceBufferWrites) {
      activeTrace.bufferWriteOverflow += 1;
      return;
    }
    const write = {
      bufferId: target.id,
      bufferOffset: Number(bufferOffset ?? 0),
      byteLength: Number(bytes.byteLength ?? 0),
      callsite,
      id: traceWriteSequence,
      label: target.label,
      sample: sampleBufferData_(bytes, config.traceBufferWriteBytes),
      source,
      telemetryFrameIndex:
        window.__WEBGPU_AOT__?.latestFrame?.frameIndex ?? null,
    };
    activeTrace.bufferWrites.push(write);
    const writes = traceWritesByBuffer.get(target.id) ?? [];
    writes.push(write);
    traceWritesByBuffer.set(target.id, writes);
  };
  const observeBuffer = (buffer, descriptor = {}, creationCallsite = null) => {
    if (resourceIds.buffers.has(buffer)) return;
    const record = {
      id: nextId++,
      creationCallsite,
      label: descriptor.label ?? buffer.label ?? "",
      lastWrite: null,
      mappedAtCreation: descriptor.mappedAtCreation === true,
      size: Number(descriptor.size ?? buffer.size ?? 0),
      uploadedBytes: 0,
      usage: Number(descriptor.usage ?? buffer.usage ?? 0),
      writeCount: 0,
    };
    resourceIds.buffers.set(buffer, record.id);
    resourceRecords.buffers.set(buffer, record);
    bufferRecordsById.set(record.id, record);
    records.buffers.push(record);
    patch(buffer, "getMappedRange", function (original, args) {
      const range = original.apply(this, args);
      const ranges = mappedRanges.get(this) ?? [];
      ranges.push({ offset: Number(args[0] ?? 0), range });
      mappedRanges.set(this, ranges);
      return range;
    });
    patch(buffer, "unmap", function (original, args) {
      const target = resourceRecords.buffers.get(this);
      const ranges = mappedRanges.get(this) ?? [];
      if (target && ranges.length > 0) {
        const { offset, range } = ranges.at(-1);
        recordCpuBufferWrite(this, target, offset, new Uint8Array(range));
        target.lastWrite = {
          sample: sampleBufferData_(range, bufferSampleLimit(target)),
          source: "mapped",
        };
        target.uploadedBytes += range.byteLength;
        target.writeCount += 1;
        appendTraceBufferWrite(
          target,
          offset,
          new Uint8Array(range),
          "mapped",
          captureCallsite(),
        );
      }
      mappedRanges.delete(this);
      return original.apply(this, args);
    });
    patch(buffer, "destroy", function (original, args) {
      const target = resourceRecords.buffers.get(this);
      if (target) target.destroyed = true;
      return original.apply(this, args);
    });
  };
  const observeTexture = (texture, descriptor = {}, device = null) => {
    if (resourceIds.textures.has(texture)) return;
    const normalized = { ...safeValue(descriptor), size: extent(descriptor.size) };
    const record = {
      ...normalized,
      estimatedBytes: estimateTextureBytes_(normalized),
      id: nextId++,
      label: descriptor.label ?? texture.label ?? "",
      uploads: [],
    };
    resourceIds.textures.set(texture, record.id);
    resourceRecords.textures.set(texture, record);
    records.textures.push(record);
    if (device !== null) liveResources.devicesByTextureId.set(record.id, device);
    patch(texture, "createView", function (original, args) {
      const view = original.apply(this, args);
      const viewRecord = {
        descriptor: safeValue(args[0] ?? {}),
        id: nextId++,
        label: view.label ?? "",
        textureId: resourceIds.textures.get(this) ?? null,
      };
      resourceIds.textureViews.set(view, viewRecord.id);
      resourceRecords.textureViews.set(view, viewRecord);
      liveResources.textureViews.set(viewRecord.id, view);
      records.textureViews.push(viewRecord);
      return view;
    });
    patch(texture, "destroy", function (original, args) {
      const target = resourceRecords.textures.get(this);
      if (target) target.destroyed = true;
      return original.apply(this, args);
    });
  };
  const incrementPipelineUse = (passState, counter) => {
    if (passState === undefined) return;
    passState.summary[counter] += 1;
    const pipeline = passState.pipeline;
    if (pipeline !== null) {
      attributePipelineBindGroups_(pipeline, passState.bindGroups);
      attributePipelineBufferBindings_(
        pipeline,
        passState.vertexBuffers ?? new Map(),
        passState.indexBuffer ?? null,
      );
      pipeline.uses[counter] += 1;
    }
  };
  const beginTrace = (window) => {
    lastTrace = null;
    activeTrace = {
      bufferSnapshotBytes: 0,
      bufferSnapshotOverflow: 0,
      bufferWriteCount: 0,
      bufferWriteOverflow: 0,
      bufferWrites: [],
      commandCount: 0,
      commandOverflow: 0,
      endingFrame: Number(window?.endingFrame ?? 0),
      passes: [],
      startingFrame: Number(window?.startingFrame ?? 0),
      submissions: [],
    };
    tracePassSequence = 0;
    traceSubmitSequence = 0;
    traceWriteSequence = 0;
    traceWritesByBuffer = new Map();
    latestGpuWrites = new Map();
  };
  const endTrace = () => {
    const trace = activeTrace;
    activeTrace = null;
    lastTrace = trace;
    return trace;
  };
  const beginTracePass = (kind, descriptor) => {
    if (activeTrace === null) return null;
    const trace = {
      ...describePassDescriptor_(
        kind,
        descriptor,
        (view) => resourceRecords.textureViews.get(view) ?? null,
      ),
      commandOverflow: 0,
      commands: [],
      sequence: ++tracePassSequence,
      telemetryFrameIndex:
        window.__WEBGPU_AOT__?.latestFrame?.frameIndex ?? null,
    };
    activeTrace.passes.push(trace);
    return trace;
  };
  const appendTraceCommand = (passState, signature, bindings) => {
    if (
      activeTrace === null ||
      passState?.trace === null ||
      passState?.trace === undefined
    ) {
      return;
    }
    if (activeTrace.commandCount >= config.maximumTraceCommands) {
      activeTrace.commandOverflow += 1;
      passState.trace.commandOverflow += 1;
      return;
    }
    activeTrace.commandCount += 1;
    const bufferBindings = resolveExecutionBufferBindings_(
      bindings,
      records.bindGroups,
      records.bindGroupLayouts,
      records.buffers,
    );
    const resourceBindings = resolveExecutionResourceBindings_(
      bindings,
      records.bindGroups,
      records.textureViews,
      records.textures,
      records.samplers,
      records.buffers,
      passState.pipeline,
      records.shaderModules,
      describeWgslBindingLayout_,
    );
    passState.trace.commands.push({
      ...signature,
      bindings,
      bufferBindings,
      dynamicState:
        passState.dynamicState === undefined
          ? null
          : safeValue(passState.dynamicState),
      pipelineId: passState.pipeline?.id ?? null,
      resourceBindings,
      sequence: activeTrace.commandCount,
    });
  };
  const recordPassCommand = (passState, signature) => {
    const pipeline = passState?.pipeline;
    if (pipeline === null || pipeline === undefined) return;
    const bindings = describeExecutionBindings_(
      passState.bindGroups,
      passState.vertexBuffers,
      passState.indexBuffer,
      passState.dynamicOffsets,
    );
    recordCommandSignature_(
      pipeline.uses.commandSignatures,
      {
        ...signature,
        bindings,
      },
      config.maximumCommandSignatures,
      pipeline.uses.commandSignatureOverflow,
    );
    appendTraceCommand(passState, signature, bindings);
  };
  const appendUnique = (values, value) => {
    if (value !== null && value !== undefined && !values.includes(value)) {
      values.push(value);
    }
  };
  const observeRenderPass = (pass, summary, trace) => {
    renderPassStates.set(pass, {
      bindGroups: new Map(),
      dynamicOffsets: new Map(),
      dynamicState: {
        blendConstant: [0, 0, 0, 0],
        scissor: null,
        stencilReference: 0,
        viewport: null,
      },
      indexBuffer: null,
      pipeline: null,
      summary,
      trace,
      vertexBuffers: new Map(),
    });
    patch(pass, "setPipeline", function (original, args) {
      const state = renderPassStates.get(this);
      if (state !== undefined) {
        state.pipeline = pipelineRecords.get(args[0]) ?? null;
        if (state.pipeline !== null) {
          appendUnique(state.summary.pipelineIds, state.pipeline.id);
          attributePipelineBindGroups_(state.pipeline, state.bindGroups);
          attributePipelineBufferBindings_(
            state.pipeline,
            state.vertexBuffers,
            state.indexBuffer,
          );
          state.pipeline.uses.passBindings += 1;
        }
      }
      return original.apply(this, args);
    });
    patch(pass, "setBindGroup", function (original, args) {
      const state = renderPassStates.get(this);
      const bindGroupId = resourceIds.bindGroups.get(args[1]) ?? null;
      if (state !== undefined) {
        const slot = Number(args[0]);
        state.bindGroups.set(slot, bindGroupId);
        state.dynamicOffsets.set(
          slot,
          normalizeDynamicOffsets_(args[2], args[3], args[4]),
        );
        appendUnique(state.summary.bindGroupIds, bindGroupId);
        attributePipelineBindGroups_(state.pipeline, state.bindGroups);
      }
      return original.apply(this, args);
    });
    patch(pass, "setViewport", function (original, args) {
      const state = renderPassStates.get(this);
      if (state !== undefined) {
        state.dynamicState.viewport = {
          height: Number(args[3]),
          maxDepth: Number(args[5]),
          minDepth: Number(args[4]),
          width: Number(args[2]),
          x: Number(args[0]),
          y: Number(args[1]),
        };
      }
      return original.apply(this, args);
    });
    patch(pass, "setScissorRect", function (original, args) {
      const state = renderPassStates.get(this);
      if (state !== undefined) {
        state.dynamicState.scissor = {
          height: Number(args[3]),
          width: Number(args[2]),
          x: Number(args[0]),
          y: Number(args[1]),
        };
      }
      return original.apply(this, args);
    });
    patch(pass, "setBlendConstant", function (original, args) {
      const state = renderPassStates.get(this);
      if (state !== undefined) state.dynamicState.blendConstant = color(args[0]);
      return original.apply(this, args);
    });
    patch(pass, "setStencilReference", function (original, args) {
      const state = renderPassStates.get(this);
      if (state !== undefined) {
        state.dynamicState.stencilReference = Number(args[0]);
      }
      return original.apply(this, args);
    });
    patch(pass, "setVertexBuffer", function (original, args) {
      const state = renderPassStates.get(this);
      if (state !== undefined) {
        state.vertexBuffers.set(Number(args[0]), {
          bufferId: resourceIds.buffers.get(args[1]) ?? null,
          offset: Number(args[2] ?? 0),
          size: args[3] === undefined ? null : Number(args[3]),
        });
        attributePipelineBufferBindings_(
          state.pipeline,
          state.vertexBuffers,
          state.indexBuffer,
        );
      }
      return original.apply(this, args);
    });
    patch(pass, "setIndexBuffer", function (original, args) {
      const state = renderPassStates.get(this);
      if (state !== undefined) {
        state.indexBuffer = {
          bufferId: resourceIds.buffers.get(args[0]) ?? null,
          format: args[1] ?? null,
          offset: Number(args[2] ?? 0),
          size: args[3] === undefined ? null : Number(args[3]),
        };
        attributePipelineBufferBindings_(
          state.pipeline,
          state.vertexBuffers,
          state.indexBuffer,
        );
      }
      return original.apply(this, args);
    });
    patch(pass, "draw", function (original, args) {
      const state = renderPassStates.get(this);
      counters.drawCalls += 1;
      counters.totalVertices += Number(args[0] ?? 0) * Number(args[1] ?? 1);
      counters.totalInstances += Number(args[1] ?? 1);
      incrementPipelineUse(state, "drawCalls");
      recordPassCommand(state, {
        firstInstance: Number(args[3] ?? 0),
        firstVertex: Number(args[2] ?? 0),
        instanceCount: Number(args[1] ?? 1),
        kind: "draw",
        vertexCount: Number(args[0] ?? 0),
      });
      return original.apply(this, args);
    });
    patch(pass, "drawIndexed", function (original, args) {
      const state = renderPassStates.get(this);
      counters.drawIndexedCalls += 1;
      counters.totalIndices += Number(args[0] ?? 0) * Number(args[1] ?? 1);
      counters.totalInstances += Number(args[1] ?? 1);
      incrementPipelineUse(state, "drawIndexedCalls");
      recordPassCommand(state, {
        baseVertex: Number(args[3] ?? 0),
        firstIndex: Number(args[2] ?? 0),
        firstInstance: Number(args[4] ?? 0),
        indexCount: Number(args[0] ?? 0),
        instanceCount: Number(args[1] ?? 1),
        kind: "drawIndexed",
      });
      return original.apply(this, args);
    });
    for (const name of ["drawIndirect", "drawIndexedIndirect"]) {
      patch(pass, name, function (original, args) {
        const state = renderPassStates.get(this);
        counters.indirectDrawCalls += 1;
        incrementPipelineUse(state, "indirectDrawCalls");
        recordPassCommand(state, {
          bufferId: resourceIds.buffers.get(args[0]) ?? null,
          kind: name,
          offset: Number(args[1] ?? 0),
        });
        return original.apply(this, args);
      });
    }
  };
  const observeComputePass = (pass, summary, trace) => {
    computePassStates.set(pass, {
      bindGroups: new Map(),
      dynamicOffsets: new Map(),
      pipeline: null,
      summary,
      trace,
    });
    patch(pass, "setPipeline", function (original, args) {
      const state = computePassStates.get(this);
      if (state !== undefined) {
        state.pipeline = pipelineRecords.get(args[0]) ?? null;
        if (state.pipeline !== null) {
          appendUnique(state.summary.pipelineIds, state.pipeline.id);
          attributePipelineBindGroups_(state.pipeline, state.bindGroups);
          state.pipeline.uses.passBindings += 1;
        }
      }
      return original.apply(this, args);
    });
    patch(pass, "setBindGroup", function (original, args) {
      const state = computePassStates.get(this);
      const bindGroupId = resourceIds.bindGroups.get(args[1]) ?? null;
      if (state !== undefined) {
        const slot = Number(args[0]);
        state.bindGroups.set(slot, bindGroupId);
        state.dynamicOffsets.set(
          slot,
          normalizeDynamicOffsets_(args[2], args[3], args[4]),
        );
        appendUnique(state.summary.bindGroupIds, bindGroupId);
        attributePipelineBindGroups_(state.pipeline, state.bindGroups);
      }
      return original.apply(this, args);
    });
    patch(pass, "dispatchWorkgroups", function (original, args) {
      const state = computePassStates.get(this);
      counters.dispatchCalls += 1;
      counters.totalDispatchedWorkgroups +=
        Number(args[0] ?? 1) * Number(args[1] ?? 1) * Number(args[2] ?? 1);
      incrementPipelineUse(state, "dispatchCalls");
      recordPassCommand(state, {
        kind: "dispatchWorkgroups",
        x: Number(args[0] ?? 1),
        y: Number(args[1] ?? 1),
        z: Number(args[2] ?? 1),
      });
      return original.apply(this, args);
    });
    patch(pass, "dispatchWorkgroupsIndirect", function (original, args) {
      const state = computePassStates.get(this);
      counters.dispatchCalls += 1;
      incrementPipelineUse(state, "dispatchCalls");
      recordPassCommand(state, {
        bufferId: resourceIds.buffers.get(args[0]) ?? null,
        kind: "dispatchWorkgroupsIndirect",
        offset: Number(args[1] ?? 0),
      });
      return original.apply(this, args);
    });
  };
  const recordPipeline = (
    resource,
    kind,
    descriptor,
    asynchronous,
    creationCallsite,
  ) => {
    const record = {
      creationCallsite,
      id: nextId++,
      ...describePipelineDescriptor_(
        kind,
        descriptor,
        asynchronous,
        (module) => resourceIds.shaders.get(module) ?? null,
      ),
      layoutId:
        typeof descriptor.layout === "object"
          ? resourceIds.pipelineLayouts.get(descriptor.layout) ?? null
          : null,
      uses: {
        bindGroups: [],
        bindGroupSlots: [],
        commandSignatureOverflow: { count: 0 },
        commandSignatures: [],
        dispatchCalls: 0,
        drawCalls: 0,
        drawIndexedCalls: 0,
        indexBuffers: [],
        indirectDrawCalls: 0,
        passBindings: 0,
        vertexBuffers: [],
        vertexBufferSlots: [],
      },
    };
    records.pipelines.push(record);
    if (resource !== null) {
      resourceIds.pipelines.set(resource, record.id);
      pipelineRecords.set(resource, record);
    }
    return record;
  };
  const passSummary = (kind, descriptor) => {
    const normalized = describePassDescriptor_(
      kind,
      descriptor,
      (view) => resourceRecords.textureViews.get(view) ?? null,
    );
    const markRenderWrite = (view, details) => {
      const textureId = resourceRecords.textureViews.get(view)?.textureId;
      const record = records.textures.find(({ id }) => id === textureId);
      if (record === undefined) return;
      record.renderWriteCount = Number(record.renderWriteCount ?? 0) + 1;
      record.lastRenderWrite = {
        ...details,
        sequence: ++renderWriteSequence,
      };
    };
    for (const [attachmentIndex, attachment] of (
      descriptor.colorAttachments ?? []
    ).entries()) {
      if (attachment === null) continue;
      if (attachment.storeOp === "store") {
        markRenderWrite(attachment.view, {
          attachmentIndex,
          kind,
          label: descriptor.label ?? "",
          role: "color",
        });
      }
      if (attachment.resolveTarget !== undefined) {
        markRenderWrite(attachment.resolveTarget, {
          attachmentIndex,
          kind,
          label: descriptor.label ?? "",
          role: "resolve",
        });
      }
    }
    if (
      descriptor.depthStencilAttachment?.depthReadOnly !== true &&
      descriptor.depthStencilAttachment?.depthStoreOp === "store"
    ) {
      markRenderWrite(descriptor.depthStencilAttachment.view, {
        attachmentIndex: 0,
        kind,
        label: descriptor.label ?? "",
        role: "depth",
      });
    }
    const key = JSON.stringify(normalized);
    let summary = passSummaries.get(key);
    if (summary === undefined) {
      summary = {
        ...normalized,
        bindGroupIds: [],
        dispatchCalls: 0,
        drawCalls: 0,
        drawIndexedCalls: 0,
        id: nextId++,
        indirectDrawCalls: 0,
        occurrences: 0,
        pipelineIds: [],
      };
      passSummaries.set(key, summary);
      records.passSummaries.push(summary);
    }
    summary.occurrences += 1;
    return summary;
  };
  const observeQueue = (queue) => {
    patch(queue, "submit", function (original, args) {
      counters.queueSubmits += 1;
      counters.submittedCommandBuffers += Number(args[0]?.length ?? 0);
      if (activeTrace !== null) {
        const submissionSequence = ++traceSubmitSequence;
        const passSequences = [];
        const submittedCommands = [];
        for (const commandBuffer of args[0] ?? []) {
          for (const pass of commandBufferTracePasses.get(commandBuffer) ?? []) {
            if (!activeTrace.passes.includes(pass)) continue;
            pass.submissionSequence = submissionSequence;
            pass.writeSequenceAtSubmission = traceWriteSequence;
            passSequences.push(pass.sequence);
            for (const command of pass.commands ?? []) {
              submittedCommands.push(command);
              for (const binding of command.bufferBindings ?? []) {
                const writes = selectEffectiveBufferWrites_(
                  binding,
                  traceWritesByBuffer.get(binding.bufferId) ?? [],
                ).map((write) => write.id);
                binding.writeIds = writes;
                binding.latestWriteId = writes.at(-1) ?? null;
                const resourceBinding = (command.resourceBindings ?? []).find(
                  (candidate) =>
                    candidate.resource?.kind === "buffer" &&
                    Number(candidate.resource.bufferId) ===
                      Number(binding.bufferId) &&
                    Number(candidate.group) === Number(binding.group) &&
                    Number(candidate.binding) === Number(binding.binding),
                );
                const buffer = bufferRecordsById.get(binding.bufferId);
                const snapshot =
                  isReflectionProofSettingsBinding_(resourceBinding, buffer)
                    ? snapshotSmallBufferBinding_(
                        binding,
                        buffer,
                        submissionSequence,
                        config.maximumTraceBufferBindingSnapshotBytes,
                      )
                    : null;
                const snapshotBytes = Number(
                  snapshot?.sample?.sampledBytes ?? 0,
                );
                if (
                  snapshot !== null &&
                  activeTrace.bufferSnapshotBytes + snapshotBytes <=
                    config.maximumTraceBufferSnapshotBytes
                ) {
                  binding.submissionSnapshot = snapshot;
                  activeTrace.bufferSnapshotBytes += snapshotBytes;
                } else if (snapshot !== null) {
                  activeTrace.bufferSnapshotOverflow += 1;
                }
              }
            }
          }
        }
        attributeGpuBufferDependencies_(submittedCommands, latestGpuWrites);
        activeTrace.submissions.push({
          bufferWriteSequence: traceWriteSequence,
          commandBufferCount: Number(args[0]?.length ?? 0),
          passSequences,
          sequence: submissionSequence,
        });
      }
      return original.apply(this, args);
    });
    patch(queue, "writeBuffer", function (original, args) {
      const [buffer, bufferOffset, data, dataOffset, size] = args;
      const callsite = captureCallsite();
      observeBuffer(buffer, {}, callsite);
      const target = resourceRecords.buffers.get(buffer);
      const bytes = writtenBytes(data, dataOffset, size);
      const byteLength = Number(bytes?.byteLength ?? 0);
      counters.writeBufferCalls += 1;
      counters.writeBufferBytes += byteLength;
      if (target) {
        recordCpuBufferWrite(
          buffer,
          target,
          Number(bufferOffset ?? 0),
          bytes,
        );
        target.lastWrite = {
          bufferOffset: Number(bufferOffset ?? 0),
          byteLength,
          callsite,
          sample:
            bytes === null
              ? null
              : sampleBufferData_(bytes, bufferSampleLimit(target)),
          source: "queue",
        };
        target.uploadedBytes += byteLength;
        target.writeCount += 1;
        appendTraceBufferWrite(
          target,
          Number(bufferOffset ?? 0),
          bytes,
          "queue",
          callsite,
        );
      }
      return original.apply(this, args);
    });
    patch(queue, "writeTexture", function (original, args) {
      const [destination, data, dataLayout, copySize] = args;
      const target = resourceRecords.textures.get(destination?.texture);
      let sourceBytes = null;
      try {
        sourceBytes = ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : new Uint8Array(data);
      } catch {
        sourceBytes = null;
      }
      const formatInfo = describeTextureProbeFormat_(target?.format);
      const upload =
        formatInfo === null || formatInfo === undefined
          ? null
          : describeTextureUpload_(
              dataLayout,
              copySize,
              formatInfo.bytesPerPixel,
              sourceBytes?.byteLength ?? 0,
            );
      counters.writeTextureCalls += 1;
      counters.writeTextureBytes += Number(sourceBytes?.byteLength ?? 0);
      counters.writeTextureTexelBytes += Number(upload?.texelBytes ?? 0);
      if (target !== undefined) {
        target.uploads.push({
          aspect: destination.aspect ?? "all",
          kind: "writeTexture",
          mipLevel: Number(destination.mipLevel ?? 0),
          origin: origin(destination.origin),
          sample:
            sourceBytes === null
              ? null
              : sampleBufferData_(
                  sourceBytes.subarray(upload?.dataOffset ?? 0),
                  config.textureUploadSampleBytes,
                ),
          ...upload,
        });
      }
      return original.apply(this, args);
    });
    patch(queue, "copyExternalImageToTexture", function (original, args) {
      const [source, destination, copySize] = args;
      const target = resourceRecords.textures.get(destination?.texture);
      const formatInfo = describeTextureProbeFormat_(target?.format);
      const upload =
        formatInfo === null || formatInfo === undefined
          ? null
          : describeTextureUpload_(
              {},
              copySize,
              formatInfo.bytesPerPixel,
              0,
            );
      counters.copyExternalImageToTextureCalls += 1;
      counters.copyExternalImageToTextureTexelBytes += Number(
        upload?.texelBytes ?? 0,
      );
      if (target !== undefined) {
        const external = source?.source;
        target.uploads.push({
          aspect: destination.aspect ?? "all",
          colorSpace: source?.colorSpace ?? null,
          flipY: source?.flipY === true,
          kind: "copyExternalImageToTexture",
          mipLevel: Number(destination.mipLevel ?? 0),
          origin: origin(destination.origin),
          premultipliedAlpha: source?.premultipliedAlpha === true,
          sourceHeight: Number(
            external?.videoHeight ?? external?.naturalHeight ?? external?.height ?? 0,
          ),
          sourceWidth: Number(
            external?.videoWidth ?? external?.naturalWidth ?? external?.width ?? 0,
          ),
          ...upload,
        });
      }
      return original.apply(this, args);
    });
  };
  const observeCommandEncoder = (encoder) => {
    commandEncoderTracePasses.set(encoder, []);
    patch(encoder, "beginRenderPass", function (original, args) {
      counters.renderPasses += 1;
      const pass = original.apply(this, args);
      const trace = beginTracePass("render", args[0] ?? {});
      if (trace !== null) commandEncoderTracePasses.get(this)?.push(trace);
      observeRenderPass(
        pass,
        passSummary("render", args[0] ?? {}),
        trace,
      );
      return pass;
    });
    patch(encoder, "beginComputePass", function (original, args) {
      counters.computePasses += 1;
      const pass = original.apply(this, args);
      const trace = beginTracePass("compute", args[0] ?? {});
      if (trace !== null) commandEncoderTracePasses.get(this)?.push(trace);
      observeComputePass(
        pass,
        passSummary("compute", args[0] ?? {}),
        trace,
      );
      return pass;
    });
    patch(encoder, "finish", function (original, args) {
      const commandBuffer = original.apply(this, args);
      commandBufferTracePasses.set(
        commandBuffer,
        [...(commandEncoderTracePasses.get(this) ?? [])],
      );
      return commandBuffer;
    });
  };
  const observeDevice = (device, descriptor = {}) => {
    if (resourceIds.devices.has(device)) return;
    const id = nextId++;
    resourceIds.devices.set(device, id);
    records.devices.push({
      features: [...device.features],
      id,
      label: device.label ?? "",
      limits: limits(device.limits),
      requested: safeValue(descriptor),
    });
    observeQueue(device.queue);
    device.addEventListener("uncapturederror", (event) => {
      errors.push(`Uncaptured GPU error: ${event.error?.message ?? String(event.error)}`);
    });
    void device.lost.then((info) => {
      errors.push(`GPU device lost: ${info.message}`);
    });
    patch(device, "createBuffer", function (original, args) {
      const descriptor = args[0] ?? {};
      const usage = Number(descriptor.usage ?? 0);
      const modelUsage =
        GPUBufferUsage.INDEX |
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.UNIFORM |
        GPUBufferUsage.VERTEX;
      const probeCandidate =
        (usage & modelUsage) !== 0 &&
        Number(descriptor.size ?? 0) > 0 &&
        Number(descriptor.size ?? 0) <= config.maximumBufferProbeCandidateBytes;
      const copySourceInjected =
        probeCandidate && (usage & GPUBufferUsage.COPY_SRC) === 0;
      const creationDescriptor = copySourceInjected
        ? { ...descriptor, usage: usage | GPUBufferUsage.COPY_SRC }
        : descriptor;
      const resource = original.call(this, creationDescriptor);
      observeBuffer(resource, descriptor, captureCallsite());
      const record = resourceRecords.buffers.get(resource);
      if (record !== undefined) {
        record.probeCopySourceInjected = copySourceInjected;
        record.probeCandidate = probeCandidate;
        record.probeEnabled = false;
      }
      if (probeCandidate) {
        bufferProbeTargets.push({
          device: this,
          label: descriptor.label ?? "",
          record,
          size: Number(descriptor.size ?? 0),
          buffer: resource,
        });
      }
      return resource;
    });
    patch(device, "createTexture", function (original, args) {
      const descriptor = args[0] ?? {};
      const size = extent(descriptor.size);
      const probeFormat = describeTextureProbeFormat_(descriptor.format);
      const probePattern = new RegExp(config.textureProbePattern, "i");
      const probeEnabled =
        probeFormat !== null &&
        Number(descriptor.sampleCount ?? 1) === 1 &&
        (descriptor.dimension ?? "2d") === "2d" &&
        size.width > 4 &&
        size.height > 4 &&
        probePattern.test(descriptor.label ?? "") &&
        textureProbeTargets.length < config.maximumTextureProbes;
      const usage = Number(descriptor.usage ?? 0);
      const copySourceInjected =
        probeEnabled && (usage & GPUTextureUsage.COPY_SRC) === 0;
      const creationDescriptor = copySourceInjected
        ? { ...descriptor, usage: usage | GPUTextureUsage.COPY_SRC }
        : descriptor;
      const resource = original.call(this, creationDescriptor);
      observeTexture(resource, descriptor, this);
      const record = resourceRecords.textures.get(resource);
      if (record !== undefined) {
        record.creationCallsite = captureCallsite();
        record.probeCopySourceInjected = copySourceInjected;
        record.probeEnabled = probeEnabled;
      }
      if (probeEnabled) {
        textureProbeTargets.push({
          device: this,
          format: descriptor.format,
          formatInfo: probeFormat,
          label: descriptor.label ?? "",
          record,
          size,
          texture: resource,
        });
      }
      return resource;
    });
    patch(device, "createSampler", function (original, args) {
      const resource = original.apply(this, args);
      const record = {
        creationCallsite: captureCallsite(),
        id: nextId++,
        ...safeValue(args[0] ?? {}),
      };
      resourceIds.samplers.set(resource, record.id);
      liveResources.samplers.set(record.id, resource);
      records.samplers.push(record);
      return resource;
    });
    patch(device, "createBindGroupLayout", function (original, args) {
      const resource = original.apply(this, args);
      const descriptor = args[0] ?? {};
      const record = {
        creationCallsite: captureCallsite(),
        entries: (descriptor.entries ?? []).map((entry) => ({
          binding: Number(entry.binding),
          buffer: safeValue(entry.buffer),
          externalTexture: safeValue(entry.externalTexture),
          sampler: safeValue(entry.sampler),
          storageTexture: safeValue(entry.storageTexture),
          texture: safeValue(entry.texture),
          visibility: Number(entry.visibility),
        })),
        id: nextId++,
        label: descriptor.label ?? "",
      };
      resourceIds.bindGroupLayouts.set(resource, record.id);
      records.bindGroupLayouts.push(record);
      return resource;
    });
    patch(device, "createPipelineLayout", function (original, args) {
      const resource = original.apply(this, args);
      const descriptor = args[0] ?? {};
      const record = {
        bindGroupLayoutIds: (descriptor.bindGroupLayouts ?? []).map(
          (layout) => resourceIds.bindGroupLayouts.get(layout) ?? null,
        ),
        creationCallsite: captureCallsite(),
        id: nextId++,
        label: descriptor.label ?? "",
      };
      resourceIds.pipelineLayouts.set(resource, record.id);
      records.pipelineLayouts.push(record);
      return resource;
    });
    patch(device, "createShaderModule", function (original, args) {
      const resource = original.apply(this, args);
      const code = String(args[0]?.code ?? "");
      const record = {
        characters: code.length,
        analysis: analyzeWgsl_(code),
        code,
        creationCallsite: captureCallsite(),
        hash: hashText(code),
        id: nextId++,
        label: args[0]?.label ?? "",
        lines: code.length === 0 ? 0 : code.split("\n").length,
        messages: [],
      };
      resourceIds.shaders.set(resource, record.id);
      records.shaderModules.push(record);
      void resource.getCompilationInfo?.().then((info) => {
        record.messages = info.messages.map((message) => ({
          line: message.lineNum,
          message: message.message,
          type: message.type,
        }));
      });
      return resource;
    });
    patch(device, "createBindGroup", function (original, args) {
      const resource = original.apply(this, args);
      const descriptor = args[0] ?? {};
      const record = {
        creationCallsite: captureCallsite(),
        entries: (descriptor.entries ?? []).map((entry) => {
          const binding = Number(entry.binding);
          const bindingResource = entry.resource;
          if (bindingResource?.buffer !== undefined) {
            return {
              binding,
              bufferId:
                resourceIds.buffers.get(bindingResource.buffer) ?? null,
              offset: Number(bindingResource.offset ?? 0),
              size:
                bindingResource.size === undefined
                  ? null
                  : Number(bindingResource.size),
              type: "buffer",
            };
          }
          const samplerId = resourceIds.samplers.get(bindingResource);
          if (samplerId !== undefined) {
            return { binding, samplerId, type: "sampler" };
          }
          const textureViewId = resourceIds.textureViews.get(bindingResource);
          if (textureViewId !== undefined) {
            return { binding, textureViewId, type: "textureView" };
          }
          return { binding, label: bindingResource?.label ?? "", type: "unknown" };
        }),
        id: nextId++,
        label: descriptor.label ?? "",
        layoutId: resourceIds.bindGroupLayouts.get(descriptor.layout) ?? null,
      };
      resourceIds.bindGroups.set(resource, record.id);
      records.bindGroups.push(record);
      return resource;
    });
    for (const [method, kind, asynchronous] of [
      ["createRenderPipeline", "render", false],
      ["createComputePipeline", "compute", false],
    ]) {
      patch(device, method, function (original, args) {
        const resource = original.apply(this, args);
        recordPipeline(
          resource,
          kind,
          args[0],
          asynchronous,
          captureCallsite(),
        );
        return resource;
      });
    }
    for (const [method, kind] of [
      ["createRenderPipelineAsync", "render"],
      ["createComputePipelineAsync", "compute"],
    ]) {
      patch(device, method, function (original, args) {
        const promise = original.apply(this, args);
        const record = recordPipeline(
          null,
          kind,
          args[0],
          true,
          captureCallsite(),
        );
        void promise.then((resource) => {
          resourceIds.pipelines.set(resource, record.id);
          pipelineRecords.set(resource, record);
        });
        return promise;
      });
    }
    patch(device, "createCommandEncoder", function (original, args) {
      counters.commandEncoders += 1;
      const encoder = original.apply(this, args);
      observeCommandEncoder(encoder);
      return encoder;
    });
  };
  const observeAdapter = (adapter, descriptor = {}) => {
    records.adapters.push({
      features: [...adapter.features],
      info: safeValue(adapter.info ?? {}),
      limits: limits(adapter.limits),
      requested: safeValue(descriptor),
    });
    patch(adapter, "requestDevice", async function (original, args) {
      const device = await original.apply(this, args);
      observeDevice(device, args[0]);
      return device;
    });
  };
  const gpu = navigator.gpu;
  if (gpu) {
    patch(gpu, "requestAdapter", async function (original, args) {
      const adapter = await original.apply(this, args);
      if (adapter) observeAdapter(adapter, args[0]);
      return adapter;
    });
  } else {
    errors.push("navigator.gpu is unavailable before application startup");
  }
  patch(document.createElement("canvas"), "getContext", function (original, args) {
    const context = original.apply(this, args);
    if (args[0] === "webgpu" && context) {
      const canvas = this;
      patch(context, "configure", function (configure, configureArgs) {
        const descriptor = configureArgs[0] ?? {};
        records.canvasConfigurations.push({
          alphaMode: descriptor.alphaMode ?? "opaque",
          colorSpace: descriptor.colorSpace ?? "srgb",
          deviceId: resourceIds.devices.get(descriptor.device) ?? null,
          format: descriptor.format ?? null,
          height: canvas.height,
          toneMapping: safeValue(descriptor.toneMapping ?? {}),
          usage: Number(descriptor.usage ?? 0),
          width: canvas.width,
        });
        return configure.apply(this, configureArgs);
      });
    }
    return context;
  });

  const capture = () => ({
    ...records,
    counters: { ...counters },
    errors: [...errors],
    resources: {
      bufferBytes: records.buffers.reduce((sum, buffer) => sum + buffer.size, 0),
      bufferCount: records.buffers.length,
      estimatedTextureBytes: records.textures.reduce(
        (sum, texture) => sum + (texture.estimatedBytes ?? 0),
        0,
      ),
      textureCount: records.textures.length,
      texturesWithUnknownSize: records.textures.filter(
        (texture) => texture.estimatedBytes === null,
      ).length,
    },
  });
  const workload = () => ({
    passes: records.passSummaries.map((summary) => ({
      dispatchCalls: summary.dispatchCalls,
      drawCalls: summary.drawCalls,
      drawIndexedCalls: summary.drawIndexedCalls,
      id: summary.id,
      indirectDrawCalls: summary.indirectDrawCalls,
      kind: summary.kind,
      label: summary.label,
      occurrences: summary.occurrences,
    })),
    pipelines: records.pipelines.map((pipeline) => ({
      dispatchCalls: pipeline.uses.dispatchCalls,
      drawCalls: pipeline.uses.drawCalls,
      drawIndexedCalls: pipeline.uses.drawIndexedCalls,
      id: pipeline.id,
      indirectDrawCalls: pipeline.uses.indirectDrawCalls,
      kind: pipeline.kind,
      label: pipeline.label,
      passBindings: pipeline.uses.passBindings,
    })),
  });
  const analyzePng = async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, config.pixelSampleWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const pixelMetrics = calculatePixelMetrics_(pixels, width, height);
    const { spatial, ...regions } = pixelMetrics;
    const sourceHeight = bitmap.height;
    const sourceWidth = bitmap.width;
    bitmap.close();
    return {
      regions,
      sampleHeight: height,
      sampleWidth: width,
      sourceHeight,
      sourceWidth,
      spatial,
    };
  };
  const probeSelectedReflection = (trace, capturedFrameIndex = null) =>
    probeSelectedReflection_(trace, capturedFrameIndex, {
      createPlan: createSelectedReflectionSamplePlan_,
      decode: decodeSelectedReflectionSamples_,
      devicesByTextureId: liveResources.devicesByTextureId,
      plan: config.textureProbePlan,
      records,
      resolve: resolveSelectedReflection_,
      sampleStrideBytes: selectedReflectionSampleStrideBytes_,
      samplers: liveResources.samplers,
      summarize: summarizeProbeValues_,
      summarizeSamples: summarizeSelectedReflectionSamples_,
      targetSlug: config.targetSlug,
      textureViews: liveResources.textureViews,
    });
  const decodeFloat16 = (bits) => {
    const sign = (bits & 0x8000) === 0 ? 1 : -1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x03ff;
    if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
    if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : NaN;
    return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  };
  const probeBuffers = async (capturedFrameIndex = null) => {
    const results = [];
    const probeErrors = [];
    const bindGroups = new Map(
      records.bindGroups.map((bindGroup) => [bindGroup.id, bindGroup]),
    );
    const executionScores = new Map();
    const scoreBuffer = (bufferId, score) => {
      if (bufferId === null || bufferId === undefined) return;
      executionScores.set(
        bufferId,
        Math.max(Number(executionScores.get(bufferId) ?? 0), score),
      );
    };
    const tracedCommands = (lastTrace?.passes ?? []).flatMap(
      (pass) => pass.commands ?? [],
    );
    const commands =
      tracedCommands.length > 0
        ? tracedCommands
        : records.pipelines.flatMap(
            (pipeline) => pipeline.uses.commandSignatures ?? [],
          );
    for (const command of commands) {
      const elementCount = Math.max(
        Number(command.indexCount ?? 0),
        Number(command.vertexCount ?? 0),
        Number(command.x ?? 0) *
          Number(command.y ?? 1) *
          Number(command.z ?? 1),
      );
      const score =
        Number(command.instanceCount ?? 0) * 1_000_000 + elementCount;
      for (const binding of command.bindings?.vertexBuffers ?? []) {
        scoreBuffer(binding.bufferId, score);
      }
      scoreBuffer(command.bindings?.indexBuffer?.bufferId, score);
      for (const binding of command.bindings?.bindGroups ?? []) {
        for (const entry of bindGroups.get(binding.bindGroupId)?.entries ?? []) {
          if (entry.type === "buffer") scoreBuffer(entry.bufferId, score);
        }
      }
    }
    const selectedTargets = selectBufferProbeTargets_(
      bufferProbeTargets.map((target) => ({
        ...target,
        executionScore: executionScores.get(target.record?.id) ?? 0,
      })),
      config.maximumBufferProbes,
      config.bufferProbePattern,
    );
    for (const target of selectedTargets) {
      if (target.record !== undefined) target.record.probeEnabled = true;
      let readback;
      try {
        const plan = createBufferProbePlan_(
          target.size,
          config.bufferProbeBytes,
        );
        const readbackSize = plan.reduce(
          (maximum, range) =>
            Math.max(maximum, range.destinationOffset + range.size),
          0,
        );
        if (readbackSize === 0) continue;
        readback = target.device.createBuffer({
          label: `WebGPU observer buffer readback for ${target.label}`,
          size: readbackSize,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = target.device.createCommandEncoder({
          label: `WebGPU observer buffer probe for ${target.label}`,
        });
        for (const range of plan) {
          encoder.copyBufferToBuffer(
            target.buffer,
            range.sourceOffset,
            readback,
            range.destinationOffset,
            range.size,
          );
        }
        target.device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const bytes = new Uint8Array(readback.getMappedRange());
        const contracts = [
          ...new Map(
            commands
              .flatMap((command) => command.resourceBindings ?? [])
              .filter(
                (binding) => binding.resource?.bufferId === target.record?.id,
              )
              .flatMap((binding) => binding.shaderBindings ?? [])
              .filter((binding) => binding.layout !== undefined)
              .map((binding) => [JSON.stringify(binding), binding]),
          ).values(),
        ];
        const cpuComparison = compareCpuGpuBufferSnapshots_(
          cpuBufferSnapshots.get(target.buffer) ?? null,
          bytes,
          plan,
          contracts.map(({ layout }) => layout),
        );
        const decodedLayouts = groupWgslBufferLayoutBindings_(contracts).map(
          (binding) => ({
            bindingNames: binding.bindingNames,
            decoded: decodeWgslBufferLayout_(bytes, plan, binding.layout),
            members: binding.layout.members,
            stages: binding.stages,
            type: binding.type,
          }),
        );
        const reportedContracts = contracts.map((binding) => ({
          ...binding,
          ...(binding.layout === undefined
            ? {}
            : {
                layout: Object.fromEntries(
                  Object.entries(binding.layout).filter(
                    ([name]) => name !== "members",
                  ),
                ),
              }),
        }));
        results.push({
          contracts: reportedContracts,
          cpuComparison,
          capturedFrameIndex,
          decodedLayouts,
          label:
            target.label || `unlabeled execution buffer ${target.record?.id}`,
          ranges: plan.map((range) => ({
            ...range,
            sample: sampleBufferData_(
              bytes.subarray(
                range.destinationOffset,
                range.destinationOffset + range.size,
              ),
              range.size,
            ),
          })),
          size: target.size,
          bufferId: target.record?.id ?? null,
          selection: target.selection,
          usage: target.record?.usage ?? null,
        });
        readback.unmap();
      } catch (error) {
        probeErrors.push(
          `${target.label || `buffer ${target.record?.id}`}: ${String(error)}`,
        );
      } finally {
        readback?.destroy();
      }
    }
    return { errors: probeErrors, results };
  };
  const probeTextures = async (capturedFrameIndex = null) => {
    const plan = config.textureProbePlan;
    const sampleCount = plan.length;
    const stride = 256;
    const results = [];
    const probeErrors = [];
    for (const target of textureProbeTargets) {
      if (!isLiveTextureProbeTarget_(target)) continue;
      let buffer;
      try {
        const subresources = createTextureProbeSubresources_(
          target.size,
          target.record?.mipLevelCount ?? 1,
          config.maximumTextureProbeArrayLayers,
          config.maximumTextureProbeMipLevels,
        );
        buffer = target.device.createBuffer({
          label: `WebGPU observer readback for ${target.label}`,
          size: sampleCount * subresources.length * stride,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = target.device.createCommandEncoder({
          label: `WebGPU observer probe for ${target.label}`,
        });
        for (const [subresourceIndex, subresource] of subresources.entries()) {
          for (let index = 0; index < plan.length; index += 1) {
            const point = plan[index];
            const x = Math.min(
              subresource.width - 1,
              Math.floor(point.x * subresource.width),
            );
            const y = Math.min(
              subresource.height - 1,
              Math.floor(point.y * subresource.height),
            );
            encoder.copyTextureToBuffer(
              {
                mipLevel: subresource.mipLevel,
                origin: [x, y, subresource.arrayLayer],
                texture: target.texture,
              },
              {
                buffer,
                bytesPerRow: stride,
                offset: (subresourceIndex * sampleCount + index) * stride,
                rowsPerImage: 1,
              },
              [1, 1, 1],
            );
          }
        }
        target.device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ);
        const bytes = new Uint8Array(buffer.getMappedRange());
        const samples = [];
        for (let index = 0; index < sampleCount * subresources.length; index += 1) {
          const offset = index * stride;
          const subresource = subresources[Math.floor(index / sampleCount)];
          const point = plan[index % sampleCount];
          const values = [];
          for (let channel = 0; channel < target.formatInfo.channels; channel += 1) {
            const channelOffset =
              offset +
              (target.formatInfo.bytesPerPixel / target.formatInfo.channels) *
                channel;
            let value;
            if (target.formatInfo.encoding === "unorm8") {
              value = bytes[channelOffset] / 255;
            } else if (target.formatInfo.encoding === "float16") {
              value = decodeFloat16(
                bytes[channelOffset] | (bytes[channelOffset + 1] << 8),
              );
            } else {
              value = new DataView(
                bytes.buffer,
                bytes.byteOffset + channelOffset,
                4,
              ).getFloat32(0, true);
            }
            const normalized = Number.isFinite(value) ? value : 0;
            values.push(normalized);
          }
          let luminance;
          if (values.length >= 3) {
            const rgb = target.format.startsWith("bgra")
              ? [values[2], values[1], values[0]]
              : values;
            luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
          } else {
            luminance = values[0];
          }
          samples.push({
            arrayLayer: subresource.arrayLayer,
            channels: values,
            luminance,
            mipLevel: subresource.mipLevel,
            region: point.region,
            x: point.x,
            y: point.y,
          });
        }
        const summarizeSamples = (selected) => ({
          channels: Array.from(
            { length: target.formatInfo.channels },
            (_, channel) =>
              summarizeProbeValues_(
                selected.map((sample) => sample.channels[channel]),
              ),
          ),
          luminance: summarizeProbeValues_(
            selected.map((sample) => sample.luminance),
          ),
          sampleCount: selected.length,
        });
        const baseSamples = samples.filter(
          ({ arrayLayer, mipLevel }) => arrayLayer === 0 && mipLevel === 0,
        );
        const regions = Object.fromEntries(
          [...new Set(plan.map(({ region }) => region))].map((region) => [
            region,
            summarizeSamples(
              baseSamples.filter((sample) => sample.region === region),
            ),
          ]),
        );
        results.push({
          ...summarizeSamples(baseSamples),
          format: target.format,
          label: target.label,
          capturedFrameIndex,
          lastRenderWrite: target.record?.lastRenderWrite ?? null,
          lightingCues: calculateSampledLightingCues_(baseSamples),
          regions,
          renderWriteCount: Number(target.record?.renderWriteCount ?? 0),
          subresources: subresources.map((subresource) => ({
            ...subresource,
            ...summarizeSamples(
              samples.filter(
                ({ arrayLayer, mipLevel }) =>
                  arrayLayer === subresource.arrayLayer &&
                  mipLevel === subresource.mipLevel,
              ),
            ),
          })),
          textureId: target.record?.id ?? null,
        });
        buffer.unmap();
      } catch (error) {
        probeErrors.push(`${target.label}: ${String(error)}`);
      } finally {
        buffer?.destroy();
      }
    }
    return { errors: probeErrors, results };
  };
  Object.defineProperty(window, "__WEBGPU_COMPARE__", {
    configurable: false,
    value: {
      animation: animationFrameGate,
      analyzePng,
      beginTrace,
      capture,
      counters: () => ({ ...counters }),
      endTrace,
      probeBuffers,
      probeSelectedReflection,
      probeTextures,
      workload,
    },
  });
}

export function createWebGpuObserverScript(config = {}) {
  const settings = {
    bufferSampleBytes: 128,
    bufferProbeBytes: 32768,
    bufferProbePattern: "(?:particle|light|render|frame|cascade)",
    maximumBufferProbeCandidateBytes: 1048576,
    maximumBufferProbes: 12,
    maximumCommandSignatures: 16,
    maximumTextureProbes: 24,
    maximumTextureProbeArrayLayers: 6,
    maximumTextureProbeMipLevels: 3,
    maximumTraceCommands: 50_000,
    maximumTraceBufferBindingSnapshotBytes: 256,
    maximumTraceBufferSnapshotBytes: 65_536,
    maximumTraceBufferWrites: 10_000,
    pixelSampleWidth: 320,
    textureProbePattern:
      "(?:ambient|occlusion|GTAO|AO$|HDR|environment|prefiltered|convolved|BRDF|(?:^|[^A-Za-z0-9])LUT(?:[^A-Za-z0-9]|$)|normal|surface|world.position|metalrough|reflection|SSR|bloom|history|temporal|TRAA|velocity|resolve$|output$)",
    textureProbePlan: createTextureProbePlan(),
    textureUploadSampleBytes: 64,
    traceBufferWriteBytes: 32_768,
    traceBufferWritePattern: ".",
    targetSlug: null,
    ...config,
  };
  const instrumentedAnalyzeWgsl = `(source) => (${analyzeWgsl.toString()})(source, ${calculateWgslStructureLayouts.toString()})`;
  const instrumentedResolveSelectedReflection = `(trace, frame, resources, targetSlug) => (${resolveSelectedReflectionCore.toString()})(trace, frame, resources, targetSlug, (${resolveAntikySelectedReflection.toString()}), (${validateAntikySelectedReflectionReconstruction.toString()}))`;
  return `(${installWebGpuObserver.toString()})(${JSON.stringify(settings)}, ${estimateTextureBytes.toString()}, ${calculatePixelMetrics.toString()}, ${instrumentedAnalyzeWgsl}, ${compareCpuGpuBufferSnapshots.toString()}, ${attributeGpuBufferDependencies.toString()}, ${describePipelineDescriptor.toString()}, ${describePassDescriptor.toString()}, ${describeTextureProbeFormat.toString()}, ${describeTextureUpload.toString()}, ${describeWgslBindingLayout.toString()}, ${createTextureProbeSubresources.toString()}, ${createBufferProbePlan.toString()}, ${decodeWgslBufferLayout.toString()}, ${groupWgslBufferLayoutBindings.toString()}, ${sampleBufferData.toString()}, ${selectBufferSampleLimit.toString()}, ${attributePipelineBufferBindings.toString()}, ${attributePipelineBindGroups.toString()}, ${describeExecutionBindings.toString()}, ${normalizeDynamicOffsets.toString()}, ${normalizeJavaScriptCallsite.toString()}, ${recordCommandSignature.toString()}, ${resolveExecutionBufferBindings.toString()}, ${resolveExecutionResourceBindings.toString()}, ${selectEffectiveBufferWrites.toString()}, ${snapshotSmallBufferBinding.toString()}, ${isReflectionProofSettingsBinding.toString()}, ${selectBufferProbeTargets.toString()}, ${summarizeProbeValues.toString()}, ${updateCpuBufferSnapshot.toString()}, ${isLiveTextureProbeTarget.toString()}, ${calculateSampledLightingCues.toString()}, ${createAnimationFrameGate.toString()}, ${probeSelectedReflection.toString()}, ${instrumentedResolveSelectedReflection}, ${createSelectedReflectionSamplePlan.toString()}, ${decodeSelectedReflectionSamples.toString()}, ${selectedReflectionSampleStrideBytes}, ${summarizeSelectedReflectionSamples.toString()});`;
}

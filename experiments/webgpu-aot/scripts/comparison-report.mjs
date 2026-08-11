import {
  extractParticleState,
  findParticleParity,
} from "./comparison-particles.mjs";
import { findLightingCues } from "./comparison-lighting.mjs";
import { findPreCompositeLightingCues } from "./comparison-hdr-lighting.mjs";
import {
  evaluateSelectedReflectionQuality,
  findSelectedReflectionComparison,
} from "./comparison-reflections.mjs";

export {
  extractParticleState,
  evaluateSelectedReflectionQuality,
  findLightingCues,
  findParticleParity,
  findPreCompositeLightingCues,
  findSelectedReflectionComparison,
};

const WORKLOAD_COUNTERS = Object.freeze([
  "commandEncoders",
  "computePasses",
  "dispatchCalls",
  "drawCalls",
  "drawIndexedCalls",
  "renderPasses",
  "submittedCommandBuffers",
  "totalIndices",
  "totalInstances",
  "totalVertices",
]);

const RESOURCE_COUNTERS = Object.freeze([
  "bufferBytes",
  "bufferCount",
  "estimatedTextureBytes",
  "textureCount",
]);

export const VISUAL_PARITY_THRESHOLD = 0.9;
const PRESENTATION_REGIONS = Object.freeze([
  "center",
  "floor",
  "full",
  "leftFire",
  "rightFire",
  "upperGallery",
]);

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value) {
  return Number(value.toFixed(6));
}

function presentationRegions(metrics) {
  return metrics?.regions ?? metrics ?? {};
}

function normalizedHistogram(histogram) {
  const total = (histogram ?? []).reduce((sum, value) => sum + value, 0);
  return total === 0 ? [] : histogram.map((value) => value / total);
}

function histogramSimilarity(candidate, reference) {
  const candidateBins = normalizedHistogram(candidate);
  const referenceBins = normalizedHistogram(reference);
  if (
    candidateBins.length === 0 ||
    candidateBins.length !== referenceBins.length
  ) {
    return 0;
  }
  const totalVariation =
    candidateBins.reduce(
      (sum, value, index) => sum + Math.abs(value - referenceBins[index]),
      0,
    ) / 2;
  return clampUnit(1 - totalVariation);
}

function spatialCells(metrics) {
  const cells = metrics?.spatial?.cells;
  if (Array.isArray(cells) && cells.length > 0) {
    return cells;
  }
  return PRESENTATION_REGIONS.map((name) => presentationRegions(metrics)[name])
    .filter((region) => region !== undefined)
    .map((region) => ({
      contrast: region.contrast,
      edgeEnergy: region.edgeEnergy,
      luminanceMean: region.luminanceMean,
      meanRgb: region.meanRgb,
    }));
}

export function compareVisualPresentation(
  candidateMetrics,
  referenceMetrics,
) {
  const candidateCells = spatialCells(candidateMetrics);
  const referenceCells = spatialCells(referenceMetrics);
  const cellCount = Math.min(candidateCells.length, referenceCells.length);
  const candidateRegions = presentationRegions(candidateMetrics);
  const referenceRegions = presentationRegions(referenceMetrics);
  const regionNames = PRESENTATION_REGIONS.filter(
    (name) =>
      candidateRegions[name] !== undefined &&
      referenceRegions[name] !== undefined,
  );
  if (cellCount === 0 || regionNames.length === 0) {
    return {
      colorSimilarity: 0,
      histogramSimilarity: 0,
      luminanceSimilarity: 0,
      mismatchHotspots: [],
      passed: false,
      score: 0,
      structureSimilarity: 0,
      threshold: VISUAL_PARITY_THRESHOLD,
      toneSimilarity: 0,
    };
  }

  const colorDistances = [];
  const luminanceDistances = [];
  const structureDistances = [];
  const mismatchHotspots = [];
  for (let index = 0; index < cellCount; index += 1) {
    const candidate = candidateCells[index];
    const reference = referenceCells[index];
    const cellColorDistances = [];
    for (let channel = 0; channel < 3; channel += 1) {
      const distance = Math.abs(
        Number(candidate.meanRgb?.[channel] ?? 0) -
          Number(reference.meanRgb?.[channel] ?? 0),
      );
      colorDistances.push(distance);
      cellColorDistances.push(distance);
    }
    const luminanceDistance = Math.abs(
      Number(candidate.luminanceMean ?? 0) -
        Number(reference.luminanceMean ?? 0),
    );
    const contrastDistance = clampUnit(
      Math.abs(
        Number(candidate.contrast ?? 0) -
          Number(reference.contrast ?? 0),
      ) * 2,
    );
    const edgeDistance = clampUnit(
      Math.abs(
        Number(candidate.edgeEnergy ?? 0) -
          Number(reference.edgeEnergy ?? 0),
      ) * 8,
    );
    const highlightDistance = clampUnit(
      Math.abs(
        Number(candidate.highlightFraction ?? 0) -
          Number(reference.highlightFraction ?? 0),
      ) * 8,
    );
    const dynamicRangeDistance = clampUnit(
      Math.abs(
        Number(candidate.dynamicRange ?? 0) -
          Number(reference.dynamicRange ?? 0),
      ) * 1.5,
    );
    luminanceDistances.push(luminanceDistance);
    structureDistances.push(
      contrastDistance,
      edgeDistance,
      highlightDistance,
      dynamicRangeDistance,
    );
    mismatchHotspots.push({
      column: Number(candidate.column ?? index % 8),
      distance: roundScore(
        mean([
          mean(cellColorDistances),
          luminanceDistance * 2,
          contrastDistance,
          edgeDistance,
          highlightDistance,
          dynamicRangeDistance,
        ]),
      ),
      row: Number(candidate.row ?? Math.floor(index / 8)),
    });
  }

  const histogramSimilarities = regionNames.map((name) =>
    histogramSimilarity(
      candidateRegions[name].histogram,
      referenceRegions[name].histogram,
    ),
  );
  const toneDistances = regionNames.flatMap((name) => {
    const candidate = candidateRegions[name];
    const reference = referenceRegions[name];
    return [
      clampUnit(
        Math.abs(candidate.blackFraction - reference.blackFraction) * 3,
      ),
      clampUnit(Math.abs(candidate.contrast - reference.contrast) * 2),
      clampUnit(
        Math.abs(candidate.dynamicRange - reference.dynamicRange) * 1.5,
      ),
      clampUnit(Math.abs(candidate.edgeEnergy - reference.edgeEnergy) * 8),
      clampUnit(
        Math.abs(candidate.highlightFraction - reference.highlightFraction) *
          8,
      ),
      clampUnit(
        Math.abs(candidate.meanSaturation - reference.meanSaturation) * 1.5,
      ),
    ];
  });

  const colorSimilarity = clampUnit(1 - mean(colorDistances));
  const luminanceSimilarity = clampUnit(
    1 - mean(luminanceDistances) * 2,
  );
  const histogramScore = mean(histogramSimilarities);
  const structureSimilarity = clampUnit(1 - mean(structureDistances));
  const toneSimilarity = clampUnit(1 - mean(toneDistances));
  const score =
    colorSimilarity * 0.35 +
    luminanceSimilarity * 0.25 +
    histogramScore * 0.2 +
    structureSimilarity * 0.1 +
    toneSimilarity * 0.1;

  return {
    colorSimilarity: roundScore(colorSimilarity),
    histogramSimilarity: roundScore(histogramScore),
    luminanceSimilarity: roundScore(luminanceSimilarity),
    mismatchHotspots: mismatchHotspots
      .sort((first, second) => second.distance - first.distance)
      .slice(0, 5),
    passed: score >= VISUAL_PARITY_THRESHOLD,
    score: roundScore(score),
    structureSimilarity: roundScore(structureSimilarity),
    threshold: VISUAL_PARITY_THRESHOLD,
    toneSimilarity: roundScore(toneSimilarity),
  };
}

export function findVisualParity(results) {
  const reference = results.find((result) => result.slug === "threejs");
  if (reference?.canvasMetrics === null || reference?.canvasMetrics === undefined) {
    return {
      entries: [],
      reference: null,
      threshold: VISUAL_PARITY_THRESHOLD,
    };
  }
  return {
    entries: results
      .filter((result) => result !== reference)
      .map((result) => ({
        name: result.name,
        slug: result.slug,
        ...compareVisualPresentation(
          result.canvasMetrics,
          reference.canvasMetrics,
        ),
      })),
    reference: reference.name,
    threshold: VISUAL_PARITY_THRESHOLD,
  };
}

function numericSignature(source, keys, minimumValues) {
  const values = keys.map((key) => source?.[key]);
  return values.filter((value) => typeof value === "number").length >=
    minimumValues
    ? JSON.stringify(values)
    : null;
}

function shaderHashes(result) {
  return new Set(
    (result.gpu?.shaderModules ?? [])
      .map((shader) => shader.hash)
      .filter((hash) => typeof hash === "string" && hash.length > 0),
  );
}

function shaderJaccard(first, second) {
  const union = new Set([...first, ...second]);
  if (union.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const hash of first) {
    if (second.has(hash)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

export function findSharedRendererPairs(results) {
  const pairs = [];
  for (let firstIndex = 0; firstIndex < results.length; firstIndex += 1) {
    const first = results[firstIndex];
    const firstWorkload = numericSignature(
      first.frameWindow?.perFrame,
      WORKLOAD_COUNTERS,
      4,
    );
    const firstResources = numericSignature(
      first.gpu?.resources,
      RESOURCE_COUNTERS,
      RESOURCE_COUNTERS.length,
    );
    const firstShaders = shaderHashes(first);
    if (
      firstWorkload === null ||
      firstResources === null ||
      firstShaders.size < 5
    ) {
      continue;
    }

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < results.length;
      secondIndex += 1
    ) {
      const second = results[secondIndex];
      const secondWorkload = numericSignature(
        second.frameWindow?.perFrame,
        WORKLOAD_COUNTERS,
        4,
      );
      const secondResources = numericSignature(
        second.gpu?.resources,
        RESOURCE_COUNTERS,
        RESOURCE_COUNTERS.length,
      );
      const shaderOverlap = shaderJaccard(
        firstShaders,
        shaderHashes(second),
      );
      if (
        firstWorkload === secondWorkload &&
        firstResources === secondResources &&
        first.gpu?.pipelines?.length === second.gpu?.pipelines?.length &&
        shaderOverlap >= 0.8
      ) {
        pairs.push({
          first: first.name,
          reason:
            "identical frame work, allocations, pipeline count, and substantially identical shaders",
          second: second.name,
          shaderOverlap,
        });
      }
    }
  }
  return pairs;
}

export function comparisonPassed(results) {
  const visualParity = findVisualParity(results);
  return (
    results.every(
      (result) =>
        result.status === "ready" &&
        result.issues.every((issue) => issue.severity !== "error"),
    ) &&
    findSharedRendererPairs(results).length === 0 &&
    visualParity.entries.every((entry) => entry.passed)
  );
}

function summarizeBufferWrite(write) {
  if (write === null || write === undefined || write.sample === undefined) {
    return write ?? null;
  }
  return {
    ...write,
    sample: {
      ...write.sample,
      segments: (write.sample.segments ?? []).map((segment) => {
        const {
          bytes: _bytes,
          floats,
          integers,
          ...metadata
        } = segment;
        return {
          ...metadata,
          ...(Array.isArray(floats)
            ? {
                ...(floats.length > 16 ? { floatCount: floats.length } : {}),
                floats: floats.slice(0, 16),
              }
            : {}),
          ...(Array.isArray(integers)
            ? {
                ...(integers.length > 16
                  ? { integerCount: integers.length }
                  : {}),
                integers: integers.slice(0, 16),
              }
            : {}),
        };
      }),
    },
  };
}

function summarizeModelBuffers(buffers) {
  const groups = new Map();
  for (const buffer of buffers ?? []) {
    if (
      buffer.lastWrite === null ||
      !/camera|light|material|model|object|settings/i.test(buffer.label)
    ) {
      continue;
    }
    const group = groups.get(buffer.label) ?? [];
    if (group.length < 3) {
      group.push({
        id: buffer.id,
        label: buffer.label,
        lastWrite: summarizeBufferWrite(buffer.lastWrite),
        size: buffer.size,
        usage: buffer.usage,
      });
      groups.set(buffer.label, group);
    }
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .flatMap(([, buffersForLabel]) => buffersForLabel)
    .slice(0, 48);
}

function summarizeShaderModules(shaderModules) {
  const totals = {
    bindings: 0,
    bufferMembers: 0,
    bufferMemberUses: 0,
    bufferMemberUseSites: 0,
    entryPoints: 0,
    functions: 0,
    loops: 0,
    textureOperations: 0,
  };
  for (const shader of shaderModules ?? []) {
    const analysis = shader.analysis;
    if (analysis === undefined) continue;
    totals.bindings += Number(analysis.bindings?.total ?? 0);
    totals.bufferMembers += analysis.bindingMemberUses?.length ?? 0;
    totals.bufferMemberUses += (analysis.bindingMemberUses ?? []).reduce(
      (sum, member) => sum + Number(member.useCount ?? 0),
      0,
    );
    totals.bufferMemberUseSites += (analysis.bindingMemberUses ?? []).reduce(
      (sum, member) => sum + (member.useSites?.length ?? 0),
      0,
    );
    totals.entryPoints += Object.values(analysis.entryPoints ?? {}).reduce(
      (sum, names) => sum + (Array.isArray(names) ? names.length : 0),
      0,
    );
    totals.functions += Number(analysis.functions ?? 0);
    totals.loops += Object.values(analysis.controlFlow ?? {}).reduce(
      (sum, value) => sum + Number(value ?? 0),
      0,
    );
    totals.textureOperations += Object.values(
      analysis.textureOperations ?? {},
    ).reduce((sum, value) => sum + Number(value ?? 0), 0);
  }
  return totals;
}

function summarizePipelineState(pipelines) {
  const targetFormats = new Set();
  let additiveTargets = 0;
  let depthWritePipelines = 0;
  let maxSampleCount = 1;
  for (const pipeline of pipelines ?? []) {
    maxSampleCount = Math.max(
      maxSampleCount,
      Number(pipeline.multisample?.count ?? 1),
    );
    if (pipeline.depthStencil?.depthWriteEnabled === true) {
      depthWritePipelines += 1;
    }
    for (const target of pipeline.fragment?.targets ?? []) {
      if (target === null) continue;
      targetFormats.add(target.format);
      if (
        target.blend?.color?.operation === "add" &&
        target.blend?.color?.srcFactor === "one"
      ) {
        additiveTargets += 1;
      }
    }
  }
  return {
    additiveTargets,
    depthWritePipelines,
    maxSampleCount,
    targetFormats: [...targetFormats].sort(),
  };
}

function summarizeExecutionTrace(trace) {
  if (trace === null || trace === undefined) return null;
  const commands = (trace.passes ?? []).flatMap((pass) => pass.commands ?? []);
  const bufferWrites = trace.bufferWrites ?? [];
  return {
    bufferWriteBytes: bufferWrites.reduce(
      (sum, write) => sum + Number(write.byteLength ?? 0),
      0,
    ),
    bufferWriteCount: Number(trace.bufferWriteCount ?? bufferWrites.length),
    bufferWriteOverflow: Number(trace.bufferWriteOverflow ?? 0),
    commandCount: Number(trace.commandCount ?? commands.length),
    commandOverflow: Number(trace.commandOverflow ?? 0),
    dynamicOffsetCommands: commands.filter((command) =>
      (command.bindings?.bindGroups ?? []).some(
        (binding) => (binding.dynamicOffsets?.length ?? 0) > 0,
      ),
    ).length,
    endingFrame: trace.endingFrame ?? null,
    passCount: trace.passes?.length ?? 0,
    scissoredCommands: commands.filter((command) =>
      command.dynamicState?.scissor !== null &&
      command.dynamicState?.scissor !== undefined
    ).length,
    startingFrame: trace.startingFrame ?? null,
    submissionCount: trace.submissions?.length ?? 0,
    viewportCommands: commands.filter((command) =>
      command.dynamicState?.viewport !== null &&
      command.dynamicState?.viewport !== undefined
    ).length,
  };
}

function summarizeBufferProbes(probes) {
  if (probes === null || probes === undefined) return null;
  return {
    errors: probes.errors ?? [],
    results: (probes.results ?? []).map((probe) => {
      const comparison = probe.cpuComparison;
      const float32 = comparison?.float32;
      return {
        bufferId: probe.bufferId ?? null,
        capturedFrameIndex: probe.capturedFrameIndex ?? null,
        contracts: probe.contracts ?? [],
        cpuComparison:
          comparison === null || comparison === undefined
            ? null
            : {
                ...comparison,
                float32:
                  float32 === null || float32 === undefined
                    ? null
                    : {
                        ...float32,
                        changedOffsetCount:
                          float32.changedOffsets?.length ?? 0,
                        changedOffsets: undefined,
                      },
              },
        decodedLayouts: (probe.decodedLayouts ?? []).map((layout) => ({
          bindingNames: layout.bindingNames ?? [],
          decodedRecordCount: layout.decoded?.decodedRecordCount ?? 0,
          elementCount: layout.decoded?.elementCount ?? 0,
          stages: layout.stages ?? [],
          truncated: layout.decoded?.truncated === true,
          type: layout.type,
        })),
        label: probe.label,
        ranges: (probe.ranges ?? []).map((range) => ({
          destinationOffset: range.destinationOffset,
          sample: {
            byteLength: range.sample?.byteLength ?? 0,
            sampledBytes: range.sample?.sampledBytes ?? 0,
            segmentCount: range.sample?.segments?.length ?? 0,
            truncated: range.sample?.truncated === true,
          },
          size: range.size,
          sourceOffset: range.sourceOffset,
        })),
        selection: probe.selection ?? null,
        size: probe.size,
        usage: probe.usage ?? null,
      };
    }),
  };
}

function createGpuInputIndex(gpu) {
  const buffers = new Map((gpu?.buffers ?? []).map((buffer) => [buffer.id, buffer]));
  const bindGroups = new Map(
    (gpu?.bindGroups ?? []).map((bindGroup) => [bindGroup.id, bindGroup]),
  );
  const samplers = new Map(
    (gpu?.samplers ?? []).map((sampler) => [sampler.id, sampler]),
  );
  const textures = new Map(
    (gpu?.textures ?? []).map((texture) => [texture.id, texture]),
  );
  const textureViews = new Map(
    (gpu?.textureViews ?? []).map((view) => [view.id, view]),
  );
  return {
    bindGroups,
    summarizeBufferBinding(bufferId, binding, offset = 0, size = null) {
      const buffer = buffers.get(bufferId);
      if (buffer === undefined) return null;
      return {
        binding,
        bindingOffset: Number(offset ?? 0),
        ...(size !== null && size !== undefined
          ? { bindingSize: Number(size) }
          : {}),
        id: buffer.id,
        label: buffer.label,
        lastWrite: summarizeBufferWrite(buffer.lastWrite),
        size: buffer.size,
        type: "buffer",
        usage: buffer.usage,
      };
    },
    summarizeEntry(bindGroup, entry) {
    const common = {
      bindGroup: bindGroup.label || `bind group ${bindGroup.id}`,
      binding: entry.binding,
    };
    if (entry.type === "buffer") {
      const buffer = buffers.get(entry.bufferId);
      if (buffer === undefined) return null;
      return {
        ...common,
        id: buffer.id,
        label: buffer.label,
        lastWrite: summarizeBufferWrite(buffer.lastWrite),
        size: buffer.size,
        type: "buffer",
        usage: buffer.usage,
        ...(entry.offset > 0 ? { bindingOffset: entry.offset } : {}),
        ...(entry.size !== null && entry.size !== undefined
          ? { bindingSize: entry.size }
          : {}),
      };
    }
    if (entry.type === "textureView") {
      const view = textureViews.get(entry.textureViewId);
      const texture = textures.get(view?.textureId);
      if (view === undefined || texture === undefined) return null;
      return {
        ...common,
        format: texture.format,
        id: texture.id,
        label: texture.label,
        size: texture.size,
        type: "texture",
        usage: texture.usage,
        viewId: view.id,
        viewLabel: view.label,
      };
    }
    if (entry.type === "sampler") {
      const sampler = samplers.get(entry.samplerId);
      if (sampler === undefined) return null;
      const { id, label, ...descriptor } = sampler;
      return {
        ...common,
        descriptor,
        id,
        label,
        type: "sampler",
      };
    }
    return null;
    },
  };
}

function summarizeBindGroupInputs(index, bindGroupIds) {
  return bindGroupIds.flatMap((bindGroupId) => {
    const bindGroup = index.bindGroups.get(bindGroupId);
    if (bindGroup === undefined) return [];
    return (bindGroup.entries ?? [])
      .map((entry) => index.summarizeEntry(bindGroup, entry))
      .filter((entry) => entry !== null);
  });
}

function summarizePipelineInputs(gpu) {
  const index = createGpuInputIndex(gpu);

  return (gpu?.pipelines ?? [])
    .map((pipeline) => {
      const bindGroupInputs = summarizeBindGroupInputs(
        index,
        pipeline.uses?.bindGroups ?? [],
      );
      const vertexInputs = (pipeline.uses?.vertexBufferSlots ?? [])
        .map((binding) =>
          index.summarizeBufferBinding(
            binding.bufferId,
            `vertex:${binding.slot}`,
            binding.offset,
            binding.size,
          ),
        )
        .filter((input) => input !== null);
      const indexInputs = (pipeline.uses?.indexBuffers ?? [])
        .map((binding) =>
          index.summarizeBufferBinding(
            binding.bufferId,
            `index:${binding.format ?? "unknown"}`,
            binding.offset,
            binding.size,
          ),
        )
        .filter((input) => input !== null);
      const allInputs = [...bindGroupInputs, ...vertexInputs, ...indexInputs];
      return {
        commands: pipeline.uses?.commandSignatures ?? [],
        id: pipeline.id,
        inputCount: allInputs.length,
        inputs: allInputs.slice(0, 48),
        inputsTruncated: allInputs.length > 48,
        kind: pipeline.kind,
        label: pipeline.label,
      };
    })
    .filter(({ inputCount }) => inputCount > 0)
    .slice(0, 64);
}

function summarizeRenderStages(gpu, workloadWindow) {
  const index = createGpuInputIndex(gpu);
  const pipelines = new Map(
    (gpu?.pipelines ?? []).map((pipeline) => [pipeline.id, pipeline]),
  );
  const textures = new Map(
    (gpu?.textures ?? []).map((texture) => [texture.id, texture]),
  );
  const activePasses = new Map();
  for (const workload of workloadWindow?.passes ?? []) {
    for (const id of workload.physicalIds ?? [workload.id]) {
      activePasses.set(id, workload);
    }
  }
  const output = (textureId, attachmentIndex, role, attachment) => {
    const texture = textures.get(textureId);
    if (texture === undefined) return null;
    return {
      attachmentIndex,
      format: texture.format,
      id: texture.id,
      label: texture.label,
      loadOp: attachment.loadOp ?? attachment.depthLoadOp ?? null,
      role,
      size: texture.size,
      storeOp: attachment.storeOp ?? attachment.depthStoreOp ?? null,
    };
  };

  const passes = (gpu?.passSummaries ?? []).filter(
    (pass) => activePasses.size === 0 || activePasses.has(pass.id),
  );
  return passes.slice(0, 64).map((pass) => {
    const passPipelines = (pass.pipelineIds ?? [])
      .map((pipelineId) => pipelines.get(pipelineId))
      .filter((pipeline) => pipeline !== undefined);
    const allInputs = summarizeBindGroupInputs(index, pass.bindGroupIds ?? []);
    for (const pipeline of passPipelines) {
      for (const binding of pipeline.uses?.vertexBufferSlots ?? []) {
        const input = index.summarizeBufferBinding(
          binding.bufferId,
          `vertex:${binding.slot}`,
          binding.offset,
          binding.size,
        );
        if (input !== null) allInputs.push(input);
      }
      for (const binding of pipeline.uses?.indexBuffers ?? []) {
        const input = index.summarizeBufferBinding(
          binding.bufferId,
          `index:${binding.format ?? "unknown"}`,
          binding.offset,
          binding.size,
        );
        if (input !== null) allInputs.push(input);
      }
    }
    const outputs = (pass.colorAttachments ?? []).flatMap(
      (attachment, attachmentIndex) => {
        if (attachment === null) return [];
        return [
          output(
            attachment.textureId,
            attachmentIndex,
            "color",
            attachment,
          ),
          output(
            attachment.resolveTextureId,
            attachmentIndex,
            "resolve",
            attachment,
          ),
        ].filter((entry) => entry !== null);
      },
    );
    if (pass.depthStencilAttachment !== null) {
      const depth = output(
        pass.depthStencilAttachment.textureId,
        0,
        "depth",
        pass.depthStencilAttachment,
      );
      if (depth !== null) outputs.push(depth);
    }
    return {
      id: pass.id,
      inputCount: allInputs.length,
      inputs: allInputs.slice(0, 48),
      inputsTruncated: allInputs.length > 48,
      kind: pass.kind,
      label: pass.label,
      occurrences: pass.occurrences,
      outputs,
      pipelines: passPipelines.map((pipeline) => ({
        commands: pipeline.uses?.commandSignatures ?? [],
        id: pipeline.id,
        label: pipeline.label ?? "",
      })),
      workload: activePasses.get(pass.id) ?? null,
    };
  });
}

export function findBufferContractMismatches(gpu) {
  const bindGroups = new Map(
    (gpu?.bindGroups ?? []).map((bindGroup) => [bindGroup.id, bindGroup]),
  );
  const buffers = new Map(
    (gpu?.buffers ?? []).map((buffer) => [buffer.id, buffer]),
  );
  const shaders = new Map(
    (gpu?.shaderModules ?? []).map((shader) => [shader.id, shader]),
  );
  const contractsByBuffer = new Map();
  for (const pipeline of gpu?.pipelines ?? []) {
    const shaderIds = [
      pipeline.vertex?.shaderId,
      pipeline.fragment?.shaderId,
      pipeline.compute?.shaderId,
    ].filter(
      (shaderId, index, selected) =>
        shaderId !== null &&
        shaderId !== undefined &&
        selected.indexOf(shaderId) === index,
    );
    for (const shaderId of shaderIds) {
      const shader = shaders.get(shaderId);
      const structures = new Map(
        (shader?.analysis?.structures ?? []).map((structure) => [
          structure.name,
          structure,
        ]),
      );
      for (const declaration of shader?.analysis?.bindings?.declarations ?? []) {
        if (
          declaration.addressSpace !== "uniform" &&
          !declaration.addressSpace.startsWith("storage")
        ) {
          continue;
        }
        const structure = structures.get(declaration.type);
        if (structure === undefined) continue;
        const members = structure.members.map(
          (member) => `${member.name}:${member.type}`,
        );
        const signature = `${declaration.addressSpace}|${members.join("|")}`;
        const slots = (pipeline.uses?.bindGroupSlots ?? []).filter(
          (slot) => slot.index === declaration.group,
        );
        for (const slot of slots) {
          const entry = bindGroups
            .get(slot.bindGroupId)
            ?.entries?.find(
              (candidate) =>
                candidate.type === "buffer" &&
                candidate.binding === declaration.binding,
            );
          if (entry?.bufferId === null || entry?.bufferId === undefined) continue;
          const contracts = contractsByBuffer.get(entry.bufferId) ?? [];
          const contract = {
            addressSpace: declaration.addressSpace,
            binding: declaration.binding,
            group: declaration.group,
            members,
            pipelineId: pipeline.id,
            pipelineLabel: pipeline.label ?? "",
            shaderId,
            signature,
            struct: declaration.type,
          };
          if (
            !contracts.some(
              (existing) =>
                existing.pipelineId === contract.pipelineId &&
                existing.shaderId === contract.shaderId &&
                existing.group === contract.group &&
                existing.binding === contract.binding,
            )
          ) {
            contracts.push(contract);
            contractsByBuffer.set(entry.bufferId, contracts);
          }
        }
      }
    }
  }
  return [...contractsByBuffer.entries()]
    .filter(
      ([bufferId]) => Number(buffers.get(bufferId)?.writeCount ?? 0) <= 1,
    )
    .filter(([, contracts]) => new Set(contracts.map(({ signature }) => signature)).size > 1)
    .map(([bufferId, contracts]) => ({
      bufferId,
      bufferLabel: buffers.get(bufferId)?.label ?? "",
      contracts: contracts.map(({ signature: _signature, ...contract }) => contract),
    }));
}

export function summarizeReport(report) {
  const lightingCues = findLightingCues(report.results);
  const preCompositeLightingCues = findPreCompositeLightingCues(report.results);
  const preCompositeEntries = new Map(
    preCompositeLightingCues.entries.map((entry) => [entry.slug, entry]),
  );
  const visualParity = findVisualParity(report.results);
  const particleParity = findParticleParity(report.results);
  const selectedReflectionComparison = findSelectedReflectionComparison(
    report.results,
  );
  const selectedReflectionEntries = new Map(
    selectedReflectionComparison.entries.map((entry) => [entry.slug, entry]),
  );
  return {
    createdAt: report.createdAt,
    lightingCues,
    particleParity,
    passed: comparisonPassed(report.results),
    preCompositeLightingCues,
    profile: report.profile,
    selectedReflectionComparison,
    sharedRendererPairs: findSharedRendererPairs(report.results),
    results: report.results.map((result) => ({
      canvasMetrics: result.canvasMetrics,
      canvasScreenshot: result.canvasScreenshot,
      bufferContractMismatches: findBufferContractMismatches(result.gpu),
      device: result.gpu?.devices?.[0] ?? null,
      durationMs: result.durationMs,
      executionTrace: summarizeExecutionTrace(result.gpu?.executionTrace),
      intermediateBuffers: summarizeBufferProbes(result.gpu?.bufferProbes),
      frameWindow: result.frameWindow,
      intermediateTargets: result.gpu?.textureProbes ?? null,
      issues: result.issues,
      lightingCues: result.lightingCues ?? null,
      modelBufferSamples: summarizeModelBuffers(result.gpu?.buffers),
      name: result.name,
      pipelineInputs: summarizePipelineInputs(result.gpu),
      pipelineState: summarizePipelineState(result.gpu?.pipelines),
      preCompositeLightingCues:
        result.slug === "threejs"
          ? preCompositeLightingCues.reference
          : preCompositeEntries.get(result.slug) ?? null,
      renderStages: summarizeRenderStages(result.gpu, result.workloadWindow),
      resources: result.gpu?.resources ?? null,
      selectedReflection:
        result.slug === "threejs"
          ? selectedReflectionComparison.reference
          : selectedReflectionEntries.get(result.slug) ?? null,
      shaders:
        result.gpu === null || result.gpu === undefined
          ? null
          : {
              characters: result.gpu.shaderModules.reduce(
                (sum, shader) => sum + shader.characters,
                0,
              ),
              ...summarizeShaderModules(result.gpu.shaderModules),
              manifest: result.gpu.shaderManifest,
              modules: result.gpu.shaderModules.length,
              pipelines: result.gpu.pipelines.length,
            },
      status: result.status,
      statusText: result.statusText,
      synchronization: result.gpu?.synchronization ?? null,
      telemetry: result.telemetry,
      url: result.url,
      visualParity:
        visualParity.entries.find((entry) => entry.slug === result.slug) ??
        (result.slug === "threejs" && visualParity.reference !== null
          ? { reference: true, score: 1 }
          : null),
      workloadWindow: result.workloadWindow ?? null,
    })),
    visualParity,
    viewport: report.viewport,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderIssues(issues) {
  if (issues.length === 0) {
    return '<p class="clean">No browser or WebGPU diagnostics.</p>';
  }
  return `<ul class="issues">${issues
    .map(
      (issue) =>
        `<li class="${escapeHtml(issue.severity)}"><strong>${escapeHtml(
          issue.kind,
        )}</strong> ${escapeHtml(issue.message)}</li>`,
    )
    .join("")}</ul>`;
}

function renderMetrics(result) {
  const frame = result.telemetry?.latestFrame;
  if (frame === undefined || frame === null) {
    return "No frame telemetry";
  }
  const parts = [];
  if (typeof frame.fps === "number") {
    parts.push(`${frame.fps.toFixed(1)} fps`);
  }
  if (typeof frame.cpuTimeMs === "number") {
    parts.push(`${frame.cpuTimeMs.toFixed(1)} ms CPU`);
  }
  if (typeof frame.visibleMeshes === "number") {
    parts.push(`${frame.visibleMeshes}/${frame.totalMeshes} meshes`);
  }
  if (typeof frame.lights === "number") {
    parts.push(`${frame.lights} lights`);
  }
  return parts.length === 0 ? "Frame rendered" : parts.join(" · ");
}

function formatBytes(bytes) {
  if (typeof bytes !== "number") {
    return "unknown";
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function metricRow(label, value, attributes = "") {
  const suffix = attributes === "" ? "" : ` ${attributes}`;
  return `<div${suffix}><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function representativeTextureProbes(textureProbes) {
  const probes = textureProbes?.results ?? [];
  const pick = (pattern, highest = false) => {
    const matches = probes.filter((probe) => pattern.test(probe.label));
    if (matches.length === 0) return null;
    return highest
      ? matches.reduce((best, probe) =>
          probe.luminance.mean > best.luminance.mean ? probe : best,
        )
      : matches.at(-1);
  };
  return [
    pick(/ambient|occlusion|GTAO|AO$/i),
    pick(/HDR|history|TRAA.*resolve|^output$/i),
    pick(/bloom/i, true),
    pick(/reflection|SSR/i, true),
  ].filter(
    (probe, index, selected) =>
      probe !== null &&
      selected.findIndex((candidate) => candidate?.label === probe.label) === index,
  );
}

function relativeLightingValue(value) {
  return typeof value === "number" ? `${value.toFixed(3)}×` : "unavailable";
}

function lightingValue(value, digits) {
  return typeof value === "number" ? value.toFixed(digits) : "unavailable";
}

function renderCaptureMetrics(
  result,
  visualParity,
  isVisualReference,
  lightingCues,
  preCompositeLightingCues,
  selectedReflection,
) {
  const rows = [];
  if (isVisualReference) {
    rows.push(metricRow("Presentation parity", "Three.js visual reference · 100.0%"));
  } else if (visualParity !== undefined) {
    rows.push(
      metricRow(
        "Presentation parity",
        `${(visualParity.score * 100).toFixed(1)}% / ${(visualParity.threshold * 100).toFixed(0)}% target · ` +
          `color ${(visualParity.colorSimilarity * 100).toFixed(0)}% · ` +
          `tone ${(visualParity.toneSimilarity * 100).toFixed(0)}% · ` +
          `structure ${(visualParity.structureSimilarity * 100).toFixed(0)}%`,
      ),
    );
    if (visualParity.mismatchHotspots.length > 0) {
      rows.push(
        metricRow(
          "Mismatch hotspots",
          visualParity.mismatchHotspots
            .map(
              (hotspot) =>
                `r${hotspot.row + 1}c${hotspot.column + 1} ${(hotspot.distance * 100).toFixed(1)}%`,
            )
            .join(" · "),
        ),
      );
    }
  }
  if (lightingCues?.status === "ready" || lightingCues?.status === "compared") {
    const relative = lightingCues.relativeToThree ?? {
      floorCoherentRowFraction: 1,
      floorContrast: 1,
      floorRatio: 1,
      upperContrast: 1,
      upperRatio: 1,
    };
    rows.push(
      metricRow(
        "Upper gallery spill",
        `contrast ${lightingValue(lightingCues.upperSpill.contrast, 6)} · ` +
          `spill/control ${lightingValue(lightingCues.upperSpill.ratio, 3)} · ` +
          `${relativeLightingValue(relative.upperContrast)} Three.js contrast / ` +
          `${relativeLightingValue(relative.upperRatio)} ratio`,
      ),
    );
    rows.push(
      metricRow(
        "Floor light pool",
        `contrast ${lightingValue(lightingCues.floorPool.contrast, 6)} · ` +
          `interior/ring ${lightingValue(lightingCues.floorPool.ratio, 3)} · ` +
          `coherent rows ${(lightingCues.floorPool.coherentRowFraction * 100).toFixed(1)}% · ` +
          `${relativeLightingValue(relative.floorContrast)} Three.js contrast / ` +
          `${relativeLightingValue(relative.floorRatio)} ratio / ` +
          `${relativeLightingValue(relative.floorCoherentRowFraction)} coherence`,
      ),
    );
  } else if (lightingCues !== undefined) {
    rows.push(
      metricRow(
        "Lighting cues",
        `unavailable · ${(lightingCues.issues ?? [])
          .map(({ message }) => message)
          .join(" · ") || "no pixel evidence"}`,
      ),
    );
  }
  if (
    preCompositeLightingCues?.status === "ready" ||
    preCompositeLightingCues?.status === "compared"
  ) {
    const relative = preCompositeLightingCues.relativeToThree ?? {
      floorContrast: 1,
      floorRatio: 1,
      upperContrast: 1,
      upperRatio: 1,
    };
    rows.push(
      metricRow(
        "Pre-composite HDR",
        `upper contrast ${lightingValue(preCompositeLightingCues.upperSpill.contrast, 6)} / ` +
          `spill/control ${lightingValue(preCompositeLightingCues.upperSpill.ratio, 3)} / ` +
          `${relativeLightingValue(relative.upperContrast)} Three.js contrast / ` +
          `${relativeLightingValue(relative.upperRatio)} ratio · ` +
          `floor contrast ${lightingValue(preCompositeLightingCues.floorPool.contrast, 6)} / ` +
          `interior/ring ${lightingValue(preCompositeLightingCues.floorPool.ratio, 3)} / ` +
          `brighter rows ${(preCompositeLightingCues.floorPool.brighterRowFraction * 100).toFixed(1)}% / ` +
          `${relativeLightingValue(relative.floorContrast)} Three.js contrast / ` +
          `${relativeLightingValue(relative.floorRatio)} ratio`,
      ),
    );
  } else if (preCompositeLightingCues !== undefined) {
    rows.push(
      metricRow(
        "Pre-composite HDR",
        `unavailable · ${(preCompositeLightingCues.issues ?? [])
          .map(({ message }) => message)
          .join(" · ") || "no exact HDR probe evidence"}`,
      ),
    );
  }
  if (selectedReflection?.status === "compared") {
    rows.push(
      metricRow(
        "Selected reflection",
        `${selectedReflection.priority.rgbLogRmse.toFixed(6)} RGB log RMSE · ` +
          `${selectedReflection.priority.logLuminanceMae.toFixed(6)} log-luminance MAE · ` +
          `${selectedReflection.priority.sampleCount} priority samples`,
        'data-reflection-status="compared"',
      ),
    );
  } else if (selectedReflection?.status === "ready") {
    const formula =
      selectedReflection.evidence?.provenance?.formula?.kind ?? "unknown";
    const sampleCount =
      selectedReflection.evidence?.sampling?.sampleCount ?? "unknown";
    rows.push(
      metricRow(
        "Selected reflection",
        `GPU-sampled reference · ${formula} · ${sampleCount} samples`,
        'data-reflection-status="ready"',
      ),
    );
  } else if (selectedReflection !== undefined) {
    rows.push(
      metricRow(
        "Selected reflection",
        `unavailable · ${(selectedReflection?.issues ?? [])
          .map(({ message }) => message)
          .join(" · ") || "no semantic reflection evidence"}`,
        'data-reflection-status="unavailable"',
      ),
    );
  }
  const work = result.frameWindow?.perFrame;
  if (work !== undefined) {
    const drawCalls = (work.drawCalls ?? 0) + (work.drawIndexedCalls ?? 0);
    rows.push(
      metricRow(
        "GPU work / frame",
        `${drawCalls.toFixed(1)} draws · ${(work.dispatchCalls ?? 0).toFixed(
          1,
        )} dispatches · ${(work.renderPasses ?? 0).toFixed(1)} render passes`,
      ),
    );
  }
  const busiestPipeline = result.workloadWindow?.pipelines?.[0];
  if (busiestPipeline !== undefined) {
    rows.push(
      metricRow(
        "Hottest pipeline",
        `${busiestPipeline.label || "unlabeled pipeline"} · ` +
          `${(
            (busiestPipeline.perFrame.drawCalls ?? 0) +
            (busiestPipeline.perFrame.drawIndexedCalls ?? 0)
          ).toFixed(1)} draws · ` +
          `${(busiestPipeline.perFrame.dispatchCalls ?? 0).toFixed(1)} dispatches/frame`,
      ),
    );
  }
  const executionTrace = summarizeExecutionTrace(result.gpu?.executionTrace);
  if (executionTrace !== null) {
    rows.push(
      metricRow(
        "Exact execution trace",
        `${executionTrace.commandCount.toLocaleString()} commands / ` +
          `${executionTrace.passCount.toLocaleString()} ordered passes · ` +
          `frames ${executionTrace.startingFrame}–${executionTrace.endingFrame} · ` +
          `${executionTrace.commandOverflow.toLocaleString()} dropped · ` +
          `${executionTrace.bufferWriteCount.toLocaleString()} queued buffer writes / ` +
          `${executionTrace.bufferWriteOverflow.toLocaleString()} dropped · ` +
          `${executionTrace.submissionCount.toLocaleString()} submissions · ` +
          `${executionTrace.dynamicOffsetCommands.toLocaleString()} dynamic-offset / ` +
          `${executionTrace.viewportCommands.toLocaleString()} viewport / ` +
          `${executionTrace.scissoredCommands.toLocaleString()} scissored commands`,
      ),
    );
  }
  const resources = result.gpu?.resources;
  if (resources !== undefined) {
    rows.push(
      metricRow(
        "Live allocations",
        `${resources.bufferCount} buffers / ${formatBytes(
          resources.bufferBytes,
        )} · ${resources.textureCount} textures / ${formatBytes(
          resources.estimatedTextureBytes,
        )}`,
      ),
    );
    const shaderCharacters = result.gpu.shaderModules.reduce(
      (sum, shader) => sum + shader.characters,
      0,
    );
    rows.push(
      metricRow(
        "Shader graph",
        `${result.gpu.shaderModules.length} modules / ${shaderCharacters.toLocaleString()} WGSL chars · ${result.gpu.pipelines.length} pipelines`,
      ),
    );
    const shaderState = summarizeShaderModules(result.gpu.shaderModules);
    rows.push(
      metricRow(
        "Generated WGSL",
        `${shaderState.entryPoints} entries · ${shaderState.bindings} bindings · ` +
          `${shaderState.bufferMembers} used buffer members / ` +
          `${shaderState.bufferMemberUses} accesses · ` +
          `${shaderState.textureOperations} texture ops · ${shaderState.loops} loops`,
      ),
    );
    const pipelineState = summarizePipelineState(result.gpu.pipelines);
    rows.push(
      metricRow(
        "Pipeline state",
        `${pipelineState.maxSampleCount}× max MSAA · ` +
          `${pipelineState.additiveTargets} additive targets · ` +
          `${pipelineState.depthWritePipelines} depth-write pipelines · ` +
        pipelineState.targetFormats.join(", "),
      ),
    );
    const pipelineInputs = summarizePipelineInputs(result.gpu);
    const concreteInputs = pipelineInputs.reduce(
      (sum, pipeline) => sum + pipeline.inputCount,
      0,
    );
    const sampledBuffers = pipelineInputs.reduce(
      (sum, pipeline) =>
        sum +
        pipeline.inputs.filter(
          (input) => input.type === "buffer" && input.lastWrite !== null,
        ).length,
      0,
    );
    rows.push(
      metricRow(
        "Bound inputs",
        `${pipelineInputs.length} pipelines · ${concreteInputs} concrete bindings · ${sampledBuffers} sampled buffer writes`,
      ),
    );
    const bufferContractMismatches = findBufferContractMismatches(result.gpu);
    rows.push(
      metricRow(
        "Buffer contracts",
        bufferContractMismatches.length === 0
          ? "compatible generated structs"
          : bufferContractMismatches
              .map(
                (mismatch) =>
                  `${mismatch.bufferLabel || `buffer ${mismatch.bufferId}`} · ${mismatch.contracts
                    .map(
                      (contract) =>
                        `${contract.pipelineLabel || `pipeline ${contract.pipelineId}`}=${contract.struct}`,
                    )
                    .join(" / ")}`,
              )
              .join(" · "),
      ),
    );
  }
  const full = result.canvasMetrics?.regions?.full;
  const floor = result.canvasMetrics?.regions?.floor;
  const leftFire = result.canvasMetrics?.regions?.leftFire;
  const rightFire = result.canvasMetrics?.regions?.rightFire;
  if (full !== undefined && floor !== undefined) {
    rows.push(
      metricRow(
        "Rendered pixels",
        `full μ ${full.luminanceMean.toFixed(3)} / contrast ${full.contrast.toFixed(
          3,
        )} / edges ${full.edgeEnergy.toFixed(3)} · floor μ ${floor.luminanceMean.toFixed(
          3,
        )} / highlights ${(floor.highlightFraction * 100).toFixed(1)}%`,
      ),
    );
  }
  if (leftFire !== undefined && rightFire !== undefined) {
    rows.push(
      metricRow(
        "Local fire pixels",
        `left ${(leftFire.highlightFraction * 100).toFixed(1)}% clipped / ` +
          `${leftFire.edgeEnergy.toFixed(3)} edges · ` +
          `right ${(rightFire.highlightFraction * 100).toFixed(1)}% clipped / ` +
          `${rightFire.edgeEnergy.toFixed(3)} edges`,
      ),
    );
  }
  const intermediateTargets = representativeTextureProbes(
    result.gpu?.textureProbes,
  );
  if (intermediateTargets.length > 0) {
    rows.push(
      metricRow(
        "Intermediate pixels",
        intermediateTargets
          .map((probe) => {
            const luminance = probe.luminance;
            const activeFraction =
              luminance.activeFraction ??
              (luminance.zeroFraction === undefined
                ? 0
                : 1 - luminance.zeroFraction);
            return (
              `${probe.label} μ ${luminance.mean.toFixed(4)} / ` +
              `active ${(activeFraction * 100).toFixed(1)}% / ` +
              `active μ ${(luminance.positiveMean ?? 0).toFixed(4)} / ` +
              `RMS ${(luminance.rms ?? 0).toFixed(4)} / ` +
              `p99 ${(luminance.p99 ?? luminance.p90).toFixed(4)} / ` +
              `HDR>1 ${((luminance.aboveOneFraction ?? 0) * 100).toFixed(1)}%`
            );
          })
          .join(" · "),
      ),
    );
  }
  const probeErrors = result.gpu?.textureProbes?.errors ?? [];
  if (probeErrors.length > 0) {
    rows.push(metricRow("Probe diagnostics", probeErrors.join(" · ")));
  }
  return rows.length === 0 ? "" : `<dl class="measurements">${rows.join("")}</dl>`;
}

function renderArtifactLinks(result) {
  const links = [];
  if (result.canvasScreenshot) {
    links.push(
      `<a href="${escapeHtml(result.canvasScreenshot)}">clean canvas capture</a>`,
    );
  }
  if (result.gpu?.shaderManifest) {
    links.push(
      `<a href="${escapeHtml(result.gpu.shaderManifest)}">shader manifest + sources</a>`,
    );
  }
  links.push('<a href="summary.json">condensed pipeline inputs</a>');
  links.push('<a href="report.json">full GPU/resource/model values</a>');
  return `<p class="artifacts">${links.join(" · ")}</p>`;
}

export function renderHtmlReport(report) {
  const passed = comparisonPassed(report.results);
  const lightingCues = findLightingCues(report.results);
  const lightingEntries = new Map(
    lightingCues.entries.map((entry) => [entry.slug, entry]),
  );
  const preCompositeLightingCues = findPreCompositeLightingCues(report.results);
  const preCompositeEntries = new Map(
    preCompositeLightingCues.entries.map((entry) => [entry.slug, entry]),
  );
  const selectedReflectionComparison = findSelectedReflectionComparison(
    report.results,
  );
  const selectedReflectionEntries = new Map(
    selectedReflectionComparison.entries.map((entry) => [entry.slug, entry]),
  );
  const sharedRendererPairs = findSharedRendererPairs(report.results);
  const visualParity = findVisualParity(report.results);
  const visualEntries = new Map(
    visualParity.entries.map((entry) => [entry.slug, entry]),
  );
  const failedVisualEntries = visualParity.entries.filter(
    (entry) => !entry.passed,
  );
  const architectureWarning =
    sharedRendererPairs.length === 0
      ? ""
      : `<section class="architecture-warning"><h2>Renderer isolation failed</h2><ul>${sharedRendererPairs
          .map(
            (pair) =>
              `<li><strong>${escapeHtml(pair.first)}</strong> and <strong>${escapeHtml(
                pair.second,
              )}</strong>: ${escapeHtml(pair.reason)} (${(
                pair.shaderOverlap * 100
              ).toFixed(1)}% shader overlap)</li>`,
          )
          .join("")}</ul></section>`;
  const visualWarning =
    failedVisualEntries.length === 0
      ? ""
      : `<section class="visual-warning"><h2>Visual parity failed</h2><p>The independent renderers remain below the ${(visualParity.threshold * 100).toFixed(0)}% presentation target relative to ${escapeHtml(visualParity.reference)}.</p><ul>${failedVisualEntries
          .map(
            (entry) =>
              `<li><strong>${escapeHtml(entry.name)}</strong>: ${(entry.score * 100).toFixed(1)}% overall · ${(entry.colorSimilarity * 100).toFixed(1)}% color · ${(entry.toneSimilarity * 100).toFixed(1)}% tone · ${(entry.structureSimilarity * 100).toFixed(1)}% structure</li>`,
          )
          .join("")}</ul></section>`;
  const cards = report.results
    .map((result) => {
      const image = result.screenshot
        ? `<a href="${escapeHtml(result.screenshot)}"><img src="${escapeHtml(
            result.screenshot,
          )}" alt="${escapeHtml(result.name)} screenshot"></a>`
        : '<div class="missing">Screenshot unavailable</div>';
      return `<article class="card ${escapeHtml(result.status)}">
        <header>
          <div><h2>${escapeHtml(result.name)}</h2><p>${escapeHtml(
            renderMetrics(result),
          )}</p></div>
          <span class="badge">${escapeHtml(result.status)}</span>
        </header>
        ${image}
        <footer>
          <p>${(result.durationMs / 1000).toFixed(2)} s · <a href="${escapeHtml(
            result.url,
          )}">${escapeHtml(result.url)}</a></p>
          ${renderCaptureMetrics(
            result,
            visualEntries.get(result.slug),
            result.slug === "threejs" && visualParity.reference !== null,
            result.slug === "threejs"
              ? lightingCues.reference
              : lightingEntries.get(result.slug),
            result.slug === "threejs"
              ? preCompositeLightingCues.reference
              : preCompositeEntries.get(result.slug),
            result.slug === "threejs"
              ? selectedReflectionComparison.reference
              : selectedReflectionEntries.get(result.slug),
          )}
          ${renderArtifactLinks(result)}
          ${renderIssues(result.issues)}
        </footer>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WebGPU implementation comparison</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #090b10; color: #f5f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; }
    .summary { align-items: end; display: flex; gap: 24px; justify-content: space-between; margin: 0 auto 24px; max-width: 2400px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(24px, 3vw, 42px); letter-spacing: -0.04em; }
    .summary p, header p, footer > p { color: #9ca6b7; margin-top: 7px; }
    .result { background: ${passed ? "#173d2d" : "#4e2028"}; border: 1px solid ${passed ? "#2d7657" : "#9e3e50"}; border-radius: 999px; font-weight: 750; padding: 9px 14px; white-space: nowrap; }
    .architecture-warning, .visual-warning { background: #371e24; border: 1px solid #873747; border-radius: 12px; margin: 0 auto 24px; max-width: 2400px; padding: 16px 18px; }
    .architecture-warning h2, .visual-warning h2 { color: #ff9cad; }
    .architecture-warning ul, .visual-warning ul { margin: 10px 0 0; padding-left: 22px; }
    .visual-warning p { color: #dcb9c0; margin-top: 7px; }
    main { display: grid; gap: 22px; grid-template-columns: repeat(auto-fit, minmax(min(620px, 100%), 1fr)); margin: 0 auto; max-width: 2400px; }
    .card { background: #11151e; border: 1px solid #252c39; border-radius: 16px; box-shadow: 0 18px 50px #0008; overflow: hidden; }
    .card.failed { border-color: #873747; }
    header { align-items: center; display: flex; justify-content: space-between; padding: 16px 18px; }
    h2 { font-size: 18px; }
    header p, footer { font-size: 13px; }
    .badge { background: #223f32; border-radius: 999px; color: #8ee7ba; font-size: 12px; font-weight: 800; padding: 5px 9px; text-transform: uppercase; }
    .failed .badge { background: #51232c; color: #ff9cad; }
    img, .missing { aspect-ratio: ${report.viewport.width} / ${report.viewport.height}; background: #050608; display: block; object-fit: cover; width: 100%; }
    .missing { align-items: center; color: #8993a5; display: flex; justify-content: center; }
    footer { padding: 14px 18px 18px; }
    a { color: #9cc9ff; }
    .clean { color: #8bd3ad; margin-top: 10px; }
    .measurements { display: grid; gap: 7px; margin: 13px 0 0; }
    .measurements div { display: grid; gap: 12px; grid-template-columns: 120px 1fr; }
    .measurements dt { color: #7f8a9d; }
    .measurements dd { margin: 0; }
    .artifacts { margin-top: 11px; }
    .issues { display: grid; gap: 7px; list-style: none; margin: 12px 0 0; padding: 0; }
    .issues li { background: #2e2830; border-left: 3px solid #b6935d; border-radius: 5px; padding: 8px 10px; }
    .issues li.error { background: #371e24; border-color: #ed687f; }
    .issues strong { margin-right: 5px; text-transform: uppercase; }
  </style>
</head>
<body>
  <section class="summary">
    <div><h1>WebGPU implementation comparison</h1><p>${escapeHtml(
      report.profile,
    )} profile · ${report.viewport.width}×${report.viewport.height} viewport · ${escapeHtml(
      report.createdAt,
    )}</p></div>
    <div class="result">${passed ? "PASS" : "FAIL"}</div>
  </section>
  ${architectureWarning}
  ${visualWarning}
  <main>${cards}</main>
</body>
</html>`;
}

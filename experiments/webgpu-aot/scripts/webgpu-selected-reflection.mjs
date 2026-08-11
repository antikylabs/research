import {
  resolveAntikySelectedReflection,
} from "./webgpu-selected-reflection-antiky.mjs";
import {
  validateAntikySelectedReflectionReconstruction,
} from "./webgpu-selected-reflection-antiky-reconstruction.mjs";

const SAMPLE_STRIDE_BYTES = 32;
export function createSelectedReflectionSamplePlan(plan, size) {
  const width = Number(size?.width ?? 0);
  const height = Number(size?.height ?? 0);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError("Selected-reflection dimensions must be positive integers");
  }
  return plan.map((point) => {
    const x = Number(point.x);
    const y = Number(point.y);
    const pixelX = Math.max(0, Math.min(width - 1, Math.floor(x * width)));
    const pixelY = Math.max(0, Math.min(height - 1, Math.floor(y * height)));
    return {
      pixelX,
      pixelY,
      region: point.region,
      sampleX: (pixelX + 0.5) / width,
      sampleY: (pixelY + 0.5) / height,
      x,
      y,
    };
  });
}

export function decodeSelectedReflectionSamples(bytes, points, hasRoughness) {
  const strideBytes = 32;
  const source = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
  const expectedBytes = points.length * strideBytes;
  if (source.byteLength !== expectedBytes) {
    throw new RangeError(
      `Selected-reflection readback has ${source.byteLength} bytes, expected ${expectedBytes}`,
    );
  }
  const data = new DataView(source.buffer, source.byteOffset, source.byteLength);
  return points.map((point, index) => {
    const offset = index * strideBytes;
    const channels = Array.from(
      { length: 4 },
      (_, channel) => data.getFloat32(offset + channel * 4, true),
    );
    const encodedRoughness = data.getFloat32(offset + 16, true);
    const lod = data.getFloat32(offset + 20, true);
    const numeric = [...channels, encodedRoughness, lod];
    if (!numeric.every(Number.isFinite)) {
      const error = new Error(`Selected-reflection sample ${index} is not finite`);
      error.code = "non-finite-sample";
      error.evidence = { index, values: numeric };
      throw error;
    }
    return {
      channels,
      lod,
      luminance:
        channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722,
      region: point.region,
      roughness: hasRoughness ? encodedRoughness : null,
      x: point.x,
      y: point.y,
    };
  });
}

export function resolveSelectedReflection(
  trace,
  frame,
  resources,
  targetSlug,
) {
  return resolveSelectedReflectionCore(
    trace,
    frame,
    resources,
    targetSlug,
    resolveAntikySelectedReflection,
    validateAntikySelectedReflectionReconstruction,
  );
}

export function resolveSelectedReflectionCore(
  trace,
  frame,
  resources,
  targetSlug,
  resolveAntiky_,
  validateAntikyReconstruction_,
) {
  const fail = (code, message, evidence = {}) => ({
    issues: [{ code, evidence, message }],
    status: "unavailable",
  });
  const escapePattern = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bindingsNamed = (command, pattern, kind = "texture") =>
    (command?.resourceBindings ?? []).filter((binding) => {
      if (binding.resource?.kind !== kind) return false;
      return (binding.shaderBindings ?? []).some(({ name, stage }) =>
        stage === "fragment" && pattern.test(String(name)),
      );
    });
  const bindingsLabeled = (command, label) =>
    (command?.resourceBindings ?? []).filter(
      (binding) =>
        binding.resource?.kind === "texture" &&
        binding.resource.label === label,
    );
  const bindingName = (binding) =>
    (binding?.shaderBindings ?? []).find(({ stage }) => stage === "fragment")
      ?.name ?? null;
  const pairedSampler = (command, textureBinding) => {
    const textureName = String(bindingName(textureBinding) ?? "")
      .replaceAll("_", "")
      .toLowerCase();
    return (command?.resourceBindings ?? []).filter((binding) => {
      if (binding.resource?.kind !== "sampler") return false;
      return (binding.shaderBindings ?? []).some(({ name, stage }) => {
        const normalized = String(name).replaceAll("_", "").toLowerCase();
        return stage === "fragment" && normalized === `${textureName}sampler`;
      });
    });
  };
  const textureById = new Map(
    (resources?.textures ?? []).map((texture) => [texture.id, texture]),
  );
  const bufferById = new Map(
    (resources?.buffers ?? []).map((buffer) => [buffer.id, buffer]),
  );
  const viewById = new Map(
    (resources?.textureViews ?? []).map((view) => [view.id, view]),
  );
  const pipelineById = new Map(
    (resources?.pipelines ?? []).map((pipeline) => [pipeline.id, pipeline]),
  );
  const shaderById = new Map(
    (resources?.shaderModules ?? []).map((shader) => [shader.id, shader]),
  );
  const validSize = (resource) => ["width", "height"].every(
    (name) => Number.isInteger(Number(resource?.size?.[name])) &&
      Number(resource.size[name]) > 0,
  );
  const exactTextureView = (resource, { baseMipLevel, mipLevelCount }) => {
    const texture = textureById.get(resource?.textureId);
    const view = viewById.get(resource?.viewId);
    const textureMipLevelCount = Number(resource?.mipLevelCount ?? texture?.mipLevelCount ?? 1);
    const resourceLayers = Number(resource?.size?.depthOrArrayLayers);
    const textureLayers = Number(texture?.size?.depthOrArrayLayers ?? resourceLayers);
    const descriptors = [resource?.viewDescriptor, view?.descriptor].filter(
      (descriptor) => typeof descriptor === "object" && descriptor !== null,
    );
    const exactDescriptor = (descriptor) => {
      const actualBaseMipLevel = Number(descriptor.baseMipLevel ?? 0);
      const actualBaseArrayLayer = Number(descriptor.baseArrayLayer ?? 0);
      return (
        actualBaseMipLevel === baseMipLevel &&
        Number(descriptor.mipLevelCount ??
          textureMipLevelCount - actualBaseMipLevel) === mipLevelCount &&
        actualBaseArrayLayer === 0 &&
        Number(descriptor.arrayLayerCount ??
          textureLayers - actualBaseArrayLayer) === 1 &&
        (descriptor.aspect ?? "all") === "all"
      );
    };
    return (
      view?.textureId === resource?.textureId &&
      Number.isInteger(textureMipLevelCount) &&
      textureMipLevelCount >= baseMipLevel + mipLevelCount &&
      resourceLayers === 1 &&
      textureLayers === 1 &&
      descriptors.length > 0 &&
      descriptors.every(exactDescriptor)
    );
  };
  const shaderEvidence = (candidate) => {
    const pipeline = pipelineById.get(candidate.command.pipelineId);
    const shaderId = pipeline?.fragment?.shaderId;
    const shader = shaderById.get(shaderId);
    return { code: shader?.code ?? "", hash: shader?.hash ?? null, shaderId };
  };
  const consumerEvidence = (candidate) => ({
    commandSequence: candidate.command.sequence ?? null,
    passSequence: candidate.pass.sequence,
    pipelineId: candidate.command.pipelineId,
    shaderHash: shaderEvidence(candidate).hash,
    shaderId: shaderEvidence(candidate).shaderId ?? null,
    submissionSequence: candidate.pass.submissionSequence ?? null,
  });
  const exactFullscreenDraw = (candidate) => {
    const command = candidate?.command;
    return (
      command?.kind === "draw" &&
      Number(command.vertexCount) === 3 &&
      Number(command.instanceCount) === 1 &&
      Number(command.firstVertex ?? 0) === 0 &&
      Number(command.firstInstance ?? 0) === 0 &&
      command.dynamicState?.viewport === null &&
      command.dynamicState?.scissor === null
    );
  };

  if (!["threejs", "typegpu-antiky", "wesl"].includes(targetSlug)) {
    return fail("unsupported-target", "Selected-reflection probing is unsupported for this target", {
      targetSlug: targetSlug ?? null,
    });
  }
  if (trace === null || !Array.isArray(trace?.passes)) {
    return fail("trace-unavailable", "The execution trace is unavailable");
  }
  if (Number(trace.commandOverflow ?? 0) !== 0) {
    return fail("trace-command-overflow", "The execution trace dropped commands", {
      commandOverflow: Number(trace.commandOverflow),
    });
  }
  const eligible = trace.passes.filter(
    (pass) =>
      Number.isFinite(Number(pass.telemetryFrameIndex)) &&
      Number(pass.telemetryFrameIndex) <= Number(frame),
  );
  if (eligible.length === 0) {
    return fail("trace-frame-unavailable", "No traced pass precedes the captured frame", {
      capturedFrameIndex: frame,
    });
  }
  const traceFrameIndex = Math.max(
    ...eligible.map((pass) => Number(pass.telemetryFrameIndex)),
  );
  const framePasses = eligible.filter(
    (pass) => Number(pass.telemetryFrameIndex) === traceFrameIndex,
  );
  const overflowedPasses = framePasses
    .filter((pass) => Number(pass.commandOverflow ?? 0) !== 0)
    .map((pass) => pass.sequence);
  if (overflowedPasses.length > 0) {
    return fail("pass-command-overflow", "A selected frame pass dropped commands", {
      passSequences: overflowedPasses,
    });
  }
  const passes = framePasses;
  const attachments = (pass) => pass.colorAttachments ?? [];
  const outputLabel = (pass) => {
    const ids = attachments(pass)
      .map(({ textureId }) => textureId)
      .filter((id) => id !== null && id !== undefined);
    return ids.length === 1 ? textureById.get(ids[0])?.label ?? "" : "";
  };
  const candidatesIn = (pass, predicate) =>
    (pass.commands ?? [])
      .filter(predicate)
      .map((command) => ({ command, pass }));
  const candidateSignature = ({ command, pass }) => JSON.stringify({
    outputTextureIds: attachments(pass).map(({ textureId }) => textureId),
    pipelineId: command.pipelineId,
    resources: (command.resourceBindings ?? []).map(({ resource }) => ({
      kind: resource?.kind,
      samplerId: resource?.samplerId,
      textureId: resource?.textureId,
      viewId: resource?.viewId,
    })),
  });
  const requireOne = (values, role) => {
    const unique = [
      ...new Map(values.map((value) => [candidateSignature(value), value])).values(),
    ];
    return unique.length === 1
      ? unique[0]
      : fail(
          `${unique.length === 0 ? "missing" : "ambiguous"}-${role}`,
          `Expected one ${role.replaceAll("-", " ")}, found ${unique.length}`,
          {
            candidateCount: values.length,
            distinctCount: unique.length,
            passSequences: unique.map(({ pass }) => pass.sequence),
          },
        );
  };

  if (targetSlug === "threejs") {
    const isConsumer = (command) =>
      bindingsLabeled(command, "SSRNode.Blur").length > 0 &&
      bindingsLabeled(command, "metalrough").length > 0;
    const final = requireOne(
      passes.flatMap((pass) =>
        attachments(pass).some(({ textureId }) => textureId === null)
          ? candidatesIn(pass, isConsumer)
          : [],
      ),
      "final-consumer",
    );
    if (final.status === "unavailable") return final;
    const bloom = requireOne(
      passes.flatMap((pass) =>
        outputLabel(pass) === "UnrealBloomPass.bright"
          ? candidatesIn(pass, isConsumer)
          : [],
      ),
      "bloom-consumer",
    );
    if (bloom.status === "unavailable") return bloom;
    const selectBindings = (candidate) => {
      const reflection = bindingsLabeled(candidate.command, "SSRNode.Blur");
      const roughness = bindingsLabeled(candidate.command, "metalrough");
      const samplers = reflection.length === 1
        ? pairedSampler(candidate.command, reflection[0])
        : [];
      return { reflection, roughness, samplers };
    };
    const finalBindings = selectBindings(final);
    const bloomBindings = selectBindings(bloom);
    for (const [role, selected] of [
      ["final", finalBindings],
      ["bloom", bloomBindings],
    ]) {
      if (
        selected.reflection.length !== 1 ||
        selected.roughness.length !== 1 ||
        selected.samplers.length !== 1
      ) {
        return fail("consumer-binding-ambiguity", "A Three consumer binding is ambiguous", {
          reflectionCount: selected.reflection.length,
          role,
          roughnessCount: selected.roughness.length,
          samplerCount: selected.samplers.length,
        });
      }
    }
    const reflection = finalBindings.reflection[0].resource;
    const roughness = finalBindings.roughness[0].resource;
    const sampler = finalBindings.samplers[0].resource;
    const agreed =
      bloomBindings.reflection[0].resource.textureId === reflection.textureId &&
      bloomBindings.reflection[0].resource.viewId === reflection.viewId &&
      bloomBindings.roughness[0].resource.textureId === roughness.textureId &&
      bloomBindings.roughness[0].resource.viewId === roughness.viewId &&
      bloomBindings.samplers[0].resource.samplerId === sampler.samplerId;
    if (!agreed) {
      return fail("consumer-disagreement", "Three final and bloom consumers disagree", {
        bloom: {
          reflectionTextureId: bloomBindings.reflection[0].resource.textureId,
          roughnessTextureId: bloomBindings.roughness[0].resource.textureId,
          samplerId: bloomBindings.samplers[0].resource.samplerId,
        },
        final: {
          reflectionTextureId: reflection.textureId,
          roughnessTextureId: roughness.textureId,
          samplerId: sampler.samplerId,
        },
      });
    }
    const settings = sampler.settings ?? {};
    const clampModes = ["addressModeU", "addressModeV", "addressModeW"];
    const samplerValid =
      clampModes.every((name) => (settings[name] ?? "clamp-to-edge") === "clamp-to-edge") &&
      settings.magFilter === "linear" &&
      settings.minFilter === "linear" &&
      settings.mipmapFilter === "linear";
    if (!samplerValid) {
      return fail("invalid-reflection-sampler", "Three reflection sampling is not linear/trilinear clamp", {
        samplerId: sampler.samplerId,
        settings,
      });
    }
    if (
      reflection.format !== "rgba16float" ||
      Number(reflection.mipLevelCount) !== 5 ||
      roughness.format !== "rgba8unorm" ||
      !validSize(reflection) ||
      !validSize(roughness) ||
      reflection.size?.width !== roughness.size?.width ||
      reflection.size?.height !== roughness.size?.height
    ) {
      return fail("resource-contract-mismatch", "Three selected-reflection resources violate the expected contract", {
        reflection,
        roughness,
      });
    }
    const formulaValid = (candidate, selected) => {
      const code = shaderEvidence(candidate).code.replace(/\s+/g, "");
      const reflectionName = String(bindingName(selected.reflection[0]));
      const roughnessName = String(bindingName(selected.roughness[0]));
      const samplerName = String(bindingName(selected.samplers[0]));
      const roughLoad = new RegExp(
        `(?:let|var)?([A-Za-z_]\\w*)=textureSample(?:Level)?\\(${escapePattern(roughnessName)},[^;]+;`,
      ).exec(code);
      if (roughLoad === null) return false;
      const roughValue = roughLoad[1];
      const roughTerm = new RegExp(
        `^${escapePattern(roughValue)}\\.y\\*${escapePattern(roughValue)}\\.y\\*4(?:\\.0*)?f?$`,
      );
      return [...code.matchAll(/clamp\(([^,;]+),([^,;]+),([^);]+)\)/g)].some((match) => {
        if (
          !roughTerm.test(match[1].replace(/[()]/g, "")) ||
          Number(match[2].replace(/[()f]/g, "")) !== 0 ||
          Number(match[3].replace(/[()f]/g, "")) !== 4
        ) return false;
        const callStart = code.lastIndexOf("textureSampleLevel(", match.index);
        const prefix = code.slice(callStart, match.index);
        const expected = `textureSampleLevel(${reflectionName},${samplerName},`;
        if (callStart < 0 || !prefix.startsWith(expected)) return false;
        const uvAndComma = prefix.slice(expected.length);
        let depth = 0;
        let commas = 0;
        for (const character of uvAndComma) {
          if (character === "(") depth += 1;
          else if (character === ")") depth -= 1;
          else if (character === "," && depth === 0) commas += 1;
        }
        return depth === 0 && commas === 1 && uvAndComma.endsWith(",");
      });
    };
    if (!formulaValid(final, finalBindings) || !formulaValid(bloom, bloomBindings)) {
      return fail("selection-formula-mismatch", "A Three consumer does not use roughness.g squared times four", {
        bloom: consumerEvidence(bloom),
        final: consumerEvidence(final),
      });
    }
    const writes = passes.flatMap((pass) =>
      attachments(pass)
        .filter(
          ({ storeOp, textureId }) =>
            storeOp === "store" && textureId === reflection.textureId,
        )
        .map((attachment) => ({
          mipLevel: Number(viewById.get(attachment.viewId)?.descriptor?.baseMipLevel ?? 0),
          passSequence: pass.sequence,
          pipelineIds: [...new Set((pass.commands ?? []).map(({ pipelineId }) => pipelineId))],
          viewId: attachment.viewId,
        })),
    );
    const counts = Array.from({ length: 5 }, (_, mipLevel) =>
      writes.filter((write) => write.mipLevel === mipLevel).length,
    );
    if (writes.length !== 5 || counts.some((count) => count !== 1)) {
      return fail("incomplete-mip-writes", "Three did not write each selected-reflection mip exactly once", {
        counts,
        writes,
      });
    }
    writes.sort((first, second) => first.mipLevel - second.mipLevel);
    return {
      implementation: "threejs",
      issues: [],
      provenance: {
        consumers: {
          bloomExtraction: consumerEvidence(bloom),
          finalPresentation: consumerEvidence(final),
        },
        formula: {
          channel: "g",
          expression: "clamp(roughness.g * roughness.g * 4.0, 0.0, 4.0)",
          kind: "roughness-squared",
          maxMipLevel: 4,
          minMipLevel: 0,
          multiplier: 4,
        },
        mipWrites: writes,
        selectionFormula: "clamp(roughness.g * roughness.g * 4.0, 0.0, 4.0)",
        targetSlug,
        traceFrameIndex,
      },
      reflection,
      roughness,
      sampler,
      status: "ready",
    };
  }

  return resolveAntiky_(
    {
      attachments,
      bindingName,
      bindingsNamed,
      bufferById,
      candidatesIn,
      consumerEvidence,
      escapePattern,
      exactFullscreenDraw,
      exactTextureView,
      fail,
      pipelineById,
      requireOne,
      shaderEvidence,
      targetSlug,
      textureById,
      trace,
      traceFrameIndex,
      validSize,
      viewById,
    },
    validateAntikyReconstruction_,
  );
}

export const selectedReflectionSampleStrideBytes = SAMPLE_STRIDE_BYTES;

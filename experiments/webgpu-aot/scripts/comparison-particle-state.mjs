export const PARTICLE_COUNT = 406;

const DIRECT_PARTICLE_STRIDE = 32;
const MATRIX_STRIDE = 64;
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const STATE_TOLERANCE = 1e-6;

function alignTo(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

export function particleIssue(code, message, evidence = {}) {
  return { code, message, ...evidence };
}

function compactWgslType(type) {
  return String(type ?? "").replaceAll(/\s/g, "");
}

function isVec4(type) {
  return /^(?:vec4(?:<f32>|f))$/.test(compactWgslType(type));
}

function arrayStructure(type) {
  const match = /^array<([A-Za-z_]\w*)(?:,(\d+))?>$/.exec(
    compactWgslType(type),
  );
  return match === null
    ? null
    : {
        count: match[2] === undefined ? null : Number(match[2]),
        structureName: match[1],
      };
}

function isParticleMatrixArray(type) {
  const compact = compactWgslType(type);
  return (
    compact === `array<mat4x4<f32>,${PARTICLE_COUNT}>` ||
    compact === `array<mat4x4f,${PARTICLE_COUNT}>`
  );
}

function isParticleDraw(command) {
  const elementCount =
    command?.kind === "drawIndexed"
      ? command.indexCount
      : command?.kind === "draw"
        ? command.vertexCount
        : null;
  return command?.instanceCount === PARTICLE_COUNT && elementCount === 6;
}

function isAdditiveParticlePipeline(pipeline) {
  const hasAdditiveTarget = (pipeline?.fragment?.targets ?? []).some(
    (target) =>
      target?.blend?.color?.operation === "add" &&
      target.blend.color.dstFactor === "one",
  );
  return (
    pipeline?.kind === "render" &&
    pipeline?.depthStencil?.depthWriteEnabled === false &&
    hasAdditiveTarget
  );
}

function selectParticleCommands(gpu) {
  const pipelines = new Map(
    (gpu?.pipelines ?? []).map((pipeline) => [pipeline.id, pipeline]),
  );
  const observed = [];
  for (const [passIndex, pass] of (gpu?.executionTrace?.passes ?? []).entries()) {
    for (const command of pass.commands ?? []) {
      if (
        isParticleDraw(command) &&
        isAdditiveParticlePipeline(pipelines.get(command.pipelineId))
      ) {
        observed.push({ command, pass, passIndex });
      }
    }
  }
  if (observed.length === 0) {
    return {
      commands: [],
      evidence: {
        matchedCommandCount: 0,
        observedPassCount: gpu?.executionTrace?.passes?.length ?? 0,
      },
    };
  }

  const frameIndices = observed
    .map(({ pass }) => pass.telemetryFrameIndex)
    .filter(Number.isFinite);
  const latestTelemetryFrameIndex =
    frameIndices.length === 0 ? null : Math.max(...frameIndices);
  const latestPassIndex = Math.max(...observed.map(({ passIndex }) => passIndex));
  const commands = observed.filter(({ pass, passIndex }) =>
    latestTelemetryFrameIndex === null
      ? passIndex === latestPassIndex
      : pass.telemetryFrameIndex === latestTelemetryFrameIndex,
  );

  return {
    commands,
    evidence: {
      latestTelemetryFrameIndex,
      matchedCommandCount: observed.length,
      selectedCommandCount: commands.length,
    },
  };
}

function shaderStructureLayout(gpu, pipeline, structureName) {
  const shaderId = pipeline?.vertex?.shaderId;
  const shader = (gpu?.shaderModules ?? []).find(
    (candidate) => candidate.id === shaderId,
  );
  return (shader?.analysis?.structureLayouts ?? []).find(
    (layout) => layout.name === structureName && layout.supported !== false,
  );
}

function directParticleLayout(gpu, pipeline, shaderBinding, resourceSize) {
  const declaredArray = arrayStructure(shaderBinding?.type);
  if (declaredArray === null) {
    return null;
  }

  let elementCount = shaderBinding?.layout?.elementCount ?? declaredArray.count;
  let stride = shaderBinding?.layout?.stride;
  let members = shaderBinding?.layout?.members;
  const structureName =
    shaderBinding?.layout?.structureName ?? declaredArray.structureName;
  if (
    !Number.isInteger(stride) ||
    stride <= 0 ||
    !Array.isArray(members)
  ) {
    const structure = shaderStructureLayout(gpu, pipeline, structureName);
    if (structure === undefined) {
      return null;
    }
    stride = alignTo(structure.size, structure.alignment);
    members = structure.members;
    if (elementCount === null) {
      elementCount = resourceSize / stride;
    }
  }

  if (
    stride !== DIRECT_PARTICLE_STRIDE ||
    elementCount !== PARTICLE_COUNT ||
    resourceSize < PARTICLE_COUNT * stride
  ) {
    return null;
  }
  const vec4Members = members.filter(
    (member) => member.size >= 16 && isVec4(member.type),
  );
  const position =
    vec4Members.find((member) => /position.*(?:size|radius)/i.test(member.name)) ??
    vec4Members.find((member) => member.offset === 0);
  const color =
    vec4Members.find((member) => /color/i.test(member.name)) ??
    vec4Members.find((member) => member.offset === 16);
  if (
    position === undefined ||
    color === undefined ||
    position.offset + 16 > stride ||
    color.offset + 16 > stride
  ) {
    return null;
  }
  return {
    colorOffset: color.offset,
    colorMember: color.name,
    positionOffset: position.offset,
    positionMember: position.name,
    stride,
    structureName,
  };
}

function reconstructProbe(probe, requiredOffset, requiredBytes) {
  const floatCount = requiredBytes / FLOAT_BYTES;
  if (
    !Number.isInteger(requiredOffset / FLOAT_BYTES) ||
    !Number.isInteger(floatCount)
  ) {
    return { coveredBytes: 0, values: null };
  }
  const values = new Array(floatCount);
  const covered = new Uint8Array(floatCount);
  for (const range of probe?.ranges ?? []) {
    const rangeOffset = Number(range.sourceOffset ?? 0);
    for (const segment of range.sample?.segments ?? []) {
      const segmentOffset = rangeOffset + Number(segment.byteOffset ?? 0);
      for (const [index, value] of (segment.floats ?? []).entries()) {
        const byteOffset = segmentOffset + index * FLOAT_BYTES;
        const destination = (byteOffset - requiredOffset) / FLOAT_BYTES;
        if (
          Number.isInteger(destination) &&
          destination >= 0 &&
          destination < floatCount &&
          typeof value === "number" &&
          Number.isFinite(value)
        ) {
          values[destination] = value;
          covered[destination] = 1;
        }
      }
    }
  }
  const coveredFloats = covered.reduce((sum, value) => sum + value, 0);
  return {
    coveredBytes: coveredFloats * FLOAT_BYTES,
    values: coveredFloats === floatCount ? values : null,
  };
}

function probeValues(probes, bufferId, requiredOffset, requiredBytes) {
  const probe = probes.get(bufferId);
  if (probe === undefined) {
    return {
      issue: particleIssue(
        "particle-buffer-probe-missing",
        "The particle draw buffer was not selected for GPU readback.",
        { bufferId, requiredBytes, requiredOffset },
      ),
      values: null,
    };
  }
  const sample = reconstructProbe(probe, requiredOffset, requiredBytes);
  if (sample.values === null) {
    return {
      issue: particleIssue(
        "incomplete-particle-buffer-probe",
        "The GPU readback did not cover the full particle state buffer.",
        {
          bufferId,
          coveredBytes: sample.coveredBytes,
          requiredBytes,
          requiredOffset,
        },
      ),
      values: null,
    };
  }
  return { issue: null, values: sample.values };
}

function directVariants(gpu, selected, probes) {
  const pipelines = new Map(
    (gpu?.pipelines ?? []).map((pipeline) => [pipeline.id, pipeline]),
  );
  const variants = [];
  const issues = [];
  let recognizedCommands = 0;
  for (const { command } of selected) {
    const pipeline = pipelines.get(command.pipelineId);
    const candidates = [];
    for (const binding of command.resourceBindings ?? []) {
      if (binding.resource?.kind !== "buffer") {
        continue;
      }
      for (const shaderBinding of binding.shaderBindings ?? []) {
        if (
          shaderBinding.stage !== "vertex" ||
          !String(shaderBinding.addressSpace ?? "").startsWith("storage")
        ) {
          continue;
        }
        const resourceSize = Number(binding.resource.size ?? 0);
        const layout = directParticleLayout(
          gpu,
          pipeline,
          shaderBinding,
          resourceSize,
        );
        if (layout !== null) {
          candidates.push({ binding, layout });
        }
      }
    }
    if (candidates.length === 0) {
      continue;
    }
    recognizedCommands += 1;
    if (candidates.length > 1) {
      issues.push(
        particleIssue(
          "ambiguous-particle-state",
          "The particle draw consumes more than one structurally matching particle array.",
          {
            candidateBufferIds: candidates.map(
              ({ binding }) => binding.resource.bufferId,
            ),
            commandSequence: command.sequence,
            pipelineId: command.pipelineId,
          },
        ),
      );
      continue;
    }

    const [{ binding, layout }] = candidates;
    const requiredBytes = PARTICLE_COUNT * layout.stride;
    const requiredOffset = Number(binding.resource.offset ?? 0);
    const sampled = probeValues(
      probes,
      binding.resource.bufferId,
      requiredOffset,
      requiredBytes,
    );
    if (sampled.issue !== null) {
      issues.push(sampled.issue);
      continue;
    }
    const strideFloats = layout.stride / FLOAT_BYTES;
    const positionOffset = layout.positionOffset / FLOAT_BYTES;
    const colorOffset = layout.colorOffset / FLOAT_BYTES;
    variants.push({
      evidence: {
        bufferId: binding.resource.bufferId,
        colorMember: layout.colorMember,
        commandSequence: command.sequence,
        pipelineId: command.pipelineId,
        positionMember: layout.positionMember,
        representation: "storage-struct-array",
        structureName: layout.structureName,
      },
      particles: Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const base = index * strideFloats;
        return {
          aux: sampled.values[base + colorOffset + 3],
          color: sampled.values.slice(
            base + colorOffset,
            base + colorOffset + 3,
          ),
          position: sampled.values.slice(
            base + positionOffset,
            base + positionOffset + 3,
          ),
          radius: sampled.values[base + positionOffset + 3],
        };
      }),
    });
  }
  return { issues, recognizedCommands, variants };
}

function matrixArrayMember(shaderBinding) {
  if (isParticleMatrixArray(shaderBinding?.type)) {
    return { offset: 0, type: shaderBinding.type };
  }
  return (shaderBinding?.layout?.members ?? []).find((member) =>
    isParticleMatrixArray(member.type),
  );
}

function instanceColorInput(pipeline, command) {
  const candidates = [];
  for (const [slot, layout] of (pipeline?.vertex?.buffers ?? []).entries()) {
    if (layout?.stepMode !== "instance") {
      continue;
    }
    for (const attribute of layout.attributes ?? []) {
      if (attribute.format !== "float32x3") {
        continue;
      }
      const binding = (command.bindings?.vertexBuffers ?? []).find(
        (candidate) => candidate.slot === slot,
      );
      if (binding !== undefined) {
        candidates.push({
          attributeOffset: Number(attribute.offset ?? 0),
          binding,
          stride: Number(layout.arrayStride ?? 0),
        });
      }
    }
  }
  return candidates;
}

function matrixVariants(gpu, selected, probes) {
  const pipelines = new Map(
    (gpu?.pipelines ?? []).map((pipeline) => [pipeline.id, pipeline]),
  );
  const variants = [];
  const issues = [];
  let recognizedCommands = 0;
  for (const { command } of selected) {
    const pipeline = pipelines.get(command.pipelineId);
    const matrixCandidates = [];
    for (const binding of command.resourceBindings ?? []) {
      if (binding.resource?.kind !== "buffer") {
        continue;
      }
      for (const shaderBinding of binding.shaderBindings ?? []) {
        if (
          shaderBinding.stage !== "vertex" ||
          shaderBinding.addressSpace !== "uniform"
        ) {
          continue;
        }
        const member = matrixArrayMember(shaderBinding);
        if (member !== undefined) {
          matrixCandidates.push({ binding, member });
        }
      }
    }
    const colorCandidates = instanceColorInput(pipeline, command).filter(
      ({ stride }) => stride >= 12 && stride % FLOAT_BYTES === 0,
    );
    if (matrixCandidates.length === 0 || colorCandidates.length === 0) {
      continue;
    }
    recognizedCommands += 1;
    if (matrixCandidates.length !== 1 || colorCandidates.length !== 1) {
      issues.push(
        particleIssue(
          "ambiguous-particle-state",
          "The particle draw has multiple structurally matching transform or color inputs.",
          {
            colorBufferIds: colorCandidates.map(
              ({ binding }) => binding.bufferId,
            ),
            commandSequence: command.sequence,
            matrixBufferIds: matrixCandidates.map(
              ({ binding }) => binding.resource.bufferId,
            ),
            pipelineId: command.pipelineId,
          },
        ),
      );
      continue;
    }

    const [{ binding: matrixBinding, member: matrixMember }] = matrixCandidates;
    const [{ attributeOffset, binding: colorBinding, stride: colorStride }] =
      colorCandidates;
    const matrixOffset =
      Number(matrixBinding.resource.offset ?? 0) + Number(matrixMember.offset ?? 0);
    const matrixSample = probeValues(
      probes,
      matrixBinding.resource.bufferId,
      matrixOffset,
      PARTICLE_COUNT * MATRIX_STRIDE,
    );
    const colorRequiredBytes =
      (PARTICLE_COUNT - 1) * colorStride + attributeOffset + 3 * FLOAT_BYTES;
    const colorOffset = Number(colorBinding.offset ?? 0);
    const colorSample = probeValues(
      probes,
      colorBinding.bufferId,
      colorOffset,
      colorRequiredBytes,
    );
    if (matrixSample.issue !== null || colorSample.issue !== null) {
      if (matrixSample.issue !== null) {
        issues.push(matrixSample.issue);
      }
      if (colorSample.issue !== null) {
        issues.push(colorSample.issue);
      }
      continue;
    }
    const colorStrideFloats = colorStride / FLOAT_BYTES;
    const colorAttributeFloatOffset = attributeOffset / FLOAT_BYTES;
    variants.push({
      evidence: {
        colorBufferId: colorBinding.bufferId,
        commandSequence: command.sequence,
        pipelineId: command.pipelineId,
        representation: "instance-matrices-and-color-attribute",
        transformBufferId: matrixBinding.resource.bufferId,
      },
      particles: Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const matrixBase = index * (MATRIX_STRIDE / FLOAT_BYTES);
        const colorBase = index * colorStrideFloats + colorAttributeFloatOffset;
        const xBasis = Math.hypot(
          matrixSample.values[matrixBase],
          matrixSample.values[matrixBase + 1],
          matrixSample.values[matrixBase + 2],
        );
        const yBasis = Math.hypot(
          matrixSample.values[matrixBase + 4],
          matrixSample.values[matrixBase + 5],
          matrixSample.values[matrixBase + 6],
        );
        return {
          aux: null,
          color: colorSample.values.slice(colorBase, colorBase + 3),
          position: matrixSample.values.slice(matrixBase + 12, matrixBase + 15),
          radius: (xBasis + yBasis) / 4,
        };
      }),
    });
  }
  return { issues, recognizedCommands, variants };
}

function scalarDiffers(first, second) {
  return Math.abs(first - second) > STATE_TOLERANCE;
}

function particlesDiffer(first, second) {
  return (
    scalarDiffers(first.radius, second.radius) ||
    first.position.some((value, index) =>
      scalarDiffers(value, second.position[index]),
    ) ||
    first.color.some((value, index) =>
      scalarDiffers(value, second.color[index]),
    ) ||
    (first.aux !== null &&
      second.aux !== null &&
      scalarDiffers(first.aux, second.aux))
  );
}

export function findParticleVariantDifferences(variants) {
  const differingIndices = [];
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    if (
      variants.slice(1).some((variant) =>
        particlesDiffer(variants[0].particles[index], variant.particles[index]),
      )
    ) {
      differingIndices.push(index);
    }
  }
  return differingIndices;
}

export function decodeParticleStateEvidence(gpu) {
  const selected = selectParticleCommands(gpu);
  const probes = new Map(
    (gpu?.bufferProbes?.results ?? []).map((probe) => [
      probe.bufferId,
      probe,
    ]),
  );
  return {
    direct: directVariants(gpu, selected.commands, probes),
    matrices: matrixVariants(gpu, selected.commands, probes),
    selected,
  };
}

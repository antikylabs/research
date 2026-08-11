export function validateAntikySelectedReflectionReconstruction(context) {
  const {
    attachments,
    bindingsNamed,
    bufferById,
    exactTextureView,
    exactFullscreenDraw,
    executionIndex,
    fail,
    finalWriter,
    passes,
    pipelineById,
    submittedPasses,
    pyramid,
    reflection,
    selectorSampler,
    selector,
    shaderEvidence,
    surface,
    textureById,
    viewById,
    contract,
  } = context;
  const exactReflectionOutputState = (candidate) => {
    const pipeline = pipelineById.get(candidate?.command?.pipelineId);
    const targets = pipeline?.fragment?.targets;
    const target = targets?.[0];
    const attachment = candidate?.pass?.colorAttachments?.[0];
    return (
      candidate?.pass?.kind === "render" &&
      candidate.pass.depthStencilAttachment === null &&
      candidate.pass.colorAttachments?.length === 1 &&
      Array.isArray(attachment?.clearValue) &&
      attachment.clearValue.length === 4 &&
      attachment.clearValue.every(
        (value, index) => Number(value) === [0, 0, 0, 1][index],
      ) &&
      attachment.loadOp === "clear" &&
      attachment.storeOp === "store" &&
      attachment.resolveTextureId === null &&
      attachment.resolveViewId === null &&
      pipeline?.depthStencil === null &&
      Array.isArray(targets) &&
      targets.length === 1 &&
      target?.format === "rgba16float" &&
      target.blend === null &&
      Number(target.writeMask) === 15 &&
      Number(pipeline?.multisample?.count) === 1 &&
      Number(pipeline?.multisample?.mask) === 0xffffffff &&
      pipeline?.multisample?.alphaToCoverageEnabled === false &&
      pipeline?.primitive?.topology === "triangle-list" &&
      pipeline?.primitive?.cullMode === "none" &&
      pipeline?.primitive?.frontFace === "ccw" &&
      pipeline?.primitive?.stripIndexFormat === null &&
      Array.isArray(pipeline?.vertex?.buffers) &&
      pipeline.vertex.buffers.length === 0
    );
  };
  if (!exactReflectionOutputState(selector)) {
    return fail(
      "selector-output-state-mismatch",
      "The Antiky roughness selector does not preserve its exact output state",
      {
        passSequence: selector.pass.sequence,
        pipelineId: selector.command.pipelineId,
      },
    );
  }
  const laterSurfaceWrites = submittedPasses.filter(
    (pass) =>
      executionIndex(pass) > executionIndex(finalWriter) &&
      attachments(pass).some(
        ({ resolveTextureId, textureId }) =>
          textureId === surface.textureId ||
          resolveTextureId === surface.textureId,
      ),
  );
  if (laterSurfaceWrites.length > 0) {
    return fail(
      "surface-roughness-overwritten",
      "The Antiky surface roughness changed before the live probe",
      {
        passSequences: laterSurfaceWrites.map(({ sequence }) => sequence),
        selectorPassSequence: finalWriter.sequence,
      },
    );
  }
  const mipStages = passes
    .filter((pass) => executionIndex(pass) < executionIndex(finalWriter))
    .flatMap((pass) =>
      attachments(pass)
        .filter(
          ({ storeOp, textureId }) =>
            storeOp === "store" && textureId === pyramid.textureId,
        )
        .map((attachment) => {
          const candidates = (pass.commands ?? []).filter(
            (command) =>
              bindingsNamed(command, contract.rawBinding).length > 0,
          );
          const command = candidates.length === 1 ? candidates[0] : null;
          const view = viewById.get(attachment.viewId);
          return {
            attachment,
            candidates,
            command,
            mipLevel: Number(view?.descriptor?.baseMipLevel ?? 0),
            pass,
            view,
          };
        }),
    );
  const mipCounts = Array.from({ length: 5 }, (_, mipLevel) =>
    mipStages.filter((stage) => stage.mipLevel === mipLevel).length,
  );
  if (
    mipStages.length !== 5 ||
    mipCounts.some((count) => count !== 1) ||
    mipStages.some(({ candidates }) => candidates.length !== 1)
  ) {
    return fail(
      "incomplete-mip-writes",
      "Antiky did not reconstruct all five mips directly from one raw reflection",
      {
        candidateCounts: mipStages.map(({ candidates }) => candidates.length),
        counts: mipCounts,
      },
    );
  }
  mipStages.sort((first, second) => first.mipLevel - second.mipLevel);

  const reconstructionHash = contract.reconstructionHash;
  const sizeMatches = (resource, expected) =>
    Number(resource?.size?.width) === Number(expected?.size?.width) &&
    Number(resource?.size?.height) === Number(expected?.size?.height) &&
    Number(resource?.size?.depthOrArrayLayers) === 1 &&
    Number(expected?.size?.depthOrArrayLayers) === 1;
  const decodeSettings = (binding, command, pass) => {
    const resource = binding?.resource;
    const buffer = bufferById.get(resource?.bufferId);
    const executionBindings = (command?.bufferBindings ?? []).filter(
      (candidate) =>
        candidate.source === "bindGroup" &&
        Number(candidate.group) === Number(binding?.group) &&
        Number(candidate.binding) === Number(binding?.binding) &&
        Number(candidate.bufferId) === Number(resource?.bufferId),
    );
    const executionBinding =
      executionBindings.length === 1 ? executionBindings[0] : null;
    const write = executionBinding?.submissionSnapshot;
    const segments = write?.sample?.segments;
    if (
      resource?.kind !== "buffer" ||
      executionBindings.length !== 1 ||
      Number(resource.offset ?? 0) !== 0 ||
      Number(resource.size) !== 16 ||
      Number(buffer?.size) !== 16 ||
      Number(executionBinding?.offset) !== 0 ||
      Number(executionBinding?.size) !== 16 ||
      Number(write?.submissionSequence) !== Number(pass?.submissionSequence) ||
      Number(write?.bufferOffset) !== 0 ||
      Number(write?.byteLength) !== 16 ||
      write?.sample?.truncated !== false ||
      !Array.isArray(segments) ||
      segments.length !== 1 ||
      Number(segments[0]?.byteOffset) !== 0 ||
      !Array.isArray(segments[0]?.bytes) ||
      segments[0].bytes.length !== 16
    ) {
      return null;
    }
    const bytes = new Uint8Array(segments[0].bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Array.from({ length: 4 }, (_, index) =>
      view.getFloat32(index * 4, true),
    );
  };
  const rawResources = [];
  const mipWrites = [];
  for (const stage of mipStages) {
    const candidate = { command: stage.command, pass: stage.pass };
    const rawBindings = bindingsNamed(stage.command, contract.rawBinding);
    const settingsBindings = bindingsNamed(
      stage.command,
      contract.settingsBinding,
      "buffer",
    );
    const samplers = (stage.command.resourceBindings ?? []).filter(
      ({ resource }) => resource?.kind === "sampler",
    );
    const descriptor = stage.view?.descriptor ?? {};
    const outputViewValid = exactTextureView(
      {
        ...pyramid,
        viewDescriptor: descriptor,
        viewId: stage.attachment.viewId,
      },
      { baseMipLevel: stage.mipLevel, mipLevelCount: 1 },
    );
    const expectedSettings = Array.from(
      new Float32Array([
        1 / Number(pyramid.size.width),
        1 / Number(pyramid.size.height),
        stage.mipLevel,
        0,
      ]),
    );
    const actualSettings =
      settingsBindings.length === 1
        ? decodeSettings(
            settingsBindings[0],
            stage.command,
            stage.pass,
          )
        : null;
    const expectedWidth = Math.max(
      1,
      Math.floor(Number(pyramid.size.width) / 2 ** stage.mipLevel),
    );
    const expectedHeight = Math.max(
      1,
      Math.floor(Number(pyramid.size.height) / 2 ** stage.mipLevel),
    );
    const drawValid =
      stage.pass.commands?.length === 1 && exactFullscreenDraw(candidate);
    const outputStateValid = exactReflectionOutputState(candidate);
    const shaderHash = shaderEvidence(candidate).hash;
    const settingsValid =
      actualSettings !== null &&
      actualSettings.every(
        (value, index) => value === expectedSettings[index],
      );
    if (
      !drawValid ||
      !outputStateValid ||
      rawBindings.length !== 1 ||
      settingsBindings.length !== 1 ||
      samplers.length !== 1 ||
      samplers[0].resource.samplerId !== selectorSampler.samplerId ||
      shaderHash !== reconstructionHash ||
      !outputViewValid ||
      !settingsValid
    ) {
      const code = !drawValid
        ? "reconstruction-draw-mismatch"
        : !outputStateValid
          ? "reconstruction-output-state-mismatch"
          : shaderHash !== reconstructionHash
            ? "reconstruction-shader-mismatch"
            : !settingsValid
              ? "reconstruction-settings-mismatch"
              : "reconstruction-stage-contract-mismatch";
      return fail(
        code,
        "An Antiky reflection reconstruction stage violates the exact contract",
        {
          actualSettings,
          expectedHeight,
          expectedSettings,
          expectedWidth,
          mipLevel: stage.mipLevel,
          passSequence: stage.pass.sequence,
          shaderHash,
          viewDescriptor: descriptor,
        },
      );
    }
    rawResources.push(rawBindings[0].resource);
    mipWrites.push({
      commandSequence: stage.command.sequence ?? null,
      executionIndex: executionIndex(stage.pass),
      height: expectedHeight,
      mipLevel: stage.mipLevel,
      passSequence: stage.pass.sequence,
      pipelineIds: [stage.command.pipelineId],
      rawTextureId: rawBindings[0].resource.textureId,
      settingsBufferId: settingsBindings[0].resource.bufferId,
      submissionSequence: stage.pass.submissionSequence ?? null,
      textureId: pyramid.textureId,
      viewId: stage.attachment.viewId,
      width: expectedWidth,
    });
  }
  const rawTextureIds = [
    ...new Set(rawResources.map(({ textureId }) => textureId)),
  ];
  const rawViewIds = [...new Set(rawResources.map(({ viewId }) => viewId))];
  const raw = rawResources[0];
  const rawTexture = textureById.get(rawTextureIds[0]);
  const rawUsage = Number(rawTexture?.usage);
  // GPUTextureUsage bits: COPY_DST 2, TEXTURE_BINDING 4, STORAGE 8, RENDER 16.
  const requiredRawUsage = 4 | 16;
  const untracedWriteUsage = 2 | 8;
  const rawWritesAreTraceable =
    Number.isInteger(rawUsage) &&
    (rawUsage & requiredRawUsage) === requiredRawUsage &&
    (rawUsage & untracedWriteUsage) === 0;
  if (
    rawTextureIds.length !== 1 ||
    rawViewIds.length !== 1 ||
    raw?.format !== "rgba16float" ||
    Number(raw?.mipLevelCount) !== 1 ||
    !exactTextureView(raw, { baseMipLevel: 0, mipLevelCount: 1 }) ||
    !sizeMatches(raw, pyramid) ||
    !sizeMatches(surface, pyramid) ||
    !sizeMatches(reflection, pyramid) ||
    Number(reflection.mipLevelCount ?? 1) !== 1 ||
    Number(surface.mipLevelCount ?? 1) !== 1 ||
    rawTextureIds[0] === pyramid.textureId ||
    rawTextureIds[0] === reflection.textureId ||
    pyramid.textureId === reflection.textureId ||
    !rawWritesAreTraceable
  ) {
    return fail(
      "reconstruction-resource-contract-mismatch",
      "Antiky reconstruction resources violate the exact texture contract",
      {
        pyramidTextureId: pyramid.textureId,
        rawTextureUsage: Number.isFinite(rawUsage) ? rawUsage : null,
        rawTextureIds,
        rawViewIds,
        selectedTextureId: reflection.textureId,
      },
    );
  }

  const stageSequences = mipWrites.map(({ passSequence }) => passSequence);
  const stageExecutionIndices = mipWrites.map(({ executionIndex: index }) =>
    index,
  );
  if (
    stageExecutionIndices.some(
      (index, mipLevel) =>
        mipLevel > 0 && index <= stageExecutionIndices[mipLevel - 1],
    ) ||
    stageExecutionIndices.at(-1) >= executionIndex(finalWriter)
  ) {
    return fail(
      "reconstruction-order-mismatch",
      "Antiky reflection reconstruction stages are not strictly ordered",
      {
        finalWriterExecutionIndex: executionIndex(finalWriter),
        finalWriterSequence: finalWriter.sequence,
        stageExecutionIndices,
        stageSequences,
      },
    );
  }
  const stagePasses = new Set(stageSequences);
  const laterPyramidWrites = submittedPasses.filter(
    (pass) =>
      executionIndex(pass) >= stageExecutionIndices[0] &&
      executionIndex(pass) < executionIndex(finalWriter) &&
      !stagePasses.has(pass.sequence) &&
      attachments(pass).some(
        ({ resolveTextureId, textureId }) =>
          textureId === pyramid.textureId ||
          resolveTextureId === pyramid.textureId,
      ),
  );
  if (laterPyramidWrites.length > 0) {
    return fail(
      "reflection-pyramid-overwritten",
      "The Antiky reflection pyramid changed before roughness selection",
      {
        passSequences: laterPyramidWrites.map(({ sequence }) => sequence),
        stageSequences,
      },
    );
  }
  const rawWriter = submittedPasses
    .filter(
      (pass) =>
        executionIndex(pass) < stageExecutionIndices[0] &&
        attachments(pass).some(
          ({ storeOp, textureId }) =>
            storeOp === "store" && textureId === rawTextureIds[0],
        ),
      )
    .sort(
      (first, second) => executionIndex(second) - executionIndex(first),
    )[0] ?? null;
  if (
    rawWriter === null ||
    executionIndex(rawWriter) >= stageExecutionIndices[0] ||
    !contract.rawLabel.test(
      String(rawWriter.label),
    )
  ) {
    return fail(
      "raw-reflection-writer-unavailable",
      "The Antiky mip pyramid does not follow the current raw reflection trace",
      { rawTextureId: rawTextureIds[0], stageSequences },
    );
  }
  const rawCandidates = (rawWriter.commands ?? []).map((command) => ({
    command,
    pass: rawWriter,
  }));
  const rawCandidate = rawCandidates.length === 1 ? rawCandidates[0] : null;
  const rawOutputStateValid =
    rawCandidate !== null && exactReflectionOutputState(rawCandidate);
  const rawAttachment = attachments(rawWriter).find(
    ({ storeOp, textureId }) =>
      storeOp === "store" && textureId === rawTextureIds[0],
  );
  const rawWriterView = viewById.get(rawAttachment?.viewId);
  const rawWriterViewValid = exactTextureView(
    {
      ...raw,
      viewDescriptor: rawWriterView?.descriptor,
      viewId: rawAttachment?.viewId,
    },
    { baseMipLevel: 0, mipLevelCount: 1 },
  );
  const rawShaderHash =
    rawCandidate === null ? null : shaderEvidence(rawCandidate).hash;
  if (
    rawCandidate === null ||
    !exactFullscreenDraw(rawCandidate) ||
    !rawOutputStateValid ||
    !rawWriterViewValid ||
    rawShaderHash !== contract.rawHash
  ) {
    const code =
      rawCandidate !== null && !rawOutputStateValid
        ? "raw-reflection-output-state-mismatch"
        : rawShaderHash !== contract.rawHash
          ? "raw-reflection-shader-mismatch"
          : "raw-reflection-draw-mismatch";
    return fail(
      code,
      "The Antiky raw reflection trace does not preserve its exact writer",
      {
        commandCount: rawCandidates.length,
        passSequence: rawWriter.sequence,
        shaderHash: rawShaderHash,
      },
    );
  }
  const laterRawWrites = submittedPasses.filter(
    (pass) =>
      executionIndex(pass) > executionIndex(rawWriter) &&
      executionIndex(pass) < executionIndex(finalWriter) &&
      attachments(pass).some(
        ({ resolveTextureId, textureId }) =>
          textureId === rawTextureIds[0] ||
          resolveTextureId === rawTextureIds[0],
      ),
  );
  if (laterRawWrites.length > 0) {
    return fail(
      "raw-reflection-overwritten",
      "The raw Antiky reflection changed while its mip pyramid was reconstructed",
      {
        passSequences: laterRawWrites.map(({ sequence }) => sequence),
        rawWriterPassSequence: rawWriter.sequence,
      },
    );
  }
  return {
    mipWrites,
    rawTextureId: rawTextureIds[0],
    status: "ready",
  };
}

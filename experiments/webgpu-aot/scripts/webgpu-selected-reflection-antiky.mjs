export function resolveAntikySelectedReflection(
  context,
  validateReconstruction,
) {
  const {
    attachments,
    bindingName,
    bindingsNamed,
    bufferById,
    candidatesIn,
    consumerEvidence: baseConsumerEvidence,
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
  } = context;
  const isWesl = targetSlug === "wesl";
  const contract = isWesl
    ? {
        bloomBinding: /^bloomReflection$/i,
        bloomLabel: /WESL bloom bright extraction/i,
        finalBinding: /^reflectionTexture$/i,
        finalLabel: /WESL linked five-level bloom ACES composite/i,
        implementation: "wesl",
        pyramidBinding: /^reconstructionSource$/i,
        reconstructionHash: "2ba25fa8",
        rawBinding: /^reconstructionSource$/i,
        rawHash: "2ba25fa8",
        rawLabel: /WESL linked screen-space reflection trace/i,
        selectorHash: "2ba25fa8",
        settingsBinding: /^reconstructionSettings$/i,
        surfaceBinding: /^reflectionRoughness$/i,
      }
    : {
        bloomBinding: /^reflection$/i,
        bloomLabel: /Antiky AOT bloom bright extraction pass/i,
        finalBinding: /^reflection$/i,
        finalLabel: /Antiky final bloom and tone-map pass/i,
        implementation: "typegpu-antiky",
        pyramidBinding: /^reflection$/i,
        reconstructionHash: "449eaaed",
        rawBinding: /^rawReflection$/i,
        rawHash: "62241419",
        rawLabel: /raw full-resolution screen-space reflection trace/i,
        selectorHash: "4c0ad554",
        settingsBinding: /^settings$/i,
        surfaceBinding: /^surface$/i,
      };
  if (!Array.isArray(trace.submissions) || trace.submissions.length === 0) {
    return fail(
      "submission-trace-unavailable",
      "The Antiky selected-reflection proof has no submitted execution order",
    );
  }
  const passBySequence = new Map(
    trace.passes.map((pass) => [pass.sequence, pass]),
  );
  if (
    passBySequence.size !== trace.passes.length ||
    trace.passes.some((pass) => !Number.isInteger(pass.sequence))
  ) {
    return fail(
      "submission-trace-incoherent",
      "The Antiky selected-reflection submission trace has invalid pass IDs",
    );
  }
  const executionOrder = new Map();
  const submittedPasses = [];
  const passes = [];
  let previousSubmissionSequence = 0;
  for (const submission of trace.submissions) {
    const submissionSequence = submission?.sequence;
    if (
      !Number.isInteger(submissionSequence) ||
      submissionSequence <= previousSubmissionSequence ||
      !Array.isArray(submission?.passSequences)
    ) {
      return fail(
        "submission-trace-incoherent",
        "The Antiky selected-reflection submission trace is incoherent",
        { submissionSequence: submission?.sequence ?? null },
      );
    }
    previousSubmissionSequence = submissionSequence;
    for (const value of submission.passSequences) {
      const sequence = value;
      const pass = passBySequence.get(sequence);
      if (
        !Number.isInteger(sequence) ||
        pass === undefined ||
        executionOrder.has(sequence) ||
        pass.submissionSequence !== submissionSequence
      ) {
        return fail(
          "submission-trace-incoherent",
          "The Antiky selected-reflection submission trace is incoherent",
          { passSequence: value ?? null, submissionSequence },
        );
      }
      executionOrder.set(sequence, executionOrder.size);
      submittedPasses.push(pass);
      if (Number(pass.telemetryFrameIndex) === traceFrameIndex) {
        passes.push(pass);
      }
    }
  }
  const executionIndex = (pass) =>
    executionOrder.get(pass?.sequence) ?? null;
  // GPUTextureUsage: COPY_DST 2, TEXTURE_BINDING 4, STORAGE 8, RENDER 16.
  const writesAreTraceable = (resource) => {
    const usage = Number(textureById.get(resource?.textureId)?.usage);
    return Number.isInteger(usage) && (usage & 20) === 20 && (usage & 10) === 0;
  };
  const consumerEvidence = (candidate) => ({
    ...baseConsumerEvidence(candidate),
    executionIndex: executionIndex(candidate.pass),
  });
  const consumer = (labelPattern, bindingPattern, role) => {
    const candidates = passes.flatMap((pass) =>
      labelPattern.test(String(pass.label))
        ? candidatesIn(
            pass,
            (command) => bindingsNamed(command, bindingPattern).length > 0,
          )
        : [],
    );
    return requireOne(candidates, role);
  };
  const final = consumer(
    contract.finalLabel,
    contract.finalBinding,
    "final-consumer",
  );
  if (final.status === "unavailable") return final;
  const bloom = consumer(
    contract.bloomLabel,
    contract.bloomBinding,
    "bloom-consumer",
  );
  if (bloom.status === "unavailable") return bloom;
  if (executionIndex(bloom.pass) >= executionIndex(final.pass)) {
    return fail(
      "consumer-order-mismatch",
      "Antiky bloom and final consumers are not submitted in proof order",
      {
        bloomExecutionIndex: executionIndex(bloom.pass),
        finalExecutionIndex: executionIndex(final.pass),
      },
    );
  }
  const selectConsumerBindings = (candidate, bindingPattern) => ({
    reflection: bindingsNamed(candidate.command, bindingPattern),
    samplers: (candidate.command.resourceBindings ?? []).filter(
      ({ resource }) => resource?.kind === "sampler",
    ),
  });
  const finalBindings = selectConsumerBindings(final, contract.finalBinding);
  const bloomBindings = selectConsumerBindings(bloom, contract.bloomBinding);
  for (const [role, selected] of [
    ["final", finalBindings],
    ["bloom", bloomBindings],
  ]) {
    if (selected.reflection.length !== 1 || selected.samplers.length !== 1) {
      return fail(
        "consumer-binding-ambiguity",
        "An Antiky consumer binding is ambiguous",
        {
          reflectionCount: selected.reflection.length,
          role,
          samplerCount: selected.samplers.length,
        },
      );
    }
  }
  const reflection = finalBindings.reflection[0].resource;
  const bloomReflection = bloomBindings.reflection[0].resource;
  const sampler = finalBindings.samplers[0].resource;
  if (
    bloomReflection.textureId !== reflection.textureId ||
    bloomBindings.samplers[0].resource.samplerId !== sampler.samplerId
  ) {
    return fail(
      "consumer-disagreement",
      "Antiky final and bloom consumers disagree",
      {
        bloomReflectionTextureId: bloomReflection.textureId,
        finalReflectionTextureId: reflection.textureId,
      },
    );
  }
  if (
    reflection.format !== "rgba16float" ||
    !validSize(reflection) ||
    !writesAreTraceable(reflection) ||
    !exactTextureView(reflection, { baseMipLevel: 0, mipLevelCount: 1 }) ||
    !exactTextureView(bloomReflection, {
      baseMipLevel: 0,
      mipLevelCount: 1,
    })
  ) {
    return fail(
      "resource-contract-mismatch",
      "Antiky reflection resource violates the expected contract",
      { reflection },
    );
  }
  const explicitLodZero = (candidate, selected) => {
    const code = shaderEvidence(candidate).code.replace(/\s+/g, "");
    const textureName = escapePattern(bindingName(selected.reflection[0]));
    const samplerName = escapePattern(bindingName(selected.samplers[0]));
    return new RegExp(
      `textureSampleLevel\\(${textureName},${samplerName},[^,]+,0(?:\\.0)?f?\\)`,
    ).test(code);
  };
  if (
    !explicitLodZero(final, finalBindings) ||
    !explicitLodZero(bloom, bloomBindings)
  ) {
    return fail(
      "selection-formula-mismatch",
      "An Antiky consumer does not explicitly select LOD zero",
      {
        bloom: consumerEvidence(bloom),
        final: consumerEvidence(final),
      },
    );
  }
  const latestWriteBefore = (consumerPass) =>
    submittedPasses
      .filter(
        (pass) =>
          executionIndex(pass) < executionIndex(consumerPass) &&
          attachments(pass).some(
            ({ storeOp, textureId }) =>
              storeOp === "store" && textureId === reflection.textureId,
          ),
      )
      .sort(
        (first, second) => executionIndex(second) - executionIndex(first),
      )[0] ?? null;
  const finalWriter = latestWriteBefore(final.pass);
  const bloomWriter = latestWriteBefore(bloom.pass);
  if (finalWriter === null || bloomWriter === null) {
    return fail(
      "reflection-writer-unavailable",
      "Antiky reflection writer is unavailable",
    );
  }
  if (finalWriter.sequence !== bloomWriter.sequence) {
    return fail(
      "consumer-writer-disagreement",
      "Antiky consumers observe different latest writers",
      {
        bloomWriter: bloomWriter.sequence,
        finalWriter: finalWriter.sequence,
      },
    );
  }
  const attachmentTargets = (attachment, textureId) =>
    attachment?.textureId === textureId ||
    attachment?.resolveTextureId === textureId;
  const laterSelectedWrites = submittedPasses.filter(
    (pass) =>
      executionIndex(pass) > executionIndex(finalWriter) &&
      attachments(pass).some((attachment) =>
        attachmentTargets(attachment, reflection.textureId),
      ),
  );
  if (laterSelectedWrites.length > 0) {
    return fail(
      "selected-reflection-overwritten",
      "The selected Antiky reflection changed before the live probe",
      {
        passSequences: laterSelectedWrites.map(({ sequence }) => sequence),
        writerPassSequence: finalWriter.sequence,
      },
    );
  }
  const writerAttachments = attachments(finalWriter).filter(
    ({ textureId }) => textureId === reflection.textureId,
  );
  const writerView = viewById.get(writerAttachments[0]?.viewId);
  if (
    writerAttachments.length !== 1 ||
    !exactTextureView(
      {
        ...reflection,
        viewDescriptor: writerView?.descriptor,
        viewId: writerAttachments[0]?.viewId,
      },
      { baseMipLevel: 0, mipLevelCount: 1 },
    )
  ) {
    return fail(
      "reflection-writer-subresource-mismatch",
      "The selected Antiky reflection writer targets the wrong subresource",
      { passSequence: finalWriter.sequence },
    );
  }
  if (!isWesl && /vertical reflection reconstruction/i.test(String(finalWriter.label))) {
    return {
      implementation: "typegpu-antiky",
      issues: [],
      provenance: {
        consumers: {
          bloomExtraction: consumerEvidence(bloom),
          finalPresentation: consumerEvidence(final),
        },
        formula: {
          expression: "textureSampleLevel(reflection, sampler, uv, 0.0)",
          kind: "constant-lod",
          lod: 0,
          maxMipLevel: 0,
        },
        latestWriter: {
          executionIndex: executionIndex(finalWriter),
          label: finalWriter.label,
          passSequence: finalWriter.sequence,
          submissionSequence: finalWriter.submissionSequence ?? null,
          textureId: reflection.textureId,
          viewIds: attachments(finalWriter)
            .filter(({ textureId }) => textureId === reflection.textureId)
            .map(({ viewId }) => viewId),
        },
        selectionFormula: "explicit LOD 0.0",
        targetSlug,
        traceFrameIndex,
      },
      reflection,
      roughness: null,
      sampler,
      status: "ready",
    };
  }
  if (!/roughness-selected reflection/i.test(String(finalWriter.label))) {
    return fail(
      "latest-writer-not-vertical",
      "The latest Antiky reflection writer is not vertical reconstruction",
      {
        label: finalWriter.label ?? "",
        passSequence: finalWriter.sequence,
      },
    );
  }

  const selector = requireOne(
    candidatesIn(
      finalWriter,
      (command) =>
        bindingsNamed(command, contract.pyramidBinding).length > 0 &&
        bindingsNamed(command, contract.surfaceBinding).length > 0,
    ),
    "reflection-selector",
  );
  if (selector.status === "unavailable") return selector;
  const selectorReflection = bindingsNamed(selector.command, contract.pyramidBinding);
  const selectorSurface = bindingsNamed(selector.command, contract.surfaceBinding);
  const selectorSamplers = (selector.command.resourceBindings ?? []).filter(
    ({ resource }) => resource?.kind === "sampler",
  );
  if (
    selectorReflection.length !== 1 ||
    selectorSurface.length !== 1 ||
    selectorSamplers.length !== 1
  ) {
    return fail(
      "selector-binding-ambiguity",
      "The Antiky roughness selector binding is ambiguous",
      {
        reflectionCount: selectorReflection.length,
        samplerCount: selectorSamplers.length,
        surfaceCount: selectorSurface.length,
      },
    );
  }
  const pyramid = selectorReflection[0].resource;
  const surface = selectorSurface[0].resource;
  const selectorSampler = selectorSamplers[0].resource;
  if (
    pyramid.format !== "rgba16float" ||
    pyramid.mipLevelCount !== 5 ||
    !validSize(pyramid) ||
    !writesAreTraceable(pyramid) ||
    !exactTextureView(pyramid, { baseMipLevel: 0, mipLevelCount: 5 }) ||
    surface.format !== "rgba16float" ||
    !validSize(surface) ||
    !writesAreTraceable(surface) ||
    !exactTextureView(surface, { baseMipLevel: 0, mipLevelCount: 1 })
  ) {
    return fail(
      "selector-resource-contract-mismatch",
      "The Antiky roughness selector resources violate the expected contract",
      { pyramid, surface },
    );
  }
  const selectorSettings = selectorSampler.settings ?? {};
  const selectorSamplerValid =
    ["addressModeU", "addressModeV", "addressModeW"].every(
      (name) =>
        (selectorSettings[name] ?? "clamp-to-edge") === "clamp-to-edge",
    ) &&
    selectorSettings.magFilter === "linear" &&
    selectorSettings.minFilter === "linear" &&
    selectorSettings.mipmapFilter === "linear";
  if (!selectorSamplerValid) {
    return fail(
      "invalid-reflection-sampler",
      "The Antiky roughness selector does not use a trilinear clamp sampler",
      { settings: selectorSettings },
    );
  }
  const selectorCode = shaderEvidence(selector).code.replace(/\s+/g, "");
  const pyramidName = escapePattern(bindingName(selectorReflection[0]));
  const surfaceName = escapePattern(bindingName(selectorSurface[0]));
  const samplerName = escapePattern(bindingName(selectorSamplers[0]));
  const roughnessMatch = new RegExp(
    `let([A-Za-z_]\\w*)=(?:clamp\\()?textureLoad\\(${surfaceName},[^;]+,0\\)\\.w`,
  ).exec(selectorCode);
  const roughnessName =
    roughnessMatch === null ? null : escapePattern(roughnessMatch[1]);
  const lodMatch =
    roughnessName === null
      ? null
      : new RegExp(
          `let([A-Za-z_]\\w*)=clamp\\(\\(\\(${roughnessName}\\*${roughnessName}\\)\\*4f?\\),0f?,4f?\\);`,
        ).exec(selectorCode);
  const lodName = lodMatch === null ? null : escapePattern(lodMatch[1]);
  const weslLodMatch =
    roughnessName === null
      ? null
      : new RegExp(
          `let([A-Za-z_]\\w*)=${roughnessName}\\*${roughnessName}\\*4(?:\\.0)?f?;`,
        ).exec(selectorCode);
  const selectedLodName = escapePattern(
    lodMatch?.[1] ?? weslLodMatch?.[1] ?? "",
  );
  const selectorFormulaValid =
    selectedLodName.length > 0 &&
    new RegExp(
      `textureSampleLevel\\(${pyramidName},${samplerName},[^,]+,${selectedLodName},?\\)`,
    ).test(selectorCode);
  if (
    !selectorFormulaValid ||
    shaderEvidence(selector).hash !== contract.selectorHash ||
    finalWriter.commands?.length !== 1 ||
    !exactFullscreenDraw(selector)
  ) {
    return fail(
      "selection-formula-mismatch",
      "The Antiky selector does not use surface.w roughness squared times four",
      {
        lodVariable: selectedLodName || null,
        pyramidBinding: bindingName(selectorReflection[0]),
        roughnessVariable: roughnessMatch?.[1] ?? null,
        samplerBinding: bindingName(selectorSamplers[0]),
        selectorFormulaValid,
        selectorHash: shaderEvidence(selector).hash,
        selectorHashExpected: contract.selectorHash,
        selectorDrawValid: exactFullscreenDraw(selector),
        selectorCommandCount: finalWriter.commands?.length ?? null,
        selector: consumerEvidence(selector),
        surfaceBinding: bindingName(selectorSurface[0]),
      },
    );
  }

  const reconstruction = validateReconstruction({
    attachments,
    bindingsNamed,
    bufferById,
    exactFullscreenDraw,
    exactTextureView,
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
  });
  if (reconstruction.status === "unavailable") return reconstruction;

  return {
    implementation: contract.implementation,
    issues: [],
    provenance: {
      consumers: {
        bloomExtraction: consumerEvidence(bloom),
        finalPresentation: consumerEvidence(final),
        roughnessSelection: consumerEvidence(selector),
      },
      formula: {
        channel: "w",
        expression: "clamp(roughness.w * roughness.w * 4.0, 0.0, 4.0)",
        kind: "roughness-squared",
        maxMipLevel: 4,
        minMipLevel: 0,
        multiplier: 4,
      },
      latestWriter: {
        executionIndex: executionIndex(finalWriter),
        label: finalWriter.label,
        passSequence: finalWriter.sequence,
        submissionSequence: finalWriter.submissionSequence ?? null,
        textureId: reflection.textureId,
        viewIds: attachments(finalWriter)
          .filter(({ textureId }) => textureId === reflection.textureId)
          .map(({ viewId }) => viewId),
      },
      lodMeaning: "upstream-selection",
      mipWrites: reconstruction.mipWrites,
      probeSampleLod: 0,
      selectionSource: {
        channel: "w",
        format: pyramid.format,
        label: pyramid.label,
        mipLevelCount: pyramid.mipLevelCount,
        rawTextureId: reconstruction.rawTextureId,
        samplerId: selectorSampler.samplerId,
        surfaceTextureId: surface.textureId,
        surfaceViewId: surface.viewId,
        textureId: pyramid.textureId,
        viewId: pyramid.viewId,
      },
      selectionFormula: "clamp(surface.w * surface.w * 4.0, 0.0, 4.0)",
      targetSlug,
      traceFrameIndex,
    },
    reflection,
    roughness: surface,
    sampleLod: "zero",
    sampler,
    status: "ready",
  };
}

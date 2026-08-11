export function summarizeSelectedReflectionSamples(samples, summarize) {
  const summarizeSet = (selected) => ({
    channels: Array.from({ length: 4 }, (_, channel) =>
      summarize(selected.map((sample) => sample.channels[channel]))),
    lod: summarize(selected.map((sample) => sample.lod)),
    luminance: summarize(selected.map((sample) => sample.luminance)),
    roughness: selected.every((sample) => sample.roughness === null)
      ? null
      : summarize(selected.map((sample) => sample.roughness)),
    sampleCount: selected.length,
  });
  return {
    ...summarizeSet(samples),
    regions: Object.fromEntries(
      [...new Set(samples.map(({ region }) => region))].map((region) => [
        region,
        summarizeSet(samples.filter((sample) => sample.region === region)),
      ]),
    ),
  };
}

export async function probeSelectedReflection(trace, frame, context) {
  const strideBytes = Number(context.sampleStrideBytes ?? 32);
  const sampling = {
    coordinateSpace: "normalized-texture",
    pixelRule: "floor-point-then-pixel-center",
    planSampleCount: context.plan.length,
    recordStrideBytes: strideBytes,
    sampleCount: 0,
  };
  const unavailable = (issues, provenance = {}) => ({
    capturedFrameIndex: frame,
    issues,
    kind: "selected-reflection",
    lod: null,
    luminance: null,
    provenance: {
      measurementPhase: "post-trace-paused",
      targetSlug: context.targetSlug ?? null,
      ...provenance,
    },
    regions: {},
    roughness: null,
    samples: [],
    sampling,
    status: "unavailable",
  });
  let resolution;
  try {
    resolution = context.resolve(trace, frame, context.records, context.targetSlug);
  } catch (error) {
    return unavailable([{
      code: "reflection-resolution-failed",
      evidence: { error: String(error) },
      message: error?.message ?? String(error),
    }]);
  }
  if (resolution.status !== "ready") {
    return unavailable(resolution.issues, resolution.provenance);
  }
  const reflectionView = context.textureViews.get(resolution.reflection.viewId);
  const sampler = context.samplers.get(resolution.sampler.samplerId);
  const roughnessView = resolution.roughness === null
    ? null
    : context.textureViews.get(resolution.roughness.viewId);
  const device = context.devicesByTextureId.get(resolution.reflection.textureId);
  const missing = [
    ["device", device],
    ["reflectionView", reflectionView],
    ["sampler", sampler],
    ...(resolution.roughness === null ? [] : [["roughnessView", roughnessView]]),
  ].filter(([, value]) => value === undefined || value === null);
  if (missing.length > 0) {
    return unavailable(
      [{
        code: "live-resource-unavailable",
        evidence: { resources: missing.map(([name]) => name) },
        message: "A traced selected-reflection GPU object is no longer available",
      }],
      resolution.provenance,
    );
  }

  let points;
  try {
    points = context.createPlan(context.plan, resolution.reflection.size);
  } catch (error) {
    return unavailable([{
      code: "sample-plan-failed",
      evidence: { error: String(error) },
      message: error?.message ?? String(error),
    }], resolution.provenance);
  }
  const pointData = new Uint32Array(points.length * 2);
  for (const [index, point] of points.entries()) {
    pointData[index * 2] = point.pixelX;
    pointData[index * 2 + 1] = point.pixelY;
  }
  const hasRoughness = resolution.roughness !== null;
  const roughnessChannel = resolution.provenance?.formula?.channel ?? "g";
  if (hasRoughness && roughnessChannel !== "g" && roughnessChannel !== "w") {
    return unavailable([{
      code: "unsupported-roughness-channel",
      evidence: { channel: roughnessChannel },
      message: "The selected-reflection probe does not support this roughness channel",
    }], resolution.provenance);
  }
  const roughnessDeclarations = hasRoughness
    ? "@group(0) @binding(2) var roughnessTexture: texture_2d<f32>;"
    : "";
  const bufferGroupOffset = hasRoughness ? 3 : 2;
  const selection = hasRoughness
    ? `let roughness = textureLoad(roughnessTexture, vec2i(pixel), 0).${roughnessChannel};
       let lod = clamp(roughness * roughness * 4.0, 0.0, 4.0);`
    : "let roughness = 0.0; let lod = 0.0;";
  const sampledLod = resolution.sampleLod === "zero" ? "0.0" : "lod";
  const code = `
    struct Point { pixel: vec2u, }
    struct Result {
      channels: vec4f,
      roughness: f32,
      lod: f32,
      padding: vec2f,
    }
    @group(0) @binding(0) var reflectionTexture: texture_2d<f32>;
    @group(0) @binding(1) var reflectionSampler: sampler;
    ${roughnessDeclarations}
    @group(0) @binding(${bufferGroupOffset}) var<storage, read> points: array<Point>;
    @group(0) @binding(${bufferGroupOffset + 1}) var<storage, read_write> results: array<Result>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) invocation: vec3u) {
      let index = invocation.x;
      if (index >= ${points.length}u) { return; }
      let dimensions = textureDimensions(reflectionTexture);
      let pixel = min(points[index].pixel, dimensions - vec2u(1));
      let uv = (vec2f(pixel) + vec2f(0.5)) / vec2f(dimensions);
      ${selection}
      results[index].channels = textureSampleLevel(reflectionTexture, reflectionSampler, uv, ${sampledLod});
      results[index].roughness = roughness;
      results[index].lod = lod;
      results[index].padding = vec2f(0.0);
    }`;
  const buffers = [];
  let validationScopeOpen = false;
  const popValidationError = async () => {
    if (!validationScopeOpen) return null;
    validationScopeOpen = false;
    return device.popErrorScope();
  };
  const validationIssue = (error, operationError = null) => ({
    code: "gpu-validation-error",
    evidence: {
      message: error.message ?? String(error),
      operationError: operationError === null ? null : String(operationError),
    },
    message: error.message ?? "The selected-reflection compute probe failed validation",
  });
  try {
    device.pushErrorScope("validation");
    validationScopeOpen = true;
    const createBuffer = (descriptor) => {
      const buffer = device.createBuffer(descriptor);
      buffers.push(buffer);
      return buffer;
    };
    const pointBuffer = createBuffer({
      label: "WebGPU observer selected-reflection points",
      size: pointData.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    const outputBuffer = createBuffer({
      label: "WebGPU observer selected-reflection output",
      size: points.length * strideBytes,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
    });
    const readback = createBuffer({
      label: "WebGPU observer selected-reflection readback",
      size: points.length * strideBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    device.queue.writeBuffer(pointBuffer, 0, pointData);
    const module = device.createShaderModule({
      code,
      label: "WebGPU observer selected-reflection compute shader",
    });
    const pipeline = device.createComputePipeline({
      compute: { entryPoint: "main", module },
      label: "WebGPU observer selected-reflection compute pipeline",
      layout: "auto",
    });
    const entries = [
      { binding: 0, resource: reflectionView },
      { binding: 1, resource: sampler },
      ...(hasRoughness ? [{ binding: 2, resource: roughnessView }] : []),
      { binding: bufferGroupOffset, resource: { buffer: pointBuffer } },
      { binding: bufferGroupOffset + 1, resource: { buffer: outputBuffer } },
    ];
    const bindGroup = device.createBindGroup({
      entries,
      label: "WebGPU observer selected-reflection compute group",
      layout: pipeline.getBindGroupLayout(0),
    });
    const encoder = device.createCommandEncoder({
      label: "WebGPU observer selected-reflection probe",
    });
    const pass = encoder.beginComputePass({
      label: "WebGPU observer selected-reflection probe pass",
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(points.length / 64));
    pass.end();
    encoder.copyBufferToBuffer(
      outputBuffer,
      0,
      readback,
      0,
      points.length * strideBytes,
    );
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(readback.getMappedRange()).slice();
    const samples = context.decode(bytes, points, hasRoughness);
    const summaries = context.summarizeSamples(samples, context.summarize);
    readback.unmap();
    const validationError = await popValidationError();
    if (validationError !== null) {
      return unavailable([validationIssue(validationError)], resolution.provenance);
    }
    return {
      capturedFrameIndex: frame,
      issues: [],
      kind: "selected-reflection",
      ...summaries,
      provenance: {
        ...resolution.provenance,
        measurementPhase: "post-trace-paused",
        resources: {
          reflection: {
            format: resolution.reflection.format,
            label: resolution.reflection.label,
            textureId: resolution.reflection.textureId,
            viewId: resolution.reflection.viewId,
          },
          roughness: resolution.roughness === null
            ? null
            : {
                channel: roughnessChannel,
                format: resolution.roughness.format,
                label: resolution.roughness.label,
                textureId: resolution.roughness.textureId,
                viewId: resolution.roughness.viewId,
              },
          sampler: {
            samplerId: resolution.sampler.samplerId,
            settings: resolution.sampler.settings,
          },
          source: "exact-traced-final-consumer-objects",
        },
      },
      samples,
      sampling: { ...sampling, sampleCount: samples.length },
      status: "ready",
    };
  } catch (error) {
    let validationError = null;
    try {
      validationError = await popValidationError();
    } catch {
      // Preserve the original operation failure when the device is already lost.
    }
    if (validationError !== null) {
      return unavailable(
        [validationIssue(validationError, error)],
        resolution.provenance,
      );
    }
    return unavailable(
      [{
        code: error?.code ?? "gpu-probe-failed",
        evidence: error?.evidence ?? { error: String(error) },
        message: error?.message ?? String(error),
      }],
      resolution.provenance,
    );
  } finally {
    if (validationScopeOpen) {
      try {
        await popValidationError();
      } catch {
        // Best-effort scope cleanup after device loss.
      }
    }
    for (const buffer of buffers) {
      try {
        buffer.destroy();
      } catch {
        // Best-effort cleanup after device loss.
      }
    }
  }
}

export interface BroMetalReflectionMip {
  readonly height: number;
  readonly level: number;
  readonly spread: number;
  readonly width: number;
}

export const BROMETAL_REFLECTION_HIT_TRANSFER = {
  intensity: 0.7,
  luminanceWeights: [0.2126, 0.7152, 0.0722] as const,
  maxDistance: 100,
  maxLuminance: 10,
} as const;

export const BROMETAL_REFLECTION_MARCH = {
  initialTravel: 0.16,
  stepBase: 0.1,
  stepCount: 24,
  stepGrowth: 0.024,
  thicknessBase: 0.11,
  thicknessGrowth: 0.028,
} as const;

interface BroMetalReflectionHitTransferInput {
  readonly hitColor: readonly [number, number, number];
  readonly incidentDotReflected: number;
  readonly metallic: number;
  readonly planeDistance: number;
}

export function applyBroMetalReflectionHitTransfer({
  hitColor,
  incidentDotReflected,
  metallic,
  planeDistance,
}: BroMetalReflectionHitTransferInput): readonly [number, number, number] {
  const distanceRatio =
    1 - planeDistance / BROMETAL_REFLECTION_HIT_TRANSFER.maxDistance;
  const attenuation = distanceRatio * distanceRatio;
  const grazing = (incidentDotReflected + 1) / 2;
  const weight = metallic * attenuation * grazing;
  const weighted = hitColor.map((channel) => channel * weight) as [
    number,
    number,
    number,
  ];
  const luminance = weighted.reduce(
    (sum, channel, index) =>
      sum + channel * BROMETAL_REFLECTION_HIT_TRANSFER.luminanceWeights[index]!,
    0,
  );
  const scale = Math.min(
    BROMETAL_REFLECTION_HIT_TRANSFER.maxLuminance /
      Math.max(luminance, 0.0001),
    1,
  ) * BROMETAL_REFLECTION_HIT_TRANSFER.intensity;
  return [weighted[0] * scale, weighted[1] * scale, weighted[2] * scale];
}

export interface BroMetalReflectionPlan {
  readonly mips: readonly BroMetalReflectionMip[];
  readonly passCount: number;
  readonly textureBytes: number;
}

export function createBroMetalReflectionPlan(
  width: number,
  height: number,
): BroMetalReflectionPlan {
  if (!Number.isSafeInteger(width) || width < 1 ||
      !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError("BroMetal reflection dimensions must be positive integers");
  }
  const mips = Array.from({ length: 5 }, (_, level) => ({
    height: Math.max(1, Math.floor(height / 2 ** level)),
    level,
    spread: level,
    width: Math.max(1, Math.floor(width / 2 ** level)),
  }));
  const baseBytes = width * height * 8;
  const pyramidBytes = mips.reduce(
    (total, mip) => total + mip.width * mip.height * 8,
    0,
  );
  return {
    mips,
    passCount: 7,
    textureBytes: baseBytes * 2 + pyramidBytes,
  };
}

interface ReflectionModules {
  readonly reconstruct: GPUShaderModule;
  readonly select: GPUShaderModule;
  readonly trace: GPUShaderModule;
}

export interface BroMetalReflectionResources {
  readonly estimatedBytes: number;
  readonly mipPasses: readonly {
    readonly bindGroup: GPUBindGroup;
    readonly level: number;
    readonly view: GPUTextureView;
  }[];
  readonly rawBindGroup: GPUBindGroup;
  readonly rawPipeline: GPURenderPipeline;
  readonly rawTarget: GPUTexture;
  readonly reconstructPipeline: GPURenderPipeline;
  readonly selectBindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly selectPipeline: GPURenderPipeline;
  readonly target: GPUTexture;
}

interface ReflectionInputs {
  readonly depth: GPUTexture;
  readonly frameBuffer: GPUBuffer;
  readonly hdr: GPUTexture;
  readonly height: number;
  readonly normalRoughness: GPUTexture;
  readonly resolvedHdr: readonly [GPUTexture, GPUTexture];
  readonly width: number;
  readonly worldMetal: GPUTexture;
}

export async function createBroMetalReflectionResources(
  device: GPUDevice,
  modules: ReflectionModules,
  inputs: ReflectionInputs,
): Promise<BroMetalReflectionResources> {
  const plan = createBroMetalReflectionPlan(inputs.width, inputs.height);
  const renderUsage = GPUTextureUsage.RENDER_ATTACHMENT |
    GPUTextureUsage.TEXTURE_BINDING;
  const rawTarget = device.createTexture({
    label: "BroMetal raw reflection trace",
    size: [inputs.width, inputs.height],
    format: "rgba16float",
    usage: renderUsage,
  });
  const pyramid = device.createTexture({
    label: "BroMetal roughness reflection pyramid",
    size: [inputs.width, inputs.height],
    format: "rgba16float",
    mipLevelCount: 5,
    usage: renderUsage,
  });
  const target = device.createTexture({
    label: "BroMetal reflected HDR target",
    size: [inputs.width, inputs.height],
    format: "rgba16float",
    usage: renderUsage,
  });
  const sampler = device.createSampler({
    label: "BroMetal trilinear reflection sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  });

  const rawLayout = device.createBindGroupLayout({
    label: "BroMetal raw reflection layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 160 } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
    ],
  });
  const rawPipeline = await device.createRenderPipelineAsync({
    label: "BroMetal AOT raw screen-space reflection pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [rawLayout] }),
    vertex: { module: modules.trace, entryPoint: "reflectionVertex" },
    fragment: {
      module: modules.trace,
      entryPoint: "reflectionFragment",
      targets: [{ format: "rgba16float" }],
    },
    primitive: { topology: "triangle-list" },
  });
  const rawBindGroup = device.createBindGroup({
    label: "BroMetal raw reflection bind group",
    layout: rawLayout,
    entries: [
      { binding: 0, resource: inputs.hdr.createView() },
      { binding: 1, resource: inputs.normalRoughness.createView() },
      { binding: 2, resource: inputs.worldMetal.createView() },
      { binding: 3, resource: inputs.depth.createView() },
      { binding: 4, resource: { buffer: inputs.frameBuffer } },
      { binding: 5, resource: sampler },
    ],
  });

  const reconstructLayout = device.createBindGroupLayout({
    label: "BroMetal reflection reconstruction layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
    ],
  });
  const reconstructPipeline = await device.createRenderPipelineAsync({
    label: "BroMetal AOT reflection pyramid pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [reconstructLayout] }),
    vertex: { module: modules.reconstruct, entryPoint: "reconstructVertex" },
    fragment: {
      module: modules.reconstruct,
      entryPoint: "reconstructFragment",
      targets: [{ format: "rgba16float" }],
    },
    primitive: { topology: "triangle-list" },
  });
  const mipPasses = plan.mips.map((mip) => {
    const settings = device.createBuffer({
      label: `BroMetal reflection mip ${mip.level} settings`,
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(
      settings,
      0,
      new Float32Array([1 / inputs.width, 1 / inputs.height, mip.spread, 0]),
    );
    return {
      bindGroup: device.createBindGroup({
        label: `BroMetal reflection mip ${mip.level} bind group`,
        layout: reconstructLayout,
        entries: [
          { binding: 0, resource: rawTarget.createView() },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: settings } },
        ],
      }),
      level: mip.level,
      view: pyramid.createView({
        baseMipLevel: mip.level,
        mipLevelCount: 1,
      }),
    };
  });

  const selectLayout = device.createBindGroupLayout({
    label: "BroMetal reflection selection layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
    ],
  });
  const selectPipeline = await device.createRenderPipelineAsync({
    label: "BroMetal AOT roughness reflection selection pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [selectLayout] }),
    vertex: { module: modules.select, entryPoint: "selectVertex" },
    fragment: {
      module: modules.select,
      entryPoint: "selectFragment",
      targets: [{ format: "rgba16float" }],
    },
    primitive: { topology: "triangle-list" },
  });
  const selectBindGroups = inputs.resolvedHdr.map((resolved, index) =>
    device.createBindGroup({
      label: `BroMetal roughness reflection selection ${index} bind group`,
      layout: selectLayout,
      entries: [
        { binding: 0, resource: resolved.createView() },
        { binding: 1, resource: pyramid.createView() },
        { binding: 2, resource: inputs.normalRoughness.createView() },
        { binding: 3, resource: sampler },
      ],
    })) as [GPUBindGroup, GPUBindGroup];

  return {
    estimatedBytes: plan.textureBytes,
    mipPasses,
    rawBindGroup,
    rawPipeline,
    rawTarget,
    reconstructPipeline,
    selectBindGroups,
    selectPipeline,
    target,
  };
}

export function encodeBroMetalReflectionPass(
  encoder: GPUCommandEncoder,
  resources: BroMetalReflectionResources,
  resolvedHistoryIndex: number,
): void {
  const rawPass = encoder.beginRenderPass({
    label: "BroMetal raw screen-space reflection pass",
    colorAttachments: [{
      view: resources.rawTarget.createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: "clear",
      storeOp: "store",
    }],
  });
  rawPass.setPipeline(resources.rawPipeline);
  rawPass.setBindGroup(0, resources.rawBindGroup);
  rawPass.draw(3);
  rawPass.end();

  for (const mip of resources.mipPasses) {
    const pass = encoder.beginRenderPass({
      label: `BroMetal reflection reconstruction mip ${mip.level}`,
      colorAttachments: [{
        view: mip.view,
        clearValue: [0, 0, 0, 1],
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(resources.reconstructPipeline);
    pass.setBindGroup(0, mip.bindGroup);
    pass.draw(3);
    pass.end();
  }

  const selectPass = encoder.beginRenderPass({
    label: "BroMetal roughness-selected reflected scene pass",
    colorAttachments: [{
      view: resources.target.createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: "clear",
      storeOp: "store",
    }],
  });
  selectPass.setPipeline(resources.selectPipeline);
  selectPass.setBindGroup(0, resources.selectBindGroups[resolvedHistoryIndex]);
  selectPass.draw(3);
  selectPass.end();
}

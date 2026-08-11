export async function checkedShaderModule(
  device: GPUDevice,
  label: string,
  code: string,
): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((message) => message.type === "error");
  if (errors.length > 0) {
    throw new Error(
      `${label} failed to compile: ${errors.map((error) => error.message).join("; ")}`,
    );
  }
  return module;
}

export function createMaterialLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label: "BroMetal material layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform", minBindingSize: 32 },
      },
    ],
  });
}

export function geometryPipelineDescriptor(
  device: GPUDevice,
  module: GPUShaderModule,
  frameLayout: GPUBindGroupLayout,
  materialLayout: GPUBindGroupLayout,
  cullMode: GPUCullMode,
): GPURenderPipelineDescriptor {
  return {
    label: `BroMetal deferred geometry ${cullMode}`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [frameLayout, materialLayout],
    }),
    vertex: {
      module,
      entryPoint: "geometryVertex",
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
        { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: "float32x4" }] },
      ],
    },
    fragment: {
      module,
      entryPoint: "geometryFragment",
      targets: [
        { format: "rgba8unorm" },
        { format: "rgba16float" },
        { format: "rgba16float" },
      ],
    },
    primitive: { topology: "triangle-list", frontFace: "ccw", cullMode },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  };
}

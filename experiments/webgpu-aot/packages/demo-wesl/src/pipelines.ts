/// <reference types="wesl-plugin/suffixes" />

import ambientWGSL from "../shaders/ambient.wesl?static";
import bloomWGSL from "../shaders/bloom.wesl?static";
import depthWGSL from "../shaders/depth.wesl?static";
import environmentWGSL from "../shaders/environment.wesl?static";
import forwardWGSL from "../shaders/forward.wesl?static";
import mipmapWGSL from "../shaders/mipmap.wesl?static";
import particlesWGSL from "../shaders/particles.wesl?static";
import postWGSL from "../shaders/post.wesl?static";
import reflectionWGSL from "../shaders/reflection.wesl?static";
import temporalWGSL from "../shaders/temporal.wesl?static";

export interface WeslPipelines {
  readonly ambient: GPURenderPipeline;
  readonly ambientLayout: GPUBindGroupLayout;
  readonly background: GPURenderPipeline;
  readonly bloom: GPURenderPipeline;
  readonly bloomLayout: GPUBindGroupLayout;
  readonly depthFrameLayout: GPUBindGroupLayout;
  readonly depthMaterialLayout: GPUBindGroupLayout;
  readonly environmentLayout: GPUBindGroupLayout;
  readonly forwardBack: GPURenderPipeline;
  readonly forwardDouble: GPURenderPipeline;
  readonly forwardFrameLayout: GPUBindGroupLayout;
  readonly forwardMaterialLayout: GPUBindGroupLayout;
  readonly particle: GPURenderPipeline;
  readonly particleLayout: GPUBindGroupLayout;
  readonly mipmapLayout: GPUBindGroupLayout;
  readonly mipmapLinear: GPURenderPipeline;
  readonly mipmapSrgb: GPURenderPipeline;
  readonly post: GPURenderPipeline;
  readonly postLayout: GPUBindGroupLayout;
  readonly reflection: GPURenderPipeline;
  readonly reflectionLayout: GPUBindGroupLayout;
  readonly reflectionReconstruct: GPURenderPipeline;
  readonly reflectionSelect: GPURenderPipeline;
  readonly reflectionReconstructLayout: GPUBindGroupLayout;
  readonly shadowBack: GPURenderPipeline;
  readonly shadowDouble: GPURenderPipeline;
  readonly temporal: GPURenderPipeline;
  readonly temporalLayout: GPUBindGroupLayout;
}

async function checkedModule(
  device: GPUDevice,
  label: string,
  code: string,
): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((message) => message.type === "error");
  if (errors.length > 0) {
    throw new Error(
      `${label} failed static linking: ${errors.map((error) => error.message).join("; ")}`,
    );
  }
  return module;
}

function createLayouts(device: GPUDevice): Omit<
  WeslPipelines,
  | "ambient"
  | "background"
  | "bloom"
  | "forwardBack"
  | "forwardDouble"
  | "mipmapLinear"
  | "mipmapSrgb"
  | "particle"
  | "post"
  | "reflection"
  | "reflectionReconstruct"
  | "reflectionSelect"
  | "shadowBack"
  | "shadowDouble"
  | "temporal"
> {
  const depthFrameLayout = device.createBindGroupLayout({
    label: "WESL depth frame layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform", minBindingSize: 160 } },
    ],
  });
  const depthMaterialLayout = device.createBindGroupLayout({
    label: "WESL alpha depth material layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 32 } },
    ],
  });
  const forwardFrameLayout = device.createBindGroupLayout({
    label: "WESL forward screen-field layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform", minBindingSize: 160 },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage", minBindingSize: 1024 } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 208 } },
    ],
  });
  const forwardMaterialLayout = device.createBindGroupLayout({
    label: "WESL forward material layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 32 } },
    ],
  });
  const environmentLayout = device.createBindGroupLayout({
    label: "WESL HDR environment lighting layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "cube" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "cube" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "cube" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform", minBindingSize: 96 },
      },
    ],
  });
  const ambientLayout = device.createBindGroupLayout({
    label: "WESL fullscreen ambient-occlusion layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
    ],
  });
  const particleLayout = device.createBindGroupLayout({
    label: "WESL linked particle layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform", minBindingSize: 160 } },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage", minBindingSize: 12_992 },
      },
    ],
  });
  const mipmapLayout = device.createBindGroupLayout({
    label: "WESL material mipmap layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ],
  });
  const bloomLayout = device.createBindGroupLayout({
    label: "WESL linked Gaussian bloom layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ],
  });
  const postLayout = device.createBindGroupLayout({
    label: "WESL linked FXAA composite layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
      { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ],
  });
  const temporalLayout = device.createBindGroupLayout({
    label: "WESL temporal resolve layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
    ],
  });
  const reflectionLayout = device.createBindGroupLayout({
    label: "WESL linked screen-reflection layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 160 } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
    ],
  });
  const reflectionReconstructLayout = device.createBindGroupLayout({
    label: "WESL linked reflection-reconstruction layout",
    entries: [
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
    ],
  });
  return {
    ambientLayout,
    bloomLayout,
    depthFrameLayout,
    depthMaterialLayout,
    environmentLayout,
    forwardFrameLayout,
    forwardMaterialLayout,
    particleLayout,
    mipmapLayout,
    postLayout,
    temporalLayout,
    reflectionLayout,
    reflectionReconstructLayout,
  };
}

export async function createWeslPipelines(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat,
): Promise<WeslPipelines> {
  const layouts = createLayouts(device);
  const [
    depth,
    environmentModule,
    ambientModule,
    forward,
    particleModule,
    bloomModule,
    postModule,
    reflectionModule,
    temporalModule,
    mipmapModule,
  ] = await Promise.all([
    checkedModule(device, "WESL linked alpha-depth module", depthWGSL),
    checkedModule(device, "WESL linked HDR environment module", environmentWGSL),
    checkedModule(device, "WESL linked ambient-occlusion module", ambientWGSL),
    checkedModule(device, "WESL linked PBR module", forwardWGSL),
    checkedModule(device, "WESL linked particle module", particlesWGSL),
    checkedModule(device, "WESL linked Gaussian bloom module", bloomWGSL),
    checkedModule(device, "WESL linked FXAA composite module", postWGSL),
    checkedModule(device, "WESL linked screen-reflection module", reflectionWGSL),
    checkedModule(device, "WESL linked temporal module", temporalWGSL),
    checkedModule(device, "WESL material mipmap module", mipmapWGSL),
  ]);
  const depthDescriptor = (
    cullMode: GPUCullMode,
    shadow = false,
  ): GPURenderPipelineDescriptor => ({
    label: `WESL ${shadow ? "directional shadow" : "alpha-depth"} ${cullMode}`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [layouts.depthFrameLayout, layouts.depthMaterialLayout],
    }),
    vertex: {
      module: depth,
      entryPoint: "depthVertex",
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
        { arrayStride: 8, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x2" }] },
      ],
    },
    fragment: { module: depth, entryPoint: "depthFragment", targets: [] },
    primitive: { topology: "triangle-list", cullMode, frontFace: "ccw" },
    depthStencil: {
      format: shadow ? "depth32float" : "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });
  const forwardDescriptor = (cullMode: GPUCullMode): GPURenderPipelineDescriptor => ({
    label: `WESL controlled forward ${cullMode}`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        layouts.forwardFrameLayout,
        layouts.forwardMaterialLayout,
        layouts.environmentLayout,
      ],
    }),
    vertex: {
      module: forward,
      entryPoint: "forwardVertex",
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
        { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
        { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: "float32x4" }] },
      ],
    },
    fragment: {
      module: forward,
      entryPoint: "forwardFragment",
      targets: [
        { format: "rgba16float" },
        { format: "rgba16float" },
        { format: "rgba16float" },
      ],
    },
    primitive: { topology: "triangle-list", cullMode, frontFace: "ccw" },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });
  const [
    shadowBack,
    shadowDouble,
    background,
    forwardBack,
    forwardDouble,
    ambient,
    particle,
    bloom,
    post,
    reflection,
    reflectionReconstruct,
    reflectionSelect,
    temporal,
    mipmapLinear,
    mipmapSrgb,
  ] =
    await Promise.all([
      device.createRenderPipelineAsync(depthDescriptor("back", true)),
      device.createRenderPipelineAsync(depthDescriptor("none", true)),
      device.createRenderPipelineAsync({
        label: "WESL HDR environment background",
        layout: device.createPipelineLayout({
          bindGroupLayouts: [layouts.environmentLayout],
        }),
        vertex: {
          module: environmentModule,
          entryPoint: "environmentVertex",
        },
        fragment: {
          module: environmentModule,
          entryPoint: "environmentFragment",
          targets: [
            { format: "rgba16float" },
            { format: "rgba16float" },
            { format: "rgba16float" },
          ],
        },
        primitive: { topology: "triangle-list" },
        depthStencil: {
          format: "depth24plus",
          depthWriteEnabled: false,
          depthCompare: "always",
        },
      }),
      device.createRenderPipelineAsync(forwardDescriptor("back")),
      device.createRenderPipelineAsync(forwardDescriptor("none")),
      device.createRenderPipelineAsync({
        label: "WESL fullscreen ambient occlusion",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.ambientLayout] }),
        vertex: { module: ambientModule, entryPoint: "ambientVertex" },
        fragment: {
          module: ambientModule,
          entryPoint: "ambientFragment",
          targets: [{ format: "r8unorm" }],
        },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        label: "WESL linked additive particle pipeline",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.particleLayout] }),
        vertex: { module: particleModule, entryPoint: "particleVertex" },
        fragment: {
          module: particleModule,
          entryPoint: "particleFragment",
          targets: [
            {
              format: "rgba16float",
              blend: {
                color: { srcFactor: "one", dstFactor: "one" },
                alpha: { srcFactor: "zero", dstFactor: "one" },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
        depthStencil: {
          format: "depth24plus",
          depthWriteEnabled: false,
          depthCompare: "less-equal",
        },
      }),
      device.createRenderPipelineAsync({
        label: "WESL linked thirteen-tap Gaussian bloom",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.bloomLayout] }),
        vertex: { module: bloomModule, entryPoint: "bloomVertex" },
        fragment: {
          module: bloomModule,
          entryPoint: "bloomFragment",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        label: "WESL FXAA Gaussian-bloom composite",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.postLayout] }),
        vertex: { module: postModule, entryPoint: "postVertex" },
        fragment: {
          module: postModule,
          entryPoint: "postFragment",
          targets: [{ format: canvasFormat }],
        },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        label: "WESL linked screen-space reflection trace",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.reflectionLayout] }),
        vertex: { module: reflectionModule, entryPoint: "reflectionVertex" },
        fragment: {
          module: reflectionModule,
          entryPoint: "reflectionFragment",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        label: "WESL linked reflection reconstruction",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.reflectionReconstructLayout] }),
        vertex: { module: reflectionModule, entryPoint: "reflectionVertex" },
        fragment: {
          module: reflectionModule,
          entryPoint: "reflectionReconstructFragment",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        label: "WESL linked roughness-selected reflection",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.reflectionReconstructLayout] }),
        vertex: { module: reflectionModule, entryPoint: "reflectionVertex" },
        fragment: {
          module: reflectionModule,
          entryPoint: "reflectionSelectFragment",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list" },
      }),
      device.createRenderPipelineAsync({
        label: "WESL linked temporal resolve",
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.temporalLayout] }),
        vertex: { module: temporalModule, entryPoint: "temporalVertex" },
        fragment: {
          module: temporalModule,
          entryPoint: "temporalFragment",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list" },
      }),
      ...(["rgba8unorm", "rgba8unorm-srgb"] as const).map((format) =>
        device.createRenderPipelineAsync({
          label: `WESL material mipmap ${format}`,
          layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.mipmapLayout] }),
          vertex: { module: mipmapModule, entryPoint: "mipmapVertex" },
          fragment: {
            module: mipmapModule,
            entryPoint: "mipmapFragment",
            targets: [{ format }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ),
    ]);
  return {
    ...layouts,
    ambient,
    background,
    bloom,
    forwardBack,
    forwardDouble,
    particle,
    post,
    reflection,
    reflectionReconstruct,
    reflectionSelect,
    shadowBack,
    shadowDouble,
    temporal,
    mipmapLinear,
    mipmapSrgb,
  };
}

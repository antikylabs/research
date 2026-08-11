import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AotComputeShaderArtifact,
  AotRenderShaderArtifact,
} from "typegpu-antiky";

import {
  compileArtifact,
  createArtifactBindGroup,
  createArtifactComputePipeline,
  createArtifactPipeline,
} from "../src/artifact.js";

const computeArtifact: AotComputeShaderArtifact = {
  kind: "compute",
  wgsl: "@compute @workgroup_size(8, 8, 1) fn computeMain() {}",
  entryPoints: { compute: "computeMain" },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "output",
          binding: 0,
          visibility: ["compute"],
          storageTexture: {
            access: "write-only",
            format: "rgba16float",
            viewDimension: "2d-array",
          },
        },
      ],
    },
  ],
};

const renderArtifact: AotRenderShaderArtifact = {
  kind: "render",
  wgsl: [
    "@group(0) @binding(0) var<uniform> tint: vec4f;",
    "@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {",
    "  return vec4f(f32(index), 0, 0, 1);",
    "}",
    "@fragment fn fragmentMain() -> @location(0) vec4f { return tint; }",
  ].join("\n"),
  entryPoints: { vertex: "vertexMain", fragment: "fragmentMain" },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "tint",
          binding: 0,
          visibility: ["vertex", "fragment"],
          buffer: { type: "uniform", minBindingSize: 16 },
        },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [],
    primitive: { topology: "triangle-list", cullMode: "back" },
    targets: [{ format: "rgba8unorm" }],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TypeGPU-Antiky static artifact runtime", () => {
  it("creates compute layouts, bind groups, and pipelines from static metadata", async () => {
    vi.stubGlobal("GPUShaderStage", { COMPUTE: 4, FRAGMENT: 2, VERTEX: 1 });
    const layoutDescriptors: GPUBindGroupLayoutDescriptor[] = [];
    const bindGroupDescriptors: GPUBindGroupDescriptor[] = [];
    const pipelineDescriptors: GPUComputePipelineDescriptor[] = [];
    const device = {
      createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => {
        bindGroupDescriptors.push(descriptor);
        return {} as GPUBindGroup;
      }),
      createBindGroupLayout: vi.fn(
        (descriptor: GPUBindGroupLayoutDescriptor) => {
          layoutDescriptors.push(descriptor);
          return {} as GPUBindGroupLayout;
        },
      ),
      createComputePipelineAsync: vi.fn(
        async (descriptor: GPUComputePipelineDescriptor) => {
          pipelineDescriptors.push(descriptor);
          return {} as GPUComputePipeline;
        },
      ),
      createPipelineLayout: vi.fn(() => ({} as GPUPipelineLayout)),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: vi.fn(async () => ({ messages: [] })),
      })),
    } as unknown as GPUDevice;

    const compiled = await compileArtifact(
      device,
      "Antiky test compute",
      computeArtifact,
    );
    expect(layoutDescriptors[0]?.entries).toEqual([
      {
        binding: 0,
        visibility: 4,
        storageTexture: {
          access: "write-only",
          format: "rgba16float",
          viewDimension: "2d-array",
        },
      },
    ]);

    const output = {} as GPUTextureView;
    createArtifactBindGroup(device, compiled, 0, "Antiky compute group", {
      output,
    });
    expect(bindGroupDescriptors[0]?.entries).toEqual([
      { binding: 0, resource: output },
    ]);

    await createArtifactComputePipeline(
      device,
      compiled,
      "Antiky compute pipeline",
    );
    expect(pipelineDescriptors[0]?.compute).toMatchObject({
      entryPoint: "computeMain",
    });
  });

  it("preserves render layouts and pipeline state through the shared compiler", async () => {
    vi.stubGlobal("GPUShaderStage", { COMPUTE: 4, FRAGMENT: 2, VERTEX: 1 });
    const layoutDescriptors: GPUBindGroupLayoutDescriptor[] = [];
    const pipelineDescriptors: GPURenderPipelineDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn(
        (descriptor: GPUBindGroupLayoutDescriptor) => {
          layoutDescriptors.push(descriptor);
          return {} as GPUBindGroupLayout;
        },
      ),
      createPipelineLayout: vi.fn(() => ({} as GPUPipelineLayout)),
      createRenderPipelineAsync: vi.fn(
        async (descriptor: GPURenderPipelineDescriptor) => {
          pipelineDescriptors.push(descriptor);
          return {} as GPURenderPipeline;
        },
      ),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: vi.fn(async () => ({ messages: [] })),
      })),
    } as unknown as GPUDevice;

    const compiled = await compileArtifact(
      device,
      "Antiky test render",
      renderArtifact,
    );
    expect(layoutDescriptors[0]?.entries).toEqual([
      {
        binding: 0,
        visibility: 3,
        buffer: { type: "uniform", minBindingSize: 16 },
      },
    ]);

    await createArtifactPipeline(device, compiled, "Antiky render pipeline");
    expect(pipelineDescriptors[0]).toMatchObject({
      vertex: { entryPoint: "vertexMain", buffers: [] },
      fragment: {
        entryPoint: "fragmentMain",
        targets: [{ format: "rgba8unorm" }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
    });
  });
});

/// <reference types="wesl-plugin/suffixes" />

import { readFile } from "node:fs/promises";

import { create, globals } from "webgpu";
import { describe, expect, it, vi } from "vitest";

import environmentWGSL from "../shaders/environment.wesl?static";
import prefilterWGSL from "../shaders/environment_prefilter.wesl?static";
import {
  createWeslEnvironment,
  createWeslEnvironmentSettings,
  decodeRadianceHdr,
  validateWeslEnvironmentFaces,
  WESL_ENVIRONMENT_BRDF_LUT_SIZE,
  WESL_ENVIRONMENT_DIFFUSE_SIZE,
  WESL_ENVIRONMENT_FACE_URLS,
  WESL_ENVIRONMENT_SOURCE_SIZE,
  WESL_ENVIRONMENT_SPECULAR_MIP_COUNT,
  type HdrImage,
} from "../src/environment.js";

function sourceBuffer(source: Uint8Array): ArrayBuffer {
  return source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ) as ArrayBuffer;
}

function solidFace(size = WESL_ENVIRONMENT_SOURCE_SIZE): HdrImage {
  const pixels = new Float32Array(size * size * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 0.25;
    pixels[index + 1] = 0.5;
    pixels[index + 2] = 2;
    pixels[index + 3] = 1;
  }
  return { width: size, height: size, pixels };
}

interface MockEnvironmentDevice {
  readonly bindGroups: GPUBindGroupDescriptor[];
  readonly buffers: Array<{ readonly destroy: ReturnType<typeof vi.fn> }>;
  readonly device: GPUDevice;
  readonly passes: Array<{
    readonly descriptor: GPUComputePassDescriptor;
    readonly dispatchWorkgroups: ReturnType<typeof vi.fn>;
    readonly end: ReturnType<typeof vi.fn>;
  }>;
  readonly textureDescriptors: GPUTextureDescriptor[];
  readonly textures: Array<{
    readonly createView: ReturnType<typeof vi.fn>;
    readonly destroy: ReturnType<typeof vi.fn>;
  }>;
  readonly onSubmittedWorkDone: ReturnType<typeof vi.fn>;
  readonly resolveSubmittedWork: () => void;
  readonly writeTexture: ReturnType<typeof vi.fn>;
}

function mockEnvironmentDevice(options?: {
  readonly deferSubmittedWork?: boolean;
  readonly failBindGroup?: number;
}): MockEnvironmentDevice {
  const bindGroups: GPUBindGroupDescriptor[] = [];
  const buffers: Array<{ readonly destroy: ReturnType<typeof vi.fn> }> = [];
  const passes: MockEnvironmentDevice["passes"] = [];
  const textureDescriptors: GPUTextureDescriptor[] = [];
  const textures: MockEnvironmentDevice["textures"] = [];
  const writeTexture = vi.fn();
  let resolveSubmittedWork = (): void => {};
  const submittedWork = options?.deferSubmittedWork
    ? new Promise<void>((resolve) => {
        resolveSubmittedWork = resolve;
      })
    : Promise.resolve();
  const onSubmittedWorkDone = vi.fn(() => submittedWork);
  const createBindGroup = vi.fn((descriptor: GPUBindGroupDescriptor) => {
    bindGroups.push(descriptor);
    if (bindGroups.length === options?.failBindGroup) {
      throw new Error("synthetic environment bind-group failure");
    }
    return { label: descriptor.label } as unknown as GPUBindGroup;
  });
  const device = {
    createBindGroup,
    createBindGroupLayout: vi.fn(
      (descriptor: GPUBindGroupLayoutDescriptor) =>
        ({ label: descriptor.label }) as unknown as GPUBindGroupLayout,
    ),
    createBuffer: vi.fn(() => {
      const buffer = { destroy: vi.fn() };
      buffers.push(buffer);
      return buffer as unknown as GPUBuffer;
    }),
    createCommandEncoder: vi.fn(() => ({
      beginComputePass: vi.fn((descriptor: GPUComputePassDescriptor) => {
        const pass = {
          descriptor,
          dispatchWorkgroups: vi.fn(),
          end: vi.fn(),
          setBindGroup: vi.fn(),
          setPipeline: vi.fn(),
        };
        passes.push(pass);
        return pass;
      }),
      finish: vi.fn(() => ({})),
    })),
    createComputePipelineAsync: vi.fn(
      async (descriptor: GPUComputePipelineDescriptor) =>
        ({ label: descriptor.label }) as unknown as GPUComputePipeline,
    ),
    createPipelineLayout: vi.fn(() => ({})),
    createSampler: vi.fn(
      (descriptor: GPUSamplerDescriptor) =>
        ({ label: descriptor.label }) as unknown as GPUSampler,
    ),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: vi.fn(async () => ({ messages: [] })),
    })),
    createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
      textureDescriptors.push(descriptor);
      const texture = {
        createView: vi.fn((viewDescriptor?: GPUTextureViewDescriptor) => ({
          texture: descriptor.label,
          viewDescriptor,
        })),
        destroy: vi.fn(),
      };
      textures.push(texture);
      return texture as unknown as GPUTexture;
    }),
    queue: {
      onSubmittedWorkDone,
      submit: vi.fn(),
      writeBuffer: vi.fn(),
      writeTexture,
    },
  } as unknown as GPUDevice;
  return {
    bindGroups,
    buffers,
    device,
    passes,
    onSubmittedWorkDone,
    resolveSubmittedWork,
    textureDescriptors,
    textures,
    writeTexture,
  };
}

describe("WESL renderer-owned HDR environment", () => {
  it("decodes all six pinned Radiance RLE faces in cube-layer order", async () => {
    expect(WESL_ENVIRONMENT_FACE_URLS).toEqual([
      "/textures/px.hdr",
      "/textures/nx.hdr",
      "/textures/py.hdr",
      "/textures/ny.hdr",
      "/textures/pz.hdr",
      "/textures/nz.hdr",
    ]);
    const faces = await Promise.all(
      WESL_ENVIRONMENT_FACE_URLS.map(async (url) => {
        const source = await readFile(
          new URL(`../../../benchmark-assets${url}`, import.meta.url),
        );
        return decodeRadianceHdr(sourceBuffer(source));
      }),
    );

    expect(validateWeslEnvironmentFaces(faces)).toBe(256);
    for (const face of faces) {
      expect(face).toMatchObject({ width: 256, height: 256 });
      expect(face.pixels).toHaveLength(256 * 256 * 4);
      expect(face.pixels.every(Number.isFinite)).toBe(true);
    }
    expect(
      faces.some((face) => face.pixels.some((channel) => channel > 1)),
    ).toBe(true);
  });

  it("rejects malformed headers and truncated Radiance scanlines", async () => {
    const malformed = new TextEncoder().encode(
      "#?NOT_HDR\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 8\n",
    );
    expect(() => decodeRadianceHdr(sourceBuffer(malformed))).toThrow(
      "Unsupported Radiance HDR signature",
    );

    const source = await readFile(
      new URL("../../../benchmark-assets/textures/px.hdr", import.meta.url),
    );
    expect(() => decodeRadianceHdr(sourceBuffer(source.subarray(0, -13)))).toThrow(
      /scanline .* (truncated|invalid)/,
    );
  });

  it("requires exactly six matching pinned-size square faces", () => {
    const face = solidFace();
    expect(() => validateWeslEnvironmentFaces(Array(5).fill(face))).toThrow(
      "exactly six",
    );
    expect(() =>
      validateWeslEnvironmentFaces([
        face,
        face,
        face,
        face,
        face,
        solidFace(128),
      ]),
    ).toThrow("256x256");
  });

  it("packs the inverse camera transform, mip limit, and neutral gains into 96 bytes", () => {
    const settings = createWeslEnvironmentSettings(2560, 1440);
    expect(settings).toHaveLength(24);
    expect(settings.byteLength).toBe(96);
    expect(Array.from(settings.slice(16, 20))).toEqual([
      expect.closeTo(9.3),
      expect.closeTo(3.4),
      expect.closeTo(-0.35),
      8,
    ]);
    expect(Array.from(settings.slice(20, 24))).toEqual([1, 1, 1, 0]);
    expect(settings.slice(0, 16).every(Number.isFinite)).toBe(true);
  });

  it("allocates cube/LUT descriptors and dispatches every startup prefilter pass", async () => {
    vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, UNIFORM: 2 });
    vi.stubGlobal("GPUShaderStage", { COMPUTE: 4 });
    vi.stubGlobal("GPUTextureUsage", {
      COPY_DST: 1,
      STORAGE_BINDING: 2,
      TEXTURE_BINDING: 4,
    });
    const mocks = mockEnvironmentDevice({ deferSubmittedWork: true });
    const face = solidFace();
    try {
      let settled = false;
      const pendingEnvironment = createWeslEnvironment(
        mocks.device,
        Array(6).fill(face),
      );
      void pendingEnvironment.then(() => {
        settled = true;
      });
      await vi.waitFor(() => {
        expect(mocks.onSubmittedWorkDone).toHaveBeenCalledOnce();
      });
      expect(settled).toBe(false);
      expect(mocks.buffers[0]?.destroy).not.toHaveBeenCalled();
      mocks.resolveSubmittedWork();
      const environment = await pendingEnvironment;
      expect(mocks.buffers[0]?.destroy).toHaveBeenCalledOnce();

      expect(mocks.textureDescriptors).toEqual([
        expect.objectContaining({
          label: "WESL decoded HDR source cube",
          size: [256, 256, 6],
          mipLevelCount: 1,
          format: "rgba16float",
        }),
        expect.objectContaining({
          label: "WESL GGX prefiltered specular cube",
          size: [256, 256, 6],
          mipLevelCount: 9,
          format: "rgba16float",
        }),
        expect.objectContaining({
          label: "WESL cosine-convolved diffuse cube",
          size: [32, 32, 6],
          mipLevelCount: 1,
          format: "rgba16float",
        }),
        expect.objectContaining({
          label: "WESL split-sum BRDF LUT",
          size: [256, 256],
          mipLevelCount: 1,
          format: "rgba16float",
        }),
      ]);
      expect(mocks.writeTexture).toHaveBeenCalledTimes(6);
      expect(
        mocks.writeTexture.mock.calls.map((call) => call[0].origin[2]),
      ).toEqual([0, 1, 2, 3, 4, 5]);

      expect(mocks.passes).toHaveLength(11);
      const specularDispatches = mocks.passes.slice(0, 9).map((pass) =>
        pass.dispatchWorkgroups.mock.calls[0],
      );
      expect(specularDispatches).toEqual([
        [32, 32, 6],
        [16, 16, 6],
        [8, 8, 6],
        [4, 4, 6],
        [2, 2, 6],
        [1, 1, 6],
        [1, 1, 6],
        [1, 1, 6],
        [1, 1, 6],
      ]);
      expect(mocks.passes[9]?.dispatchWorkgroups).toHaveBeenCalledWith(4, 4, 6);
      expect(mocks.passes[10]?.dispatchWorkgroups).toHaveBeenCalledWith(32, 32, 1);
      for (const pass of mocks.passes) expect(pass.end).toHaveBeenCalledOnce();

      const specularTexture = mocks.textures[1];
      const storageViews = specularTexture?.createView.mock.calls
        .map((call) => call[0] as GPUTextureViewDescriptor | undefined)
        .filter((view) => view?.dimension === "2d-array");
      expect(storageViews).toHaveLength(9);
      expect(storageViews?.map((view) => view?.baseMipLevel)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);

      expect(environment.sourceView).toBeDefined();
      expect(environment.diffuseView).toBeDefined();
      expect(environment.specularView).toBeDefined();
      expect(environment.brdfLutView).toBeDefined();
      expect(environment.specularMipLevelCount).toBe(
        WESL_ENVIRONMENT_SPECULAR_MIP_COUNT,
      );
      const sourceBytes = 256 * 256 * 6 * 8;
      const specularTexels = Array.from(
        { length: 9 },
        (_, mip) => (256 >> mip) ** 2,
      ).reduce((sum, texels) => sum + texels, 0);
      expect(environment.estimatedBytes).toBe(
        sourceBytes +
          specularTexels * 6 * 8 +
          WESL_ENVIRONMENT_DIFFUSE_SIZE ** 2 * 6 * 8 +
          WESL_ENVIRONMENT_BRDF_LUT_SIZE ** 2 * 8,
      );

      environment.destroy();
      environment.destroy();
      for (const texture of mocks.textures) {
        expect(texture.destroy).toHaveBeenCalledOnce();
      }
      expect(mocks.buffers[0]?.destroy).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("destroys every partial allocation when startup construction fails", async () => {
    vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, UNIFORM: 2 });
    vi.stubGlobal("GPUShaderStage", { COMPUTE: 4 });
    vi.stubGlobal("GPUTextureUsage", {
      COPY_DST: 1,
      STORAGE_BINDING: 2,
      TEXTURE_BINDING: 4,
    });
    const mocks = mockEnvironmentDevice({ failBindGroup: 4 });
    const face = solidFace();
    try {
      await expect(
        createWeslEnvironment(mocks.device, Array(6).fill(face)),
      ).rejects.toThrow("synthetic environment bind-group failure");
      expect(mocks.textures).toHaveLength(4);
      for (const texture of mocks.textures) {
        expect(texture.destroy).toHaveBeenCalledOnce();
      }
      expect(mocks.buffers[0]?.destroy).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("compiles both linked modules and executes the split-sum entry point in Dawn", async () => {
    const dawnGlobals = globals as unknown as {
      readonly GPUBufferUsage: typeof GPUBufferUsage;
      readonly GPUMapMode: typeof GPUMapMode;
      readonly GPUTextureUsage: typeof GPUTextureUsage;
    };
    let gpu = create([]);
    let adapter = await gpu.requestAdapter();
    if (adapter === null) {
      gpu = create(["backend=null"]);
      adapter = await gpu.requestAdapter();
    }
    if (adapter === null) throw new Error("Dawn did not provide a WebGPU adapter");

    const device = await adapter.requestDevice();
    try {
      for (const code of [environmentWGSL, prefilterWGSL]) {
        const module = device.createShaderModule({ code });
        const info = await module.getCompilationInfo();
        expect(
          info.messages.filter((message) => message.type === "error"),
        ).toEqual([]);
      }

      const module = device.createShaderModule({ code: prefilterWGSL });
      await expect(
        device.createComputePipelineAsync({
          layout: "auto",
          compute: { module, entryPoint: "prefilterSpecular" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createComputePipelineAsync({
          layout: "auto",
          compute: { module, entryPoint: "convolveDiffuse" },
        }),
      ).resolves.toBeDefined();
      const brdfPipeline = await device.createComputePipelineAsync({
        layout: "auto",
        compute: { module, entryPoint: "integrateBrdf" },
      });
      const output = device.createTexture({
        size: [8, 8],
        format: "rgba16float",
        usage:
          dawnGlobals.GPUTextureUsage.STORAGE_BINDING |
          dawnGlobals.GPUTextureUsage.COPY_SRC,
      });
      const readback = device.createBuffer({
        size: 8 * 256,
        usage:
          dawnGlobals.GPUBufferUsage.COPY_DST |
          dawnGlobals.GPUBufferUsage.MAP_READ,
      });
      const group = device.createBindGroup({
        layout: brdfPipeline.getBindGroupLayout(0),
        entries: [{ binding: 4, resource: output.createView() }],
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(brdfPipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(1, 1, 1);
      pass.end();
      encoder.copyTextureToBuffer(
        { texture: output },
        { buffer: readback, bytesPerRow: 256, rowsPerImage: 8 },
        [8, 8],
      );
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(dawnGlobals.GPUMapMode.READ);
      expect(new Uint16Array(readback.getMappedRange()).some(Boolean)).toBe(true);
      readback.unmap();
      readback.destroy();
      output.destroy();
    } finally {
      device.destroy();
    }
  });
});

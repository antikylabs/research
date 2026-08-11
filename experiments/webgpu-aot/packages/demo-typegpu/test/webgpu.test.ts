import { create, globals } from "webgpu";
import tgpu from "typegpu";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTypeGpuBackgroundPipeline,
  createTypeGpuForwardPipeline,
} from "../src/pipelines.js";
import {
  createTypeGpuShadowPipeline,
  shadowLayout,
} from "../src/shaders/shadow.js";
import {
  materialLayout,
  resolveTypeGpuRendererWGSL,
  sceneLayout,
  TYPEGPU_IBL_DIFFUSE_GAIN,
  TYPEGPU_IBL_SPECULAR_GAIN,
} from "../src/shaders/forward.js";

Object.assign(globalThis, globals);

let cachedDawnAdapter: GPUAdapter | undefined;
let cachedDawnGpu: GPU | undefined;
let dawnDevice: GPUDevice;
let dawnUsesNullBackend = false;

async function requestDawnAdapter() {
  if (cachedDawnAdapter !== undefined) return cachedDawnAdapter;
  let gpu = create([]);
  let adapter = await gpu.requestAdapter();
  if (adapter === null) {
    dawnUsesNullBackend = true;
    gpu = create(["backend=null"]);
    adapter = await gpu.requestAdapter();
  } else {
    dawnUsesNullBackend = false;
  }
  if (adapter === null) {
    throw new Error("Dawn did not provide a WebGPU adapter");
  }
  cachedDawnGpu = gpu;
  cachedDawnAdapter = adapter;
  return adapter;
}

beforeAll(async () => {
  dawnDevice = await (await requestDawnAdapter()).requestDevice();
});

afterAll(() => {
  dawnDevice.destroy();
  cachedDawnAdapter = undefined;
  cachedDawnGpu = undefined;
  dawnUsesNullBackend = false;
});

function decodeFloat16(value: number): number {
  const sign = (value & 0x8000) === 0 ? 1 : -1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : Number.NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

describe("standard TypeGPU runtime WebGPU artifact", () => {
  it.each(Object.entries(resolveTypeGpuRendererWGSL()))(
    "compiles the %s shader module in Dawn",
    async (_name, code) => {
      const shaderModule = dawnDevice.createShaderModule({ code });
      const compilationInfo = await shaderModule.getCompilationInfo();
      expect(
        compilationInfo.messages.filter((message) => message.type === "error"),
      ).toEqual([]);
    },
  );

  it("selects its background pipeline inside the single-sampled forward pass", async () => {
    const renderAttachment = 0x10;
    const device = dawnDevice;
    const root = tgpu.initFromDevice({ device, unstable_names: "strict" });
    const colorTextures = Array.from({ length: 3 }, (_, index) =>
      device.createTexture({
        label: `TypeGPU background test color ${index}`,
        size: [4, 4],
        sampleCount: 1,
        format: "rgba16float",
        usage: renderAttachment,
      }),
    );
    const depth = device.createTexture({
      label: "TypeGPU background test depth",
      size: [4, 4],
      sampleCount: 1,
      format: "depth24plus",
      usage: renderAttachment,
    });

    try {
      device.pushErrorScope("validation");
      const pipeline = root.unwrap(createTypeGpuBackgroundPipeline(root, 1));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: colorTextures.map((texture) => ({
          view: texture.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: "clear" as const,
          storeOp: "discard" as const,
        })),
        depthStencilAttachment: {
          view: depth.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "discard",
        },
      });
      pass.setPipeline(pipeline);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      expect(await device.popErrorScope()).toBeNull();
    } finally {
      root.destroy();
    }
  });

  it("executes the typed cascaded-shadow pipeline in Dawn", async () => {
    const uniform = 0x40;
    const copyDst = 0x8;
    const vertex = 0x20;
    const index = 0x10;
    const renderAttachment = 0x10;
    const device = dawnDevice;
    const root = tgpu.initFromDevice({ device, unstable_names: "strict" });
    const frameValues = new Float32Array(32);
    frameValues.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0);
    frameValues.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 16);
    const frame = device.createBuffer({
      size: frameValues.byteLength,
      usage: uniform | copyDst,
    });
    device.queue.writeBuffer(frame, 0, frameValues);
    const positions = device.createBuffer({
      size: 3 * 3 * Float32Array.BYTES_PER_ELEMENT,
      usage: vertex | copyDst,
    });
    device.queue.writeBuffer(
      positions,
      0,
      new Float32Array([-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0, 0.5, 0.5]),
    );
    const indices = device.createBuffer({ size: 8, usage: index | copyDst });
    device.queue.writeBuffer(indices, 0, new Uint16Array([0, 1, 2, 0]));
    const depth = device.createTexture({
      size: [4, 4],
      format: "depth32float",
      usage: renderAttachment,
    });

    try {
      device.pushErrorScope("validation");
      const pipeline = root.unwrap(createTypeGpuShadowPipeline(root, "back"));
      const group = root.unwrap(root.createBindGroup(shadowLayout, { frame }));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: {
          view: depth.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.setVertexBuffer(0, positions);
      pass.setIndexBuffer(indices, "uint16");
      pass.drawIndexed(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      expect(await device.popErrorScope()).toBeNull();
    } finally {
      root.destroy();
    }
  });

  it.for([
    {
      environmentFaces: Array.from(
        { length: 6 },
        () => [255, 255, 255, 255] as const,
      ),
      expectedRange: [0.48, 0.54] as const,
      name: "unit cube",
      roughness: 1,
      surfaceAxis: "z" as const,
    },
    {
      environmentFaces: Array.from(
        { length: 6 },
        () => [0, 0, 0, 255] as const,
      ),
      expectedRange: [-0.001, 0.005] as const,
      name: "black cube",
      roughness: 1,
      surfaceAxis: "z" as const,
    },
    {
      environmentFaces: [
        [0, 0, 0, 255] as const,
        [255, 255, 255, 255] as const,
        [0, 0, 0, 255] as const,
        [0, 0, 0, 255] as const,
        [0, 0, 0, 255] as const,
        [0, 0, 0, 255] as const,
      ],
      expectedRange: [0.48, 0.54] as const,
      name: "negative-X face for a positive-X surface",
      roughness: 1,
      surfaceAxis: "x" as const,
    },
    {
      environmentFaces: Array.from(
        { length: 6 },
        () => [255, 255, 255, 255] as const,
      ),
      expectedRange: [0.48, 0.54] as const,
      name: "low-roughness surface before temporal occlusion",
      roughness: 0.045,
      surfaceAxis: "z" as const,
    },
  ])(
    "renders $name IBL without direct-light or hemisphere leakage",
    async ({
      environmentFaces,
      expectedRange,
      roughness,
      surfaceAxis,
    }, testContext) => {
      if (dawnUsesNullBackend) {
        testContext.skip(
          "Dawn's null backend validates commands but does not execute pixel readbacks",
        );
      }
      const device = dawnDevice;
      const root = tgpu.initFromDevice({ device, unstable_names: "strict" });
      const buffers: GPUBuffer[] = [];
      const textures: GPUTexture[] = [];
      let readbackMapped = false;
      const uploadBuffer = (
        label: string,
        values: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
        usage: GPUBufferUsageFlags,
      ): GPUBuffer => {
        const size = Math.ceil(values.byteLength / 4) * 4;
        const buffer = device.createBuffer({ label, size, usage });
        device.queue.writeBuffer(buffer, 0, values);
        buffers.push(buffer);
        return buffer;
      };
      const sampledRgba = (
        label: string,
        color: readonly [number, number, number, number],
      ): GPUTexture => {
        const texture = device.createTexture({
          label,
          size: [1, 1],
          format: "rgba8unorm",
          usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        });
        device.queue.writeTexture(
          { texture },
          new Uint8Array(color),
          { bytesPerRow: 4 },
          [1, 1],
        );
        textures.push(texture);
        return texture;
      };

      const frameValues = new Float32Array(92);
      const identity = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
      const model =
        surfaceAxis === "x"
          ? new Float32Array([
              0, 0, -1, 0,
              0, 1, 0, 0,
              1, 0, 0, 0,
              0, 0, 0, 1,
            ])
          : identity;
      const viewProjection =
        surfaceAxis === "x"
          ? new Float32Array([
              0, 0, 1, 0,
              0, 1, 0, 0,
              -1, 0, 0, 0,
              0, 0, 0, 1,
            ])
          : identity;
      frameValues.set(viewProjection, 0);
      frameValues.set(model, 16);
      frameValues.set(viewProjection, 32);
      frameValues.set(viewProjection, 48);
      frameValues.set(model, 64);
      frameValues.set(surfaceAxis === "x" ? [2, 0, 0, 1] : [0, 0, 2, 1], 80);
      frameValues.set([0, 5, 5, 0], 84);
      frameValues.set(
        [
          0,
          TYPEGPU_IBL_DIFFUSE_GAIN,
          TYPEGPU_IBL_SPECULAR_GAIN,
          0,
        ],
        88,
      );
      const frame = uploadBuffer(
        "TypeGPU forward consumer frame",
        frameValues,
        GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
      );
      const lights = device.createBuffer({
        label: "TypeGPU forward consumer lights",
        size: 64 * 64,
        usage: GPUBufferUsage.STORAGE,
      });
      buffers.push(lights);

      const nearShadow = device.createTexture({
        label: "TypeGPU forward consumer near shadow",
        size: [4, 4],
        format: "depth32float",
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const farShadow = device.createTexture({
        label: "TypeGPU forward consumer far shadow",
        size: [4, 4],
        format: "depth32float",
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const environment = device.createTexture({
        label: "TypeGPU forward consumer environment cube",
        size: [1, 1, 6],
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      for (let face = 0; face < 6; face += 1) {
        device.queue.writeTexture(
          { texture: environment, origin: [0, 0, face] },
          new Uint8Array(environmentFaces[face]),
          { bytesPerRow: 4, rowsPerImage: 1 },
          [1, 1, 1],
        );
      }
      textures.push(nearShadow, farShadow, environment);

      const baseColor = sampledRgba(
        "TypeGPU forward consumer base color",
        [255, 255, 255, 255],
      );
      const normalMap = sampledRgba(
        "TypeGPU forward consumer normal map",
        [128, 128, 255, 255],
      );
      const metallicRoughness = sampledRgba(
        "TypeGPU forward consumer metallic roughness",
        [0, 255, 0, 255],
      );
      const material = uploadBuffer(
        "TypeGPU forward consumer material",
        new Float32Array([0.5, 0.5, 0.5, 1, 0, 1, roughness, 0]),
        GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
      );
      const positions = uploadBuffer(
        "TypeGPU forward consumer positions",
        new Float32Array([-1, -1, 0.5, 3, -1, 0.5, -1, 3, 0.5]),
        GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      );
      const normals = uploadBuffer(
        "TypeGPU forward consumer normals",
        new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      );
      const texcoords = uploadBuffer(
        "TypeGPU forward consumer texcoords",
        new Float32Array([0, 0, 2, 0, 0, 2]),
        GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      );
      const indices = uploadBuffer(
        "TypeGPU forward consumer indices",
        new Uint16Array([0, 1, 2, 0]),
        GPUBufferUsage.COPY_DST | GPUBufferUsage.INDEX,
      );
      const colorTargets = Array.from({ length: 3 }, (_, index) => {
        const texture = device.createTexture({
          label: `TypeGPU forward consumer color ${index}`,
          size: [5, 5],
          sampleCount: 1,
          format: "rgba16float",
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT |
            (index === 0 ? GPUTextureUsage.COPY_SRC : 0),
        });
        textures.push(texture);
        return texture;
      });
      const depth = device.createTexture({
        label: "TypeGPU forward consumer depth",
        size: [5, 5],
        sampleCount: 1,
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      const readback = device.createBuffer({
        label: "TypeGPU forward consumer readback",
        size: 256 * 5,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      buffers.push(readback);
      textures.push(depth);

      try {
        device.pushErrorScope("validation");
        const untouchedColor = [4, -4, 2, 0] as const;
        const pipeline = root.unwrap(createTypeGpuForwardPipeline(root, "none", 1));
        const sceneGroup = root.unwrap(
          root.createBindGroup(sceneLayout, {
            frame,
            lights,
            nearShadow: nearShadow.createView(),
            farShadow: farShadow.createView(),
            shadowSampler: device.createSampler({
              addressModeU: "clamp-to-edge",
              addressModeV: "clamp-to-edge",
              compare: "less-equal",
            }),
            environmentMap: environment.createView({ dimension: "cube" }),
            environmentSampler: device.createSampler({
              magFilter: "linear",
              minFilter: "linear",
            }),
          }),
        );
        const materialGroup = root.unwrap(
          root.createBindGroup(materialLayout, {
            sampler: device.createSampler({
              magFilter: "linear",
              minFilter: "linear",
            }),
            baseColor: baseColor.createView(),
            normal: normalMap.createView(),
            metallicRoughness: metallicRoughness.createView(),
            material,
          }),
        );
        const encoder = device.createCommandEncoder();
        for (const shadow of [nearShadow, farShadow]) {
          const clear = encoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: {
              view: shadow.createView(),
              depthClearValue: 0,
              depthLoadOp: "clear",
              depthStoreOp: "store",
            },
          });
          clear.end();
        }
        const pass = encoder.beginRenderPass({
          colorAttachments: colorTargets.map((texture, index) => ({
            view: texture.createView(),
            clearValue: index === 0 ? untouchedColor : [0, 0, 0, 0] as const,
            loadOp: "clear" as const,
            storeOp: "store" as const,
          })),
          depthStencilAttachment: {
            view: depth.createView(),
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "discard",
          },
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, sceneGroup);
        pass.setBindGroup(1, materialGroup);
        pass.setVertexBuffer(0, positions);
        pass.setVertexBuffer(1, normals);
        pass.setVertexBuffer(2, texcoords);
        pass.setIndexBuffer(indices, "uint16");
        pass.drawIndexed(3);
        pass.end();
        encoder.copyTextureToBuffer(
          { texture: colorTargets[0] },
          { buffer: readback, bytesPerRow: 256, rowsPerImage: 5 },
          [5, 5],
        );
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        expect(await device.popErrorScope()).toBeNull();
        await readback.mapAsync(GPUMapMode.READ);
        readbackMapped = true;
        const readbackBytesPerRow = 256;
        const centerCoordinate = 2;
        const rgba16PixelBytes = 4 * Uint16Array.BYTES_PER_ELEMENT;
        const centerByteOffset =
          centerCoordinate * readbackBytesPerRow +
          centerCoordinate * rgba16PixelBytes;
        const centerPixel = new Uint16Array(
          readback.getMappedRange(),
          centerByteOffset,
          4,
        );
        const decodedPixel = Array.from(centerPixel, decodeFloat16);
        expect(decodedPixel.every(Number.isFinite)).toBe(true);
        expect(decodedPixel[3]).toBeGreaterThan(0.99);
        expect(decodedPixel[3]).toBeLessThan(1.01);
        const color = decodedPixel.slice(0, 3);
        for (const channel of color) {
          expect(channel).toBeGreaterThan(expectedRange[0]);
          expect(channel).toBeLessThan(expectedRange[1]);
        }
      } finally {
        if (readbackMapped) readback.unmap();
        for (const buffer of buffers) buffer.destroy();
        for (const texture of textures) texture.destroy();
        root.destroy();
      }
    },
  );
});

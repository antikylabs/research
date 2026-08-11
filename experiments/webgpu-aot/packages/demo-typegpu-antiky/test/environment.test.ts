import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  ANTIKY_ENVIRONMENT_FACE_URLS,
  buildAntikyEnvironmentMipChain,
  createAntikyEnvironment,
  decodeRadianceHdr,
  encodeAntikyRgba16Float,
  float32ToFloat16Bits,
  validateAntikyEnvironmentFaces,
  type AntikyHdrImage,
} from "../src/environment.js";

function arrayBuffer(source: Uint8Array): ArrayBuffer {
  return source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ) as ArrayBuffer;
}

function solidFace(size = 4, value = 1): AntikyHdrImage {
  const pixels = new Float32Array(size * size * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = value;
    pixels[index + 1] = value * 2;
    pixels[index + 2] = value * 4;
    pixels[index + 3] = 1;
  }
  return { height: size, pixels, width: size };
}

function mockDevice(options?: { readonly failSampler?: boolean }): {
  readonly descriptor: GPUTextureDescriptor[];
  readonly device: GPUDevice;
  readonly samplerDescriptor: GPUSamplerDescriptor[];
  readonly texture: {
    readonly createView: ReturnType<typeof vi.fn>;
    readonly destroy: ReturnType<typeof vi.fn>;
  };
  readonly writes: ReturnType<typeof vi.fn>;
} {
  const descriptor: GPUTextureDescriptor[] = [];
  const samplerDescriptor: GPUSamplerDescriptor[] = [];
  const texture = {
    createView: vi.fn((viewDescriptor?: GPUTextureViewDescriptor) => ({
      viewDescriptor,
    })),
    destroy: vi.fn(),
  };
  const writes = vi.fn();
  const device = {
    createSampler: vi.fn((value: GPUSamplerDescriptor) => {
      samplerDescriptor.push(value);
      if (options?.failSampler === true) {
        throw new Error("synthetic sampler failure");
      }
      return { label: value.label } as unknown as GPUSampler;
    }),
    createTexture: vi.fn((value: GPUTextureDescriptor) => {
      descriptor.push(value);
      return texture as unknown as GPUTexture;
    }),
    queue: { writeTexture: writes },
  } as unknown as GPUDevice;
  return { descriptor, device, samplerDescriptor, texture, writes };
}

describe("TypeGPU-Antiky renderer-owned HDR environment", () => {
  it("decodes the six pinned Radiance faces in cube-layer order", async () => {
    expect(ANTIKY_ENVIRONMENT_FACE_URLS).toEqual([
      "/textures/px.hdr",
      "/textures/nx.hdr",
      "/textures/py.hdr",
      "/textures/ny.hdr",
      "/textures/pz.hdr",
      "/textures/nz.hdr",
    ]);
    const faces = await Promise.all(
      ANTIKY_ENVIRONMENT_FACE_URLS.map(async (url) => {
        const source = await readFile(
          new URL(`../../../benchmark-assets${url}`, import.meta.url),
        );
        return decodeRadianceHdr(arrayBuffer(source));
      }),
    );

    expect(validateAntikyEnvironmentFaces(faces)).toBe(256);
    for (const face of faces) {
      expect(face).toMatchObject({ height: 256, width: 256 });
      expect(face.pixels).toHaveLength(256 * 256 * 4);
      expect(face.pixels.every(Number.isFinite)).toBe(true);
    }
    expect(
      faces.some((face) => face.pixels.some((channel) => channel > 1)),
    ).toBe(true);
  });

  it("rejects malformed headers, truncated scanlines, and invalid cubes", async () => {
    const malformed = new TextEncoder().encode(
      "#?NOT_HDR\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 8\n",
    );
    expect(() => decodeRadianceHdr(arrayBuffer(malformed))).toThrow(
      "Unsupported Radiance HDR signature",
    );

    const source = await readFile(
      new URL(
        "../../../benchmark-assets/textures/px.hdr",
        import.meta.url,
      ),
    );
    expect(() =>
      decodeRadianceHdr(arrayBuffer(source.subarray(0, -13))),
    ).toThrow(/scanline .* (truncated|invalid)/);

    expect(() =>
      validateAntikyEnvironmentFaces(Array(5).fill(solidFace())),
    ).toThrow("exactly six");
    expect(() =>
      validateAntikyEnvironmentFaces([
        solidFace(),
        solidFace(),
        solidFace(),
        solidFace(),
        solidFace(),
        solidFace(2),
      ]),
    ).toThrow("matching square dimensions");
  });

  it("builds a complete deterministic box-filter mip chain", () => {
    const source = solidFace(4);
    source.pixels[0] = 0;
    source.pixels[4] = 2;
    source.pixels[16] = 4;
    source.pixels[20] = 6;

    const levels = buildAntikyEnvironmentMipChain(source);
    expect(levels.map(({ width, height }) => [width, height])).toEqual([
      [4, 4],
      [2, 2],
      [1, 1],
    ]);
    expect(levels[1]!.pixels[0]).toBe(3);
    expect(levels[2]!.pixels[3]).toBe(1);
  });

  it("encodes finite rgba16float upload data", () => {
    expect(float32ToFloat16Bits(0)).toBe(0x0000);
    expect(float32ToFloat16Bits(1)).toBe(0x3c00);
    expect(float32ToFloat16Bits(-2)).toBe(0xc000);
    expect(float32ToFloat16Bits(Number.POSITIVE_INFINITY)).toBe(0x7bff);
    expect(Array.from(encodeAntikyRgba16Float(new Float32Array([0, 1, -2])))).toEqual([
      0x0000,
      0x3c00,
      0xc000,
    ]);
  });

  it("uploads every face and mip and owns texture lifetime", () => {
    const mock = mockDevice();
    const environment = createAntikyEnvironment(
      mock.device,
      Array.from({ length: 6 }, (_, face) => solidFace(4, face + 1)),
    );

    expect(mock.descriptor).toHaveLength(1);
    expect(mock.descriptor[0]).toMatchObject({
      dimension: "2d",
      format: "rgba16float",
      label: "Antiky renderer-owned HDR environment cube",
      mipLevelCount: 3,
      size: [4, 4, 6],
    });
    expect(mock.texture.createView).toHaveBeenCalledWith({
      dimension: "cube",
      mipLevelCount: 3,
    });
    expect(mock.samplerDescriptor[0]).toMatchObject({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      lodMaxClamp: 2,
    });
    expect(mock.writes).toHaveBeenCalledTimes(18);
    expect(mock.writes.mock.calls[0]?.[0]).toMatchObject({
      mipLevel: 0,
      origin: [0, 0, 0],
    });
    expect(mock.writes.mock.calls.at(-1)?.[0]).toMatchObject({
      mipLevel: 2,
      origin: [0, 0, 5],
    });
    expect(environment).toMatchObject({
      estimatedBytes: 6 * (4 * 4 + 2 * 2 + 1) * 8,
      mipLevelCount: 3,
    });

    environment.destroy();
    environment.destroy();
    expect(mock.texture.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys partially allocated GPU state when construction fails", () => {
    const mock = mockDevice({ failSampler: true });
    expect(() =>
      createAntikyEnvironment(mock.device, Array(6).fill(solidFace())),
    ).toThrow("synthetic sampler failure");
    expect(mock.texture.destroy).toHaveBeenCalledTimes(1);
  });
});

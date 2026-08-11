import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  BROMETAL_ENVIRONMENT_FACE_URLS,
  buildBroMetalEnvironmentMipChain,
  decodeBroMetalRadianceHdr,
  loadBroMetalEnvironment,
} from "../src/environment.js";

describe("BroMetal HDR environment", () => {
  it("owns and decodes the six pinned square HDR faces", async () => {
    expect(BROMETAL_ENVIRONMENT_FACE_URLS).toEqual([
      "/textures/px.hdr",
      "/textures/nx.hdr",
      "/textures/py.hdr",
      "/textures/ny.hdr",
      "/textures/pz.hdr",
      "/textures/nz.hdr",
    ]);
    const faces = await Promise.all(
      BROMETAL_ENVIRONMENT_FACE_URLS.map(async (url) => {
        const source = await readFile(
          fileURLToPath(new URL(`../../../benchmark-assets${url}`, import.meta.url)),
        );
        return decodeBroMetalRadianceHdr(
          source.buffer.slice(
            source.byteOffset,
            source.byteOffset + source.byteLength,
          ) as ArrayBuffer,
        );
      }),
    );
    for (const face of faces) {
      expect(face.width).toBe(256);
      expect(face.height).toBe(256);
      expect(face.pixels.every(Number.isFinite)).toBe(true);
      expect(face.pixels.some((value) => value > 0)).toBe(true);
      expect(buildBroMetalEnvironmentMipChain(face)).toHaveLength(9);
    }
    expect(faces.some((face) => face.pixels.some((value) => value > 1))).toBe(true);
  });

  it("allocates a complete filterable nine-mip cube and destroys it once", async () => {
    vi.stubGlobal("GPUTextureUsage", { COPY_DST: 2, TEXTURE_BINDING: 4 });
    const destroy = vi.fn();
    const texture = {
      createView: vi.fn(() => ({ dimension: "cube" })),
      destroy,
    } as unknown as GPUTexture;
    const device = {
      createSampler: vi.fn(() => ({}) as GPUSampler),
      createTexture: vi.fn(() => texture),
      queue: { writeTexture: vi.fn() },
    } as unknown as GPUDevice;
    const face = {
      height: 1,
      pixels: new Float32Array([1, 1, 1, 1]),
      width: 1,
    };
    const environment = await loadBroMetalEnvironment(device, {
      fetchFace: vi.fn(async () => face),
    });
    expect(device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "rgba16float",
        mipLevelCount: 1,
        size: [1, 1, 6],
      }),
    );
    expect(device.queue.writeTexture).toHaveBeenCalledTimes(6);
    environment.destroy();
    environment.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

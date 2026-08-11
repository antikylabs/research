import { describe, expect, it, vi } from "vitest";

import {
  createWeslMipmapPlan,
  encodeWeslMipmaps,
} from "../src/mipmaps.js";

describe("WESL material mipmaps", () => {
  it("plans every mip down to one texel", () => {
    expect(createWeslMipmapPlan(1024, 512)).toEqual([
      { level: 1, width: 512, height: 256 },
      { level: 2, width: 256, height: 128 },
      { level: 3, width: 128, height: 64 },
      { level: 4, width: 64, height: 32 },
      { level: 5, width: 32, height: 16 },
      { level: 6, width: 16, height: 8 },
      { level: 7, width: 8, height: 4 },
      { level: 8, width: 4, height: 2 },
      { level: 9, width: 2, height: 1 },
      { level: 10, width: 1, height: 1 },
    ]);
  });

  it("renders each level from the immediately preceding mip", () => {
    const passes: Array<{
      readonly draw: ReturnType<typeof vi.fn>;
      readonly end: ReturnType<typeof vi.fn>;
      readonly setBindGroup: ReturnType<typeof vi.fn>;
      readonly setPipeline: ReturnType<typeof vi.fn>;
    }> = [];
    const encoder = {
      beginRenderPass: vi.fn(() => {
        const pass = {
          draw: vi.fn(),
          end: vi.fn(),
          setBindGroup: vi.fn(),
          setPipeline: vi.fn(),
        };
        passes.push(pass);
        return pass;
      }),
    } as unknown as GPUCommandEncoder;
    const texture = {
      createView: vi.fn((descriptor: GPUTextureViewDescriptor) => ({ descriptor })),
    } as unknown as GPUTexture;
    const bindGroups: GPUBindGroupDescriptor[] = [];
    const device = {
      createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => {
        bindGroups.push(descriptor);
        return descriptor;
      }),
    } as unknown as GPUDevice;

    encodeWeslMipmaps(
      device,
      encoder,
      texture,
      createWeslMipmapPlan(8, 4),
      {} as GPUSampler,
      {} as GPUBindGroupLayout,
      {} as GPURenderPipeline,
    );

    expect(passes).toHaveLength(3);
    expect(bindGroups.map(({ entries }) =>
      (Array.from(entries)[1]?.resource as unknown as {
        descriptor: GPUTextureViewDescriptor;
      }).descriptor,
    )).toEqual([
      { baseMipLevel: 0, mipLevelCount: 1 },
      { baseMipLevel: 1, mipLevelCount: 1 },
      { baseMipLevel: 2, mipLevelCount: 1 },
    ]);
    expect(texture.createView).toHaveBeenCalledWith({
      baseMipLevel: 3,
      mipLevelCount: 1,
    });
    for (const pass of passes) {
      expect(pass.draw).toHaveBeenCalledWith(3);
      expect(pass.end).toHaveBeenCalledOnce();
    }
  });
});

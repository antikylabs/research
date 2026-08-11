import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildEnvironmentMipChain,
  decodeRadianceHdr,
  float32ToFloat16Bits,
} from "../src/environment.js";

describe("TypeGPU native HDR environment ingestion", () => {
  it("decodes the pinned Radiance cube face and builds its complete mip chain", async () => {
    const source = await readFile(
      new URL("../../../benchmark-assets/textures/px.hdr", import.meta.url),
    );
    const decoded = decodeRadianceHdr(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    );

    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(256);
    expect(decoded.pixels).toHaveLength(256 * 256 * 4);
    expect(decoded.pixels.every(Number.isFinite)).toBe(true);
    expect(decoded.pixels.some((value) => value > 1)).toBe(true);

    const mips = buildEnvironmentMipChain(decoded);
    expect(mips).toHaveLength(9);
    expect(mips.at(-1)).toMatchObject({ width: 1, height: 1 });
    expect(mips.at(-1)?.pixels.every(Number.isFinite)).toBe(true);
  });

  it("encodes finite HDR channels for rgba16float uploads", () => {
    expect(float32ToFloat16Bits(0)).toBe(0);
    expect(float32ToFloat16Bits(1)).toBe(0x3c00);
    expect(float32ToFloat16Bits(65_504)).toBe(0x7bff);
    expect(float32ToFloat16Bits(Number.POSITIVE_INFINITY)).toBe(0x7bff);
  });
});

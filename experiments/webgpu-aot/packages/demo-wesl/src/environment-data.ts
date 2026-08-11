export const WESL_ENVIRONMENT_FACE_URLS = [
  "/textures/px.hdr",
  "/textures/nx.hdr",
  "/textures/py.hdr",
  "/textures/ny.hdr",
  "/textures/pz.hdr",
  "/textures/nz.hdr",
] as const;

export const WESL_ENVIRONMENT_SOURCE_SIZE = 256;

export interface HdrImage {
  readonly height: number;
  readonly pixels: Float32Array<ArrayBufferLike>;
  readonly width: number;
}

function nextLine(bytes: Uint8Array, cursor: { offset: number }): string {
  const start = cursor.offset;
  while (cursor.offset < bytes.length && bytes[cursor.offset] !== 10) {
    cursor.offset += 1;
  }
  if (cursor.offset >= bytes.length) {
    throw new Error("Radiance HDR header ended unexpectedly");
  }
  const end = cursor.offset;
  cursor.offset += 1;
  return new TextDecoder()
    .decode(bytes.subarray(start, end))
    .replace(/\r$/, "");
}

export function decodeRadianceHdr(source: ArrayBuffer): HdrImage {
  const bytes = new Uint8Array(source);
  const cursor = { offset: 0 };
  const signature = nextLine(bytes, cursor);
  if (signature !== "#?RADIANCE" && signature !== "#?RGBE") {
    throw new Error(`Unsupported Radiance HDR signature: ${signature}`);
  }

  let formatFound = false;
  for (;;) {
    const line = nextLine(bytes, cursor);
    if (line.length === 0) break;
    if (line === "FORMAT=32-bit_rle_rgbe") formatFound = true;
  }
  if (!formatFound) {
    throw new Error("Radiance HDR does not use 32-bit RLE RGBE encoding");
  }
  const resolution = nextLine(bytes, cursor).match(
    /^-Y\s+(\d+)\s+\+X\s+(\d+)$/,
  );
  if (resolution === null) {
    throw new Error(
      "Radiance HDR must use top-to-bottom, left-to-right scanlines",
    );
  }
  const height = Number(resolution[1]);
  const width = Number(resolution[2]);
  if (width < 8 || width > 32_767 || height < 1 || height > 32_767) {
    throw new Error(`Unsupported Radiance HDR dimensions ${width}x${height}`);
  }

  const scanline = new Uint8Array(width * 4);
  const pixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    if (cursor.offset + 4 > bytes.length) {
      throw new Error(`Radiance HDR scanline ${y} is truncated`);
    }
    const marker0 = bytes[cursor.offset++];
    const marker1 = bytes[cursor.offset++];
    const encodedWidth =
      (bytes[cursor.offset++] ?? 0) * 256 + (bytes[cursor.offset++] ?? 0);
    if (marker0 !== 2 || marker1 !== 2 || encodedWidth !== width) {
      throw new Error(`Radiance HDR scanline ${y} has an invalid RLE marker`);
    }

    for (let channel = 0; channel < 4; channel += 1) {
      let x = 0;
      while (x < width) {
        const count = bytes[cursor.offset++];
        if (count === undefined || count === 0) {
          throw new Error(
            `Radiance HDR scanline ${y} channel ${channel} is truncated`,
          );
        }
        if (count > 128) {
          const runLength = count - 128;
          const value = bytes[cursor.offset++];
          if (value === undefined || x + runLength > width) {
            throw new Error(
              `Radiance HDR scanline ${y} has an invalid RLE run`,
            );
          }
          const start = channel * width + x;
          scanline.fill(value, start, start + runLength);
          x += runLength;
        } else {
          if (cursor.offset + count > bytes.length || x + count > width) {
            throw new Error(
              `Radiance HDR scanline ${y} has an invalid literal run`,
            );
          }
          scanline.set(
            bytes.subarray(cursor.offset, cursor.offset + count),
            channel * width + x,
          );
          cursor.offset += count;
          x += count;
        }
      }
    }

    for (let x = 0; x < width; x += 1) {
      const exponent = scanline[3 * width + x] ?? 0;
      const scale = exponent === 0 ? 0 : 2 ** (exponent - 136);
      const target = (y * width + x) * 4;
      pixels[target] = (scanline[x] ?? 0) * scale;
      pixels[target + 1] = (scanline[width + x] ?? 0) * scale;
      pixels[target + 2] = (scanline[2 * width + x] ?? 0) * scale;
      pixels[target + 3] = 1;
    }
  }
  return { height, pixels, width };
}

export function validateWeslEnvironmentFaces(
  faces: readonly HdrImage[],
): number {
  if (faces.length !== WESL_ENVIRONMENT_FACE_URLS.length) {
    throw new Error(
      `WESL environment requires exactly six cube faces; received ${faces.length}`,
    );
  }
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    if (
      face === undefined ||
      face.width !== WESL_ENVIRONMENT_SOURCE_SIZE ||
      face.height !== WESL_ENVIRONMENT_SOURCE_SIZE ||
      face.pixels.length !==
        WESL_ENVIRONMENT_SOURCE_SIZE * WESL_ENVIRONMENT_SOURCE_SIZE * 4
    ) {
      const label = WESL_ENVIRONMENT_FACE_URLS[index] ?? `face ${index}`;
      throw new Error(
        `WESL environment ${label} must be a complete 256x256 RGBA face`,
      );
    }
  }
  return WESL_ENVIRONMENT_SOURCE_SIZE;
}

const floatBits = new Uint32Array(1);
const floatValue = new Float32Array(floatBits.buffer);

export function float32ToFloat16Bits(value: number): number {
  const finite = Number.isFinite(value) ? value : Math.sign(value) * 65_504;
  floatValue[0] = Math.max(-65_504, Math.min(65_504, finite || 0));
  const bits = floatBits[0] ?? 0;
  const sign = (bits >>> 16) & 0x8000;
  let exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  let mantissa = bits & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa = (mantissa | 0x800000) >>> (1 - exponent);
    return sign | ((mantissa + 0x1000) >>> 13);
  }
  if (exponent >= 31) return sign | 0x7bff;
  mantissa += 0x1000;
  if ((mantissa & 0x800000) !== 0) {
    mantissa = 0;
    exponent += 1;
    if (exponent >= 31) return sign | 0x7bff;
  }
  return sign | (exponent << 10) | (mantissa >>> 13);
}

export function rgba16FloatBytes(
  pixels: Float32Array<ArrayBufferLike>,
): Uint16Array<ArrayBuffer> {
  const encoded = new Uint16Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) {
    encoded[index] = float32ToFloat16Bits(pixels[index] ?? 0);
  }
  return encoded;
}

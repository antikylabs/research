import type { LoadingDisplay } from "./loading.js";
import {
  ANTIKY_ENVIRONMENT_FACE_URLS,
  buildAntikyEnvironmentMipChain,
  decodeRadianceHdr,
  encodeAntikyRgba16Float,
  validateAntikyEnvironmentFaces,
  type AntikyHdrImage,
} from "./environment-data.js";

export {
  ANTIKY_ENVIRONMENT_FACE_URLS,
  buildAntikyEnvironmentMipChain,
  decodeRadianceHdr,
  encodeAntikyRgba16Float,
  float32ToFloat16Bits,
  validateAntikyEnvironmentFaces,
  type AntikyHdrImage,
} from "./environment-data.js";

export interface AntikyEnvironment {
  readonly estimatedBytes: number;
  readonly mipLevelCount: number;
  readonly sampler: GPUSampler;
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  destroy(): void;
}

const COPY_DST_TEXTURE_USAGE = 0x02;
const TEXTURE_BINDING_USAGE = 0x04;

export function createAntikyEnvironment(
  device: GPUDevice,
  faces: readonly AntikyHdrImage[],
): AntikyEnvironment {
  const size = validateAntikyEnvironmentFaces(faces);
  const mipChains = faces.map(buildAntikyEnvironmentMipChain);
  const mipLevelCount = mipChains[0]?.length ?? 1;
  let texture: GPUTexture | undefined;
  try {
    texture = device.createTexture({
      label: "Antiky renderer-owned HDR environment cube",
      size: [size, size, 6],
      mipLevelCount,
      dimension: "2d",
      format: "rgba16float",
      usage: COPY_DST_TEXTURE_USAGE | TEXTURE_BINDING_USAGE,
    });

    let estimatedBytes = 0;
    for (let face = 0; face < mipChains.length; face += 1) {
      const levels = mipChains[face] ?? [];
      for (let mipLevel = 0; mipLevel < levels.length; mipLevel += 1) {
        const level = levels[mipLevel];
        if (level === undefined) continue;
        const encoded = encodeAntikyRgba16Float(level.pixels);
        device.queue.writeTexture(
          { texture, mipLevel, origin: [0, 0, face] },
          encoded,
          {
            bytesPerRow: level.width * 8,
            rowsPerImage: level.height,
          },
          [level.width, level.height, 1],
        );
        estimatedBytes += encoded.byteLength;
      }
    }

    const view = texture.createView({
      dimension: "cube",
      mipLevelCount,
    });
    const sampler = device.createSampler({
      label: "Antiky renderer-owned HDR environment sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      lodMaxClamp: mipLevelCount - 1,
    });
    let destroyed = false;
    return {
      estimatedBytes,
      mipLevelCount,
      sampler,
      texture,
      view,
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        texture?.destroy();
      },
    };
  } catch (error) {
    texture?.destroy();
    throw error;
  }
}

async function checkedFetch(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Unable to load Antiky environment ${url}: ${response.status}`,
    );
  }
  return response.arrayBuffer();
}

export async function loadAntikyEnvironment(
  device: GPUDevice,
  display?: LoadingDisplay,
): Promise<AntikyEnvironment> {
  display?.update({
    completed: 5,
    label: "Decoding six Antiky-owned HDR environment faces",
    total: 9,
  });
  const faces = await Promise.all(
    ANTIKY_ENVIRONMENT_FACE_URLS.map(async (url) =>
      decodeRadianceHdr(await checkedFetch(url)),
    ),
  );
  return createAntikyEnvironment(device, faces);
}

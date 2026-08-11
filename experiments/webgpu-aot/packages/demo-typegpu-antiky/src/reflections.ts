export const ANTIKY_REFLECTION_MIP_COUNT = 5;
export const ANTIKY_REFLECTION_FILTER_RADIUS = 3;
export const ANTIKY_RAW_REFLECTION_PASS_LABEL =
  "Antiky AOT raw full-resolution screen-space reflection trace";

export interface AntikyReflectionLevel {
  readonly height: number;
  readonly level: number;
  readonly settings: Float32Array<ArrayBuffer>;
  readonly spread: number;
  readonly width: number;
}

export interface AntikyReflectionPlan {
  readonly levels: readonly AntikyReflectionLevel[];
  readonly mipLevelCount: number;
  readonly passCount: number;
  readonly pyramidTextureBytes: number;
  readonly rawTextureBytes: number;
  readonly selectedTextureBytes: number;
  readonly settingsBytes: number;
  readonly textureBytes: number;
}

export function createAntikyReflectionPlan(
  width: number,
  height: number,
): AntikyReflectionPlan {
  if (
    !Number.isSafeInteger(width) ||
    width < 1 ||
    !Number.isSafeInteger(height) ||
    height < 1
  ) {
    throw new RangeError("Antiky reflection dimensions must be positive integers");
  }
  if (Math.max(width, height) < 2 ** (ANTIKY_REFLECTION_MIP_COUNT - 1)) {
    throw new RangeError("Antiky reflection dimensions require five mip levels");
  }

  const levels = Array.from(
    { length: ANTIKY_REFLECTION_MIP_COUNT },
    (_, level): AntikyReflectionLevel => {
      const spread = level;
      return {
        height: Math.max(1, Math.floor(height / 2 ** level)),
        level,
        settings: new Float32Array([1 / width, 1 / height, spread, 0]),
        spread,
        width: Math.max(1, Math.floor(width / 2 ** level)),
      };
    },
  );
  const rawTextureBytes = width * height * 8;
  const selectedTextureBytes = rawTextureBytes;
  const pyramidTextureBytes = levels.reduce(
    (total, level) => total + level.width * level.height * 8,
    0,
  );
  const settingsBytes = levels.length * 16;

  return {
    levels,
    mipLevelCount: levels.length,
    passCount: 1 + levels.length + 1,
    pyramidTextureBytes,
    rawTextureBytes,
    selectedTextureBytes,
    settingsBytes,
    textureBytes: rawTextureBytes + pyramidTextureBytes + selectedTextureBytes,
  };
}

export function createAntikyReflectionTextureDescriptors(
  width: number,
  height: number,
  usage: GPUTextureUsageFlags = 20,
): {
  readonly pyramid: GPUTextureDescriptor;
  readonly raw: GPUTextureDescriptor;
  readonly selected: GPUTextureDescriptor;
} {
  const plan = createAntikyReflectionPlan(width, height);
  const common = {
    format: "rgba16float" as const,
    size: [width, height] as const,
    usage,
  };
  return {
    raw: {
      ...common,
      label: "Antiky raw full-resolution screen-space reflection trace",
      mipLevelCount: 1,
    },
    pyramid: {
      ...common,
      label: "Antiky five-level reflection reconstruction pyramid",
      mipLevelCount: plan.mipLevelCount,
    },
    selected: {
      ...common,
      label: "Antiky roughness-selected reflection",
      mipLevelCount: 1,
    },
  };
}

export function createAntikyReflectionViews(
  raw: GPUTexture,
  pyramid: GPUTexture,
  selected: GPUTexture,
): {
  readonly pyramid: GPUTextureView;
  readonly raw: GPUTextureView;
  readonly selected: GPUTextureView;
} {
  return {
    raw: raw.createView(),
    pyramid: pyramid.createView(),
    selected: selected.createView(),
  };
}

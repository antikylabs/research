export const TYPEGPU_REFLECTION_MIP_COUNT = 5;
export const TYPEGPU_REFLECTION_FILTER_RADIUS = 3;

export interface TypeGpuReflectionLevel {
  readonly height: number;
  readonly level: number;
  readonly settings: Float32Array<ArrayBuffer>;
  readonly spread: number;
  readonly width: number;
}

export const TYPEGPU_REFLECTION_HIT_TRANSFER = {
  intensity: 0.7,
  luminanceWeights: [0.2126, 0.7152, 0.0722] as const,
  maxDistance: 100,
  maxLuminance: 10,
} as const;

export interface TypeGpuReflectionPlan {
  readonly levels: readonly TypeGpuReflectionLevel[];
  readonly mipLevelCount: number;
  readonly passCount: number;
  readonly textureBytes: number;
}

export function createTypeGpuReflectionPlan(
  width: number,
  height: number,
): TypeGpuReflectionPlan {
  if (
    !Number.isSafeInteger(width) || width < 1 ||
    !Number.isSafeInteger(height) || height < 1
  ) {
    throw new RangeError("TypeGPU reflection dimensions must be positive integers");
  }
  if (Math.max(width, height) < 2 ** (TYPEGPU_REFLECTION_MIP_COUNT - 1)) {
    throw new RangeError("TypeGPU reflection dimensions require five mip levels");
  }

  const levels = Array.from(
    { length: TYPEGPU_REFLECTION_MIP_COUNT },
    (_, level): TypeGpuReflectionLevel => ({
      height: Math.max(1, Math.floor(height / 2 ** level)),
      level,
      settings: new Float32Array([1 / width, 1 / height, level, 0]),
      spread: level,
      width: Math.max(1, Math.floor(width / 2 ** level)),
    }),
  );
  const fullResolutionBytes = width * height * 8;
  const pyramidBytes = levels.reduce(
    (total, level) => total + level.width * level.height * 8,
    0,
  );
  return {
    levels,
    mipLevelCount: levels.length,
    passCount: 1 + levels.length + 1,
    textureBytes: fullResolutionBytes * 2 + pyramidBytes,
  };
}

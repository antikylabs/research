export interface WeslReflectionLevel {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly spread: number;
}

export interface WeslReflectionPlan {
  readonly levels: readonly WeslReflectionLevel[];
  readonly mipLevelCount: number;
  readonly textureBytes: number;
}

export function createWeslReflectionPlan(
  width: number,
  height: number,
): WeslReflectionPlan {
  const levels = Array.from({ length: 5 }, (_, level) => ({
    level,
    width: Math.max(1, Math.floor(width / 2 ** level)),
    height: Math.max(1, Math.floor(height / 2 ** level)),
    spread: level,
  }));
  return {
    levels,
    mipLevelCount: levels.length,
    textureBytes: levels.reduce(
      (bytes, level) => bytes + level.width * level.height * 8,
      0,
    ),
  };
}

export function createWeslReflectionSettings(
  width: number,
  height: number,
  spread: number,
): Float32Array<ArrayBuffer> {
  return new Float32Array([1 / width, 1 / height, spread, 0]);
}

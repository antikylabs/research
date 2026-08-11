export const ANTIKY_BLOOM_LEVEL_COUNT = 5;
export const ANTIKY_BLOOM_BLUR_PASSES = ANTIKY_BLOOM_LEVEL_COUNT * 2;
export const ANTIKY_BLOOM_KERNEL_RADII = [6, 10, 14, 18, 22] as const;
export const ANTIKY_BLOOM_MAX_RADIUS = 22;
export const ANTIKY_BLOOM_WEIGHTS = [
  0.179496,
  0.143748,
  0.108,
  0.072252,
  0.036504,
] as const;

export type AntikyBloomStageKind = "extract" | "horizontal" | "vertical";

export interface AntikyBloomLevelPlan {
  readonly height: number;
  readonly level: number;
  readonly width: number;
}

export interface AntikyBloomStagePlan {
  readonly kind: AntikyBloomStageKind;
  readonly level: number | null;
  readonly settings: Float32Array<ArrayBuffer>;
  readonly source: string;
  readonly target: string;
}

export interface AntikyBloomPlan {
  readonly levels: readonly AntikyBloomLevelPlan[];
  readonly stages: readonly AntikyBloomStagePlan[];
  readonly textureBytes: number;
}

export function createAntikyBloomPlan(
  width: number,
  height: number,
): AntikyBloomPlan {
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0
  ) {
    throw new Error("Antiky bloom requires positive integer dimensions");
  }

  const levels = Array.from(
    { length: ANTIKY_BLOOM_LEVEL_COUNT },
    (_, level) => ({
      height: Math.max(1, Math.floor(height / 2 ** level)),
      level,
      width: Math.max(1, Math.floor(width / 2 ** level)),
    }),
  );
  const stages: AntikyBloomStagePlan[] = [
    {
      kind: "extract",
      level: null,
      settings: new Float32Array([1 / width, 1 / height, 0, 0]),
      source: "temporal",
      target: "bright",
    },
  ];
  for (const level of levels) {
    const radius = ANTIKY_BLOOM_KERNEL_RADII[level.level]!;
    stages.push(
      {
        kind: "horizontal",
        level: level.level,
        settings: new Float32Array([
          1 / level.width,
          1 / level.height,
          radius,
          0,
        ]),
        source: level.level === 0 ? "bright" : `vertical-${level.level - 1}`,
        target: `horizontal-${level.level}`,
      },
      {
        kind: "vertical",
        level: level.level,
        settings: new Float32Array([
          1 / level.width,
          1 / level.height,
          0,
          radius,
        ]),
        source: `horizontal-${level.level}`,
        target: `vertical-${level.level}`,
      },
    );
  }

  const firstLevel = levels[0]!;
  const textureBytes =
    firstLevel.width * firstLevel.height * 8 +
    levels.reduce(
      (bytes, level) => bytes + level.width * level.height * 8 * 2,
      0,
    );
  return { levels, stages, textureBytes };
}

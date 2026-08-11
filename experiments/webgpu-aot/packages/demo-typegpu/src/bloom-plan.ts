import {
  TYPEGPU_BLOOM_LEVEL_COUNT,
  TYPEGPU_BLOOM_KERNEL_RADII,
} from "./shaders/bloom.js";

export type TypeGpuBloomStageKind = "extract" | "horizontal" | "vertical";

export interface TypeGpuBloomLevelPlan {
  readonly height: number;
  readonly level: number;
  readonly width: number;
}

export interface TypeGpuBloomStagePlan {
  readonly kind: TypeGpuBloomStageKind;
  readonly level: number | null;
  readonly settings: Float32Array<ArrayBuffer>;
  readonly source: string;
  readonly target: string;
}

export interface TypeGpuBloomPlan {
  readonly levels: readonly TypeGpuBloomLevelPlan[];
  readonly stages: readonly TypeGpuBloomStagePlan[];
  readonly textureBytes: number;
}

export function createTypeGpuBloomPlan(
  width: number,
  height: number,
): TypeGpuBloomPlan {
  const levels = Array.from({ length: TYPEGPU_BLOOM_LEVEL_COUNT }, (_, level) => ({
    height: Math.max(1, Math.ceil(height / 2 ** level)),
    level,
    width: Math.max(1, Math.ceil(width / 2 ** level)),
  }));
  const stages: TypeGpuBloomStagePlan[] = [
    {
      kind: "extract",
      level: null,
      settings: new Float32Array([1 / width, 1 / height, 0, 0]),
      source: "hdr",
      target: "bright",
    },
  ];
  for (const level of levels) {
    const radius = TYPEGPU_BLOOM_KERNEL_RADII[level.level];
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
  const [firstLevel] = levels;
  const textureBytes =
    firstLevel.width * firstLevel.height * 8 +
    levels.reduce(
      (bytes, level) => bytes + level.width * level.height * 8 * 2,
      0,
    );
  return { levels, stages, textureBytes };
}

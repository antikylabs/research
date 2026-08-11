export const BROMETAL_BLOOM_THRESHOLD = 1;
export const BROMETAL_BLOOM_STRENGTH = 0.18;
export const BROMETAL_BLOOM_RADIUS = 0.0035;
export const BROMETAL_BLOOM_KERNEL_RADII = [6, 10, 14, 18, 22] as const;
export const BROMETAL_BLOOM_FACTORS = [1, 0.8, 0.6, 0.4, 0.2] as const;

export interface BroMetalBloomLevel {
  readonly height: number;
  readonly kernelRadius: number;
  readonly width: number;
}

export interface BroMetalBloomPlan {
  readonly compositeFactors: readonly number[];
  readonly levels: readonly BroMetalBloomLevel[];
}

export function createBroMetalBloomPlan(
  width: number,
  height: number,
): BroMetalBloomPlan {
  let levelWidth = Math.max(1, Math.floor(width * 0.5));
  let levelHeight = Math.max(1, Math.floor(height * 0.5));
  const levels = BROMETAL_BLOOM_KERNEL_RADII.map((kernelRadius) => {
    const level = { height: levelHeight, kernelRadius, width: levelWidth };
    levelWidth = Math.max(1, Math.floor(levelWidth * 0.5));
    levelHeight = Math.max(1, Math.floor(levelHeight * 0.5));
    return level;
  });
  const compositeFactors = BROMETAL_BLOOM_FACTORS.map(
    (factor) =>
      (1 - BROMETAL_BLOOM_RADIUS) * factor +
      BROMETAL_BLOOM_RADIUS * (1.2 - factor),
  );
  return { compositeFactors, levels };
}

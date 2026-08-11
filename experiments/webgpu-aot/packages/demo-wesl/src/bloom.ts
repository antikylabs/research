export const WESL_BLOOM_THRESHOLD = 1;
export const WESL_BLOOM_STRENGTH = 0.18;
export const WESL_BLOOM_RADIUS = 0.0035;
export const WESL_BLOOM_KERNEL_RADII = [6, 10, 14, 18, 22] as const;
export const WESL_BLOOM_FACTORS = [1, 0.8, 0.6, 0.4, 0.2] as const;

export function createWeslBloomPlan(width: number, height: number) {
  let levelWidth = Math.max(1, Math.floor(width * 0.5));
  let levelHeight = Math.max(1, Math.floor(height * 0.5));
  const levels = WESL_BLOOM_KERNEL_RADII.map((kernelRadius) => {
    const level = { height: levelHeight, kernelRadius, width: levelWidth };
    levelWidth = Math.max(1, Math.floor(levelWidth * 0.5));
    levelHeight = Math.max(1, Math.floor(levelHeight * 0.5));
    return level;
  });
  return { levels };
}

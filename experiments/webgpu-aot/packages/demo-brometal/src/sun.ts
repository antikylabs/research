export type BroMetalVector3 = readonly [number, number, number];

const normalize = (value: BroMetalVector3): BroMetalVector3 => {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
};

const subtract = (
  left: BroMetalVector3,
  right: BroMetalVector3,
): BroMetalVector3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
];

const SUN_POSITION = [0.1, 100, 0.1] as const;
const SUN_TARGET = [0, 2, 0] as const;

export const BROMETAL_CAMERA = {
  far: 100,
  fieldOfViewRadians: (70 * Math.PI) / 180,
  near: 0.1,
  position: [9.3, 3.4, -0.35] as const,
  target: [0, 2, 0] as const,
  up: [0, 1, 0] as const,
} as const;

export const BROMETAL_SUN = {
  color: [0.2156, 0.2627, 0.3333] as const,
  direction: normalize(subtract(SUN_POSITION, SUN_TARGET)),
  intensity: 2,
  position: SUN_POSITION,
  shadow: {
    biases: [-0.00015, -0.0003] as const,
    cascadeCount: 2,
    lightMargin: 20,
    normalBias: 0.015,
    resolution: 4096,
  },
  target: SUN_TARGET,
} as const;

export function broMetalWGSLFloat(value: number): string {
  const source = String(value);
  return source.includes(".") || source.includes("e") ? source : `${source}.0`;
}

export function broMetalWGSLVector3(value: BroMetalVector3): string {
  return `vec3f(${value.map(broMetalWGSLFloat).join(", ")})`;
}

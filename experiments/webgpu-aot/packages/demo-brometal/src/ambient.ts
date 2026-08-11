export const BROMETAL_AMBIENT_OCCLUSION_SAMPLES = 16;
export const BROMETAL_AMBIENT_OCCLUSION_STRENGTH = 6;

export interface BroMetalAmbientPlan {
  readonly estimatedBytes: number;
  readonly format: "r8unorm";
  readonly height: number;
  readonly label: "BroMetal full-resolution ambient occlusion";
  readonly width: number;
}

export function createBroMetalAmbientPlan(
  width: number,
  height: number,
): BroMetalAmbientPlan {
  if (
    !Number.isSafeInteger(width) || width < 1 ||
    !Number.isSafeInteger(height) || height < 1
  ) {
    throw new RangeError("BroMetal ambient dimensions must be positive integers");
  }
  return {
    estimatedBytes: width * height,
    format: "r8unorm",
    height,
    label: "BroMetal full-resolution ambient occlusion",
    width,
  };
}

export function createBroMetalAmbientSettings(
  width: number,
  height: number,
): Float32Array<ArrayBuffer> {
  if (
    !Number.isSafeInteger(width) || width < 1 ||
    !Number.isSafeInteger(height) || height < 1
  ) {
    throw new RangeError("BroMetal ambient settings are invalid");
  }
  return new Float32Array([
    width,
    height,
    Math.max(2, width / 640),
    BROMETAL_AMBIENT_OCCLUSION_STRENGTH,
  ]);
}

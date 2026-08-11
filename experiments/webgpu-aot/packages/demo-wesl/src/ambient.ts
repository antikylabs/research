export const WESL_AMBIENT_OCCLUSION_SAMPLES = 16;
export const WESL_AMBIENT_OCCLUSION_STRENGTH = 6;

export function createWeslAmbientSettings(
  width: number,
  height: number,
): Float32Array<ArrayBuffer> {
  return new Float32Array([
    width,
    height,
    Math.max(2, width / 640),
    WESL_AMBIENT_OCCLUSION_STRENGTH,
  ]);
}

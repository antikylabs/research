import { mat4 } from "wgpu-matrix";

import {
  createWeslSunLightingValues,
  createWeslSunPlan,
  WESL_CAMERA,
  WESL_SUN,
} from "./sun.js";

const MODEL = mat4.multiply(
  mat4.translation([0, 2, 0]),
  mat4.scaling([0.008, 0.008, 0.008]),
);

function frameValues(
  viewProjection: Float32Array,
  camera: readonly [number, number, number],
  settings: readonly [number, number, number, number],
): Float32Array<ArrayBuffer> {
  const values = new Float32Array(40);
  values.set(viewProjection, 0);
  values.set(MODEL, 16);
  values.set([...camera, 1], 32);
  values.set(settings, 36);
  return values;
}

export function createWeslFrameValues(
  width: number,
  height: number,
  lights: number,
): {
  readonly farShadow: Float32Array<ArrayBuffer>;
  readonly forward: Float32Array<ArrayBuffer>;
  readonly nearShadow: Float32Array<ArrayBuffer>;
  readonly sunLighting: Float32Array<ArrayBuffer>;
} {
  const aspect = width / height;
  const sunPlan = createWeslSunPlan(aspect);
  const projection = mat4.perspective(
    WESL_CAMERA.fieldOfViewRadians,
    aspect,
    WESL_CAMERA.near,
    WESL_CAMERA.far,
  );
  const view = mat4.lookAt(
    WESL_CAMERA.position,
    WESL_CAMERA.target,
    WESL_CAMERA.up,
  );

  return {
    forward: frameValues(mat4.multiply(projection, view), WESL_CAMERA.position, [
      lights,
      width,
      height,
      0,
    ]),
    nearShadow: frameValues(
      sunPlan.cascades[0].viewProjection,
      WESL_SUN.position,
      [0, WESL_SUN.shadow.resolution, 0, 0],
    ),
    farShadow: frameValues(
      sunPlan.cascades[1].viewProjection,
      WESL_SUN.position,
      [1, WESL_SUN.shadow.resolution, 0, 0],
    ),
    sunLighting: createWeslSunLightingValues(sunPlan),
  };
}

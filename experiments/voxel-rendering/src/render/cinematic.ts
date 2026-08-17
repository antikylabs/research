import type { CameraSnapshot } from '../camera/types.ts';
import type { Vec3Tuple, VoxelScene } from '../scene/types.ts';

function normalize(vector: Vec3Tuple): Vec3Tuple {
  const magnitude = Math.hypot(...vector);
  if (magnitude < 1e-8) throw new Error('Cinematic matrix received a zero-length direction.');
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

function cross(left: Vec3Tuple, right: Vec3Tuple): Vec3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(left: Vec3Tuple, right: Vec3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function multiply(left: readonly number[], right: readonly number[]): Float32Array<ArrayBuffer> {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += left[index * 4 + row]! * right[column * 4 + index]!;
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

export function createSunViewProjection(
  scene: VoxelScene,
  sunDirection: Vec3Tuple,
): Float32Array<ArrayBuffer> {
  const center: Vec3Tuple = [
    (scene.bounds.min[0] + scene.bounds.max[0]) * 0.5,
    (scene.bounds.min[1] + scene.bounds.max[1]) * 0.5,
    (scene.bounds.min[2] + scene.bounds.max[2]) * 0.5,
  ];
  const direction = normalize(sunDirection);
  const diagonal = Math.hypot(...scene.dimensions);
  const position: Vec3Tuple = [
    center[0] + direction[0] * diagonal,
    center[1] + direction[1] * diagonal,
    center[2] + direction[2] * diagonal,
  ];
  const forward = normalize([
    center[0] - position[0],
    center[1] - position[1],
    center[2] - position[2],
  ]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = normalize(cross(right, forward));
  const view = [
    right[0], up[0], -forward[0], 0,
    right[1], up[1], -forward[1], 0,
    right[2], up[2], -forward[2], 0,
    -dot(right, position), -dot(up, position), dot(forward, position), 1,
  ];
  const halfSpan = diagonal * 0.58;
  const near = 0.1;
  const far = diagonal * 2.25;
  const orthographic = [
    1 / halfSpan, 0, 0, 0,
    0, 1 / halfSpan, 0, 0,
    0, 0, 1 / (near - far), 0,
    0, 0, near / (near - far), 1,
  ];
  return multiply(orthographic, view);
}

export function cameraFocusDistance(camera: CameraSnapshot): number {
  return Math.hypot(
    camera.target[0] - camera.position[0],
    camera.target[1] - camera.position[1],
    camera.target[2] - camera.position[2],
  );
}

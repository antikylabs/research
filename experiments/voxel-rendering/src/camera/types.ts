import type { Vec3Tuple } from '../scene/types.ts';

export type CameraSnapshot = Readonly<{
  position: Vec3Tuple;
  target: Vec3Tuple;
  forward: Vec3Tuple;
  right: Vec3Tuple;
  up: Vec3Tuple;
  viewProjection: Float32Array<ArrayBuffer>;
  verticalFovRadians: number;
  revision: number;
}>;


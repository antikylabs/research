import type { Vec3Tuple } from '../scene/types.ts';
import type { CameraSnapshot } from './types.ts';

type OrbitCameraOptions = Readonly<{
  target?: Vec3Tuple;
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  yaw?: number;
  pitch?: number;
  verticalFovRadians?: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(vector: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
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

export class OrbitCamera {
  private readonly initial: Required<OrbitCameraOptions>;
  private distanceValue: number;
  private yawValue: number;
  private pitchValue: number;
  private revisionValue = 0;

  constructor(options: OrbitCameraOptions = {}) {
    this.initial = Object.freeze({
      target: options.target ?? ([0, 23, 18] as const),
      distance: options.distance ?? 118,
      minDistance: options.minDistance ?? 35,
      maxDistance: options.maxDistance ?? 360,
      yaw: options.yaw ?? 0.42,
      pitch: options.pitch ?? 0.14,
      verticalFovRadians: options.verticalFovRadians ?? Math.PI / 3.3,
    });
    this.distanceValue = clamp(this.initial.distance, this.initial.minDistance, this.initial.maxDistance);
    this.yawValue = this.initial.yaw;
    this.pitchValue = clamp(this.initial.pitch, -1.45, 1.45);
  }

  get revision(): number {
    return this.revisionValue;
  }

  orbit(deltaYaw: number, deltaPitch: number): void {
    if (deltaYaw === 0 && deltaPitch === 0) return;
    const nextPitch = clamp(this.pitchValue + deltaPitch, -1.45, 1.45);
    const nextYaw = this.yawValue + deltaYaw;
    if (nextPitch === this.pitchValue && nextYaw === this.yawValue) return;
    this.pitchValue = nextPitch;
    this.yawValue = nextYaw;
    this.revisionValue += 1;
  }

  zoom(delta: number): void {
    const next = clamp(this.distanceValue + delta, this.initial.minDistance, this.initial.maxDistance);
    if (next === this.distanceValue) return;
    this.distanceValue = next;
    this.revisionValue += 1;
  }

  reset(): void {
    if (
      this.distanceValue === this.initial.distance
      && this.yawValue === this.initial.yaw
      && this.pitchValue === this.initial.pitch
    ) return;
    this.distanceValue = this.initial.distance;
    this.yawValue = this.initial.yaw;
    this.pitchValue = this.initial.pitch;
    this.revisionValue += 1;
  }

  snapshot(aspect: number): CameraSnapshot {
    const horizontal = Math.cos(this.pitchValue) * this.distanceValue;
    const target = this.initial.target;
    const position = [
      target[0] + Math.sin(this.yawValue) * horizontal,
      target[1] + Math.sin(this.pitchValue) * this.distanceValue,
      target[2] + Math.cos(this.yawValue) * horizontal,
    ] as const;
    const forward = normalize([
      target[0] - position[0], target[1] - position[1], target[2] - position[2],
    ]);
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = normalize(cross(right, forward));
    const view = [
      right[0], up[0], -forward[0], 0,
      right[1], up[1], -forward[1], 0,
      right[2], up[2], -forward[2], 0,
      -dot(right, position), -dot(up, position), dot(forward, position), 1,
    ];
    const near = 0.1;
    const far = 600;
    const f = 1 / Math.tan(this.initial.verticalFovRadians / 2);
    const projection = [
      f / Math.max(aspect, 0.01), 0, 0, 0,
      0, f, 0, 0,
      0, 0, far / (near - far), -1,
      0, 0, (near * far) / (near - far), 0,
    ];
    return Object.freeze({
      position,
      target,
      forward,
      right,
      up,
      viewProjection: multiply(projection, view),
      verticalFovRadians: this.initial.verticalFovRadians,
      revision: this.revisionValue,
    });
  }
}

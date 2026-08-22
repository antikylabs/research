import type { Vec3Tuple } from '../scene/types.ts';
import type { CameraSnapshot } from './types.ts';

export type FlyMovement = Readonly<{
  forward: number;
  right: number;
  up: number;
}>;

type FlyCameraOptions = Readonly<{
  position?: Vec3Tuple;
  yaw?: number;
  pitch?: number;
  verticalFovRadians?: number;
  movementSpeed?: number;
  targetDistance?: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(vector: Vec3Tuple): Vec3Tuple {
  const magnitude = Math.hypot(...vector);
  if (magnitude < 1e-9) return [0, 0, 0];
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

function direction(yaw: number, pitch: number): Vec3Tuple {
  const horizontal = Math.cos(pitch);
  return normalize([
    Math.sin(yaw) * horizontal,
    Math.sin(pitch),
    -Math.cos(yaw) * horizontal,
  ]);
}

/** Host-owned free camera used consistently by every rendering approach. */
export class FlyCamera {
  readonly #initial: Required<FlyCameraOptions>;
  #position: [number, number, number];
  #yaw: number;
  #pitch: number;
  #revision = 0;

  constructor(options: FlyCameraOptions = {}) {
    this.#initial = Object.freeze({
      position: options.position ?? ([48, 40, 124] as const),
      yaw: options.yaw ?? -0.42,
      pitch: clamp(options.pitch ?? -0.14, -1.553, 1.553),
      verticalFovRadians: options.verticalFovRadians ?? Math.PI / 3.3,
      movementSpeed: Math.max(0.01, options.movementSpeed ?? 42),
      targetDistance: Math.max(1, options.targetDistance ?? 118),
    });
    this.#position = [...this.#initial.position];
    this.#yaw = this.#initial.yaw;
    this.#pitch = this.#initial.pitch;
  }

  get revision(): number {
    return this.#revision;
  }

  look(deltaYaw: number, deltaPitch: number): void {
    if (!Number.isFinite(deltaYaw) || !Number.isFinite(deltaPitch)) return;
    const nextYaw = this.#yaw + deltaYaw;
    const nextPitch = clamp(this.#pitch + deltaPitch, -1.553, 1.553);
    if (nextYaw === this.#yaw && nextPitch === this.#pitch) return;
    this.#yaw = nextYaw;
    this.#pitch = nextPitch;
    this.#revision += 1;
  }

  move(movement: FlyMovement, deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const local = normalize([movement.right, movement.up, movement.forward]);
    if (local[0] === 0 && local[1] === 0 && local[2] === 0) return;
    const forward = direction(this.#yaw, this.#pitch);
    const right = normalize(cross(forward, [0, 1, 0]));
    const distance = this.#initial.movementSpeed * deltaSeconds;
    this.#position = [
      this.#position[0] + (right[0] * local[0] + forward[0] * local[2]) * distance,
      this.#position[1] + (local[1] + forward[1] * local[2]) * distance,
      this.#position[2] + (right[2] * local[0] + forward[2] * local[2]) * distance,
    ];
    this.#revision += 1;
  }

  reset(): void {
    const unchanged = this.#position.every((value, index) => value === this.#initial.position[index])
      && this.#yaw === this.#initial.yaw
      && this.#pitch === this.#initial.pitch;
    if (unchanged) return;
    this.#position = [...this.#initial.position];
    this.#yaw = this.#initial.yaw;
    this.#pitch = this.#initial.pitch;
    this.#revision += 1;
  }

  snapshot(aspect: number): CameraSnapshot {
    const forward = direction(this.#yaw, this.#pitch);
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = normalize(cross(right, forward));
    const position = Object.freeze([...this.#position] as [number, number, number]);
    const target: Vec3Tuple = [
      position[0] + forward[0] * this.#initial.targetDistance,
      position[1] + forward[1] * this.#initial.targetDistance,
      position[2] + forward[2] * this.#initial.targetDistance,
    ];
    const view = [
      right[0], up[0], -forward[0], 0,
      right[1], up[1], -forward[1], 0,
      right[2], up[2], -forward[2], 0,
      -dot(right, position), -dot(up, position), dot(forward, position), 1,
    ];
    const near = 0.1;
    const far = 1200;
    const f = 1 / Math.tan(this.#initial.verticalFovRadians / 2);
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
      verticalFovRadians: this.#initial.verticalFovRadians,
      revision: this.#revision,
    });
  }
}

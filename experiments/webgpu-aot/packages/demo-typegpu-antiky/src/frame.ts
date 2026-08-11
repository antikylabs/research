import { mat4 } from "wgpu-matrix";

import { ANTIKY_CAMERA, createAntikySunPlan } from "./sun.js";

export function createFrameValues(
  width: number,
  height: number,
  lightCount: number,
): {
  readonly farShadow: Float32Array<ArrayBuffer>;
  readonly forward: Float32Array<ArrayBuffer>;
  readonly nearShadow: Float32Array<ArrayBuffer>;
} {
  const projection = mat4.perspective(
    ANTIKY_CAMERA.fieldOfViewRadians,
    width / height,
    ANTIKY_CAMERA.near,
    ANTIKY_CAMERA.far,
  );
  const view = mat4.lookAt(
    ANTIKY_CAMERA.position,
    ANTIKY_CAMERA.target,
    ANTIKY_CAMERA.up,
  );
  const viewProjection = mat4.multiply(projection, view);
  const model = mat4.multiply(
    mat4.translation([0, 2, 0]),
    mat4.scaling([0.008, 0.008, 0.008]),
  );
  const sun = createAntikySunPlan(width / height);
  const nearViewProjection = sun.cascades[0].viewProjection;
  const farViewProjection = sun.cascades[1].viewProjection;

  const forward = new Float32Array(72);
  forward.set(viewProjection, 0);
  forward.set(model, 16);
  forward.set(nearViewProjection, 32);
  forward.set(farViewProjection, 48);
  forward.set([...ANTIKY_CAMERA.position, 1], 64);
  forward.set([lightCount, width, height, 0], 68);

  const nearShadow = new Float32Array(32);
  nearShadow.set(nearViewProjection, 0);
  nearShadow.set(model, 16);
  const farShadow = new Float32Array(32);
  farShadow.set(farViewProjection, 0);
  farShadow.set(model, 16);
  return { farShadow, forward, nearShadow };
}

export function staticBuffer(
  device: GPUDevice,
  label: string,
  values: Float32Array<ArrayBuffer>,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const buffer = device.createBuffer({
    label,
    size: values.byteLength,
    usage: usage | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, values);
  return buffer;
}

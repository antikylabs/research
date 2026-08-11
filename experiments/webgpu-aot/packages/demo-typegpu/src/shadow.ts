import type { TgpuRoot } from "typegpu";

import type { TypeGpuPrimitive } from "./scene.js";
import {
  createTypeGpuShadowPipeline,
  shadowLayout,
} from "./shaders/shadow.js";
import {
  createTypeGpuSunPlan,
  TYPEGPU_SHADOW_CASCADE_COUNT,
  TYPEGPU_SHADOW_RESOLUTION,
  type TypeGpuSunPlan,
} from "./sun.js";

export {
  createTypeGpuSunPlan,
  TYPEGPU_SHADOW_CASCADE_COUNT,
  TYPEGPU_SHADOW_RESOLUTION,
} from "./sun.js";

export interface TypeGpuShadowCascadeResources {
  readonly bindGroup: GPUBindGroup;
  readonly buffer: GPUBuffer;
  readonly map: GPUTexture;
  readonly view: GPUTextureView;
}

export interface TypeGpuShadowResources {
  readonly backPipeline: GPURenderPipeline;
  readonly cascades: readonly [
    TypeGpuShadowCascadeResources,
    TypeGpuShadowCascadeResources,
  ];
  readonly doublePipeline: GPURenderPipeline;
  readonly estimatedBytes: number;
  readonly plan: TypeGpuSunPlan;
  readonly sampler: GPUSampler;
  destroy(): void;
}

function encodeCascade(
  encoder: GPUCommandEncoder,
  primitives: readonly TypeGpuPrimitive[],
  resources: TypeGpuShadowResources,
  cascade: TypeGpuShadowCascadeResources,
  index: number,
): void {
  const name = index === 0 ? "near" : "far";
  const pass = encoder.beginRenderPass({
    label: `TypeGPU 103-primitive ${name} directional shadow cascade`,
    colorAttachments: [],
    depthStencilAttachment: {
      view: cascade.view,
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });
  pass.setBindGroup(0, cascade.bindGroup);
  let activePipeline: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided
      ? resources.doublePipeline
      : resources.backPipeline;
    if (pipeline !== activePipeline) {
      pass.setPipeline(pipeline);
      activePipeline = pipeline;
    }
    pass.setVertexBuffer(0, primitive.position.buffer);
    pass.setIndexBuffer(
      primitive.indexBuffer,
      "uint16",
      primitive.indexOffset,
    );
    pass.drawIndexed(primitive.indexCount);
  }
  pass.end();
}

export function encodeTypeGpuShadowPass(
  encoder: GPUCommandEncoder,
  primitives: readonly TypeGpuPrimitive[],
  resources: TypeGpuShadowResources,
): void {
  resources.cascades.forEach((cascade, index) => {
    encodeCascade(encoder, primitives, resources, cascade, index);
  });
}

export function createTypeGpuShadowResources(
  root: TgpuRoot,
  model: Float32Array,
  aspect: number,
): TypeGpuShadowResources {
  const device = root.device;
  const plan = createTypeGpuSunPlan(aspect);
  const allocatedBuffers: GPUBuffer[] = [];
  const allocatedTextures: GPUTexture[] = [];
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    for (const buffer of allocatedBuffers) buffer.destroy();
    for (const texture of allocatedTextures) texture.destroy();
  };
  const createCascade = (
    index: 0 | 1,
  ): TypeGpuShadowCascadeResources => {
    const cascade = plan.cascades[index];
    const name = index === 0 ? "near" : "far";
    const values = new Float32Array(32);
    values.set(cascade.viewProjection, 0);
    values.set(model, 16);
    const buffer = device.createBuffer({
      label: `TypeGPU ${name} shadow frame uniform`,
      size: values.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    allocatedBuffers.push(buffer);
    device.queue.writeBuffer(buffer, 0, values);
    const map = device.createTexture({
      label: `TypeGPU ${name} fitted directional shadow map`,
      size: [TYPEGPU_SHADOW_RESOLUTION, TYPEGPU_SHADOW_RESOLUTION],
      format: "depth32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    allocatedTextures.push(map);
    const group = root.createBindGroup(shadowLayout, { frame: buffer });
    return {
      bindGroup: root.unwrap(group),
      buffer,
      map,
      view: map.createView(),
    };
  };

  try {
    const cascades = [createCascade(0), createCascade(1)] as const;
    const backPipeline = root.unwrap(
      createTypeGpuShadowPipeline(root, "back"),
    );
    const doublePipeline = root.unwrap(
      createTypeGpuShadowPipeline(root, "none"),
    );
    const sampler = device.createSampler({
      label: "TypeGPU cascaded shadow comparison sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      compare: "less-equal",
    });
    return {
      backPipeline,
      cascades,
      destroy,
      doublePipeline,
      estimatedBytes:
        TYPEGPU_SHADOW_CASCADE_COUNT *
          TYPEGPU_SHADOW_RESOLUTION *
          TYPEGPU_SHADOW_RESOLUTION *
          4 +
        cascades.length * 32 * Float32Array.BYTES_PER_ELEMENT,
      plan,
      sampler,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}

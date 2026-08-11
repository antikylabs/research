import type { BroMetalPrimitive } from "./scene.js";

interface DynamicBufferWrite {
  readonly buffer: GPUBuffer;
  readonly values: Float32Array<ArrayBuffer>;
}

export interface BroMetalDynamicBufferWrites {
  readonly frame: DynamicBufferWrite;
  readonly lights: DynamicBufferWrite;
  readonly particles: DynamicBufferWrite;
  readonly temporal: DynamicBufferWrite;
}

export function writeBroMetalDynamicBuffers(
  queue: GPUQueue,
  writes: BroMetalDynamicBufferWrites,
): void {
  for (const { buffer, values } of [
    writes.frame,
    writes.lights,
    writes.particles,
    writes.temporal,
  ]) {
    queue.writeBuffer(buffer, 0, values);
  }
}

export function encodeBroMetalGeometryPass(
  pass: GPURenderPassEncoder,
  primitives: readonly BroMetalPrimitive[],
  frameBindGroup: GPUBindGroup,
  backPipeline: GPURenderPipeline,
  doublePipeline: GPURenderPipeline,
): void {
  pass.setBindGroup(0, frameBindGroup);
  let activePipeline: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided
      ? doublePipeline
      : backPipeline;
    if (pipeline !== activePipeline) {
      pass.setPipeline(pipeline);
      activePipeline = pipeline;
    }
    pass.setBindGroup(1, primitive.material.bindGroup);
    pass.setVertexBuffer(0, primitive.positions.buffer, primitive.positions.offset);
    pass.setVertexBuffer(1, primitive.normals.buffer, primitive.normals.offset);
    pass.setVertexBuffer(2, primitive.texcoords.buffer, primitive.texcoords.offset);
    pass.setVertexBuffer(3, primitive.tangents.buffer, primitive.tangents.offset);
    pass.setIndexBuffer(primitive.indexBuffer, "uint16", primitive.indexOffset);
    pass.drawIndexed(primitive.indexCount);
  }
}

export function encodeBroMetalBloomPass(
  encoder: GPUCommandEncoder,
  label: string,
  target: GPUTexture,
  pipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
): void {
  const pass = encoder.beginRenderPass({
    label,
    colorAttachments: [
      {
        view: target.createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}

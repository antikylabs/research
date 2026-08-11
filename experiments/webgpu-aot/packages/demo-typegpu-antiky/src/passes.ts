import type { AntikyPrimitive } from "./scene.js";

export function encodeAntikyShadowPass(
  pass: GPURenderPassEncoder,
  backPipeline: GPURenderPipeline,
  doublePipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
  primitives: readonly AntikyPrimitive[],
): void {
  pass.setBindGroup(0, bindGroup);
  let active: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided
      ? doublePipeline
      : backPipeline;
    if (pipeline !== active) {
      pass.setPipeline(pipeline);
      active = pipeline;
    }
    pass.setVertexBuffer(0, primitive.position.buffer, primitive.position.offset);
    pass.setIndexBuffer(primitive.indexBuffer, "uint16", primitive.indexOffset);
    pass.drawIndexed(primitive.indexCount);
  }
}

export function encodeAntikyForwardPass(
  pass: GPURenderPassEncoder,
  primitives: readonly AntikyPrimitive[],
  sceneBindGroup: GPUBindGroup,
  backPipeline: GPURenderPipeline,
  doublePipeline: GPURenderPipeline,
): void {
  pass.setBindGroup(0, sceneBindGroup);
  let active: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided
      ? doublePipeline
      : backPipeline;
    if (pipeline !== active) {
      pass.setPipeline(pipeline);
      active = pipeline;
    }
    pass.setBindGroup(1, primitive.material.bindGroup);
    pass.setVertexBuffer(0, primitive.position.buffer, primitive.position.offset);
    pass.setVertexBuffer(1, primitive.normal.buffer, primitive.normal.offset);
    pass.setVertexBuffer(2, primitive.texcoord.buffer, primitive.texcoord.offset);
    pass.setIndexBuffer(primitive.indexBuffer, "uint16", primitive.indexOffset);
    pass.drawIndexed(primitive.indexCount);
  }
}

export function encodeAntikyBloomPass(
  encoder: GPUCommandEncoder,
  label: string,
  target: GPUTexture,
  pipeline: GPURenderPipeline,
  group: GPUBindGroup,
  viewDescriptor?: GPUTextureViewDescriptor,
): void {
  const pass = encoder.beginRenderPass({
    label,
    colorAttachments: [
      {
        view: target.createView(viewDescriptor),
        clearValue: [0, 0, 0, 1],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.draw(3);
  pass.end();
}

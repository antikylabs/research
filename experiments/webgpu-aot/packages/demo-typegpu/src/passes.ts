import tgpu from "typegpu";

import type { TypeGpuPrimitive } from "./scene.js";

export function drawTypeGpuScene(
  pass: GPURenderPassEncoder,
  primitives: readonly TypeGpuPrimitive[],
  root: ReturnType<typeof tgpu.initFromDevice>,
  frameBindGroup: GPUBindGroup,
  backPipeline: GPURenderPipeline,
  doublePipeline: GPURenderPipeline,
): void {
  pass.setBindGroup(0, frameBindGroup);
  let active: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided
      ? doublePipeline
      : backPipeline;
    if (pipeline !== active) {
      pass.setPipeline(pipeline);
      active = pipeline;
    }
    pass.setBindGroup(1, root.unwrap(primitive.material.bindGroup));
    pass.setVertexBuffer(0, primitive.position.buffer);
    pass.setVertexBuffer(1, primitive.normal.buffer);
    pass.setVertexBuffer(2, primitive.texcoord.buffer);
    pass.setIndexBuffer(primitive.indexBuffer, "uint16", primitive.indexOffset);
    pass.drawIndexed(primitive.indexCount);
  }
}

export function encodeTypeGpuBloomPass(
  encoder: GPUCommandEncoder,
  label: string,
  target: GPUTexture,
  pipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
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
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}

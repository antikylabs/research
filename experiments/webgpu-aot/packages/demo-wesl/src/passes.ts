import type { WeslPrimitive } from "./scene.js";

export function encodeWeslBackgroundPass(
  pass: GPURenderPassEncoder,
  environment: GPUBindGroup,
  pipeline: GPURenderPipeline,
): void {
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, environment);
  pass.draw(3);
}

export function encodeWeslDepthPass(
  pass: GPURenderPassEncoder,
  primitives: readonly WeslPrimitive[],
  frame: GPUBindGroup,
  backPipeline: GPURenderPipeline,
  doublePipeline: GPURenderPipeline,
): void {
  pass.setBindGroup(0, frame);
  let active: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided ? doublePipeline : backPipeline;
    if (pipeline !== active) {
      pass.setPipeline(pipeline);
      active = pipeline;
    }
    pass.setBindGroup(1, primitive.material.depthBindGroup);
    pass.setVertexBuffer(0, primitive.position.buffer, primitive.position.offset);
    pass.setVertexBuffer(1, primitive.texcoord.buffer, primitive.texcoord.offset);
    pass.setIndexBuffer(primitive.indexBuffer, "uint16", primitive.indexOffset);
    pass.drawIndexed(primitive.indexCount);
  }
}

export function encodeWeslForwardPass(
  pass: GPURenderPassEncoder,
  primitives: readonly WeslPrimitive[],
  frame: GPUBindGroup,
  environment: GPUBindGroup,
  backPipeline: GPURenderPipeline,
  doublePipeline: GPURenderPipeline,
): void {
  pass.setBindGroup(0, frame);
  pass.setBindGroup(2, environment);
  let active: GPURenderPipeline | undefined;
  for (const primitive of primitives) {
    const pipeline = primitive.material.doubleSided ? doublePipeline : backPipeline;
    if (pipeline !== active) {
      pass.setPipeline(pipeline);
      active = pipeline;
    }
    pass.setBindGroup(1, primitive.material.forwardBindGroup);
    pass.setVertexBuffer(0, primitive.position.buffer, primitive.position.offset);
    pass.setVertexBuffer(1, primitive.normal.buffer, primitive.normal.offset);
    pass.setVertexBuffer(2, primitive.texcoord.buffer, primitive.texcoord.offset);
    pass.setVertexBuffer(3, primitive.tangent.buffer, primitive.tangent.offset);
    pass.setIndexBuffer(primitive.indexBuffer, "uint16", primitive.indexOffset);
    pass.drawIndexed(primitive.indexCount);
  }
}

export function encodeWeslFullscreenPass(
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

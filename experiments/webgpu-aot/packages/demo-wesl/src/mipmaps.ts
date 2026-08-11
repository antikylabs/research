export interface WeslMipmapLevel {
  readonly height: number;
  readonly level: number;
  readonly width: number;
}

export function createWeslMipmapPlan(
  width: number,
  height: number,
): readonly WeslMipmapLevel[] {
  const levels: WeslMipmapLevel[] = [];
  let level = 1;
  let levelWidth = Math.max(1, Math.floor(width / 2));
  let levelHeight = Math.max(1, Math.floor(height / 2));
  while (levelWidth < width || levelHeight < height) {
    levels.push({ level, width: levelWidth, height: levelHeight });
    width = levelWidth;
    height = levelHeight;
    level += 1;
    levelWidth = Math.max(1, Math.floor(width / 2));
    levelHeight = Math.max(1, Math.floor(height / 2));
  }
  return levels;
}

export function weslMipmappedTextureBytes(
  width: number,
  height: number,
): number {
  return createWeslMipmapPlan(width, height).reduce(
    (bytes, level) => bytes + level.width * level.height * 4,
    width * height * 4,
  );
}

export function encodeWeslMipmaps(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  texture: GPUTexture,
  plan: readonly WeslMipmapLevel[],
  sampler: GPUSampler,
  layout: GPUBindGroupLayout,
  pipeline: GPURenderPipeline,
): void {
  for (const level of plan) {
    const source = texture.createView({
      baseMipLevel: level.level - 1,
      mipLevelCount: 1,
    });
    const target = texture.createView({
      baseMipLevel: level.level,
      mipLevelCount: 1,
    });
    const bindGroup = device.createBindGroup({
      label: `WESL material mip ${level.level} group`,
      layout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: source },
      ],
    });
    const pass = encoder.beginRenderPass({
      label: `WESL material mip ${level.level} pass`,
      colorAttachments: [
        {
          view: target,
          clearValue: [0, 0, 0, 0],
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
}

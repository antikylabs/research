export const BROMETAL_TEMPORAL_JITTER_COUNT = 31;

function assertTemporalInputs(
  frameIndex: number,
  width: number,
  height: number,
): void {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("BroMetal temporal frame index must be a non-negative integer");
  }
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0
  ) {
    throw new Error("BroMetal temporal dimensions must be positive integers");
  }
}

function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let remaining = index;
  while (remaining > 0) {
    fraction /= base;
    result += fraction * (remaining % base);
    remaining = Math.floor(remaining / base);
  }
  return result;
}

export function broMetalTemporalJitter(
  frameIndex: number,
  width: number,
  height: number,
): readonly [number, number] {
  assertTemporalInputs(frameIndex, width, height);
  const cycleIndex = frameIndex % BROMETAL_TEMPORAL_JITTER_COUNT;
  const sampleIndex = cycleIndex + 1;
  const offsetX = halton(sampleIndex, 2) - 0.5;
  const offsetY = halton(sampleIndex, 3) - 0.5;
  const jitterX = offsetX === 0 ? 0 : -2 * offsetX / width;
  return [jitterX, 2 * offsetY / height];
}

export function writeBroMetalTemporalFrame(
  frame: Float32Array,
  baseViewProjection: Float32Array,
  width: number,
  height: number,
  frameIndex: number,
): void {
  if (frame.length < 40) {
    throw new Error("BroMetal forward frame requires 40 floats");
  }
  if (baseViewProjection.length !== 16) {
    throw new Error("BroMetal temporal base view-projection requires 16 floats");
  }
  const [jitterX, jitterY] = broMetalTemporalJitter(
    frameIndex,
    width,
    height,
  );
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const clipW = baseViewProjection[offset + 3]!;
    frame[offset] = baseViewProjection[offset]! + jitterX * clipW;
    frame[offset + 1] = baseViewProjection[offset + 1]! + jitterY * clipW;
    frame[offset + 2] = baseViewProjection[offset + 2]!;
    frame[offset + 3] = clipW;
  }
}

export function createBroMetalTemporalSettings(
  width: number,
  height: number,
  frameIndex: number,
): Float32Array<ArrayBuffer> {
  assertTemporalInputs(frameIndex, width, height);
  return new Float32Array([
    width,
    height,
    frameIndex === 0 ? 0 : 1,
    frameIndex,
  ]);
}

export function broMetalTemporalHistoryIndices(
  frameIndex: number,
): readonly [read: number, write: number] {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("BroMetal temporal frame index must be a non-negative integer");
  }
  const read = frameIndex % 2;
  return [read, 1 - read];
}

export interface BroMetalTemporalResources {
  readonly bindGroups: readonly [GPUBindGroup, GPUBindGroup];
  readonly estimatedBytes: number;
  readonly histories: readonly [GPUTexture, GPUTexture];
  readonly pipeline: GPURenderPipeline;
  readonly settingsBuffer: GPUBuffer;
}

export async function createBroMetalTemporalResources(
  device: GPUDevice,
  module: GPUShaderModule,
  currentHdr: GPUTexture,
  ambient: GPUTexture,
  width: number,
  height: number,
): Promise<BroMetalTemporalResources> {
  const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const histories = [0, 1].map((index) => device.createTexture({
    label: `BroMetal temporal history ${index}`,
    size: [width, height],
    format: "rgba16float",
    usage,
  })) as [GPUTexture, GPUTexture];
  const settingsBuffer = device.createBuffer({
    label: "BroMetal temporal settings",
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  const layout = device.createBindGroupLayout({
    label: "BroMetal temporal layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
    ],
  });
  const pipeline = await device.createRenderPipelineAsync({
    label: "BroMetal AOT temporal resolve pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: "temporalVertex" },
    fragment: { module, entryPoint: "temporalFragment", targets: [{ format: "rgba16float" }] },
    primitive: { topology: "triangle-list" },
  });
  const bindGroups = histories.map((history, index) => device.createBindGroup({
    label: `BroMetal temporal read ${index} bind group`,
    layout,
    entries: [
      { binding: 0, resource: currentHdr.createView() },
      { binding: 1, resource: history.createView() },
      { binding: 2, resource: ambient.createView() },
      { binding: 3, resource: { buffer: settingsBuffer } },
    ],
  })) as [GPUBindGroup, GPUBindGroup];
  return {
    bindGroups,
    estimatedBytes: width * height * 8 * 2 + 16,
    histories,
    pipeline,
    settingsBuffer,
  };
}

export function encodeBroMetalTemporalPass(
  encoder: GPUCommandEncoder,
  resources: BroMetalTemporalResources,
  frameIndex: number,
): number {
  const [read, write] = broMetalTemporalHistoryIndices(frameIndex);
  const pass = encoder.beginRenderPass({
    label: "BroMetal temporal resolve pass",
    colorAttachments: [{
      view: resources.histories[write].createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: "clear",
      storeOp: "store",
    }],
  });
  pass.setPipeline(resources.pipeline);
  pass.setBindGroup(0, resources.bindGroups[read]);
  pass.draw(3);
  pass.end();
  return write;
}

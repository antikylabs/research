import { encodeWeslDepthPass } from "./passes.js";
import type { WeslPipelines } from "./pipelines.js";
import type { WorkloadProfileName } from "./profile.js";
import type { WeslPrimitive } from "./scene.js";
import { WESL_SUN } from "./sun.js";

export const WESL_SHADOW_CASCADE_COUNT = WESL_SUN.shadow.cascadeCount;
export const WESL_SHADOW_RESOLUTION = WESL_SUN.shadow.resolution;

interface WeslShadowCascade {
  readonly frameBuffer: GPUBuffer;
  readonly frameGroup: GPUBindGroup;
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
}

export interface WeslShadowResources {
  destroy(): void;
  readonly estimatedBytes: number;
  readonly far: WeslShadowCascade;
  readonly lightingBuffer: GPUBuffer;
  readonly near: WeslShadowCascade;
  readonly sampler: GPUSampler;
}

export function shadowResolutionForProfile(
  _profileName: WorkloadProfileName,
): number {
  return WESL_SHADOW_RESOLUTION;
}

function createCascade(
  device: GPUDevice,
  label: string,
  resolution: number,
  layout: GPUBindGroupLayout,
  values: Float32Array<ArrayBuffer>,
  trackedBuffers: GPUBuffer[],
  trackedTextures: GPUTexture[],
): WeslShadowCascade {
  const frameBuffer = device.createBuffer({
    label: `${label} frame uniform`,
    size: values.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  trackedBuffers.push(frameBuffer);
  device.queue.writeBuffer(frameBuffer, 0, values);
  const frameGroup = device.createBindGroup({
    label: `${label} frame group`,
    layout,
    entries: [{ binding: 0, resource: { buffer: frameBuffer } }],
  });
  const texture = device.createTexture({
    label: `${label} depth map`,
    size: [resolution, resolution],
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  trackedTextures.push(texture);
  return { frameBuffer, frameGroup, texture, view: texture.createView() };
}

export function createWeslShadowResources(
  device: GPUDevice,
  pipelines: WeslPipelines,
  profileName: WorkloadProfileName,
  nearValues: Float32Array<ArrayBuffer>,
  farValues: Float32Array<ArrayBuffer>,
  lightingValues: Float32Array<ArrayBuffer>,
): WeslShadowResources {
  const resolution = shadowResolutionForProfile(profileName);
  const trackedBuffers: GPUBuffer[] = [];
  const trackedTextures: GPUTexture[] = [];
  try {
    const near = createCascade(
      device,
      "WESL near fitted directional cascade",
      resolution,
      pipelines.depthFrameLayout,
      nearValues,
      trackedBuffers,
      trackedTextures,
    );
    const far = createCascade(
      device,
      "WESL far fitted directional cascade",
      resolution,
      pipelines.depthFrameLayout,
      farValues,
      trackedBuffers,
      trackedTextures,
    );
    const lightingBuffer = device.createBuffer({
      label: "WESL fitted cascaded sun lighting uniform",
      size: lightingValues.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    trackedBuffers.push(lightingBuffer);
    device.queue.writeBuffer(lightingBuffer, 0, lightingValues);
    const sampler = device.createSampler({
      label: "WESL fitted cascade comparison sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      compare: "less-equal",
    });
    let destroyed = false;
    return {
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        for (const buffer of trackedBuffers) buffer.destroy();
        for (const texture of trackedTextures) texture.destroy();
      },
      estimatedBytes:
        WESL_SHADOW_CASCADE_COUNT * resolution * resolution * 4 +
        nearValues.byteLength +
        farValues.byteLength +
        lightingValues.byteLength,
      far,
      lightingBuffer,
      near,
      sampler,
    };
  } catch (error) {
    for (const buffer of trackedBuffers) buffer.destroy();
    for (const texture of trackedTextures) texture.destroy();
    throw error;
  }
}

function encodeCascade(
  encoder: GPUCommandEncoder,
  label: string,
  primitives: readonly WeslPrimitive[],
  cascade: WeslShadowCascade,
  pipelines: WeslPipelines,
): void {
  const pass = encoder.beginRenderPass({
    label,
    colorAttachments: [],
    depthStencilAttachment: {
      view: cascade.view,
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });
  encodeWeslDepthPass(
    pass,
    primitives,
    cascade.frameGroup,
    pipelines.shadowBack,
    pipelines.shadowDouble,
  );
  pass.end();
}

export function encodeWeslShadowPasses(
  encoder: GPUCommandEncoder,
  primitives: readonly WeslPrimitive[],
  resources: WeslShadowResources,
  pipelines: WeslPipelines,
): void {
  encodeCascade(
    encoder,
    "WESL 103-draw near directional cascade",
    primitives,
    resources.near,
    pipelines,
  );
  encodeCascade(
    encoder,
    "WESL 103-draw far directional cascade",
    primitives,
    resources.far,
    pipelines,
  );
}

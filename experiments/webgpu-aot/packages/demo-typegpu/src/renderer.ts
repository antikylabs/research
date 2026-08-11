import tgpu, { common } from "typegpu";
import { mat4 } from "wgpu-matrix";

import { createTypeGpuBloomPlan } from "./bloom-plan.js";
import { loadTypeGpuEnvironment } from "./environment.js";
import { createTypeGpuLightRig } from "./light-rig.js";
import type { LoadingDisplay } from "./loading.js";
import { createTypeGpuReflectionPlan } from "./reflections.js";
import {
  drawTypeGpuScene,
  encodeTypeGpuBloomPass,
} from "./passes.js";
import {
  createTypeGpuBackgroundPipeline,
  createTypeGpuForwardPipeline,
} from "./pipelines.js";
import type { WorkloadProfileName } from "./profile.js";
import { WORKLOAD_PROFILES } from "./profile.js";
import {
  createTypeGpuRendererLifetime,
  type TypeGpuRendererLifetime,
} from "./renderer-lifetime.js";
import { loadTypeGpuScene } from "./scene.js";
import {
  createTypeGpuShadowResources,
  encodeTypeGpuShadowPass,
} from "./shadow.js";
import {
  ambientFragment,
  ambientLayout,
  TYPEGPU_AMBIENT_OCCLUSION_STRENGTH,
} from "./shaders/ambient.js";
import {
  bloomFragment,
  bloomLayout,
  bloomVertex,
} from "./shaders/bloom.js";
import {
  materialLayout,
  sceneLayout,
  TYPEGPU_BACKGROUND_ENVIRONMENT_GAIN,
  TYPEGPU_ENVIRONMENT_MAX_MIP,
  TYPEGPU_IBL_DIFFUSE_GAIN,
  TYPEGPU_IBL_SPECULAR_GAIN,
} from "./shaders/forward.js";
import {
  particleFragment,
  particleRenderLayout,
  particleVertex,
  TYPEGPU_PARTICLE_COUNT,
  TYPEGPU_SIMULATED_LIGHT_COUNT,
} from "./shaders/particles.js";
import {
  compositeFragment,
  compositeLayout,
  TYPEGPU_COMPOSITE_EXPOSURE,
} from "./shaders/composite.js";
import {
  reflectionFragment,
  reflectionLayout,
} from "./shaders/reflection.js";
import {
  reflectionReconstructFragment,
  reflectionReconstructLayout,
  reflectionSelectFragment,
  reflectionSelectLayout,
} from "./shaders/reflection-reconstruct.js";
import {
  temporalFragment,
  temporalLayout,
} from "./shaders/temporal.js";
import {
  countTypeGpuIndexedGeometryDraws,
  type WorkloadTelemetry,
} from "./telemetry.js";
import {
  createTypeGpuTemporalSettings,
  typeGpuTemporalHistoryIndices,
  writeTypeGpuTemporalFrame,
} from "./temporal.js";
import {
  TYPEGPU_CAMERA,
  type TypeGpuSunPlan,
} from "./sun.js";
interface RunningTypeGpuRenderer {
  stop(): void;
}
function createFrameValues(
  width: number,
  height: number,
  lights: number,
  model: Float32Array,
  sunPlan: TypeGpuSunPlan,
): Float32Array<ArrayBuffer> {
  const projection = mat4.perspective(
    TYPEGPU_CAMERA.fieldOfViewRadians,
    width / height,
    TYPEGPU_CAMERA.near,
    TYPEGPU_CAMERA.far,
  );
  const view = mat4.lookAt(
    TYPEGPU_CAMERA.position,
    TYPEGPU_CAMERA.target,
    TYPEGPU_CAMERA.up,
  );
  const viewProjection = mat4.multiply(projection, view);
  const inverseViewProjection = mat4.inverse(viewProjection);
  const values = new Float32Array(92);
  values.set(viewProjection, 0);
  values.set(model, 16);
  values.set(sunPlan.cascades[0].viewProjection, 32);
  values.set(sunPlan.cascades[1].viewProjection, 48);
  values.set(inverseViewProjection, 64);
  values.set([...TYPEGPU_CAMERA.position, 1], 80);
  values.set([lights, width, height, 0], 84);
  values.set(
    [
      TYPEGPU_ENVIRONMENT_MAX_MIP,
      TYPEGPU_IBL_DIFFUSE_GAIN,
      TYPEGPU_IBL_SPECULAR_GAIN,
      TYPEGPU_BACKGROUND_ENVIRONMENT_GAIN,
    ],
    88,
  );
  return values;
}
function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB tracked`;
}
export async function startTypeGpuRenderer(
  canvas: HTMLCanvasElement,
  profileName: WorkloadProfileName,
  display: LoadingDisplay,
  telemetry: WorkloadTelemetry,
): Promise<RunningTypeGpuRenderer> {
  const profile = WORKLOAD_PROFILES[profileName];
  if (navigator.gpu === undefined) throw new Error("WebGPU is unavailable in this browser");
  display.update({ done: 1, message: "Requesting the TypeGPU runtime device", total: 8 });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (adapter === null) throw new Error("No WebGPU adapter is available");
  const device = await adapter.requestDevice();
  const root = tgpu.initFromDevice({ device, unstable_names: "strict" });
  const lifetime = createTypeGpuRendererLifetime(root);
  try {
    return await continueTypeGpuRendererStartup(
      canvas,
      profileName,
      display,
      telemetry,
      profile,
      device,
      root,
      lifetime,
    );
  } catch (error) {
    return lifetime.fail(error);
  }
}

async function continueTypeGpuRendererStartup(
  canvas: HTMLCanvasElement,
  profileName: WorkloadProfileName,
  display: LoadingDisplay,
  telemetry: WorkloadTelemetry,
  profile: (typeof WORKLOAD_PROFILES)[WorkloadProfileName],
  device: GPUDevice,
  root: ReturnType<typeof tgpu.initFromDevice>,
  lifetime: TypeGpuRendererLifetime,
): Promise<RunningTypeGpuRenderer> {
  const format = navigator.gpu.getPreferredCanvasFormat();
  canvas.width = profile.width;
  canvas.height = profile.height;
  const context = root.configureContext({ canvas, format, alphaMode: "opaque" });

  display.update({ done: 2, message: "Resolving TGSL render and compute functions", total: 8 });
  const forwardBack = createTypeGpuForwardPipeline(root, "back", profile.sampleCount);
  const forwardDouble = createTypeGpuForwardPipeline(root, "none", profile.sampleCount);
  const backgroundPipeline = createTypeGpuBackgroundPipeline(root, profile.sampleCount);
  const particlePipeline = root
    .createRenderPipeline({
      vertex: particleVertex,
      fragment: particleFragment,
      targets: {
        format: "rgba16float",
        blend: {
          color: {
            operation: "add",
            srcFactor: "src-alpha",
            dstFactor: "one",
          },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
        },
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      multisample: { count: profile.sampleCount },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: false,
        depthCompare: "less-equal",
      },
    })
    .$name("TypeGPU typed emissive particle pipeline");
  const bloomPipeline = root
    .createRenderPipeline({
      vertex: bloomVertex,
      fragment: bloomFragment,
      targets: { format: "rgba16float" },
      primitive: { topology: "triangle-list", cullMode: "none" },
    })
    .$name("TypeGPU runtime thirteen-tap Gaussian bloom");
  const reflectionPipeline = root
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: reflectionFragment,
      targets: { format: "rgba16float" },
      primitive: { topology: "triangle-list", cullMode: "none" },
    })
    .$name("TypeGPU runtime screen-space reflection trace");
  const reflectionReconstructPipeline = root
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: reflectionReconstructFragment,
      targets: { format: "rgba16float" },
      primitive: { topology: "triangle-list", cullMode: "none" },
    })
    .$name("TypeGPU runtime reflection reconstruction");
  const reflectionSelectPipeline = root
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: reflectionSelectFragment,
      targets: { format: "rgba16float" },
      primitive: { topology: "triangle-list", cullMode: "none" },
    })
    .$name("TypeGPU runtime roughness reflection selection");
  const ambientPipeline = root
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: ambientFragment,
      targets: { format: "r8unorm" },
      primitive: { topology: "triangle-list", cullMode: "none" },
    })
    .$name("TypeGPU runtime world-space ambient occlusion");
  const temporalPipeline = root
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: temporalFragment,
      targets: { format: "rgba16float" },
      primitive: { topology: "triangle-list", cullMode: "none" },
    })
    .$name("TypeGPU runtime temporal resolve");
  const compositePipeline = root
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: compositeFragment,
      targets: { format },
      primitive: { topology: "triangle-list" },
    })
    .$name("TypeGPU runtime HDR composite");

  telemetry.status = "loading";
  const scene = await loadTypeGpuScene(root, display);
  const environment = await loadTypeGpuEnvironment(device, display);
  telemetry.assetsReadyAt = performance.now();
  display.update({
    done: 5,
    message: "Compiling fitted cascades and allocating render targets",
    total: 8,
  });

  const model = mat4.multiply(
    mat4.translation([0, 2, 0]),
    mat4.scaling([0.008, 0.008, 0.008]),
  );
  const shadows = lifetime.ownShadows(
    createTypeGpuShadowResources(
      root,
      model,
      profile.width / profile.height,
    ),
  );
  const hdr = device.createTexture({
    label: "TypeGPU HDR color",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const surface = device.createTexture({
    label: "TypeGPU normal and roughness",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const worldMetal = device.createTexture({
    label: "TypeGPU world position and metallic",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const ambientTarget = device.createTexture({
    label: "TypeGPU full-resolution world-space ambient occlusion",
    size: [profile.width, profile.height],
    format: "r8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const depth = device.createTexture({
    label: "TypeGPU forward depth",
    size: [profile.width, profile.height],
    sampleCount: profile.sampleCount,
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const bloomPlan = createTypeGpuBloomPlan(profile.width, profile.height);
  const bloomBright = device.createTexture({
    label: "TypeGPU bloom bright extraction",
    size: [bloomPlan.levels[0].width, bloomPlan.levels[0].height],
    format: "rgba16float",
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const bloomLevels = bloomPlan.levels.map((level) => ({
    horizontal: device.createTexture({
      label: `TypeGPU bloom level ${level.level} horizontal`,
      size: [level.width, level.height],
      format: "rgba16float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }),
    vertical: device.createTexture({
      label: `TypeGPU bloom level ${level.level} vertical`,
      size: [level.width, level.height],
      format: "rgba16float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }),
  }));
  const bloomTextures = new Map<string, GPUTexture>([
    ["hdr", hdr],
    ["bright", bloomBright],
  ]);
  for (const [index, level] of bloomLevels.entries()) {
    bloomTextures.set(`horizontal-${index}`, level.horizontal);
    bloomTextures.set(`vertical-${index}`, level.vertical);
  }
  const bloomTexture = (name: string): GPUTexture => {
    const texture = bloomTextures.get(name);
    if (texture === undefined) {
      throw new Error(`Unknown TypeGPU bloom texture ${name}`);
    }
    return texture;
  };
  const reflectionPlan = createTypeGpuReflectionPlan(profile.width, profile.height);
  const reflectionUsage =
    GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const rawReflection = device.createTexture({
    label: "TypeGPU raw full-resolution screen-space reflection trace",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: reflectionUsage,
  });
  const reflectionPyramid = device.createTexture({
    label: "TypeGPU five-level reflection reconstruction pyramid",
    size: [profile.width, profile.height],
    format: "rgba16float",
    mipLevelCount: reflectionPlan.mipLevelCount,
    usage: reflectionUsage,
  });
  const selectedReflection = device.createTexture({
    label: "TypeGPU roughness-selected reflection",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: reflectionUsage,
  });
  const temporalTargets = [0, 1].map((index) =>
    device.createTexture({
      label: `TypeGPU temporal resolve target ${index}`,
      size: [profile.width, profile.height],
      format: "rgba16float",
      usage: reflectionUsage,
    }),
  );

  const frameValues = createFrameValues(
    profile.width,
    profile.height,
    profile.lights,
    model,
    shadows.plan,
  );
  const baseViewProjection = frameValues.slice(0, 16);
  const frameBuffer = device.createBuffer({
    label: "TypeGPU camera, model, and fitted-cascade frame uniform",
    size: frameValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(frameBuffer, 0, frameValues);
  const lightRig = createTypeGpuLightRig();
  const { lightValues, particleValues } = lightRig;
  const lightBuffer = device.createBuffer({
    label: "TypeGPU Mutable Light Struct Array",
    size: lightValues.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(lightBuffer, 0, lightValues);
  const particleBuffer = device.createBuffer({
    label: "TypeGPU CPU-authored 406-particle storage",
    size: particleValues.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuffer, 0, particleValues);
  const compositeValues = new Float32Array([
    0,
    TYPEGPU_COMPOSITE_EXPOSURE,
    profile.width,
    profile.height,
  ]);
  const compositeBuffer = device.createBuffer({
    label: "TypeGPU Composite Settings Uniform",
    size: compositeValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(compositeBuffer, 0, compositeValues);
  const temporalValues = createTypeGpuTemporalSettings(
    profile.width,
    profile.height,
    0,
  );
  const temporalBuffer = device.createBuffer({
    label: "TypeGPU temporal resolve settings",
    size: temporalValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(temporalBuffer, 0, temporalValues);
  const bloomSettings = bloomPlan.stages.map((stage, index) => {
    const buffer = device.createBuffer({
      label: `TypeGPU bloom ${stage.kind} stage ${index} settings`,
      size: stage.settings.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(buffer, 0, stage.settings);
    return buffer;
  });
  const reflectionLevelSettings = reflectionPlan.levels.map((level) => {
    const buffer = device.createBuffer({
      label: `TypeGPU reflection mip ${level.level} settings`,
      size: level.settings.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(buffer, 0, level.settings);
    return buffer;
  });
  const ambientValues = new Float32Array([
    profile.width,
    profile.height,
    Math.max(2, profile.width / 640),
    TYPEGPU_AMBIENT_OCCLUSION_STRENGTH,
  ]);
  const ambientBuffer = device.createBuffer({
    label: "TypeGPU ambient-occlusion settings",
    size: ambientValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(ambientBuffer, 0, ambientValues);
  const bloomSampler = device.createSampler({
    label: "TypeGPU runtime bloom sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });
  const reflectionSampler = device.createSampler({
    label: "TypeGPU trilinear reflection sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  });

  const sceneBindGroup = root.createBindGroup(sceneLayout, {
    frame: frameBuffer,
    lights: lightBuffer,
    nearShadow: shadows.cascades[0].view,
    farShadow: shadows.cascades[1].view,
    shadowSampler: shadows.sampler,
    environmentMap: environment.view,
    environmentSampler: environment.sampler,
  });
  const particleRenderBindGroup = root.createBindGroup(particleRenderLayout, {
    frame: frameBuffer,
    particles: particleBuffer,
  });
  const bloomExtractionGroups = temporalTargets.map((target) =>
    root.createBindGroup(bloomLayout, {
      source: target.createView(),
      reflection: selectedReflection.createView(),
      sampler: bloomSampler,
      settings: bloomSettings[0],
    }),
  );
  const bloomBlurBindGroups = bloomPlan.stages.slice(1).map((stage, index) =>
    root.createBindGroup(bloomLayout, {
      source: bloomTexture(stage.source).createView(),
      reflection: selectedReflection.createView(),
      sampler: bloomSampler,
      settings: bloomSettings[index + 1],
    }),
  );
  const bloomStageTargets = bloomPlan.stages.map((stage) =>
    bloomTexture(stage.target),
  );
  const reflectionBindGroup = root.createBindGroup(reflectionLayout, {
    hdr: hdr.createView(),
    surface: surface.createView(),
    worldMetal: worldMetal.createView(),
    frame: frameBuffer,
    sampler: bloomSampler,
  });
  const ambientBindGroup = root.createBindGroup(ambientLayout, {
    depth: depth.createView(),
    normal: surface.createView(),
    settings: ambientBuffer,
  });
  const reflectionLevelBindGroups = reflectionPlan.levels.map((level) =>
    root.createBindGroup(reflectionReconstructLayout, {
      rawReflection: rawReflection.createView(),
      sampler: reflectionSampler,
      settings: reflectionLevelSettings[level.level],
    }),
  );
  const reflectionSelectBindGroup = root.createBindGroup(reflectionSelectLayout, {
    reflection: reflectionPyramid.createView(),
    surface: surface.createView(),
    sampler: reflectionSampler,
  });
  const temporalBindGroups = temporalTargets.map((history) =>
    root.createBindGroup(temporalLayout, {
      currentHdr: hdr.createView(),
      currentAmbient: ambientTarget.createView(),
      history: history.createView(),
      settings: temporalBuffer,
    }),
  );
  const compositeBindGroups = temporalTargets.map((target) =>
    root.createBindGroup(compositeLayout, {
      hdr: target.createView(),
      bloomLevel0: bloomLevels[0].vertical.createView(),
      bloomLevel1: bloomLevels[1].vertical.createView(),
      bloomLevel2: bloomLevels[2].vertical.createView(),
      bloomLevel3: bloomLevels[3].vertical.createView(),
      bloomLevel4: bloomLevels[4].vertical.createView(),
      reflection: selectedReflection.createView(),
      bloomSampler,
      settings: compositeBuffer,
    }),
  );

  display.update({ done: 7, message: "Finalizing thirteen typed GPU pipelines", total: 8 });
  const rawBackgroundPipeline = root.unwrap(backgroundPipeline);
  const rawForwardBack = root.unwrap(forwardBack);
  const rawForwardDouble = root.unwrap(forwardDouble);
  const rawParticlePipeline = root.unwrap(particlePipeline);
  const rawBloomPipeline = root.unwrap(bloomPipeline);
  const rawReflectionPipeline = root.unwrap(reflectionPipeline);
  const rawReflectionReconstructPipeline = root.unwrap(reflectionReconstructPipeline);
  const rawReflectionSelectPipeline = root.unwrap(reflectionSelectPipeline);
  const rawAmbientPipeline = root.unwrap(ambientPipeline);
  const rawTemporalPipeline = root.unwrap(temporalPipeline);
  const rawCompositePipeline = root.unwrap(compositePipeline);
  const rawSceneGroup = root.unwrap(sceneBindGroup);
  const rawParticleRenderGroup = root.unwrap(particleRenderBindGroup);
  const rawBloomExtractionGroups = bloomExtractionGroups.map((group) =>
    root.unwrap(group),
  );
  const rawBloomBlurGroups = bloomBlurBindGroups.map((group) =>
    root.unwrap(group),
  );
  const rawReflectionGroup = root.unwrap(reflectionBindGroup);
  const rawAmbientGroup = root.unwrap(ambientBindGroup);
  const rawReflectionLevelGroups = reflectionLevelBindGroups.map((group) =>
    root.unwrap(group),
  );
  const rawReflectionSelectGroup = root.unwrap(reflectionSelectBindGroup);
  const rawTemporalGroups = temporalBindGroups.map((group) => root.unwrap(group));
  const rawCompositeGroups = compositeBindGroups.map((group) => root.unwrap(group));

  const trackedBytes =
    scene.bytes +
    environment.bytes +
    shadows.estimatedBytes +
    profile.width * profile.height * (8 + 8 + 8 + 4 + 1 + 8 * 2) +
    reflectionPlan.textureBytes +
    bloomPlan.textureBytes +
    lightValues.byteLength +
    particleValues.byteLength;
  let frameIndex = 0;
  let previousTime: number | undefined;
  let fps = 0;
  let stopped = false;
  let animationFrame = 0;

  device.lost.then((info) => {
    stopped = true;
    telemetry.status = "error";
    telemetry.error = `WebGPU device lost: ${info.message}`;
    display.fail(telemetry.error);
  });

  const render = (timeMs: number): void => {
    if (stopped) return;
    const cpuStart = performance.now();
    lightRig.updateFrame(frameIndex);
    writeTypeGpuTemporalFrame(
      frameValues,
      baseViewProjection,
      profile.width,
      profile.height,
      frameIndex,
    );
    temporalValues[2] = frameIndex === 0 ? 0 : 1;
    temporalValues[3] = frameIndex;
    device.queue.writeBuffer(frameBuffer, 0, frameValues);
    device.queue.writeBuffer(lightBuffer, 0, lightValues);
    device.queue.writeBuffer(particleBuffer, 0, particleValues);
    device.queue.writeBuffer(temporalBuffer, 0, temporalValues);
    const [historyRead, historyWrite] =
      typeGpuTemporalHistoryIndices(frameIndex);

    const encoder = device.createCommandEncoder({ label: "TypeGPU native frame encoder" });
    encodeTypeGpuShadowPass(encoder, scene.primitives, shadows);

    const forwardPass = encoder.beginRenderPass({
      label: "TypeGPU 103-primitive forward PBR pass",
      colorAttachments: [
        {
          view: hdr.createView(),
          clearValue: [0.006, 0.008, 0.015, 1],
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: surface.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: worldMetal.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    forwardPass.setPipeline(rawBackgroundPipeline);
    forwardPass.setBindGroup(0, rawSceneGroup);
    forwardPass.draw(3);
    drawTypeGpuScene(
      forwardPass,
      scene.primitives,
      root,
      rawSceneGroup,
      rawForwardBack,
      rawForwardDouble,
    );
    forwardPass.end();

    const particlePass = encoder.beginRenderPass({
      label: "TypeGPU 406-instance emissive particle pass",
      colorAttachments: [
        {
          view: hdr.createView(),
          loadOp: "load",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthLoadOp: "load",
        depthStoreOp: "store",
      },
    });
    particlePass.setPipeline(rawParticlePipeline);
    particlePass.setBindGroup(0, rawParticleRenderGroup);
    particlePass.draw(6, TYPEGPU_PARTICLE_COUNT);
    particlePass.end();

    encodeTypeGpuBloomPass(
      encoder,
      "TypeGPU runtime world-space ambient-occlusion pass",
      ambientTarget,
      rawAmbientPipeline,
      rawAmbientGroup,
    );
    encodeTypeGpuBloomPass(
      encoder,
      "TypeGPU runtime temporal resolve pass",
      temporalTargets[historyWrite],
      rawTemporalPipeline,
      rawTemporalGroups[historyRead],
    );

    encodeTypeGpuBloomPass(
      encoder,
      "TypeGPU runtime screen-space reflection trace",
      rawReflection,
      rawReflectionPipeline,
      rawReflectionGroup,
    );
    for (const level of reflectionPlan.levels) {
      encodeTypeGpuBloomPass(
        encoder,
        `TypeGPU runtime reflection reconstruction mip ${level.level}`,
        reflectionPyramid,
        rawReflectionReconstructPipeline,
        rawReflectionLevelGroups[level.level],
        { baseMipLevel: level.level, mipLevelCount: 1 },
      );
    }
    encodeTypeGpuBloomPass(
      encoder,
      "TypeGPU runtime roughness-selected reflection",
      selectedReflection,
      rawReflectionSelectPipeline,
      rawReflectionSelectGroup,
    );

    for (let index = 0; index < bloomPlan.stages.length; index += 1) {
      const stage = bloomPlan.stages[index];
      encodeTypeGpuBloomPass(
        encoder,
        stage.kind === "extract"
          ? "TypeGPU runtime bloom bright extraction"
          : `TypeGPU runtime bloom level ${stage.level} ${stage.kind}`,
        bloomStageTargets[index],
        rawBloomPipeline,
        stage.kind === "extract"
          ? rawBloomExtractionGroups[historyWrite]
          : rawBloomBlurGroups[index - 1],
      );
    }

    const compositePass = encoder.beginRenderPass({
      label: "TypeGPU runtime Gaussian-bloom composite pass",
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    compositePass.setPipeline(rawCompositePipeline);
    compositePass.setBindGroup(0, rawCompositeGroups[historyWrite]);
    compositePass.draw(3);
    compositePass.end();
    device.queue.submit([encoder.finish()]);

    if (previousTime !== undefined) {
      const current = 1000 / Math.max(timeMs - previousTime, 0.001);
      fps = fps === 0 ? current : fps * 0.9 + current * 0.1;
    }
    previousTime = timeMs;
    telemetry.firstFrameAt ??= performance.now();
    telemetry.status = "ready";
    telemetry.latestFrame = {
      frameIndex,
      cpuTimeMs: performance.now() - cpuStart,
      fps,
      lights: TYPEGPU_SIMULATED_LIGHT_COUNT,
      visibleMeshes: scene.primitives.length,
      totalMeshes: scene.primitives.length,
      vram: formatBytes(trackedBytes),
    };
    if (frameIndex < 3 || frameIndex % 30 === 0) {
      display.ready(
        `TypeGPU runtime · ${profileName} ${profile.width}×${profile.height} · ` +
          `${countTypeGpuIndexedGeometryDraws(scene.primitives.length)} indexed draws · ${TYPEGPU_PARTICLE_COUNT} typed particles · ` +
          `${profile.lights} forward slots · ${TYPEGPU_SIMULATED_LIGHT_COUNT} simulated lights · ${fps.toFixed(1)} fps`,
      );
    }
    frameIndex += 1;
    animationFrame = requestAnimationFrame(render);
  };

  display.update({ done: 8, message: "Submitting the first typed frame graph", total: 8 });
  animationFrame = requestAnimationFrame(render);
  return {
    stop(): void {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      telemetry.status = "stopped";
      lifetime.destroy();
    },
  };
}

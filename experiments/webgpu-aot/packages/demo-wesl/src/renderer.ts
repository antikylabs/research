import { createWeslAmbientSettings } from "./ambient.js";
import {
  createWeslEnvironmentSettings,
  loadWeslEnvironment,
} from "./environment.js";
import { createWeslBloomPlan } from "./bloom.js";
import { createWeslFrameValues } from "./frame.js";
import type { LoadingDisplay } from "./loading.js";
import {
  createWeslLightRig,
  WESL_ANALYTIC_LIGHT_COUNT,
  WESL_PARTICLE_COUNT,
  WESL_SIMULATED_LIGHT_COUNT,
} from "./lights.js";
import {
  encodeWeslBackgroundPass,
  encodeWeslForwardPass,
  encodeWeslFullscreenPass,
} from "./passes.js";
import { createWeslPipelines } from "./pipelines.js";
import type { WorkloadProfileName } from "./profile.js";
import {
  createWeslReflectionPlan,
  createWeslReflectionSettings,
} from "./reflection.js";
import {
  WESL_POST_EXPOSURE,
  WESL_POST_SPATIAL_BLEND,
  WORKLOAD_PROFILES,
} from "./profile.js";
import { loadWeslScene } from "./scene.js";
import {
  createWeslShadowResources,
  encodeWeslShadowPasses,
} from "./shadow.js";
import type { WorkloadTelemetry } from "./telemetry.js";
import {
  createWeslTemporalSettings,
  weslTemporalHistoryIndices,
  writeWeslTemporalFrame,
} from "./temporal.js";

interface RunningRenderer {
  stop(): void;
}

function createBuffer(
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

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB tracked`;
}

export async function startWeslRenderer(
  canvas: HTMLCanvasElement,
  profileName: WorkloadProfileName,
  display: LoadingDisplay,
  telemetry: WorkloadTelemetry,
): Promise<RunningRenderer> {
  const profile = WORKLOAD_PROFILES[profileName];
  if (navigator.gpu === undefined) throw new Error("WebGPU is unavailable in this browser");
  display.update(1, 8, "Requesting a device for linked WESL modules");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (adapter === null) throw new Error("No WebGPU adapter is available");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (context === null) throw new Error("Unable to create the WESL WebGPU context");
  canvas.width = profile.width;
  canvas.height = profile.height;
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format: canvasFormat, alphaMode: "opaque" });

  display.update(2, 8, "Compiling renderer-owned linked WESL modules");
  const pipelines = await createWeslPipelines(device, canvasFormat);
  telemetry.status = "loading";
  const scene = await loadWeslScene(device, pipelines, display);
  const environment = await loadWeslEnvironment(device, display);
  telemetry.assetsReadyAt = performance.now();
  display.update(
    5,
    8,
    "Allocating cascades, depth, ambient, surface, reflection, HDR, and bloom targets",
  );

  const frameValues = createWeslFrameValues(
    profile.width,
    profile.height,
    WESL_ANALYTIC_LIGHT_COUNT,
  );
  const shadows = createWeslShadowResources(
    device,
    pipelines,
    profileName,
    frameValues.nearShadow,
    frameValues.farShadow,
    frameValues.sunLighting,
  );

  const depth = device.createTexture({
    label: "WESL forward depth",
    size: [profile.width, profile.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const ambientTarget = device.createTexture({
    label: "WESL full-resolution ambient occlusion",
    size: [profile.width, profile.height],
    format: "r8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const hdr = device.createTexture({
    label: "WESL forward HDR target",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const surface = device.createTexture({
    label: "WESL linked normal and roughness target",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const worldMetal = device.createTexture({
    label: "WESL linked world-position and metalness target",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const reflectionUsage =
    GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const reflectionA = device.createTexture({
    label: "WESL full-resolution reflection trace",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: reflectionUsage,
  });
  const reflectionPlan = createWeslReflectionPlan(profile.width, profile.height);
  const reflectionB = device.createTexture({
    label: "WESL five-level reflection reconstruction pyramid",
    size: [profile.width, profile.height],
    format: "rgba16float",
    mipLevelCount: reflectionPlan.mipLevelCount,
    usage: reflectionUsage,
  });
  const selectedReflection = device.createTexture({
    label: "WESL roughness-selected reflection",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: reflectionUsage,
  });
  const temporalUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const temporalHistories = [0, 1].map((index) => device.createTexture({
    label: `WESL temporal history ${index}`,
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: temporalUsage,
  })) as [GPUTexture, GPUTexture];
  const bloomPlan = createWeslBloomPlan(profile.width, profile.height);
  const firstBloomLevel = bloomPlan.levels[0];
  if (firstBloomLevel === undefined) throw new Error("WESL bloom has no levels");
  const bloomUsage =
    GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const createBloomTarget = (label: string, width: number, height: number) =>
    device.createTexture({ label, size: [width, height], format: "rgba16float", usage: bloomUsage });
  const bloomBright = createBloomTarget(
    "WESL bloom bright extraction",
    firstBloomLevel.width,
    firstBloomLevel.height,
  );
  const bloomHorizontal = bloomPlan.levels.map((level, index) =>
    createBloomTarget(`WESL bloom horizontal level ${index}`, level.width, level.height),
  );
  const bloomVertical = bloomPlan.levels.map((level, index) =>
    createBloomTarget(`WESL bloom vertical level ${index}`, level.width, level.height),
  );
  const depthView = depth.createView();
  const ambientView = ambientTarget.createView();
  const hdrView = hdr.createView();
  const surfaceView = surface.createView();
  const worldMetalView = worldMetal.createView();
  const reflectionAView = reflectionA.createView();
  const reflectionBView = reflectionB.createView();
  const selectedReflectionView = selectedReflection.createView();
  const temporalHistoryViews = temporalHistories.map((texture) => texture.createView()) as [
    GPUTextureView,
    GPUTextureView,
  ];

  const frameBuffer = createBuffer(
    device,
    "WESL camera and model frame",
    frameValues.forward,
    GPUBufferUsage.UNIFORM,
  );
  const baseViewProjection = new Float32Array(frameValues.forward.slice(0, 16));
  const temporalSettings = createWeslTemporalSettings(
    profile.width,
    profile.height,
    0,
  );
  const temporalBuffer = createBuffer(
    device,
    "WESL temporal resolve settings",
    temporalSettings,
    GPUBufferUsage.UNIFORM,
  );
  const environmentSettings = createWeslEnvironmentSettings(
    profile.width,
    profile.height,
  );
  const environmentBuffer = createBuffer(
    device,
    "WESL environment frame gains",
    environmentSettings,
    GPUBufferUsage.UNIFORM,
  );
  const lightRig = createWeslLightRig();
  const { lightValues, particleValues } = lightRig;
  const lightBuffer = createBuffer(device, "WESL CPU light storage", lightValues, GPUBufferUsage.STORAGE);
  const particleBuffer = createBuffer(
    device,
    "WESL linked particle storage",
    particleValues,
    GPUBufferUsage.STORAGE,
  );
  const ambientValues = createWeslAmbientSettings(profile.width, profile.height);
  const ambientBuffer = createBuffer(device, "WESL ambient-occlusion settings", ambientValues, GPUBufferUsage.UNIFORM);
  const extractBuffer = createBuffer(
    device,
    "WESL bloom extraction settings",
    new Float32Array([1 / firstBloomLevel.width, 1 / firstBloomLevel.height, 0, 0]),
    GPUBufferUsage.UNIFORM,
  );
  const bloomLevelBuffers = bloomPlan.levels.map((level, index) => ({
    horizontal: createBuffer(
      device,
      `WESL bloom horizontal level ${index} settings`,
      new Float32Array([1 / level.width, 1 / level.height, level.kernelRadius, 1]),
      GPUBufferUsage.UNIFORM,
    ),
    vertical: createBuffer(
      device,
      `WESL bloom vertical level ${index} settings`,
      new Float32Array([1 / level.width, 1 / level.height, level.kernelRadius, 2]),
      GPUBufferUsage.UNIFORM,
    ),
  }));
  const reflectionLevelBuffers = reflectionPlan.levels.map((level) => createBuffer(
    device,
    `WESL reflection mip ${level.level} settings`,
    createWeslReflectionSettings(profile.width, profile.height, level.spread),
    GPUBufferUsage.UNIFORM,
  ));
  const postValues = new Float32Array([
    0,
    WESL_POST_EXPOSURE,
    WESL_POST_SPATIAL_BLEND,
    profile.height,
  ]);
  const postBuffer = createBuffer(device, "WESL linked post settings", postValues, GPUBufferUsage.UNIFORM);
  const bloomSampler = device.createSampler({
    label: "WESL Gaussian bloom sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  });

  const forwardFrameGroup = device.createBindGroup({
    label: "WESL controlled forward frame group",
    layout: pipelines.forwardFrameLayout,
    entries: [
      { binding: 0, resource: { buffer: frameBuffer } },
      { binding: 1, resource: { buffer: lightBuffer } },
      { binding: 2, resource: shadows.near.view },
      { binding: 3, resource: shadows.far.view },
      { binding: 4, resource: shadows.sampler },
      { binding: 5, resource: { buffer: shadows.lightingBuffer } },
    ],
  });
  const environmentGroup = device.createBindGroup({
    label: "WESL HDR environment lighting group",
    layout: pipelines.environmentLayout,
    entries: [
      { binding: 0, resource: environment.sampler },
      { binding: 1, resource: environment.sourceView },
      { binding: 2, resource: environment.diffuseView },
      { binding: 3, resource: environment.specularView },
      { binding: 4, resource: environment.brdfLutView },
      { binding: 5, resource: { buffer: environmentBuffer } },
    ],
  });
  const ambientGroup = device.createBindGroup({
    label: "WESL fullscreen ambient-occlusion group",
    layout: pipelines.ambientLayout,
    entries: [
      { binding: 0, resource: depthView },
      { binding: 1, resource: surfaceView },
      { binding: 2, resource: { buffer: ambientBuffer } },
    ],
  });
  const particleGroup = device.createBindGroup({
    label: "WESL linked particle group",
    layout: pipelines.particleLayout,
    entries: [
      { binding: 0, resource: { buffer: frameBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  });
  const reflectionGroup = device.createBindGroup({
    label: "WESL linked screen-reflection trace group",
    layout: pipelines.reflectionLayout,
    entries: [
      { binding: 0, resource: hdrView },
      { binding: 1, resource: surfaceView },
      { binding: 2, resource: worldMetalView },
      { binding: 3, resource: { buffer: frameBuffer } },
      { binding: 4, resource: bloomSampler },
    ],
  });
  const reflectionReconstructGroup = (
    label: string,
    source: GPUTextureView,
    settings: GPUBuffer,
  ): GPUBindGroup =>
    device.createBindGroup({
      label,
      layout: pipelines.reflectionReconstructLayout,
      entries: [
        { binding: 5, resource: source },
        { binding: 6, resource: bloomSampler },
        { binding: 7, resource: { buffer: settings } },
        { binding: 8, resource: surfaceView },
      ],
    });
  const reflectionLevelGroups = reflectionPlan.levels.map((level) => {
    const settings = reflectionLevelBuffers[level.level];
    if (settings === undefined) throw new Error(`WESL reflection mip ${level.level} has no settings`);
    return reflectionReconstructGroup(
      `WESL reflection mip ${level.level} reconstruction group`,
      reflectionAView,
      settings,
    );
  });
  const reflectionSelectSettings = reflectionLevelBuffers[0];
  if (reflectionSelectSettings === undefined) throw new Error("WESL reflection selector has no settings");
  const reflectionSelectGroup = reflectionReconstructGroup(
    "WESL roughness-selected reflection group",
    reflectionBView,
    reflectionSelectSettings,
  );
  const temporalGroups = temporalHistoryViews.map((history, index) =>
    device.createBindGroup({
      label: `WESL temporal resolve reading history ${index}`,
      layout: pipelines.temporalLayout,
      entries: [
        { binding: 0, resource: hdrView },
        { binding: 1, resource: ambientView },
        { binding: 2, resource: history },
        { binding: 3, resource: { buffer: temporalBuffer } },
      ],
    }),
  ) as [GPUBindGroup, GPUBindGroup];
  const bloomGroup = (
    label: string,
    source: GPUTextureView,
    settings: GPUBuffer,
    reflection: GPUTextureView,
  ): GPUBindGroup =>
    device.createBindGroup({
      label,
      layout: pipelines.bloomLayout,
      entries: [
        { binding: 0, resource: source },
        { binding: 1, resource: bloomSampler },
        { binding: 2, resource: { buffer: settings } },
        { binding: 3, resource: reflection },
      ],
    });
  const bloomExtractGroups = temporalHistoryViews.map((history, index) => bloomGroup(
    `WESL temporal bloom extraction group ${index}`,
    history,
    extractBuffer,
    selectedReflectionView,
  )) as [GPUBindGroup, GPUBindGroup];
  const bloomHorizontalGroups = bloomPlan.levels.map((_, index) => {
    const source = index === 0 ? bloomBright : bloomVertical[index - 1];
    const settings = bloomLevelBuffers[index]?.horizontal;
    if (source === undefined || settings === undefined) {
      throw new Error(`WESL bloom horizontal level ${index} is incomplete`);
    }
    const sourceView = source.createView();
    return bloomGroup(
      `WESL bloom horizontal level ${index} group`,
      sourceView,
      settings,
      sourceView,
    );
  });
  const bloomVerticalGroups = bloomPlan.levels.map((_, index) => {
    const source = bloomHorizontal[index];
    const settings = bloomLevelBuffers[index]?.vertical;
    if (source === undefined || settings === undefined) {
      throw new Error(`WESL bloom vertical level ${index} is incomplete`);
    }
    const sourceView = source.createView();
    return bloomGroup(
      `WESL bloom vertical level ${index} group`,
      sourceView,
      settings,
      sourceView,
    );
  });
  const postGroups = temporalHistoryViews.map((history, historyIndex) =>
    device.createBindGroup({
      label: `WESL linked temporal composite group ${historyIndex}`,
      layout: pipelines.postLayout,
      entries: [
        { binding: 0, resource: history },
        { binding: 1, resource: ambientView },
        ...bloomVertical.map((texture, index) => ({ binding: index + 2, resource: texture.createView() })),
        { binding: 7, resource: bloomSampler },
        { binding: 8, resource: { buffer: postBuffer } },
        { binding: 9, resource: selectedReflectionView },
      ],
    }),
  ) as [GPUBindGroup, GPUBindGroup];

  const pixelCount = profile.width * profile.height;
  const trackedBytes =
    scene.bytes +
    pixelCount * (4 + 1 + 8 * 7) +
    reflectionPlan.textureBytes +
    (firstBloomLevel.width * firstBloomLevel.height +
      bloomPlan.levels.reduce((sum, level) => sum + level.width * level.height * 2, 0)) * 8 +
    lightValues.byteLength +
    particleValues.byteLength +
    frameValues.forward.byteLength +
    environmentSettings.byteLength +
    environment.estimatedBytes +
    shadows.estimatedBytes;
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
    writeWeslTemporalFrame(
      frameValues.forward,
      baseViewProjection,
      profile.width,
      profile.height,
      frameIndex,
    );
    temporalSettings.set(createWeslTemporalSettings(
      profile.width,
      profile.height,
      frameIndex,
    ));
    const [temporalReadIndex, temporalWriteIndex] = weslTemporalHistoryIndices(frameIndex);
    lightRig.updateFrame(frameIndex);
    device.queue.writeBuffer(lightBuffer, 0, lightValues);
    device.queue.writeBuffer(particleBuffer, 0, particleValues);
    device.queue.writeBuffer(frameBuffer, 0, frameValues.forward);
    device.queue.writeBuffer(temporalBuffer, 0, temporalSettings);

    const encoder = device.createCommandEncoder({ label: "WESL independent frame encoder" });
    encodeWeslShadowPasses(
      encoder,
      scene.primitives,
      shadows,
      pipelines,
    );
    const forwardPass = encoder.beginRenderPass({
      label: "WESL 103-draw controlled forward pass",
      colorAttachments: [
        { view: hdrView, clearValue: [0.004, 0.006, 0.012, 1], loadOp: "clear", storeOp: "store" },
        { view: surfaceView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
        { view: worldMetalView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    encodeWeslBackgroundPass(
      forwardPass,
      environmentGroup,
      pipelines.background,
    );
    encodeWeslForwardPass(
      forwardPass,
      scene.primitives,
      forwardFrameGroup,
      environmentGroup,
      pipelines.forwardBack,
      pipelines.forwardDouble,
    );
    forwardPass.end();

    const particlePass = encoder.beginRenderPass({
      label: "WESL 406-instance additive particle pass",
      colorAttachments: [{ view: hdrView, loadOp: "load", storeOp: "store" }],
      depthStencilAttachment: {
        view: depthView,
        depthLoadOp: "load",
        depthStoreOp: "store",
      },
    });
    particlePass.setPipeline(pipelines.particle);
    particlePass.setBindGroup(0, particleGroup);
    particlePass.draw(6, WESL_PARTICLE_COUNT);
    particlePass.end();

    encodeWeslFullscreenPass(
      encoder,
      "WESL full-resolution ambient-occlusion pass",
      ambientTarget,
      pipelines.ambient,
      ambientGroup,
    );

    encodeWeslFullscreenPass(
      encoder,
      "WESL temporal resolve pass",
      temporalHistories[temporalWriteIndex],
      pipelines.temporal,
      temporalGroups[temporalReadIndex],
    );

    encodeWeslFullscreenPass(
      encoder,
      "WESL linked screen-space reflection trace",
      reflectionA,
      pipelines.reflection,
      reflectionGroup,
    );
    for (const level of reflectionPlan.levels) {
      const group = reflectionLevelGroups[level.level];
      if (group === undefined) throw new Error(`WESL reflection mip ${level.level} has no group`);
      encodeWeslFullscreenPass(
        encoder,
        `WESL reflection reconstruction mip ${level.level}`,
        reflectionB,
        pipelines.reflectionReconstruct,
        group,
        { baseMipLevel: level.level, mipLevelCount: 1 },
      );
    }
    encodeWeslFullscreenPass(
      encoder,
      "WESL roughness-selected reflection pass",
      selectedReflection,
      pipelines.reflectionSelect,
      reflectionSelectGroup,
    );

    encodeWeslFullscreenPass(
      encoder,
      "WESL bloom bright extraction",
      bloomBright,
      pipelines.bloom,
      bloomExtractGroups[temporalWriteIndex],
    );
    for (let index = 0; index < bloomPlan.levels.length; index += 1) {
      const horizontal = bloomHorizontal[index];
      const vertical = bloomVertical[index];
      const horizontalGroup = bloomHorizontalGroups[index];
      const verticalGroup = bloomVerticalGroups[index];
      if (
        horizontal === undefined || vertical === undefined ||
        horizontalGroup === undefined || verticalGroup === undefined
      ) {
        throw new Error(`WESL bloom level ${index} is incomplete`);
      }
      encodeWeslFullscreenPass(
        encoder,
        `WESL bloom horizontal level ${index}`,
        horizontal,
        pipelines.bloom,
        horizontalGroup,
      );
      encodeWeslFullscreenPass(
        encoder,
        `WESL bloom vertical level ${index}`,
        vertical,
        pipelines.bloom,
        verticalGroup,
      );
    }

    const postPass = encoder.beginRenderPass({
      label: "WESL linked five-level bloom ACES composite",
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    postPass.setPipeline(pipelines.post);
    postPass.setBindGroup(0, postGroups[temporalWriteIndex]);
    postPass.draw(3);
    postPass.end();
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
      lights: WESL_SIMULATED_LIGHT_COUNT,
      visibleMeshes: scene.primitives.length,
      totalMeshes: scene.primitives.length,
      vram: formatBytes(trackedBytes),
    };
    if (frameIndex < 3 || frameIndex % 30 === 0) {
      display.ready(
        `WESL static · ${profileName} ${profile.width}×${profile.height} · ` +
          `${scene.primitives.length * 4} indexed draws · ${WESL_PARTICLE_COUNT} particles · ` +
          `HDR IBL background · temporal resolve · two soft cascades · linked SSR · ${fps.toFixed(1)} fps`,
      );
    }
    frameIndex += 1;
    animationFrame = requestAnimationFrame(render);
  };

  display.update(8, 8, "Submitting the statically linked WESL frame graph");
  animationFrame = requestAnimationFrame(render);
  return {
    stop(): void {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      telemetry.status = "stopped";
      environment.destroy();
      shadows.destroy();
      device.destroy();
    },
  };
}

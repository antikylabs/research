import {
  compileArtifact,
  createArtifactBindGroup,
  createArtifactPipeline,
} from "./artifact.js";
import { createAntikyBloomPlan } from "./bloom.js";
import { loadAntikyEnvironment } from "./environment.js";
import { createFrameValues, staticBuffer } from "./frame.js";
import { shader as ambientShader } from "./generated/ambient.generated.js";
import { shader as bloomShader } from "./generated/bloom.generated.js";
import { shader as compositeShader } from "./generated/composite.generated.js";
import { shader as forwardShader } from "./generated/forward.generated.js";
import { shader as particlesShader } from "./generated/particles.generated.js";
import { shader as reflectionReconstructShader } from "./generated/reflection-reconstruct.generated.js";
import { shader as reflectionSelectShader } from "./generated/reflection-select.generated.js";
import { shader as reflectionShader } from "./generated/reflection.generated.js";
import { shader as shadowShader } from "./generated/shadow.generated.js";
import { shader as temporalShader } from "./generated/temporal.generated.js";
import {
  ANTIKY_PARTICLE_COUNT,
  ANTIKY_SIMULATED_LIGHT_COUNT,
  createAntikyLightRig,
} from "./lights.js";
import type { LoadingDisplay } from "./loading.js";
import {
  encodeAntikyBloomPass,
  encodeAntikyForwardPass,
  encodeAntikyShadowPass,
} from "./passes.js";
import type { WorkloadProfileName } from "./profile.js";
import {
  ANTIKY_AMBIENT_OCCLUSION_STRENGTH,
  ANTIKY_COMPOSITE_EXPOSURE,
  WORKLOAD_PROFILES,
} from "./profile.js";
import {
  ANTIKY_RAW_REFLECTION_PASS_LABEL,
  createAntikyReflectionPlan,
  createAntikyReflectionTextureDescriptors,
  createAntikyReflectionViews,
} from "./reflections.js";
import { loadAntikyScene } from "./scene.js";
import { ANTIKY_SHADOW_RESOLUTION } from "./sun.js";
import type { WorkloadTelemetry } from "./telemetry.js";
import {
  antikyTemporalHistoryIndices,
  createAntikyTemporalSettings,
  writeAntikyTemporalFrame,
} from "./temporal.js";

interface RunningRenderer {
  stop(): void;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB tracked`;
}

export async function startAntikyRenderer(
  canvas: HTMLCanvasElement,
  profileName: WorkloadProfileName,
  display: LoadingDisplay,
  telemetry: WorkloadTelemetry,
): Promise<RunningRenderer> {
  const profile = WORKLOAD_PROFILES[profileName];
  if (navigator.gpu === undefined) throw new Error("WebGPU is unavailable in this browser");
  display.update({ completed: 1, label: "Requesting a device for static artifacts", total: 9 });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (adapter === null) throw new Error("No WebGPU adapter is available");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (context === null) throw new Error("Unable to create an Antiky WebGPU context");
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  if (canvasFormat !== compositeShader.pipeline.targets[0]?.format) {
    throw new Error(`Antiky artifact targets bgra8unorm, but this browser selected ${canvasFormat}`);
  }
  canvas.width = profile.width;
  canvas.height = profile.height;
  context.configure({ device, format: canvasFormat, alphaMode: "opaque" });

  display.update({ completed: 2, label: "Validating ten build-time WGSL modules", total: 9 });
  const [shadow, forward, particles, bloom, ambient, reflection, reflectionReconstruct, reflectionSelect, temporal, composite] =
    await Promise.all([
      compileArtifact(device, "Antiky cascaded shadow", shadowShader),
      compileArtifact(device, "Antiky forward PBR", forwardShader),
      compileArtifact(device, "Antiky emissive particles", particlesShader),
      compileArtifact(device, "Antiky multiscale Gaussian bloom", bloomShader),
      compileArtifact(device, "Antiky full-resolution ambient occlusion", ambientShader),
      compileArtifact(device, "Antiky screen-space reflections", reflectionShader),
      compileArtifact(device, "Antiky reflection reconstruction", reflectionReconstructShader),
      compileArtifact(device, "Antiky roughness reflection selection", reflectionSelectShader),
      compileArtifact(device, "Antiky temporal resolve", temporalShader),
      compileArtifact(device, "Antiky final composite", compositeShader),
    ]);
  display.update({ completed: 3, label: "Compiling artifact-described pipelines", total: 9 });
  const [
    shadowBack,
    shadowDouble,
    forwardBack,
    forwardDouble,
    particlePipeline,
    bloomPipeline,
    ambientPipeline,
    reflectionPipeline,
    reflectionReconstructPipeline,
    reflectionSelectPipeline,
    temporalPipeline,
    compositePipeline,
  ] = await Promise.all([
    createArtifactPipeline(device, shadow, "Antiky fitted cascade back-face pipeline"),
    createArtifactPipeline(
      device,
      shadow,
      "Antiky fitted cascade double-sided pipeline",
      { ...shadow.artifact.pipeline.primitive, cullMode: "none" },
    ),
    createArtifactPipeline(device, forward, "Antiky AOT forward back-face pipeline"),
    createArtifactPipeline(device, forward, "Antiky AOT forward double-sided pipeline", {
      ...forward.artifact.pipeline.primitive,
      cullMode: "none",
    }),
    createArtifactPipeline(device, particles, "Antiky AOT emissive particle pipeline"),
    createArtifactPipeline(device, bloom, "Antiky AOT separable bloom pipeline"),
    createArtifactPipeline(device, ambient, "Antiky AOT ambient-occlusion pipeline"),
    createArtifactPipeline(device, reflection, "Antiky AOT screen-space reflection pipeline"),
    createArtifactPipeline(device, reflectionReconstruct, "Antiky AOT reflection reconstruction pipeline"),
    createArtifactPipeline(device, reflectionSelect, "Antiky AOT roughness reflection selection pipeline"),
    createArtifactPipeline(device, temporal, "Antiky AOT temporal resolve pipeline"),
    createArtifactPipeline(device, composite, "Antiky AOT final composite pipeline"),
  ]);

  telemetry.status = "loading";
  const scene = await loadAntikyScene(device, forward, display);
  const environment = await loadAntikyEnvironment(device, display);
  telemetry.assetsReadyAt = performance.now();
  display.update({ completed: 6, label: "Allocating cascades and temporal resolve targets", total: 9 });

  const shadowSize = ANTIKY_SHADOW_RESOLUTION;
  const createShadowTarget = (label: string): {
    readonly color: GPUTextureView;
    readonly depth: GPUTextureView;
  } => {
    const color = device.createTexture({
      label: `${label} occupancy target`,
      size: [shadowSize, shadowSize],
      format: "r8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depth = device.createTexture({
      label: `${label} depth map`,
      size: [shadowSize, shadowSize],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return { color: color.createView(), depth: depth.createView() };
  };
  const nearTarget = createShadowTarget("Antiky near cascade");
  const farTarget = createShadowTarget("Antiky far cascade");
  const targetUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const hdr = device.createTexture({
    label: "Antiky AOT forward HDR",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: targetUsage,
  });
  const normal = device.createTexture({
    label: "Antiky AOT forward normal and roughness",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: targetUsage,
  });
  const worldMetal = device.createTexture({
    label: "Antiky AOT forward world position and metallic",
    size: [profile.width, profile.height],
    format: "rgba16float",
    usage: targetUsage,
  });
  const depth = device.createTexture({
    label: "Antiky forward depth",
    size: [profile.width, profile.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const ambientTarget = device.createTexture({
    label: "Antiky full-resolution ambient occlusion",
    size: [profile.width, profile.height],
    format: "r8unorm",
    usage: targetUsage,
  });
  const reflectionPlan = createAntikyReflectionPlan(profile.width, profile.height);
  const reflectionDescriptors = createAntikyReflectionTextureDescriptors(
    profile.width,
    profile.height,
    targetUsage,
  );
  const rawReflection = device.createTexture(reflectionDescriptors.raw);
  const reflectionPyramid = device.createTexture(reflectionDescriptors.pyramid);
  const selectedReflection = device.createTexture(reflectionDescriptors.selected);
  const reflectionViews = createAntikyReflectionViews(
    rawReflection,
    reflectionPyramid,
    selectedReflection,
  );
  const temporalTargets = [0, 1].map((index) =>
    device.createTexture({
      label: `Antiky temporal resolve target ${index}`,
      size: [profile.width, profile.height],
      format: "rgba16float",
      usage: targetUsage,
    }),
  );
  const bloomPlan = createAntikyBloomPlan(profile.width, profile.height);
  const bloomBright = device.createTexture({
    label: "Antiky bloom bright extraction",
    size: [bloomPlan.levels[0]!.width, bloomPlan.levels[0]!.height],
    format: "rgba16float",
    usage: targetUsage,
  });
  const bloomLevels = bloomPlan.levels.map((level) => ({
    horizontal: device.createTexture({
      label: `Antiky bloom level ${level.level} horizontal`,
      size: [level.width, level.height],
      format: "rgba16float",
      usage: targetUsage,
    }),
    vertical: device.createTexture({
      label: `Antiky bloom level ${level.level} vertical`,
      size: [level.width, level.height],
      format: "rgba16float",
      usage: targetUsage,
    }),
  }));
  const bloomTextures = new Map<string, GPUTexture>([["bright", bloomBright]]);
  for (const [index, level] of bloomLevels.entries()) {
    bloomTextures.set(`horizontal-${index}`, level.horizontal);
    bloomTextures.set(`vertical-${index}`, level.vertical);
  }
  const bloomTexture = (name: string): GPUTexture => {
    const texture = bloomTextures.get(name);
    if (texture === undefined) {
      throw new Error(`Unknown Antiky bloom texture ${name}`);
    }
    return texture;
  };

  const frameValues = createFrameValues(profile.width, profile.height, profile.lights);
  const baseViewProjection = frameValues.forward.slice(0, 16);
  const forwardBuffer = staticBuffer(
    device,
    "Antiky jittered forward frame",
    frameValues.forward,
    GPUBufferUsage.UNIFORM,
  );
  const nearShadowBuffer = staticBuffer(
    device,
    "Antiky near cascade frame",
    frameValues.nearShadow,
    GPUBufferUsage.UNIFORM,
  );
  const farShadowBuffer = staticBuffer(
    device,
    "Antiky far cascade frame",
    frameValues.farShadow,
    GPUBufferUsage.UNIFORM,
  );
  const lightRig = createAntikyLightRig();
  const { lightValues, particleValues } = lightRig;
  const lightBuffer = staticBuffer(
    device,
    "Antiky CPU-authored light storage",
    lightValues,
    GPUBufferUsage.STORAGE,
  );
  const particleBuffer = staticBuffer(
    device,
    "Antiky CPU-authored particle storage",
    particleValues,
    GPUBufferUsage.STORAGE,
  );
  const temporalValues = createAntikyTemporalSettings(profile.width, profile.height, 0);
  const temporalBuffer = staticBuffer(
    device,
    "Antiky temporal resolve settings",
    temporalValues,
    GPUBufferUsage.UNIFORM,
  );
  const compositeValues = new Float32Array([
    0,
    ANTIKY_COMPOSITE_EXPOSURE,
    0,
    0,
  ]);
  const compositeBuffer = staticBuffer(
    device,
    "Antiky final composite settings",
    compositeValues,
    GPUBufferUsage.UNIFORM,
  );
  const bloomSettings = bloomPlan.stages.map((stage, index) =>
    staticBuffer(
      device,
      `Antiky bloom ${stage.kind} stage ${index} settings`,
      stage.settings,
      GPUBufferUsage.UNIFORM,
    ),
  );
  const ambientValues = new Float32Array([
    profile.width,
    profile.height,
    Math.max(2, profile.width / 640),
    ANTIKY_AMBIENT_OCCLUSION_STRENGTH,
  ]);
  const ambientBuffer = staticBuffer(
    device,
    "Antiky ambient-occlusion settings",
    ambientValues,
    GPUBufferUsage.UNIFORM,
  );
  const reflectionLevelSettings = reflectionPlan.levels.map((level) =>
    staticBuffer(
      device,
      `Antiky reflection mip ${level.level} settings`,
      level.settings,
      GPUBufferUsage.UNIFORM,
    ),
  );
  const comparisonSampler = device.createSampler({
    label: "Antiky cascaded comparison sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    compare: "less-equal",
  });
  const bloomSampler = device.createSampler({
    label: "Antiky bloom clamp sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });
  const reflectionSampler = device.createSampler({
    label: "Antiky trilinear reflection sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  });

  const nearShadowGroup = createArtifactBindGroup(
    device,
    shadow,
    0,
    "Antiky near cascade group",
    { frame: { buffer: nearShadowBuffer } },
  );
  const farShadowGroup = createArtifactBindGroup(
    device,
    shadow,
    0,
    "Antiky far cascade group",
    { frame: { buffer: farShadowBuffer } },
  );
  const forwardGroup = createArtifactBindGroup(
    device,
    forward,
    0,
    "Antiky static scene group",
    {
      frame: { buffer: forwardBuffer },
      lights: { buffer: lightBuffer },
      nearShadow: nearTarget.depth,
      farShadow: farTarget.depth,
      shadowSampler: comparisonSampler,
      environmentSampler: environment.sampler,
      environmentMap: environment.view,
    },
  );
  const particleGroup = createArtifactBindGroup(
    device,
    particles,
    0,
    "Antiky static particle group",
    {
      frame: { buffer: forwardBuffer },
      particles: { buffer: particleBuffer },
    },
  );
  const bloomExtractionGroups = temporalTargets.map((target, index) =>
    createArtifactBindGroup(
      device,
      bloom,
      0,
      `Antiky bloom extraction temporal source ${index} group`,
      {
        source: target.createView(),
        reflection: reflectionViews.selected,
        sampler: bloomSampler,
        settings: { buffer: bloomSettings[0]! },
      },
    ),
  );
  const bloomBlurGroups = bloomPlan.stages.slice(1).map((stage, index) => {
    const stageIndex = index + 1;
    return createArtifactBindGroup(
      device,
      bloom,
      0,
      `Antiky bloom ${stage.kind} stage ${stageIndex} group`,
      {
        source: bloomTexture(stage.source).createView(),
        reflection: reflectionViews.selected,
        sampler: bloomSampler,
        settings: { buffer: bloomSettings[stageIndex]! },
      },
    );
  });
  const bloomStageTargets = bloomPlan.stages.map((stage) =>
    bloomTexture(stage.target),
  );
  const ambientGroup = createArtifactBindGroup(
    device,
    ambient,
    0,
    "Antiky static ambient-occlusion group",
    {
      depth: depth.createView(),
      normal: normal.createView(),
      settings: { buffer: ambientBuffer },
    },
  );
  const reflectionGroup = createArtifactBindGroup(
    device,
    reflection,
    0,
    "Antiky static screen-space reflection group",
    {
      hdr: hdr.createView(),
      surface: normal.createView(),
      worldMetal: worldMetal.createView(),
      depth: depth.createView(),
      frame: { buffer: forwardBuffer },
      sampler: bloomSampler,
    },
  );
  const reflectionLevelGroups = reflectionPlan.levels.map((level) =>
    createArtifactBindGroup(
      device,
      reflectionReconstruct,
      0,
      `Antiky reflection mip ${level.level} reconstruction group`,
      {
        rawReflection: reflectionViews.raw,
        sampler: reflectionSampler,
        settings: { buffer: reflectionLevelSettings[level.level]! },
      },
    ),
  );
  const reflectionSelectGroup = createArtifactBindGroup(
    device,
    reflectionSelect,
    0,
    "Antiky roughness-selected reflection group",
    {
      reflection: reflectionViews.pyramid,
      surface: normal.createView(),
      sampler: reflectionSampler,
    },
  );
  const temporalGroups = temporalTargets.map((history, index) =>
    createArtifactBindGroup(
      device,
      temporal,
      0,
      `Antiky temporal resolve history source ${index} group`,
      {
        currentHdr: hdr.createView(),
        ambient: ambientTarget.createView(),
        history: history.createView(),
        settings: { buffer: temporalBuffer },
      },
    ),
  );
  const compositeGroups = temporalTargets.map((target, index) =>
    createArtifactBindGroup(
      device,
      composite,
      0,
      `Antiky final composite temporal source ${index} group`,
      {
        temporal: target.createView(),
        bloomLevel0: bloomLevels[0]!.vertical.createView(),
        bloomLevel1: bloomLevels[1]!.vertical.createView(),
        bloomLevel2: bloomLevels[2]!.vertical.createView(),
        bloomLevel3: bloomLevels[3]!.vertical.createView(),
        bloomLevel4: bloomLevels[4]!.vertical.createView(),
        reflection: reflectionViews.selected,
        sampler: bloomSampler,
        settings: { buffer: compositeBuffer },
      },
    ),
  );

  const pixelCount = profile.width * profile.height;
  const trackedBytes =
    scene.bytes +
    shadowSize * shadowSize * 5 * 2 +
    pixelCount * (8 + 8 + 8 + 4 + 1 + 8 * 2) +
    reflectionPlan.textureBytes +
    bloomPlan.textureBytes +
    environment.estimatedBytes +
    lightValues.byteLength +
    particleValues.byteLength +
    frameValues.forward.byteLength +
    frameValues.nearShadow.byteLength +
    frameValues.farShadow.byteLength;
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
    writeAntikyTemporalFrame(
      frameValues.forward,
      baseViewProjection,
      profile.width,
      profile.height,
      frameIndex,
    );
    temporalValues[2] = frameIndex === 0 ? 0 : 1;
    temporalValues[3] = frameIndex;
    device.queue.writeBuffer(forwardBuffer, 0, frameValues.forward);
    device.queue.writeBuffer(lightBuffer, 0, lightValues);
    device.queue.writeBuffer(particleBuffer, 0, particleValues);
    device.queue.writeBuffer(temporalBuffer, 0, temporalValues);

    const encoder = device.createCommandEncoder({ label: "Antiky native AOT frame encoder" });
    const shadowPass = (
      label: string,
      target: { readonly color: GPUTextureView; readonly depth: GPUTextureView },
      group: GPUBindGroup,
    ): void => {
      const pass = encoder.beginRenderPass({
        label,
        colorAttachments: [
          { view: target.color, clearValue: [1, 1, 1, 1], loadOp: "clear", storeOp: "discard" },
        ],
        depthStencilAttachment: {
          view: target.depth,
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      encodeAntikyShadowPass(
        pass,
        shadowBack,
        shadowDouble,
        group,
        scene.primitives,
      );
      pass.end();
    };
    shadowPass("Antiky 103-draw near cascade pass", nearTarget, nearShadowGroup);
    shadowPass("Antiky 103-draw far cascade pass", farTarget, farShadowGroup);

    const forwardPass = encoder.beginRenderPass({
      label: "Antiky 103-draw static forward PBR pass",
      colorAttachments: [
        { view: hdr.createView(), clearValue: [0.006, 0.008, 0.016, 1], loadOp: "clear", storeOp: "store" },
        { view: normal.createView(), clearValue: [0.5, 0.5, 1, 1], loadOp: "clear", storeOp: "store" },
        { view: worldMetal.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    encodeAntikyForwardPass(
      forwardPass,
      scene.primitives,
      forwardGroup,
      forwardBack,
      forwardDouble,
    );
    forwardPass.end();

    const particlePass = encoder.beginRenderPass({
      label: "Antiky 406-instance emissive particle pass",
      colorAttachments: [
        { view: hdr.createView(), loadOp: "load", storeOp: "store" },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthLoadOp: "load",
        depthStoreOp: "store",
      },
    });
    particlePass.setPipeline(particlePipeline);
    particlePass.setBindGroup(0, particleGroup);
    particlePass.draw(6, ANTIKY_PARTICLE_COUNT);
    particlePass.end();

    encodeAntikyBloomPass(
      encoder,
      "Antiky AOT full-resolution ambient-occlusion pass",
      ambientTarget,
      ambientPipeline,
      ambientGroup,
    );

    const [historyRead, historyWrite] = antikyTemporalHistoryIndices(frameIndex);
    encodeAntikyBloomPass(
      encoder,
      "Antiky AOT temporal resolve pass",
      temporalTargets[historyWrite]!,
      temporalPipeline,
      temporalGroups[historyRead]!,
    );

    encodeAntikyBloomPass(
      encoder,
      ANTIKY_RAW_REFLECTION_PASS_LABEL,
      rawReflection,
      reflectionPipeline,
      reflectionGroup,
    );
    for (const level of reflectionPlan.levels) {
      encodeAntikyBloomPass(
        encoder,
        `Antiky AOT reflection reconstruction mip ${level.level}`,
        reflectionPyramid,
        reflectionReconstructPipeline,
        reflectionLevelGroups[level.level]!,
        { baseMipLevel: level.level, mipLevelCount: 1 },
      );
    }
    encodeAntikyBloomPass(
      encoder,
      "Antiky AOT roughness-selected reflection pass",
      selectedReflection,
      reflectionSelectPipeline,
      reflectionSelectGroup,
    );

    for (let index = 0; index < bloomPlan.stages.length; index += 1) {
      const stage = bloomPlan.stages[index]!;
      encodeAntikyBloomPass(
        encoder,
        stage.kind === "extract"
          ? "Antiky AOT bloom bright extraction pass"
          : `Antiky AOT bloom level ${stage.level} ${stage.kind} pass`,
        bloomStageTargets[index]!,
        bloomPipeline,
        stage.kind === "extract"
          ? bloomExtractionGroups[historyWrite]!
          : bloomBlurGroups[index - 1]!,
      );
    }

    const compositePass = encoder.beginRenderPass({
      label: "Antiky final bloom and tone-map pass",
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    compositePass.setPipeline(compositePipeline);
    compositePass.setBindGroup(0, compositeGroups[historyWrite]);
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
      lights: ANTIKY_SIMULATED_LIGHT_COUNT,
      visibleMeshes: scene.primitives.length,
      totalMeshes: scene.primitives.length,
      vram: formatBytes(trackedBytes),
    };
    if (frameIndex < 3 || frameIndex % 30 === 0) {
      display.ready(
        `Antiky AOT · ${profileName} ${profile.width}×${profile.height} · ` +
          `${scene.primitives.length * 3} indexed draws · two ${shadowSize}px cascades · ${fps.toFixed(1)} fps`,
      );
    }
    frameIndex += 1;
    animationFrame = requestAnimationFrame(render);
  };

  display.update({ completed: 9, label: "Submitting the temporal AOT frame graph", total: 9 });
  animationFrame = requestAnimationFrame(render);
  return {
    stop(): void {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      telemetry.status = "stopped";
      environment.destroy();
      device.destroy();
    },
  };
}

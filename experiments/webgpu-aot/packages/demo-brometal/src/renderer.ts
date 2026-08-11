import { mat4 } from "wgpu-matrix";

import {
  createBroMetalAmbientPlan,
  createBroMetalAmbientSettings,
} from "./ambient.js";
import { brometalShaders } from "./generated/pipeline.generated.js";
import { createBroMetalBloomPlan } from "./bloom.js";
import { loadBroMetalEnvironment } from "./environment.js";
import {
  BROMETAL_PARTICLE_COUNT,
  BROMETAL_SIMULATED_LIGHT_COUNT,
  createBroMetalLightRig,
} from "./lights.js";
import type { LoadingDisplay } from "./loading.js";
import {
  encodeBroMetalBloomPass,
  encodeBroMetalGeometryPass,
  writeBroMetalDynamicBuffers,
} from "./passes.js";
import {
  checkedShaderModule,
  createMaterialLayout,
  geometryPipelineDescriptor,
} from "./pipelines.js";
import type { WorkloadProfileName } from "./profile.js";
import {
  createBroMetalCompositeSettings,
  WORKLOAD_PROFILES,
} from "./profile.js";
import {
  createBroMetalReflectionResources,
  encodeBroMetalReflectionPass,
} from "./reflections.js";
import { loadBroMetalScene } from "./scene.js";
import { createBroMetalShadowResources, encodeBroMetalShadowPass } from "./shadow.js";
import { BROMETAL_CAMERA } from "./sun.js";
import {
  countBroMetalIndexedGeometryDraws,
  type WorkloadTelemetry,
} from "./telemetry.js";
import {
  createBroMetalTemporalResources,
  createBroMetalTemporalSettings,
  encodeBroMetalTemporalPass,
  writeBroMetalTemporalFrame,
} from "./temporal.js";

interface RunningRenderer {
  stop(): void;
}

const formatBytes = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MiB tracked`;

export async function startBroMetalRenderer(
  canvas: HTMLCanvasElement,
  profileName: WorkloadProfileName,
  display: LoadingDisplay,
  telemetry: WorkloadTelemetry,
): Promise<RunningRenderer> {
  const profile = WORKLOAD_PROFILES[profileName];
  if (navigator.gpu === undefined) throw new Error("WebGPU is unavailable in this browser");
  display.update({ completed: 1, label: "Requesting a high-performance WebGPU device", total: 8 });
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (adapter === null) throw new Error("No WebGPU adapter is available");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (context === null) throw new Error("Unable to create a WebGPU canvas context");
  canvas.width = profile.width;
  canvas.height = profile.height;
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format: canvasFormat, alphaMode: "opaque" });

  display.update({ completed: 2, label: "Validating ten BroMetal AOT modules", total: 8 });
  const [shadowModule, geometryModule, lightingModule, reflectionModule, reflectionReconstructModule, reflectionSelectModule, temporalModule, particleModule, bloomModule, compositeModule] = await Promise.all([
    checkedShaderModule(device, "BroMetal AOT shadow module", brometalShaders.shadow),
    checkedShaderModule(device, "BroMetal AOT geometry module", brometalShaders.geometry),
    checkedShaderModule(device, "BroMetal AOT lighting module", brometalShaders.lighting),
    checkedShaderModule(device, "BroMetal AOT reflection module", brometalShaders.reflection),
    checkedShaderModule(device, "BroMetal AOT reflection reconstruction module", brometalShaders.reflectionReconstruct),
    checkedShaderModule(device, "BroMetal AOT reflection selection module", brometalShaders.reflectionSelect),
    checkedShaderModule(device, "BroMetal AOT temporal module", brometalShaders.temporal),
    checkedShaderModule(device, "BroMetal AOT particle module", brometalShaders.particles),
    checkedShaderModule(device, "BroMetal AOT bloom module", brometalShaders.bloom),
    checkedShaderModule(device, "BroMetal AOT composite module", brometalShaders.composite),
  ]);

  const frameLayout = device.createBindGroupLayout({
    label: "BroMetal geometry frame layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform", minBindingSize: 160 },
      },
    ],
  });
  const materialLayout = createMaterialLayout(device);
  display.update({ completed: 3, label: "Compiling deferred render pipelines", total: 8 });
  const [geometryBack, geometryDouble] = await Promise.all([
    device.createRenderPipelineAsync(
      geometryPipelineDescriptor(device, geometryModule, frameLayout, materialLayout, "back"),
    ),
    device.createRenderPipelineAsync(
      geometryPipelineDescriptor(device, geometryModule, frameLayout, materialLayout, "none"),
    ),
  ]);

  telemetry.status = "loading";
  const scene = await loadBroMetalScene(device, materialLayout, (progress) => display.update(progress));
  const environment = await loadBroMetalEnvironment(device, { display });
  telemetry.assetsReadyAt = performance.now();

  const pixelCount = profile.width * profile.height;
  const createTarget = (label: string, format: GPUTextureFormat, usage: GPUTextureUsageFlags): GPUTexture =>
    device.createTexture({ label, size: [profile.width, profile.height], format, usage });
  const renderUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
  const albedo = createTarget("BroMetal GBuffer Albedo", "rgba8unorm", renderUsage);
  const normalRoughness = createTarget("BroMetal GBuffer Normal Roughness", "rgba16float", renderUsage);
  const worldMetal = createTarget("BroMetal GBuffer World Metal", "rgba16float", renderUsage);
  const depth = createTarget("BroMetal GBuffer Depth", "depth24plus", renderUsage);
  const hdr = createTarget("BroMetal Deferred HDR", "rgba16float", renderUsage);
  const ambientPlan = createBroMetalAmbientPlan(profile.width, profile.height);
  const ambient = createTarget(
    ambientPlan.label,
    ambientPlan.format,
    renderUsage,
  );
  const bloomPlan = createBroMetalBloomPlan(profile.width, profile.height);
  const firstBloomLevel = bloomPlan.levels[0];
  if (firstBloomLevel === undefined) throw new Error("BroMetal bloom has no levels");
  const createBloomTarget = (label: string, width: number, height: number): GPUTexture =>
    device.createTexture({
      label,
      size: [width, height],
      format: "rgba16float",
      usage: renderUsage,
    });
  const bloomBright = createBloomTarget(
    "BroMetal bloom bright extraction",
    firstBloomLevel.width,
    firstBloomLevel.height,
  );
  const bloomHorizontal = bloomPlan.levels.map((level, index) =>
    createBloomTarget(
      `BroMetal bloom horizontal level ${index}`,
      level.width,
      level.height,
    ),
  );
  const bloomVertical = bloomPlan.levels.map((level, index) =>
    createBloomTarget(
      `BroMetal bloom vertical level ${index}`,
      level.width,
      level.height,
    ),
  );

  const frameValues = new Float32Array(40);
  const aspect = profile.width / profile.height;
  const projection = mat4.perspective(
    BROMETAL_CAMERA.fieldOfViewRadians,
    aspect,
    BROMETAL_CAMERA.near,
    BROMETAL_CAMERA.far,
  );
  const view = mat4.lookAt(
    BROMETAL_CAMERA.position,
    BROMETAL_CAMERA.target,
    BROMETAL_CAMERA.up,
  );
  const viewProjection = mat4.multiply(projection, view);
  const baseViewProjection = new Float32Array(viewProjection);
  const model = mat4.multiply(mat4.translation([0, 2, 0]), mat4.scaling([0.008, 0.008, 0.008]));
  frameValues.set(viewProjection, 0);
  frameValues.set(model, 16);
  frameValues.set([...BROMETAL_CAMERA.position, 1], 32);
  frameValues.set([profile.analyticLights, 0, profile.width, profile.height], 36);
  const frameBuffer = device.createBuffer({
    label: "BroMetal Camera Model Frame Uniform",
    size: frameValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(frameBuffer, 0, frameValues);
  const ambientValues = createBroMetalAmbientSettings(
    profile.width,
    profile.height,
  );
  const ambientBuffer = device.createBuffer({
    label: "BroMetal horizon ambient frame",
    size: ambientValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(ambientBuffer, 0, ambientValues);
  const frameBindGroup = device.createBindGroup({
    label: "BroMetal geometry frame bind group",
    layout: frameLayout,
    entries: [{ binding: 0, resource: { buffer: frameBuffer } }],
  });
  const shadow = await createBroMetalShadowResources(
    device,
    shadowModule,
    frameLayout,
    model,
    aspect,
  );

  const lightRig = createBroMetalLightRig();
  const lightValues = lightRig.lightValues;
  const lightBuffer = device.createBuffer({
    label: "BroMetal Deferred Light Storage",
    size: lightValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  device.queue.writeBuffer(lightBuffer, 0, lightValues);
  const particleValues = lightRig.particleValues;
  const particleBuffer = device.createBuffer({
    label: "BroMetal Independent Particle Storage",
    size: particleValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  device.queue.writeBuffer(particleBuffer, 0, particleValues);
  const particleLayout = device.createBindGroupLayout({
    label: "BroMetal particle layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform", minBindingSize: 160 },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage", minBindingSize: BROMETAL_PARTICLE_COUNT * 32 },
      },
    ],
  });
  const particlePipeline = await device.createRenderPipelineAsync({
    label: "BroMetal AOT additive particle pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [particleLayout] }),
    vertex: { module: particleModule, entryPoint: "particleVertex" },
    fragment: {
      module: particleModule,
      entryPoint: "particleFragment",
      targets: [
        {
          format: "rgba16float",
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: false,
      depthCompare: "less-equal",
    },
  });
  const particleBindGroup = device.createBindGroup({
    label: "BroMetal independent particle bind group",
    layout: particleLayout,
    entries: [
      { binding: 0, resource: { buffer: frameBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  });
  const lightingLayout = device.createBindGroupLayout({
    label: "BroMetal deferred lighting layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 160 } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      { binding: 9, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 176 } },
      {
        binding: 10,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "cube" },
      },
      { binding: 11, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      {
        binding: 12,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform", minBindingSize: 16 },
      },
    ],
  });
  const lightingPipeline = await device.createRenderPipelineAsync({
    label: "BroMetal screen-space PBR lighting pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [lightingLayout] }),
    vertex: { module: lightingModule, entryPoint: "screenVertex" },
    fragment: {
      module: lightingModule,
      entryPoint: "lightingFragment",
      targets: [
        { format: "rgba16float" },
        { format: ambientPlan.format },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
  const lightingBindGroup = device.createBindGroup({
    label: "BroMetal GBuffer lighting bind group",
    layout: lightingLayout,
    entries: [
      { binding: 0, resource: albedo.createView() },
      { binding: 1, resource: normalRoughness.createView() },
      { binding: 2, resource: worldMetal.createView() },
      { binding: 3, resource: depth.createView() },
      { binding: 4, resource: { buffer: lightBuffer } },
      { binding: 5, resource: { buffer: frameBuffer } },
      { binding: 6, resource: shadow.cascades[0].view },
      { binding: 7, resource: shadow.cascades[1].view },
      { binding: 8, resource: shadow.sampler },
      { binding: 9, resource: { buffer: shadow.lightingBuffer } },
      { binding: 10, resource: environment.view },
      { binding: 11, resource: environment.sampler },
      { binding: 12, resource: { buffer: ambientBuffer } },
    ],
  });
  const temporal = await createBroMetalTemporalResources(
    device,
    temporalModule,
    hdr,
    ambient,
    profile.width,
    profile.height,
  );
  const reflection = await createBroMetalReflectionResources(
    device,
    {
      reconstruct: reflectionReconstructModule,
      select: reflectionSelectModule,
      trace: reflectionModule,
    },
    {
      depth,
      frameBuffer,
      hdr,
      height: profile.height,
      normalRoughness,
      resolvedHdr: temporal.histories,
      width: profile.width,
      worldMetal,
    },
  );

  const bloomSampler = device.createSampler({
    label: "BroMetal bloom clamp sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });
  const bloomLayout = device.createBindGroupLayout({
    label: "BroMetal AOT bloom layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform", minBindingSize: 16 },
      },
    ],
  });
  const bloomPipeline = await device.createRenderPipelineAsync({
    label: "BroMetal AOT quarter-resolution Gaussian bloom pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [bloomLayout] }),
    vertex: { module: bloomModule, entryPoint: "screenVertex" },
    fragment: {
      module: bloomModule,
      entryPoint: "bloomFragment",
      targets: [{ format: "rgba16float" }],
    },
    primitive: { topology: "triangle-list" },
  });
  const createUniformBuffer = (
    label: string,
    values: Float32Array<ArrayBuffer>,
  ): GPUBuffer => {
    const buffer = device.createBuffer({
      label,
      size: values.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(buffer, 0, values);
    return buffer;
  };
  const bloomStages: Array<{
    readonly source: GPUTexture;
    readonly settings: GPUBuffer;
    readonly target: GPUTexture;
  }> = [];
  bloomStages.push({
    source: reflection.target,
    settings: createUniformBuffer(
      "BroMetal bloom bright extraction settings",
      new Float32Array([1 / firstBloomLevel.width, 1 / firstBloomLevel.height, 0, 0]),
    ),
    target: bloomBright,
  });
  for (let index = 0; index < bloomPlan.levels.length; index += 1) {
    const level = bloomPlan.levels[index];
    const horizontal = bloomHorizontal[index];
    const vertical = bloomVertical[index];
    if (level === undefined || horizontal === undefined || vertical === undefined) {
      throw new Error(`BroMetal bloom level ${index} is incomplete`);
    }
    const source = index === 0 ? bloomBright : bloomVertical[index - 1];
    if (source === undefined) throw new Error(`BroMetal bloom level ${index} has no source`);
    bloomStages.push({
      source,
      settings: createUniformBuffer(
        `BroMetal bloom horizontal level ${index} settings`,
        new Float32Array([1 / level.width, 1 / level.height, level.kernelRadius, 1]),
      ),
      target: horizontal,
    });
    bloomStages.push({
      source: horizontal,
      settings: createUniformBuffer(
        `BroMetal bloom vertical level ${index} settings`,
        new Float32Array([1 / level.width, 1 / level.height, level.kernelRadius, 2]),
      ),
      target: vertical,
    });
  }
  const bloomBindGroups = bloomStages.map(({ source, settings }, index) =>
    device.createBindGroup({
      label: `BroMetal bloom stage ${index} bind group`,
      layout: bloomLayout,
      entries: [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: bloomSampler },
        { binding: 2, resource: { buffer: settings } },
      ],
    }),
  );

  const composeValues = createBroMetalCompositeSettings(
    profile.width,
    profile.height,
  );
  const composeBuffer = device.createBuffer({
    label: "BroMetal Composite Settings Uniform",
    size: composeValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(composeBuffer, 0, composeValues);
  const composeLayout = device.createBindGroupLayout({
    label: "BroMetal composite layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform", minBindingSize: 16 } },
    ],
  });
  const compositePipeline = await device.createRenderPipelineAsync({
    label: "BroMetal bloom tone-map pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [composeLayout] }),
    vertex: { module: compositeModule, entryPoint: "screenVertex" },
    fragment: {
      module: compositeModule,
      entryPoint: "compositeFragment",
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: "triangle-list" },
  });
  const composeBindGroup = device.createBindGroup({
    label: "BroMetal HDR composite bind group",
    layout: composeLayout,
    entries: [
      { binding: 0, resource: reflection.target.createView() },
      ...bloomVertical.map((texture, index) => ({
        binding: index + 1,
        resource: texture.createView(),
      })),
      { binding: 6, resource: bloomSampler },
      { binding: 7, resource: { buffer: composeBuffer } },
    ],
  });

  const targetBytes = pixelCount * (4 + 8 + 8 + 4 + 8) +
    ambientPlan.estimatedBytes;
  const trackedBytes =
    scene.estimatedBytes +
    targetBytes +
    reflection.estimatedBytes +
    temporal.estimatedBytes +
    (firstBloomLevel.width * firstBloomLevel.height +
      bloomPlan.levels.reduce(
        (sum, level) => sum + level.width * level.height * 2,
        0,
      )) * 8 +
    lightValues.byteLength +
    particleValues.byteLength +
    frameValues.byteLength +
    ambientValues.byteLength +
    environment.bytes +
    shadow.estimatedBytes;
  let frameIndex = 0;
  let previousTime: number | undefined;
  let smoothedFps = 0;
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
    const cpuStarted = performance.now();
    const time = frameIndex / 60;
    writeBroMetalTemporalFrame(
      frameValues,
      baseViewProjection,
      profile.width,
      profile.height,
      frameIndex,
    );
    frameValues[37] = time;
    lightRig.updateFrame(frameIndex);
    writeBroMetalDynamicBuffers(device.queue, {
      frame: { buffer: frameBuffer, values: frameValues },
      lights: { buffer: lightBuffer, values: lightValues },
      particles: { buffer: particleBuffer, values: particleValues },
      temporal: {
        buffer: temporal.settingsBuffer,
        values: createBroMetalTemporalSettings(
          profile.width,
          profile.height,
          frameIndex,
        ),
      },
    });

    const encoder = device.createCommandEncoder({ label: "BroMetal deferred frame encoder" });
    encodeBroMetalShadowPass(encoder, scene.primitives, shadow);
    const geometryPass = encoder.beginRenderPass({
      label: "BroMetal 103-primitive GBuffer pass",
      colorAttachments: [
        { view: albedo.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
        { view: normalRoughness.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
        { view: worldMetal.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    encodeBroMetalGeometryPass(
      geometryPass,
      scene.primitives,
      frameBindGroup,
      geometryBack,
      geometryDouble,
    );
    geometryPass.end();

    const lightingPass = encoder.beginRenderPass({
      label: "BroMetal screen-space PBR and AO pass",
      colorAttachments: [
        { view: hdr.createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" },
        { view: ambient.createView(), clearValue: [1, 0, 0, 1], loadOp: "clear", storeOp: "store" },
      ],
    });
    lightingPass.setPipeline(lightingPipeline);
    lightingPass.setBindGroup(0, lightingBindGroup);
    lightingPass.draw(3);
    lightingPass.end();

    const particlePass = encoder.beginRenderPass({
      label: "BroMetal AOT emissive particle pass",
      colorAttachments: [
        { view: hdr.createView(), loadOp: "load", storeOp: "store" },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthLoadOp: "load",
        depthStoreOp: "discard",
      },
    });
    particlePass.setPipeline(particlePipeline);
    particlePass.setBindGroup(0, particleBindGroup);
    particlePass.draw(6, BROMETAL_PARTICLE_COUNT);
    particlePass.end();

    const resolvedHistoryIndex = encodeBroMetalTemporalPass(
      encoder,
      temporal,
      frameIndex,
    );
    encodeBroMetalReflectionPass(encoder, reflection, resolvedHistoryIndex);

    for (let index = 0; index < bloomStages.length; index += 1) {
      const stage = bloomStages[index];
      const bindGroup = bloomBindGroups[index];
      if (stage === undefined || bindGroup === undefined) {
        throw new Error(`BroMetal bloom stage ${index} is incomplete`);
      }
      encodeBroMetalBloomPass(
        encoder,
        index === 0
          ? "BroMetal bloom bright extraction pass"
          : `BroMetal bloom pyramid pass ${index}`,
        stage.target,
        bloomPipeline,
        bindGroup,
      );
    }

    const compositePass = encoder.beginRenderPass({
      label: "BroMetal wide-bloom ACES composite pass",
      colorAttachments: [
        { view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" },
      ],
    });
    compositePass.setPipeline(compositePipeline);
    compositePass.setBindGroup(0, composeBindGroup);
    compositePass.draw(3);
    compositePass.end();
    device.queue.submit([encoder.finish()]);

    const elapsed = previousTime === undefined ? 0 : Math.max(timeMs - previousTime, 0.001);
    previousTime = timeMs;
    if (elapsed > 0) {
      const fps = 1000 / elapsed;
      smoothedFps = smoothedFps === 0 ? fps : smoothedFps * 0.9 + fps * 0.1;
    }
    telemetry.firstFrameAt ??= performance.now();
    telemetry.status = "ready";
    telemetry.latestFrame = {
      frameIndex,
      cpuTimeMs: performance.now() - cpuStarted,
      fps: smoothedFps,
      lights: BROMETAL_SIMULATED_LIGHT_COUNT,
      visibleMeshes: scene.primitives.length,
      totalMeshes: scene.primitives.length,
      vram: formatBytes(trackedBytes),
    };
    if (frameIndex % 30 === 0) {
      const indexedGeometryDraws = countBroMetalIndexedGeometryDraws(
        scene.primitives.length,
      );
      display.ready(
        `BroMetal AOT · ${profileName} ${profile.width}×${profile.height} · ` +
          `${indexedGeometryDraws} indexed geometry draws · ${BROMETAL_SIMULATED_LIGHT_COUNT} simulated lights · ${smoothedFps.toFixed(1)} fps`,
      );
    }
    frameIndex += 1;
    animationFrame = requestAnimationFrame(render);
  };
  animationFrame = requestAnimationFrame(render);

  return {
    stop(): void {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      shadow.destroy();
      environment.destroy();
      telemetry.status = "stopped";
    },
  };
}

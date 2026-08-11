import {
  CONTROLLED_PROFILES,
  controlledShaderFor,
  hashControlledShader,
  type ControlledImplementationId,
  type ControlledProfile,
} from "./contract.js";
import type { ControlledTelemetry } from "./telemetry.js";

interface RunningControlledRenderer {
  stop(): void;
}

export async function createControlledPipelines(
  device: GPUDevice,
  shaderSource: string,
  canvasFormat: GPUTextureFormat,
) {
  const module = device.createShaderModule({
    code: shaderSource,
    label: "Controlled byte-identical WGSL module",
  });
  const compilation = await module.getCompilationInfo();
  const errors = compilation.messages.filter(({ type }) => type === "error");
  if (errors.length > 0) {
    throw new Error(errors.map(({ message }) => message).join("\n"));
  }

  const sceneLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      buffer: { minBindingSize: 16, type: "uniform" },
      visibility: GPUShaderStage.FRAGMENT,
    }],
    label: "Controlled scene layout",
  });
  const compositeLayout = device.createBindGroupLayout({
    entries: [{
      binding: 1,
      texture: { sampleType: "unfilterable-float" },
      visibility: GPUShaderStage.FRAGMENT,
    }],
    label: "Controlled composite layout",
  });
  const [scenePipeline, compositePipeline] = await Promise.all([
    device.createRenderPipelineAsync({
      fragment: {
        entryPoint: "controlledFragment",
        module,
        targets: [{ format: "rgba16float" }],
      },
      label: "Controlled 32-light GGX pipeline",
      layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout] }),
      primitive: { topology: "triangle-list" },
      vertex: { entryPoint: "fullScreenVertex", module },
    }),
    device.createRenderPipelineAsync({
      fragment: {
        entryPoint: "compositeFragment",
        module,
        targets: [{ format: canvasFormat }],
      },
      label: "Controlled ACES composite pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [compositeLayout],
      }),
      primitive: { topology: "triangle-list" },
      vertex: { entryPoint: "fullScreenVertex", module },
    }),
  ]);

  return {
    compositeLayout,
    compositePipeline,
    sceneLayout,
    scenePipeline,
  };
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB descriptor estimate`;
}

export async function startControlledRenderer(
  canvas: HTMLCanvasElement,
  implementation: ControlledImplementationId,
  profileName: ControlledProfile,
  telemetry: ControlledTelemetry,
  taskDynamics: "dynamic" | "static" = "dynamic",
): Promise<RunningControlledRenderer> {
  if (navigator.gpu === undefined) throw new Error("WebGPU is unavailable");
  const profile = CONTROLLED_PROFILES[profileName];
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (adapter === null) throw new Error("No WebGPU adapter is available");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (context === null) throw new Error("Unable to create a WebGPU context");

  canvas.width = profile.width;
  canvas.height = profile.height;
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ alphaMode: "opaque", device, format: canvasFormat });

  const shaderSource = controlledShaderFor(implementation);
  telemetry.shaderHash = await hashControlledShader(shaderSource);

  const frameValues = new Float32Array([
    0,
    profile.width,
    profile.height,
    32,
  ]);
  const frameBuffer = device.createBuffer({
    label: "Controlled frame uniform",
    size: frameValues.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(frameBuffer, 0, frameValues);
  const hdrTexture = device.createTexture({
    format: "rgba16float",
    label: "Controlled HDR target",
    size: [profile.width, profile.height],
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const {
    compositeLayout,
    compositePipeline,
    sceneLayout,
    scenePipeline,
  } = await createControlledPipelines(
    device,
    shaderSource,
    canvasFormat,
  );
  const sceneGroup = device.createBindGroup({
    entries: [{ binding: 0, resource: { buffer: frameBuffer } }],
    label: "Controlled scene group",
    layout: sceneLayout,
  });
  const compositeGroup = device.createBindGroup({
    entries: [{ binding: 1, resource: hdrTexture.createView() }],
    label: "Controlled composite group",
    layout: compositeLayout,
  });

  const estimatedBytes = profile.width * profile.height * 8 +
    frameValues.byteLength;
  let animationFrame = 0;
  let frameIndex = 0;
  let previousTime: number | undefined;
  let smoothedFps = 0;
  let stopped = false;
  telemetry.assetsReadyAt = performance.now();

  device.lost.then((info) => {
    stopped = true;
    telemetry.status = "error";
    telemetry.error = `WebGPU device lost: ${info.message}`;
  });

  const render = (timeMs: number): void => {
    if (stopped) return;
    const cpuStarted = performance.now();
    if (taskDynamics === "dynamic") {
      frameValues[0] = frameIndex;
      device.queue.writeBuffer(frameBuffer, 0, frameValues);
    }

    const encoder = device.createCommandEncoder({
      label: "Controlled frame encoder",
    });
    const scenePass = encoder.beginRenderPass({
      colorAttachments: [{
        clearValue: [0, 0, 0, 1],
        loadOp: "clear",
        storeOp: "store",
        view: hdrTexture.createView(),
      }],
      label: "Controlled 32-light scene pass",
    });
    scenePass.setPipeline(scenePipeline);
    scenePass.setBindGroup(0, sceneGroup);
    scenePass.draw(3);
    scenePass.end();

    const compositePass = encoder.beginRenderPass({
      colorAttachments: [{
        clearValue: [0, 0, 0, 1],
        loadOp: "clear",
        storeOp: "store",
        view: context.getCurrentTexture().createView(),
      }],
      label: "Controlled ACES composite pass",
    });
    compositePass.setPipeline(compositePipeline);
    compositePass.setBindGroup(0, compositeGroup);
    compositePass.draw(3);
    compositePass.end();
    device.queue.submit([encoder.finish()]);

    const elapsed = previousTime === undefined ? 0 : timeMs - previousTime;
    previousTime = timeMs;
    if (elapsed > 0) {
      const fps = 1000 / elapsed;
      smoothedFps = smoothedFps === 0 ? fps : smoothedFps * 0.9 + fps * 0.1;
    }
    telemetry.firstFrameAt ??= performance.now();
    telemetry.status = "ready";
    telemetry.latestFrame = {
      cpuTimeMs: performance.now() - cpuStarted,
      fps: smoothedFps,
      frameIndex,
      lights: 32,
      totalMeshes: 1,
      visibleMeshes: 1,
      vram: formatBytes(estimatedBytes),
    };
    frameIndex += 1;
    animationFrame = requestAnimationFrame(render);
  };
  animationFrame = requestAnimationFrame(render);

  return {
    stop(): void {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      hdrTexture.destroy();
      frameBuffer.destroy();
      device.destroy();
      telemetry.status = "stopped";
    },
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { createInstrumentationScript } from "../scripts/instrumentation.mjs";

test("records WebGPU work and live resource estimates during a capture", async () => {
  let animationFrame;
  class GPUAdapter {
    features = new Set(["timestamp-query"]);
    info = { architecture: "test-arch", description: "Test GPU", device: "test-device", vendor: "test-vendor" };
    limits = { maxBufferSize: 1024, maxTextureDimension2D: 8192 };
  }
  class GPU {
    async requestAdapter() { return new GPUAdapter(); }
  }
  class GPUBuffer {
    async mapAsync() {}
    getMappedRange() { return new ArrayBuffer(16); }
    unmap() {}
    destroy() {}
  }
  class GPUTexture {
    destroy() {}
  }
  class GPURenderPassEncoder {
    draw() {}
    drawIndexed() {}
  }
  class GPUComputePassEncoder {
    dispatchWorkgroups() {}
  }
  class GPUCommandEncoder {
    beginRenderPass() { return new GPURenderPassEncoder(); }
    beginComputePass() { return new GPUComputePassEncoder(); }
    copyBufferToBuffer() {}
    copyBufferToTexture() {}
    copyTextureToBuffer() {}
    copyTextureToTexture() {}
  }
  class GPUQueue {
    submit() {}
    writeBuffer() {}
    writeTexture() {}
    copyExternalImageToTexture() {}
    async onSubmittedWorkDone() {}
  }
  class GPUDevice {
    createBuffer() { return new GPUBuffer(); }
    createTexture() { return new GPUTexture(); }
    createCommandEncoder() { return new GPUCommandEncoder(); }
    createShaderModule() { return {}; }
    createRenderPipeline() { return {}; }
    createRenderPipelineAsync() { return Promise.resolve({}); }
    createComputePipeline() { return {}; }
    createComputePipelineAsync() { return Promise.resolve({}); }
  }
  const context = {
    GPU,
    GPUAdapter,
    GPUBuffer,
    GPUCommandEncoder,
    GPUComputePassEncoder,
    GPUDevice,
    GPUQueue,
    GPURenderPassEncoder,
    GPUTexture,
    GPUBufferUsage: { MAP_READ: 1, MAP_WRITE: 2 },
    GPUMapMode: { READ: 1, WRITE: 2 },
    performance,
    queueMicrotask,
    requestAnimationFrame(callback) { animationFrame = callback; },
  };
  context.globalThis = context;
  context.window = context;
  context.__WEBGPU_AOT__ = { latestFrame: { frameIndex: 7 } };
  vm.runInNewContext(createInstrumentationScript(), context);

  const adapter = await new GPU().requestAdapter({ powerPreference: "high-performance" });
  assert.ok(adapter instanceof GPUAdapter);
  const device = new GPUDevice();
  const buffer = device.createBuffer({ size: 256, usage: 1 });
  const mappedBuffer = device.createBuffer({ mappedAtCreation: true, size: 128, usage: 2 });
  const texture = device.createTexture({ format: "rgba8unorm", sampleCount: 4, size: [10, 5, 1] });
  device.createRenderPipeline({ multisample: { count: 4 } });
  const commandEncoder = device.createCommandEncoder();
  const renderPass = commandEncoder.beginRenderPass({});
  renderPass.draw(3, 2);
  renderPass.drawIndexed(12, 4);
  const computePass = commandEncoder.beginComputePass({});
  computePass.dispatchWorkgroups(2, 3, 4);
  commandEncoder.copyBufferToBuffer(buffer, 0, mappedBuffer, 0, 64);
  commandEncoder.copyBufferToTexture({}, { texture }, [4, 3, 1]);
  commandEncoder.copyTextureToBuffer({ texture }, {}, [2, 2, 1]);
  commandEncoder.copyTextureToTexture({ texture }, { texture }, [3, 2, 1]);
  const queue = new GPUQueue();
  queue.writeBuffer({}, 0, new Uint8Array(32));
  queue.writeBuffer({}, 0, new Float32Array(10), 2, 3);
  queue.writeTexture({ texture }, new Uint8Array(80), {}, [5, 4, 1]);
  queue.copyExternalImageToTexture({}, { texture }, [4, 2, 1]);
  mappedBuffer.getMappedRange(0, 64);
  mappedBuffer.unmap();
  await buffer.mapAsync(1, 32, 96);
  buffer.getMappedRange(32, 48);
  buffer.unmap();
  queue.submit([{}, {}]);
  await new Promise((resolve) => setImmediate(resolve));
  animationFrame(1);
  animationFrame(17);

  assert.deepEqual({ ...context.__BENCHMARK__.resources }, {
    liveBufferBytes: 384,
    liveBufferCount: 2,
    liveTextureBytes: 800,
    liveTextureCount: 1,
    texturesWithUnknownSize: 0,
  });
  assert.equal(context.__BENCHMARK__.maxSampleCount, 4);
  assert.equal(context.__BENCHMARK__.counters.commandEncoders, 1);
  assert.equal(context.__BENCHMARK__.counters.renderPasses, 1);
  assert.equal(context.__BENCHMARK__.counters.computePasses, 1);
  assert.equal(context.__BENCHMARK__.counters.drawCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.drawIndexedCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.totalVertices, 6);
  assert.equal(context.__BENCHMARK__.counters.totalIndices, 48);
  assert.equal(context.__BENCHMARK__.counters.dispatchCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.totalDispatchedWorkgroups, 24);
  assert.equal(context.__BENCHMARK__.counters.queueSubmits, 1);
  assert.equal(context.__BENCHMARK__.counters.submittedCommandBuffers, 2);
  assert.equal(context.__BENCHMARK__.counters.writeBufferCalls, 2);
  assert.equal(context.__BENCHMARK__.counters.writeBufferBytes, 44);
  assert.equal(context.__BENCHMARK__.counters.writeTextureCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.writeTextureBytes, 80);
  assert.equal(context.__BENCHMARK__.counters.copyExternalImageToTextureCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.copyExternalImageToTextureBytes, 32);
  assert.equal(context.__BENCHMARK__.counters.mappedAtCreationCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.mappedAtCreationBytes, 128);
  assert.equal(context.__BENCHMARK__.counters.mapAsyncReadCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.mapAsyncReadBytes, 96);
  assert.equal(context.__BENCHMARK__.counters.mapAsyncWriteCalls, 0);
  assert.equal(context.__BENCHMARK__.counters.getMappedRangeCalls, 2);
  assert.equal(context.__BENCHMARK__.counters.unmapCalls, 2);
  assert.equal(context.__BENCHMARK__.counters.copyBufferToBufferCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.copyBufferToBufferBytes, 64);
  assert.equal(context.__BENCHMARK__.counters.copyBufferToTextureCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.copyBufferToTextureBytes, 48);
  assert.equal(context.__BENCHMARK__.counters.copyTextureToBufferCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.copyTextureToBufferBytes, 16);
  assert.equal(context.__BENCHMARK__.counters.copyTextureToTextureCalls, 1);
  assert.equal(context.__BENCHMARK__.counters.copyTextureToTextureBytes, 24);
  assert.equal(context.__BENCHMARK__.frameTimes[0], 16);
  const snapshot = context.__BENCHMARK__.snapshot();
  context.__WEBGPU_AOT__.latestFrame.frameIndex = 12;
  assert.equal(snapshot.telemetryFrameIndex, 7);
  assert.deepEqual({ ...snapshot.adapter.info }, {
    architecture: "test-arch",
    description: "Test GPU",
    device: "test-device",
    vendor: "test-vendor",
  });
  assert.deepEqual([...snapshot.adapter.features], ["timestamp-query"]);
  assert.equal(snapshot.adapter.limits.maxBufferSize, 1024);
  assert.equal(snapshot.adapter.requestOptions.powerPreference, "high-performance");
  assert.equal(snapshot.dataMovement.cpuToGpuQueueWrites.classification, "cpu-source-to-gpu");
  assert.equal(snapshot.dataMovement.gpuToCpuMapReads.classification, "gpu-to-cpu-readback-request");
  assert.equal(snapshot.dataMovement.externalImageCopies.classification, "external-source-to-gpu-source-residency-unknown");
  assert.equal(snapshot.dataMovement.gpuInternalCopies.classification, "gpu-internal");
  assert.equal(snapshot.dataMovement.mappedWrites.classification, "cpu-writable-capacity-not-confirmed-transfer");

  buffer.destroy();
  mappedBuffer.destroy();
  texture.destroy();
  assert.equal(context.__BENCHMARK__.resources.liveBufferBytes, 0);
  assert.equal(context.__BENCHMARK__.resources.liveTextureBytes, 0);
});

export function createInstrumentationScript() {
  return `(() => {
    const counters = {
      commandEncoders: 0,
      computePasses: 0,
      copyBufferToBufferBytes: 0,
      copyBufferToBufferCalls: 0,
      copyBufferToTextureBytes: 0,
      copyBufferToTextureCalls: 0,
      copyBufferToTextureUnknownByteCalls: 0,
      copyExternalImageToTextureBytes: 0,
      copyExternalImageToTextureCalls: 0,
      copyExternalImageToTextureUnknownByteCalls: 0,
      copyTextureToBufferBytes: 0,
      copyTextureToBufferCalls: 0,
      copyTextureToBufferUnknownByteCalls: 0,
      copyTextureToTextureBytes: 0,
      copyTextureToTextureCalls: 0,
      copyTextureToTextureUnknownByteCalls: 0,
      dispatchCalls: 0,
      drawCalls: 0,
      drawIndexedCalls: 0,
      getMappedRangeCalls: 0,
      mapAsyncReadBytes: 0,
      mapAsyncReadCalls: 0,
      mapAsyncWriteBytes: 0,
      mapAsyncWriteCalls: 0,
      mappedAtCreationBytes: 0,
      mappedAtCreationCalls: 0,
      queueSubmits: 0,
      renderPasses: 0,
      submittedCommandBuffers: 0,
      totalDispatchedWorkgroups: 0,
      totalIndices: 0,
      totalInstances: 0,
      totalVertices: 0,
      unmapCalls: 0,
      writeBufferBytes: 0,
      writeBufferCalls: 0,
      writeTextureBytes: 0,
      writeTextureCalls: 0,
      writeTextureUnknownByteCalls: 0,
    };
    const resources = {
      liveBufferBytes: 0,
      liveBufferCount: 0,
      liveTextureBytes: 0,
      liveTextureCount: 0,
      texturesWithUnknownSize: 0,
    };
    const dataMovement = {
      cpuToGpuQueueWrites: {
        apis: ['GPUQueue.writeBuffer', 'GPUQueue.writeTexture'],
        byteSemantics: 'Buffer bytes are API payload bytes; texture bytes are known-format logical texel/block payload and exclude row padding and driver transfers.',
        classification: 'cpu-source-to-gpu',
      },
      externalImageCopies: {
        apis: ['GPUQueue.copyExternalImageToTexture'],
        byteSemantics: 'Known-format destination logical texel/block payload estimate.',
        classification: 'external-source-to-gpu-source-residency-unknown',
      },
      gpuInternalCopies: {
        apis: ['GPUCommandEncoder.copyBufferToBuffer', 'GPUCommandEncoder.copyBufferToTexture', 'GPUCommandEncoder.copyTextureToBuffer', 'GPUCommandEncoder.copyTextureToTexture'],
        byteSemantics: 'Known logical copy payload; texture copies exclude layout padding and unknown formats are counted separately.',
        classification: 'gpu-internal',
      },
      gpuToCpuMapReads: {
        apis: ['GPUBuffer.mapAsync(GPUMapMode.READ)'],
        byteSemantics: 'Requested mapped range, counted once at mapAsync; getMappedRange is not added again.',
        classification: 'gpu-to-cpu-readback-request',
      },
      mappedWrites: {
        apis: ['GPUDevice.createBuffer(mappedAtCreation)', 'GPUBuffer.mapAsync(GPUMapMode.WRITE)'],
        byteSemantics: 'CPU-writable mapped capacity; JavaScript writes within a mapped range are not observable, so this is not confirmed transfer volume.',
        classification: 'cpu-writable-capacity-not-confirmed-transfer',
      },
    };
    const measurements = window.__BENCHMARK__ = {
      adapter: null,
      counters,
      dataMovement,
      frameTimes: [],
      maxSampleCount: 1,
      pipelineCreationMs: 0,
      pipelineCreations: 0,
      resources,
      sampleGeneration: 0,
      shaderPreparationMs: 0,
      shaderModules: 0,
    };
    measurements.snapshot = () => ({
      adapter: measurements.adapter === null ? null : {
        features: [...measurements.adapter.features],
        info: { ...measurements.adapter.info },
        limits: { ...measurements.adapter.limits },
        requestOptions: { ...measurements.adapter.requestOptions },
      },
      counters: { ...counters },
      dataMovement,
      resources: { ...resources },
      telemetryFrameIndex: window.__WEBGPU_AOT__?.latestFrame?.frameIndex ?? null,
    });

    const textureDescriptors = new WeakMap();
    const formatBlock = (format) => {
      const uncompressedBytes = {
        r8sint: 1, r8snorm: 1, r8uint: 1, r8unorm: 1,
        r16float: 2, r16sint: 2, r16uint: 2,
        rg8sint: 2, rg8snorm: 2, rg8uint: 2, rg8unorm: 2,
        depth16unorm: 2,
        bgra8unorm: 4, 'bgra8unorm-srgb': 4,
        depth24plus: 4, 'depth24plus-stencil8': 4, depth32float: 4,
        r32float: 4, r32sint: 4, r32uint: 4,
        rg16float: 4, rg16sint: 4, rg16uint: 4,
        rgb10a2uint: 4, rgb10a2unorm: 4, rg11b10ufloat: 4, rgb9e5ufloat: 4,
        rgba8sint: 4, rgba8snorm: 4, rgba8uint: 4, rgba8unorm: 4,
        'rgba8unorm-srgb': 4,
        'depth32float-stencil8': 8,
        rg32float: 8, rg32sint: 8, rg32uint: 8,
        rgba16float: 8, rgba16sint: 8, rgba16uint: 8,
        rgba32float: 16, rgba32sint: 16, rgba32uint: 16,
      }[format];
      if (uncompressedBytes !== undefined) return { bytes: uncompressedBytes, height: 1, width: 1 };
      if (/^bc(?:1|4)-/.test(format) || /^(?:eac-r11|etc2-rgb8|etc2-rgb8a1)/.test(format)) return { bytes: 8, height: 4, width: 4 };
      if (/^bc(?:2|3|5|6h|7)-/.test(format) || /^(?:eac-rg11|etc2-rgba8)/.test(format)) return { bytes: 16, height: 4, width: 4 };
      const astc = /^astc-(\\d+)x(\\d+)-/.exec(format);
      return astc === null ? null : { bytes: 16, height: Number(astc[2]), width: Number(astc[1]) };
    };
    const copyExtent = (size) => ({
      depth: Number(size?.depthOrArrayLayers ?? size?.[2] ?? 1),
      height: Number(size?.height ?? size?.[1] ?? 1),
      width: Number(size?.width ?? size?.[0] ?? 1),
    });
    const logicalTextureBytes = (format, size) => {
      const block = formatBlock(format);
      if (block === null) return null;
      const { depth, height, width } = copyExtent(size);
      return Math.ceil(width / block.width) * Math.ceil(height / block.height) * depth * block.bytes;
    };
    const textureBytes = (descriptor) => {
      const block = formatBlock(descriptor.format);
      if (block === null) return null;
      const size = descriptor.size ?? [1, 1, 1];
      const width = Number(size.width ?? size[0] ?? 1);
      const height = Number(size.height ?? size[1] ?? 1);
      const depth = Number(size.depthOrArrayLayers ?? size[2] ?? 1);
      const mipLevels = Number(descriptor.mipLevelCount ?? 1);
      const samples = Number(descriptor.sampleCount ?? 1);
      let total = 0;
      for (let mip = 0; mip < mipLevels; mip += 1) {
        const mipDepth = descriptor.dimension === '3d' ? Math.max(1, Math.floor(depth / 2 ** mip)) : depth;
        const mipWidth = Math.max(1, Math.floor(width / 2 ** mip));
        const mipHeight = Math.max(1, Math.floor(height / 2 ** mip));
        total += Math.ceil(mipWidth / block.width) * Math.ceil(mipHeight / block.height) * mipDepth * block.bytes * samples;
      }
      return total;
    };
    const copyTextureBytes = (imageCopy, size) => {
      const descriptor = textureDescriptors.get(imageCopy?.texture);
      return descriptor === undefined ? null : logicalTextureBytes(descriptor.format, size);
    };
    const recordBytes = (bytesKey, unknownKey, value) => {
      if (value === null || !Number.isFinite(value)) counters[unknownKey] += 1;
      else counters[bytesKey] += value;
    };
    const patch = (prototype, name, replacement) => {
      if (!prototype || typeof prototype[name] !== 'function') return;
      const original = prototype[name];
      prototype[name] = replacement(original);
    };
    const timed = (prototype, name, counter, count) => {
      patch(prototype, name, (original) => function (...args) {
        const started = performance.now();
        const record = () => {
          measurements[counter] += performance.now() - started;
          measurements[count] += 1;
        };
        try {
          const result = original.apply(this, args);
          if (result && typeof result.then === 'function') return result.finally(record);
          record();
          return result;
        } catch (error) {
          record();
          throw error;
        }
      });
    };

    const selectedProperties = (value, names) => Object.fromEntries(names.flatMap((name) => {
      const property = value?.[name];
      return typeof property === 'string' || Number.isFinite(property) ? [[name, property]] : [];
    }));
    patch(globalThis.GPU?.prototype, 'requestAdapter', (original) => async function (...args) {
      const adapter = await original.apply(this, args);
      if (adapter !== null) {
        measurements.adapter = {
          features: [...(adapter.features ?? [])].map(String).sort(),
          info: selectedProperties(adapter.info, [
            'architecture', 'description', 'device', 'subgroupMaxSize', 'subgroupMinSize', 'vendor',
          ]),
          limits: selectedProperties(adapter.limits, [
            'maxBindGroups', 'maxBindingsPerBindGroup', 'maxBufferSize',
            'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupStorageSize',
            'maxStorageBufferBindingSize', 'maxTextureArrayLayers', 'maxTextureDimension2D',
            'maxUniformBufferBindingSize',
          ]),
          requestOptions: selectedProperties(args[0], ['powerPreference', 'forceFallbackAdapter']),
        };
      }
      return adapter;
    });

    timed(globalThis.GPUDevice?.prototype, 'createShaderModule', 'shaderPreparationMs', 'shaderModules');
    for (const name of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) {
      timed(globalThis.GPUDevice?.prototype, name, 'pipelineCreationMs', 'pipelineCreations');
    }
    for (const name of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) {
      patch(globalThis.GPUDevice?.prototype, name, (original) => function (descriptor, ...rest) {
        measurements.maxSampleCount = Math.max(measurements.maxSampleCount, Number(descriptor?.multisample?.count ?? 1));
        return original.call(this, descriptor, ...rest);
      });
    }

    const bufferRecords = new WeakMap();
    patch(globalThis.GPUDevice?.prototype, 'createBuffer', (original) => function (descriptor) {
      const buffer = original.call(this, descriptor);
      const bytes = Number(descriptor?.size ?? 0);
      bufferRecords.set(buffer, { bytes, usage: Number(descriptor?.usage ?? 0) });
      resources.liveBufferBytes += bytes;
      resources.liveBufferCount += 1;
      if (descriptor?.mappedAtCreation === true) {
        counters.mappedAtCreationCalls += 1;
        counters.mappedAtCreationBytes += bytes;
      }
      return buffer;
    });
    patch(globalThis.GPUBuffer?.prototype, 'destroy', (original) => function (...args) {
      const record = bufferRecords.get(this);
      if (record !== undefined) {
        resources.liveBufferBytes -= record.bytes;
        resources.liveBufferCount -= 1;
        bufferRecords.delete(this);
      }
      return original.apply(this, args);
    });
    patch(globalThis.GPUBuffer?.prototype, 'mapAsync', (original) => function (mode, offset = 0, size) {
      const record = bufferRecords.get(this);
      const bytes = Number(size ?? Math.max(0, Number(record?.bytes ?? 0) - Number(offset)));
      const readMode = Number(globalThis.GPUMapMode?.READ ?? 1);
      const writeMode = Number(globalThis.GPUMapMode?.WRITE ?? 2);
      if ((Number(mode) & readMode) !== 0) {
        counters.mapAsyncReadCalls += 1;
        counters.mapAsyncReadBytes += bytes;
      } else if ((Number(mode) & writeMode) !== 0) {
        counters.mapAsyncWriteCalls += 1;
        counters.mapAsyncWriteBytes += bytes;
      }
      return original.call(this, mode, offset, size);
    });
    patch(globalThis.GPUBuffer?.prototype, 'getMappedRange', (original) => function (...args) {
      counters.getMappedRangeCalls += 1;
      return original.apply(this, args);
    });
    patch(globalThis.GPUBuffer?.prototype, 'unmap', (original) => function (...args) {
      counters.unmapCalls += 1;
      return original.apply(this, args);
    });

    patch(globalThis.GPUDevice?.prototype, 'createTexture', (original) => function (descriptor) {
      const texture = original.call(this, descriptor);
      const bytes = textureBytes(descriptor ?? {});
      textureDescriptors.set(texture, { ...descriptor, size: descriptor?.size });
      resources.liveTextureCount += 1;
      if (bytes === null) resources.texturesWithUnknownSize += 1;
      else resources.liveTextureBytes += bytes;
      measurements.maxSampleCount = Math.max(measurements.maxSampleCount, Number(descriptor?.sampleCount ?? 1));
      return texture;
    });
    patch(globalThis.GPUTexture?.prototype, 'destroy', (original) => function (...args) {
      if (textureDescriptors.has(this)) {
        const bytes = textureBytes(textureDescriptors.get(this));
        resources.liveTextureCount -= 1;
        if (bytes === null) resources.texturesWithUnknownSize -= 1;
        else resources.liveTextureBytes -= bytes;
        textureDescriptors.delete(this);
      }
      return original.apply(this, args);
    });

    patch(globalThis.GPUDevice?.prototype, 'createCommandEncoder', (original) => function (...args) {
      counters.commandEncoders += 1;
      return original.apply(this, args);
    });
    patch(globalThis.GPUCommandEncoder?.prototype, 'beginRenderPass', (original) => function (...args) {
      counters.renderPasses += 1;
      return original.apply(this, args);
    });
    patch(globalThis.GPUCommandEncoder?.prototype, 'beginComputePass', (original) => function (...args) {
      counters.computePasses += 1;
      return original.apply(this, args);
    });
    patch(globalThis.GPUCommandEncoder?.prototype, 'copyBufferToBuffer', (original) => function (source, sourceOffset, destination, destinationOffset, size) {
      counters.copyBufferToBufferCalls += 1;
      counters.copyBufferToBufferBytes += Number(size ?? 0);
      return original.call(this, source, sourceOffset, destination, destinationOffset, size);
    });
    patch(globalThis.GPUCommandEncoder?.prototype, 'copyBufferToTexture', (original) => function (source, destination, size) {
      counters.copyBufferToTextureCalls += 1;
      recordBytes('copyBufferToTextureBytes', 'copyBufferToTextureUnknownByteCalls', copyTextureBytes(destination, size));
      return original.call(this, source, destination, size);
    });
    patch(globalThis.GPUCommandEncoder?.prototype, 'copyTextureToBuffer', (original) => function (source, destination, size) {
      counters.copyTextureToBufferCalls += 1;
      recordBytes('copyTextureToBufferBytes', 'copyTextureToBufferUnknownByteCalls', copyTextureBytes(source, size));
      return original.call(this, source, destination, size);
    });
    patch(globalThis.GPUCommandEncoder?.prototype, 'copyTextureToTexture', (original) => function (source, destination, size) {
      counters.copyTextureToTextureCalls += 1;
      const copiedBytes = copyTextureBytes(source, size) ?? copyTextureBytes(destination, size);
      recordBytes('copyTextureToTextureBytes', 'copyTextureToTextureUnknownByteCalls', copiedBytes);
      return original.call(this, source, destination, size);
    });
    patch(globalThis.GPURenderPassEncoder?.prototype, 'draw', (original) => function (vertices, instances = 1, ...rest) {
      counters.drawCalls += 1;
      counters.totalVertices += Number(vertices) * Number(instances);
      counters.totalInstances += Number(instances);
      return original.call(this, vertices, instances, ...rest);
    });
    patch(globalThis.GPURenderPassEncoder?.prototype, 'drawIndexed', (original) => function (indices, instances = 1, ...rest) {
      counters.drawIndexedCalls += 1;
      counters.totalIndices += Number(indices) * Number(instances);
      counters.totalInstances += Number(instances);
      return original.call(this, indices, instances, ...rest);
    });
    patch(globalThis.GPUComputePassEncoder?.prototype, 'dispatchWorkgroups', (original) => function (x, y = 1, z = 1) {
      counters.dispatchCalls += 1;
      counters.totalDispatchedWorkgroups += Number(x) * Number(y) * Number(z);
      return original.call(this, x, y, z);
    });
    let latestQueue;
    patch(globalThis.GPUQueue?.prototype, 'submit', (original) => function (commandBuffers) {
      latestQueue = this;
      counters.queueSubmits += 1;
      counters.submittedCommandBuffers += Number(commandBuffers?.length ?? 0);
      return original.call(this, commandBuffers);
    });
    patch(globalThis.GPUQueue?.prototype, 'writeBuffer', (original) => function (buffer, offset, data, dataOffset = 0, size) {
      const bytesPerElement = Number(data?.BYTES_PER_ELEMENT ?? 1);
      const availableElements = Number(data?.byteLength ?? 0) / bytesPerElement - Number(dataOffset ?? 0);
      const writtenElements = Number(size ?? Math.max(0, availableElements));
      counters.writeBufferCalls += 1;
      counters.writeBufferBytes += writtenElements * bytesPerElement;
      return original.call(this, buffer, offset, data, dataOffset, size);
    });
    patch(globalThis.GPUQueue?.prototype, 'writeTexture', (original) => function (destination, data, dataLayout, size) {
      counters.writeTextureCalls += 1;
      recordBytes('writeTextureBytes', 'writeTextureUnknownByteCalls', copyTextureBytes(destination, size));
      return original.call(this, destination, data, dataLayout, size);
    });
    patch(globalThis.GPUQueue?.prototype, 'copyExternalImageToTexture', (original) => function (source, destination, size) {
      counters.copyExternalImageToTextureCalls += 1;
      recordBytes('copyExternalImageToTextureBytes', 'copyExternalImageToTextureUnknownByteCalls', copyTextureBytes(destination, size));
      return original.call(this, source, destination, size);
    });
    measurements.drainGpu = async () => {
      if (!latestQueue || typeof latestQueue.onSubmittedWorkDone !== 'function') return null;
      const started = performance.now();
      await latestQueue.onSubmittedWorkDone();
      return performance.now() - started;
    };

    let previous;
    let sampleGeneration = measurements.sampleGeneration;
    const frame = (now) => {
      if (sampleGeneration !== measurements.sampleGeneration) {
        sampleGeneration = measurements.sampleGeneration;
        previous = undefined;
      }
      if (previous !== undefined) measurements.frameTimes.push(now - previous);
      previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })();`;
}

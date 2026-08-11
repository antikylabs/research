import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemoTargets,
  classifyBrowserIssue,
  compareVisualPresentation,
  comparisonPassed,
  findSharedRendererPairs,
  findVisualParity,
  parseArguments,
  renderHtmlReport,
  summarizeReport,
} from "../scripts/compare-demos.mjs";
import {
  calculatePixelMetrics,
  createAnimationFrameGate,
  createWebGpuObserverScript,
  diffGpuCounters,
  estimateTextureBytes,
  isLiveTextureProbeTarget,
  isReflectionProofSettingsBinding,
  sanitizeArtifactName,
  snapshotSmallBufferBinding,
} from "../scripts/webgpu-observer.mjs";

test("recognizes renderer-local reflection reconstruction settings", () => {
  const buffer = { label: "WESL reflection mip 2 settings" };
  const binding = (name) => ({
    shaderBindings: [{ name, stage: "fragment" }],
  });
  assert.equal(isReflectionProofSettingsBinding(binding("settings"), buffer), true);
  assert.equal(
    isReflectionProofSettingsBinding(
      binding("reconstructionSettings"),
      buffer,
    ),
    true,
  );
  assert.equal(
    isReflectionProofSettingsBinding(binding("postSettings"), buffer),
    false,
  );
});
import {
  analyzeWgsl,
  attributeGpuBufferDependencies,
  attributePipelineBufferBindings,
  attributePipelineBindGroups,
  calculateWgslStructureLayouts,
  compareCpuGpuBufferSnapshots,
  createTextureProbePlan,
  decodeWgslBufferLayout,
  describePassDescriptor,
  describeExecutionBindings,
  describePipelineDescriptor,
  describeTextureProbeFormat,
  describeWgslBindingLayout,
  groupWgslBufferLayoutBindings,
  normalizeDynamicOffsets,
  normalizeJavaScriptCallsite,
  recordCommandSignature,
  resolveExecutionBufferBindings,
  resolveExecutionResourceBindings,
  sampleBufferData,
  selectBufferSampleLimit,
  selectEffectiveBufferWrites,
  selectBufferProbeTargets,
  summarizeProbeValues,
  updateCpuBufferSnapshot,
} from "../scripts/webgpu-analysis.mjs";
import * as webGpuAnalysis from "../scripts/webgpu-analysis.mjs";
import * as comparisonReport from "../scripts/comparison-report.mjs";
import {
  captureCanvasRendering,
  captureGpuFrameWindow,
  diffGpuWorkload,
} from "../scripts/comparison-capture.mjs";
import {
  createSelectedReflectionSamplePlan,
  decodeSelectedReflectionSamples,
  resolveSelectedReflection,
} from "../scripts/webgpu-selected-reflection.mjs";
import {
  resolveAntikySelectedReflection,
} from "../scripts/webgpu-selected-reflection-antiky.mjs";
import {
  validateAntikySelectedReflectionReconstruction,
} from "../scripts/webgpu-selected-reflection-antiky-reconstruction.mjs";
import {
  probeSelectedReflection as runSelectedReflectionProbe,
  summarizeSelectedReflectionSamples,
} from "../scripts/webgpu-selected-reflection-runtime.mjs";

test("buildDemoTargets maps every implementation and supports focused captures", () => {
  assert.deepEqual(
    buildDemoTargets({ host: "http://127.0.0.1", profile: "smoke" }),
    [
      {
        name: "BroMetal AOT",
        slug: "brometal",
        url: "http://127.0.0.1:4173/?profile=smoke",
      },
      {
        name: "TypeGPU runtime",
        slug: "typegpu",
        url: "http://127.0.0.1:4174/?profile=smoke",
      },
      {
        name: "TypeGPU-Antiky AOT",
        slug: "typegpu-antiky",
        url: "http://127.0.0.1:4175/?profile=smoke",
      },
      {
        name: "WESL static",
        slug: "wesl",
        url: "http://127.0.0.1:4176/?profile=smoke",
      },
      {
        name: "Three.js native",
        slug: "threejs",
        url: "http://127.0.0.1:4177/?profile=smoke",
      },
    ],
  );
  assert.deepEqual(
    buildDemoTargets({
      host: "http://127.0.0.1",
      only: "brometal",
      port: 4273,
      profile: "heavy",
    }),
    [
      {
        name: "BroMetal AOT",
        slug: "brometal",
        url: "http://127.0.0.1:4273/?profile=heavy",
      },
    ],
  );
  const offsetTargets = buildDemoTargets({
    host: "http://127.0.0.1",
    portOffset: 100,
    profile: "smoke",
  });
  assert.equal(offsetTargets[0].url, "http://127.0.0.1:4273/?profile=smoke");
  assert.equal(offsetTargets[4].url, "http://127.0.0.1:4277/?profile=smoke");
});

test("texture probes skip renderer resources destroyed after startup", () => {
  assert.equal(isLiveTextureProbeTarget({ record: {} }), true);
  assert.equal(
    isLiveTextureProbeTarget({ record: { destroyed: false } }),
    true,
  );
  assert.equal(
    isLiveTextureProbeTarget({ record: { destroyed: true } }),
    false,
  );
});

test("freezes bounded small-buffer state at submission", () => {
  const lastWrite = {
    bufferOffset: 0,
    byteLength: 16,
    sample: {
      byteLength: 16,
      sampledBytes: 16,
      segments: [{ byteOffset: 0, bytes: Array.from({ length: 16 }, (_, index) => index) }],
      truncated: false,
    },
    source: "queue",
  };
  const snapshot = snapshotSmallBufferBinding(
    { offset: 0, size: 16 },
    { lastWrite, size: 16 },
    7,
    256,
  );
  lastWrite.sample.segments[0].bytes[0] = 255;
  assert.equal(snapshot.sample.segments[0].bytes[0], 0);
  assert.equal(snapshot.submissionSequence, 7);
  assert.equal(
    snapshotSmallBufferBinding(
      { offset: 0, size: 512 },
      { lastWrite, size: 512 },
      7,
      256,
    ),
    null,
  );
});

test("injects the selected-reflection target and runtime into the browser observer", async () => {
  const source = createWebGpuObserverScript({ targetSlug: "typegpu-antiky" });

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /"targetSlug":"typegpu-antiky"/);
  assert.match(source, /probeSelectedReflection/);
  assert.equal(source.includes(resolveAntikySelectedReflection.toString()), true);
  assert.equal(
    source.includes(
      validateAntikySelectedReflectionReconstruction.toString(),
    ),
    true,
  );

  class FakeCanvas {
    getContext() {
      return null;
    }
  }
  const browserWindow = {
    cancelAnimationFrame() {},
    requestAnimationFrame() {
      return 1;
    },
  };
  browserWindow.top = browserWindow;
  const install = new Function("window", "navigator", "document", source);
  install(
    browserWindow,
    { gpu: null },
    { createElement: () => new FakeCanvas() },
  );
  const result = await browserWindow.__WEBGPU_COMPARE__.probeSelectedReflection(
    {
      commandOverflow: 0,
      passes: [{
        colorAttachments: [],
        commandOverflow: 0,
        commands: [],
        sequence: 1,
        submissionSequence: 1,
        telemetryFrameIndex: 0,
      }],
      submissions: [{ passSequences: [1], sequence: 1 }],
    },
    0,
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.issues[0].code, "missing-final-consumer");
});

test("describes color formats that can be sampled from intermediate GPU targets", () => {
  assert.deepEqual(describeTextureProbeFormat("r8unorm"), {
    bytesPerPixel: 1,
    channels: 1,
    encoding: "unorm8",
  });
  assert.deepEqual(describeTextureProbeFormat("rgba16float"), {
    bytesPerPixel: 8,
    channels: 4,
    encoding: "float16",
  });
  assert.equal(describeTextureProbeFormat("depth24plus"), null);
});

test("describes padded texture uploads independently of their source allocation", () => {
  assert.equal(typeof webGpuAnalysis.describeTextureUpload, "function");
  assert.deepEqual(
    webGpuAnalysis.describeTextureUpload(
      { bytesPerRow: 256, offset: 16, rowsPerImage: 3 },
      { depthOrArrayLayers: 2, height: 2, width: 4 },
      8,
      2048,
    ),
    {
      dataOffset: 16,
      bytesPerRow: 256,
      requiredSourceBytes: 1072,
      rowsPerImage: 3,
      size: { depthOrArrayLayers: 2, height: 2, width: 4 },
      sourceByteLength: 2048,
      texelBytes: 128,
    },
  );
});

test("bounds GPU-generated buffer probes to aligned head, midpoint, and tail ranges", () => {
  assert.equal(typeof webGpuAnalysis.createBufferProbePlan, "function");
  assert.deepEqual(webGpuAnalysis.createBufferProbePlan(4096, 512), [
    { destinationOffset: 0, size: 160, sourceOffset: 0 },
    { destinationOffset: 160, size: 160, sourceOffset: 1968 },
    { destinationOffset: 320, size: 160, sourceOffset: 3936 },
  ]);
  assert.deepEqual(webGpuAnalysis.createBufferProbePlan(96, 512), [
    { destinationOffset: 0, size: 96, sourceOffset: 0 },
  ]);
});

test("selects labeled and execution-bound model buffers for complete probing", () => {
  const selected = selectBufferProbeTargets(
    [
      { executionScore: 0, label: "Unrelated staging", record: { id: 1 }, size: 64 },
      { executionScore: 0, label: "Typed particle storage", record: { id: 2 }, size: 12992 },
      { executionScore: 406_000_006, label: "", record: { id: 3 }, size: 25984 },
      { executionScore: 1_083_388, label: "", record: { id: 4 }, size: 368608 },
    ],
    2,
    "(?:particle|light)",
  );

  assert.deepEqual(
    selected.map(({ record, selection, size }) => ({ id: record.id, selection, size })),
    [
      {
        id: 2,
        selection: { executionScore: 0, labelMatched: true },
        size: 12992,
      },
      {
        id: 3,
        selection: { executionScore: 406000006, labelMatched: false },
        size: 25984,
      },
    ],
  );
});

test("retains every buffer from the most-instanced draw under probe allocation pressure", () => {
  const dominantDrawBufferSizes = [
    128,
    128,
    48,
    48,
    4_872,
    24,
    9_036,
    128,
    25_984,
    25_984,
  ];
  const mostInstancedDrawBuffers = dominantDrawBufferSizes.map(
    (size, index) => ({
      executionScore: 406_000_006,
      label: index === 0 ? "Generated render uniform" : "",
      record: { id: 100 + index },
      size,
    }),
  );
  const lowerWorkLabeledBuffers = Array.from({ length: 12 }, (_, index) => ({
    executionScore: 1_083_388 - index,
    label: `Generated render buffer ${index}`,
    record: { id: 200 + index },
    size: 128 + index * 16,
  }));

  const selected = selectBufferProbeTargets(
    [...lowerWorkLabeledBuffers, ...mostInstancedDrawBuffers],
    12,
    "(?:particle|light|render|frame|cascade)",
  );
  const selectedIds = new Set(selected.map(({ record }) => record.id));

  assert.ok(
    mostInstancedDrawBuffers.every(({ record }) => selectedIds.has(record.id)),
    "all structural inputs from the dominant instanced draw must survive the default quota",
  );
});

test("builds localized intermediate-target probes around presentation hotspots", () => {
  const plan = createTextureProbePlan();
  const regions = new Set(plan.map(({ region }) => region));
  assert.deepEqual(regions, new Set([
    "full",
    "floor",
    "leftFire",
    "rightFire",
    "upperGallery",
  ]));
  assert.ok(plan.filter(({ region }) => region === "leftFire").length >= 400);
  assert.ok(plan.filter(({ region }) => region === "rightFire").length >= 400);
  assert.ok(plan.length >= 1200);
  assert.ok(plan.every(({ x, y }) => x > 0 && x < 1 && y > 0 && y < 1));
});

test("decodes all selected-reflection samples at aligned pixel centers and fractional LOD", () => {
  const plan = createTextureProbePlan();
  const points = createSelectedReflectionSamplePlan(plan, {
    height: 720,
    width: 1280,
  });
  const bytes = new Uint8Array(points.length * 32);
  const values = new DataView(bytes.buffer);
  for (let index = 0; index < points.length; index += 1) {
    const offset = index * 32;
    values.setFloat32(offset, index + 0.25, true);
    values.setFloat32(offset + 4, 2, true);
    values.setFloat32(offset + 8, 3, true);
    values.setFloat32(offset + 12, 1, true);
    values.setFloat32(offset + 16, 0.625, true);
    values.setFloat32(offset + 20, index === 0 ? 1.5625 : (index % 9) * 0.5, true);
  }

  const samples = decodeSelectedReflectionSamples(bytes, points, true);

  assert.equal(plan.length, 1_388);
  assert.equal(samples.length, 1_388);
  assert.equal(points[0].sampleX, (points[0].pixelX + 0.5) / 1280);
  assert.equal(points[0].sampleY, (points[0].pixelY + 0.5) / 720);
  assert.deepEqual(samples[0], {
    channels: [0.25, 2, 3, 1],
    lod: 1.5625,
    luminance: 1.7001499999999998,
    region: plan[0].region,
    roughness: 0.625,
    x: plan[0].x,
    y: plan[0].y,
  });
  assert.equal(samples.at(-1).channels[0], 1_387.25);
  assert.ok(samples.some(({ lod }) => !Number.isInteger(lod)));
  const summaries = summarizeSelectedReflectionSamples(
    samples,
    summarizeProbeValues,
  );
  assert.equal(summaries.lod.minimum, 0);
  assert.equal(summaries.lod.maximum, 4);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(summaries.regions).map(([region, summary]) => [
        region,
        summary.sampleCount,
      ]),
    ),
    {
      floor: 60,
      full: 240,
      leftFire: 480,
      rightFire: 480,
      upperGallery: 128,
    },
  );

  values.setFloat32(0, Number.NaN, true);
  assert.throws(
    () => decodeSelectedReflectionSamples(bytes, points, true),
    (error) => error.code === "non-finite-sample",
  );
});

test("reports the post-trace phase in selected-reflection provenance", async () => {
  const probe = await runSelectedReflectionProbe(null, 12, {
    plan: createTextureProbePlan(),
    resolve() {
      return {
        issues: [{ code: "synthetic-unavailable", evidence: {}, message: "No target" }],
        provenance: { targetSlug: "threejs", traceFrameIndex: 11 },
        status: "unavailable",
      };
    },
    targetSlug: "threejs",
  });

  assert.equal(probe.status, "unavailable");
  assert.equal(probe.provenance.measurementPhase, "post-trace-paused");
  assert.equal(probe.provenance.targetSlug, "threejs");
  assert.equal(probe.provenance.traceFrameIndex, 11);
  assert.equal(probe.sampling.coordinateSpace, "normalized-texture");
  assert.equal(probe.sampling.pixelRule, "floor-point-then-pixel-center");
  assert.equal(probe.sampling.sampleCount, 0);
  assert.equal("measurementPhase" in probe.sampling, false);
});

test("runs the selected-reflection compute probe with exact traced objects", async () => {
  const previousBufferUsage = globalThis.GPUBufferUsage;
  const previousMapMode = globalThis.GPUMapMode;
  globalThis.GPUBufferUsage = {
    COPY_DST: 1,
    COPY_SRC: 2,
    MAP_READ: 4,
    STORAGE: 8,
  };
  globalThis.GPUMapMode = { READ: 1 };
  const reflectionView = { role: "traced-reflection-view" };
  const roughnessView = { role: "traced-roughness-view" };
  const sampler = { role: "traced-reflection-sampler" };
  const destroyed = [];
  let bindGroupEntries = null;
  const shaderCodes = [];
  let dispatchCount = null;
  let errorScopeDepth = 0;
  let validationError = null;
  const device = {
    createBindGroup({ entries }) {
      bindGroupEntries = entries;
      return {};
    },
    createBuffer(descriptor) {
      const data = new Uint8Array(descriptor.size);
      return {
        data,
        destroy() {
          destroyed.push(descriptor.label);
        },
        getMappedRange() {
          return data.buffer;
        },
        async mapAsync() {},
        unmap() {},
      };
    },
    createCommandEncoder() {
      return {
        beginComputePass() {
          return {
            dispatchWorkgroups(count) {
              dispatchCount = count;
            },
            end() {},
            setBindGroup() {},
            setPipeline() {},
          };
        },
        copyBufferToBuffer(source, sourceOffset, target, targetOffset, size) {
          const values = new DataView(source.data.buffer);
          for (let offset = 0; offset < size; offset += 32) {
            values.setFloat32(offset, 1, true);
            values.setFloat32(offset + 4, 2, true);
            values.setFloat32(offset + 8, 3, true);
            values.setFloat32(offset + 12, 1, true);
            values.setFloat32(offset + 16, 0.625, true);
            values.setFloat32(offset + 20, 1.5625, true);
          }
          target.data.set(source.data.subarray(sourceOffset, sourceOffset + size), targetOffset);
        },
        finish() {
          return {};
        },
      };
    },
    createComputePipeline() {
      return { getBindGroupLayout: () => ({}) };
    },
    createShaderModule({ code }) {
      shaderCodes.push(code);
      assert.match(code, /struct Point \{\s*pixel: vec2u,\s*\}/);
      return {};
    },
    async popErrorScope() {
      errorScopeDepth -= 1;
      return validationError;
    },
    pushErrorScope(filter) {
      assert.equal(filter, "validation");
      errorScopeDepth += 1;
    },
    queue: {
      submit() {},
      writeBuffer(buffer, offset, source) {
        buffer.data.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength), offset);
      },
    },
  };
  const plan = createTextureProbePlan();
  const resolution = {
    issues: [],
    provenance: {
      formula: { kind: "roughness-squared", maxMipLevel: 4 },
      targetSlug: "threejs",
      traceFrameIndex: 11,
    },
    reflection: {
      format: "rgba16float",
      label: "SSRNode.Blur",
      size: { height: 720, width: 1280 },
      textureId: 20,
      viewId: 21,
    },
    roughness: {
      format: "rgba8unorm",
      label: "metalrough",
      textureId: 30,
      viewId: 31,
    },
    sampler: { samplerId: 10, settings: { mipmapFilter: "linear" } },
    status: "ready",
  };

  try {
    const probe = await runSelectedReflectionProbe(null, 12, {
      createPlan: createSelectedReflectionSamplePlan,
      decode: decodeSelectedReflectionSamples,
      devicesByTextureId: new Map([[20, device]]),
      plan,
      records: {},
      resolve: () => resolution,
      sampleStrideBytes: 32,
      samplers: new Map([[10, sampler]]),
      summarize: summarizeProbeValues,
      summarizeSamples: summarizeSelectedReflectionSamples,
      targetSlug: "threejs",
      textureViews: new Map([
        [21, reflectionView],
        [31, roughnessView],
      ]),
    });

    assert.equal(probe.status, "ready", JSON.stringify(probe.issues));
    assert.equal(probe.samples.length, 1_388);
    assert.equal(probe.lod.minimum, 1.5625);
    assert.equal(probe.roughness.maximum, 0.625);
    assert.equal(probe.regions.floor.sampleCount, 60);
    assert.equal(dispatchCount, 22);
    assert.equal(bindGroupEntries[0].resource, reflectionView);
    assert.equal(bindGroupEntries[1].resource, sampler);
    assert.equal(bindGroupEntries[2].resource, roughnessView);
    assert.equal(destroyed.length, 3);
    assert.equal(errorScopeDepth, 0);
    assert.match(
      shaderCodes[0],
      /let roughness = textureLoad\(roughnessTexture, vec2i\(pixel\), 0\)\.g;/,
    );
    assert.match(
      shaderCodes[0],
      /textureSampleLevel\(reflectionTexture, reflectionSampler, uv, lod\)/,
    );

    const selectedOutputResolution = {
      ...resolution,
      provenance: {
        formula: { channel: "w", kind: "roughness-squared", maxMipLevel: 4 },
        targetSlug: "typegpu-antiky",
        traceFrameIndex: 11,
      },
      sampleLod: "zero",
    };
    const selectedOutputProbe = await runSelectedReflectionProbe(null, 12, {
      createPlan: createSelectedReflectionSamplePlan,
      decode: decodeSelectedReflectionSamples,
      devicesByTextureId: new Map([[20, device]]),
      plan,
      records: {},
      resolve: () => selectedOutputResolution,
      sampleStrideBytes: 32,
      samplers: new Map([[10, sampler]]),
      summarize: summarizeProbeValues,
      summarizeSamples: summarizeSelectedReflectionSamples,
      targetSlug: "typegpu-antiky",
      textureViews: new Map([
        [21, reflectionView],
        [31, roughnessView],
      ]),
    });
    assert.equal(
      selectedOutputProbe.status,
      "ready",
      JSON.stringify(selectedOutputProbe.issues),
    );
    assert.equal(
      selectedOutputProbe.provenance.resources.roughness.channel,
      "w",
    );
    assert.match(
      shaderCodes[1],
      /let roughness = textureLoad\(roughnessTexture, vec2i\(pixel\), 0\)\.w;/,
    );
    assert.match(
      shaderCodes[1],
      /let lod = clamp\(roughness \* roughness \* 4\.0, 0\.0, 4\.0\);/,
    );
    assert.match(
      shaderCodes[1],
      /textureSampleLevel\(reflectionTexture, reflectionSampler, uv, 0\.0\)/,
    );
    assert.equal(destroyed.length, 6);

    validationError = { message: "synthetic compute validation failure" };
    const failedProbe = await runSelectedReflectionProbe(null, 12, {
      createPlan: createSelectedReflectionSamplePlan,
      decode: decodeSelectedReflectionSamples,
      devicesByTextureId: new Map([[20, device]]),
      plan,
      records: {},
      resolve: () => resolution,
      sampleStrideBytes: 32,
      samplers: new Map([[10, sampler]]),
      summarize: summarizeProbeValues,
      summarizeSamples: summarizeSelectedReflectionSamples,
      targetSlug: "threejs",
      textureViews: new Map([
        [21, reflectionView],
        [31, roughnessView],
      ]),
    });
    assert.equal(failedProbe.status, "unavailable");
    assert.equal(failedProbe.issues[0].code, "gpu-validation-error");
    assert.equal(errorScopeDepth, 0);
    assert.equal(destroyed.length, 9);
  } finally {
    globalThis.GPUBufferUsage = previousBufferUsage;
    globalThis.GPUMapMode = previousMapMode;
  }
});

function selectedReflectionBinding({
  kind,
  label = "",
  name,
  samplerId,
  settings,
  textureId,
  viewId,
}) {
  return {
    resource:
      kind === "sampler"
        ? { kind, label, samplerId, settings }
        : {
            format: label === "metalrough" ? "rgba8unorm" : "rgba16float",
            kind,
            label,
            mipLevelCount: label === "SSRNode.Blur" ? 5 : 1,
            size: { depthOrArrayLayers: 1, height: 720, width: 1280 },
            textureId,
            viewDescriptor: {},
            viewId,
          },
    shaderBindings: [{ name, stage: "fragment" }],
  };
}

const THREE_SELECTION_SHADER = `
@group(0) @binding(0) var reflectionSampler: sampler;
@group(0) @binding(1) var reflection: texture_2d<f32>;
@group(0) @binding(2) var metalSampler: sampler;
@group(0) @binding(3) var metalrough: texture_2d<f32>;
@fragment fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let rough = textureSample(metalrough, metalSampler, uv);
  return textureSampleLevel(
    reflection,
    reflectionSampler,
    uv,
    clamp(((rough.y * rough.y) * 4.0), 0.0, 4.0),
  );
}`;

function createThreeSelectedReflectionFixture() {
  const samplerSettings = {
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    addressModeW: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  };
  const consumer = (pipelineId, sequence) => ({
    pipelineId,
    resourceBindings: [
      selectedReflectionBinding({
        kind: "sampler",
        name: "reflectionSampler",
        samplerId: 10,
        settings: samplerSettings,
      }),
      selectedReflectionBinding({
        kind: "texture",
        label: "SSRNode.Blur",
        name: "reflection",
        textureId: 20,
        viewId: 21,
      }),
      selectedReflectionBinding({
        kind: "texture",
        label: "metalrough",
        name: "metalrough",
        textureId: 30,
        viewId: 31,
      }),
    ],
    sequence,
  });
  const pass = (sequence, textureId, viewId, commands = []) => ({
    colorAttachments: [{ storeOp: "store", textureId, viewId }],
    commandOverflow: 0,
    commands,
    sequence,
    submissionSequence: 1,
    telemetryFrameIndex: 11,
  });
  return {
    frame: 12,
    resources: {
      pipelines: [
        { fragment: { shaderId: 101 }, id: 100 },
        { fragment: { shaderId: 102 }, id: 110 },
      ],
      shaderModules: [
        { code: THREE_SELECTION_SHADER, id: 101 },
        { code: THREE_SELECTION_SHADER, id: 102 },
      ],
      textures: [
        { format: "rgba16float", id: 20, label: "SSRNode.Blur", mipLevelCount: 5 },
        { format: "rgba8unorm", id: 30, label: "metalrough", mipLevelCount: 1 },
        { format: "rgba16float", id: 40, label: "UnrealBloomPass.bright" },
      ],
      textureViews: [
        { descriptor: { baseMipLevel: 0 }, id: 50, textureId: 20 },
        { descriptor: { baseMipLevel: 1 }, id: 51, textureId: 20 },
        { descriptor: { baseMipLevel: 2 }, id: 52, textureId: 20 },
        { descriptor: { baseMipLevel: 3 }, id: 53, textureId: 20 },
        { descriptor: { baseMipLevel: 4 }, id: 54, textureId: 20 },
      ],
    },
    trace: {
      commandOverflow: 0,
      passes: [
        pass(1, null, 90, [consumer(100, 1)]),
        ...Array.from({ length: 5 }, (_, mipLevel) =>
          pass(2 + mipLevel, 20, 50 + mipLevel, [
            { pipelineId: 120, resourceBindings: [], sequence: 2 + mipLevel },
          ]),
        ),
        pass(7, 40, 41, [consumer(110, 7)]),
      ],
      submissions: [{ passSequences: [1, 2, 3, 4, 5, 6, 7], sequence: 1 }],
    },
  };
}

test("resolves the exact Three final and bloom reflection contract", () => {
  const fixture = createThreeSelectedReflectionFixture();
  const resolution = resolveSelectedReflection(
    fixture.trace,
    fixture.frame,
    fixture.resources,
    "threejs",
  );

  assert.equal(resolution.status, "ready", JSON.stringify(resolution));
  assert.equal(resolution.reflection.viewId, 21);
  assert.equal(resolution.roughness.viewId, 31);
  assert.equal(resolution.sampler.samplerId, 10);
  assert.deepEqual(
    resolution.provenance.mipWrites.map(({ mipLevel }) => mipLevel),
    [0, 1, 2, 3, 4],
  );
  assert.equal(
    resolution.provenance.selectionFormula,
    "clamp(roughness.g * roughness.g * 4.0, 0.0, 4.0)",
  );
  assert.equal(resolution.provenance.formula.kind, "roughness-squared");
  assert.equal(resolution.provenance.formula.maxMipLevel, 4);

  const duplicate = createThreeSelectedReflectionFixture();
  duplicate.trace.passes.unshift(duplicate.trace.passes[0]);
  assert.equal(
    resolveSelectedReflection(
      duplicate.trace,
      duplicate.frame,
      duplicate.resources,
      "threejs",
    ).status,
    "ready",
  );
});

test("selected-reflection resolution fails closed on overflow, ambiguity, and unsupported slugs", () => {
  const fixture = createThreeSelectedReflectionFixture();
  const missingMip = createThreeSelectedReflectionFixture();
  missingMip.trace.passes.splice(4, 1);
  const nearestSampler = createThreeSelectedReflectionFixture();
  nearestSampler.trace.passes[0].commands[0].resourceBindings[0].resource.settings.mipmapFilter =
    "nearest";
  const driftedFormula = createThreeSelectedReflectionFixture();
  for (const shader of driftedFormula.resources.shaderModules) {
    shader.code = shader.code.replace("* 4.0", "* 3.0");
  }
  const additiveFormula = createThreeSelectedReflectionFixture();
  for (const shader of additiveFormula.resources.shaderModules) {
    shader.code = shader.code.replace(") * 4.0", ") + rough.y * 4.0");
  }
  const cases = [
    {
      code: "unsupported-target",
      slug: "threejs-copy",
      trace: fixture.trace,
    },
    {
      code: "trace-command-overflow",
      slug: "threejs",
      trace: { ...fixture.trace, commandOverflow: 1 },
    },
    {
      code: "missing-final-consumer",
      slug: "typegpu-antiky",
      trace: fixture.trace,
    },
    {
      code: "ambiguous-final-consumer",
      slug: "threejs",
      trace: {
        ...fixture.trace,
        passes: [
          {
            ...fixture.trace.passes[0],
            commands: fixture.trace.passes[0].commands.map((command) => ({
              ...command,
              pipelineId: 999,
            })),
          },
          ...fixture.trace.passes,
        ],
      },
    },
    {
      code: "incomplete-mip-writes",
      resources: missingMip.resources,
      slug: "threejs",
      trace: missingMip.trace,
    },
    {
      code: "invalid-reflection-sampler",
      resources: nearestSampler.resources,
      slug: "threejs",
      trace: nearestSampler.trace,
    },
    {
      code: "selection-formula-mismatch",
      resources: driftedFormula.resources,
      slug: "threejs",
      trace: driftedFormula.trace,
    },
    {
      code: "selection-formula-mismatch",
      resources: additiveFormula.resources,
      slug: "threejs",
      trace: additiveFormula.trace,
    },
  ];

  for (const scenario of cases) {
    const resolution = resolveSelectedReflection(
      scenario.trace,
      fixture.frame,
      scenario.resources ?? fixture.resources,
      scenario.slug,
    );
    assert.equal(resolution.status, "unavailable");
    assert.equal(resolution.issues[0].code, scenario.code);
  }
});

test("resolves Antiky consumers only when the latest writer is vertical and LOD is explicit", () => {
  const explicitLodShader = `
    @group(0) @binding(0) var reflection: texture_2d<f32>;
    @group(0) @binding(1) var reflectionSampler: sampler;
    @fragment fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
      return textureSampleLevel(reflection, reflectionSampler, uv, 0.0);
    }`;
  const reflection = selectedReflectionBinding({
    kind: "texture",
    label: "allocation label is stale",
    name: "reflection",
    textureId: 70,
    viewId: 71,
  });
  const sampler = selectedReflectionBinding({
    kind: "sampler",
    name: "reflectionSampler",
    samplerId: 72,
    settings: { magFilter: "linear", minFilter: "linear" },
  });
  const consumer = (pipelineId, sequence) => ({
    pipelineId,
    resourceBindings: [
      { ...reflection, resource: { ...reflection.resource } },
      { ...sampler, resource: { ...sampler.resource } },
    ],
    sequence,
  });
  const fixture = {
    resources: {
      pipelines: [
        { fragment: { shaderId: 201 }, id: 200 },
        { fragment: { shaderId: 202 }, id: 210 },
      ],
      shaderModules: [
        { code: explicitLodShader, id: 201 },
        { code: explicitLodShader, id: 202 },
      ],
      textures: [{
        format: "rgba16float",
        id: 70,
        label: "stale trace target",
        usage: 20,
      }],
      textureViews: [
        {
          descriptor: { baseMipLevel: 0, mipLevelCount: 1 },
          id: 71,
          textureId: 70,
        },
        {
          descriptor: { baseMipLevel: 0, mipLevelCount: 1 },
          id: 73,
          textureId: 70,
        },
      ],
    },
    trace: {
      commandOverflow: 0,
      passes: [
        {
          colorAttachments: [{ storeOp: "store", textureId: 70, viewId: 73 }],
          commandOverflow: 0,
          commands: [{ pipelineId: 190, resourceBindings: [], sequence: 1 }],
          label: "Antiky AOT vertical reflection reconstruction pass",
          sequence: 1,
          submissionSequence: 1,
          telemetryFrameIndex: 11,
        },
        {
          colorAttachments: [{ storeOp: "store", textureId: 80, viewId: 81 }],
          commandOverflow: 0,
          commands: [consumer(200, 2)],
          label: "Antiky AOT bloom bright extraction pass",
          sequence: 2,
          submissionSequence: 1,
          telemetryFrameIndex: 11,
        },
        {
          colorAttachments: [{ storeOp: "store", textureId: null, viewId: 82 }],
          commandOverflow: 0,
          commands: [consumer(210, 3)],
          label: "Antiky final bloom and tone-map pass",
          sequence: 3,
          submissionSequence: 1,
          telemetryFrameIndex: 11,
        },
      ],
      submissions: [{ passSequences: [1, 2, 3], sequence: 1 }],
    },
  };

  const resolution = resolveSelectedReflection(
    fixture.trace,
    12,
    fixture.resources,
    "typegpu-antiky",
  );
  assert.equal(resolution.status, "ready");
  assert.equal(resolution.reflection.textureId, 70);
  assert.equal(resolution.provenance.latestWriter.passSequence, 1);
  assert.equal(resolution.provenance.selectionFormula, "explicit LOD 0.0");
  assert.equal(resolution.provenance.formula.kind, "constant-lod");
  assert.equal(resolution.provenance.formula.maxMipLevel, 0);

  fixture.trace.passes[1].commands[0].resourceBindings[0].resource.textureId = 71;
  const disagreement = resolveSelectedReflection(
    fixture.trace,
    12,
    fixture.resources,
    "typegpu-antiky",
  );
  assert.equal(disagreement.status, "unavailable");
  assert.equal(disagreement.issues[0].code, "consumer-disagreement");
  fixture.trace.passes[1].commands[0].resourceBindings[0].resource.textureId = 70;

  fixture.trace.passes[0].label = "Antiky horizontal reconstruction pass";
  const stale = resolveSelectedReflection(
    fixture.trace,
    12,
    fixture.resources,
    "typegpu-antiky",
  );
  assert.equal(stale.status, "unavailable");
  assert.equal(stale.issues[0].code, "latest-writer-not-vertical");
});

test("resolves Antiky roughness selection through its five-mip reflection pyramid", async (t) => {
  const finalShader = `
    @group(0) @binding(0) var reflection: texture_2d<f32>;
    @group(0) @binding(1) var reflectionSampler: sampler;
    @fragment fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
      return textureSampleLevel(reflection, reflectionSampler, uv, 0.0);
    }`;
  const selectShader = `
    @group(0) @binding(0) var reflection: texture_2d<f32>;
    @group(0) @binding(1) var surface: texture_2d<f32>;
    @group(0) @binding(2) var reflectionSampler: sampler;
    @fragment fn main(
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    ) -> @location(0) vec4f {
      let roughness = textureLoad(surface, vec2i(floor(position.xy)), 0).w;
      let lod = clamp(((roughness * roughness) * 4f), 0f, 4f);
      return textureSampleLevel(reflection, reflectionSampler, uv, lod);
    }`;
  const sampler = selectedReflectionBinding({
    kind: "sampler",
    name: "reflectionSampler",
    samplerId: 72,
    settings: {
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    },
  });
  const selected = selectedReflectionBinding({
    kind: "texture",
    label: "Antiky roughness-selected reflection",
    name: "reflection",
    textureId: 70,
    viewId: 71,
  });
  const pyramid = selectedReflectionBinding({
    kind: "texture",
    label: "Antiky five-mip roughness reflection pyramid",
    name: "reflection",
    textureId: 90,
    viewId: 91,
  });
  pyramid.resource.mipLevelCount = 5;
  const raw = selectedReflectionBinding({
    kind: "texture",
    label: "Antiky raw full-resolution reflection trace",
    name: "rawReflection",
    textureId: 80,
    viewId: 81,
  });
  const surface = selectedReflectionBinding({
    kind: "texture",
    label: "Antiky AOT forward normal and roughness",
    name: "surface",
    textureId: 100,
    viewId: 101,
  });
  const settingsBytes = (mipLevel) =>
    Array.from(
      new Uint8Array(
        new Float32Array([1 / 1280, 1 / 720, mipLevel, 0]).buffer,
      ),
    );
  const exactColorAttachment = (textureId, viewId) => ({
    clearValue: [0, 0, 0, 1],
    loadOp: "clear",
    resolveTextureId: null,
    resolveViewId: null,
    storeOp: "store",
    textureId,
    viewId,
  });
  const exactOutputPipeline = (id, shaderId) => ({
    depthStencil: null,
    fragment: {
      shaderId,
      targets: [{ blend: null, format: "rgba16float", writeMask: 15 }],
    },
    id,
    multisample: {
      alphaToCoverageEnabled: false,
      count: 1,
      mask: 0xffffffff,
    },
    primitive: {
      cullMode: "none",
      frontFace: "ccw",
      stripIndexFormat: null,
      topology: "triangle-list",
    },
    vertex: { buffers: [] },
  });
  const submittedSettingsBinding = (mipLevel) => ({
    binding: 2,
    bufferId: 300 + mipLevel,
    group: 0,
    offset: 0,
    size: 16,
    source: "bindGroup",
    submissionSnapshot: {
      bufferOffset: 0,
      byteLength: 16,
      sample: {
        byteLength: 16,
        sampledBytes: 16,
        segments: [{ byteOffset: 0, bytes: settingsBytes(mipLevel) }],
        truncated: false,
      },
      source: "queue",
      submissionSequence: 1,
    },
  });
  const settingsBinding = (mipLevel) => ({
    binding: 2,
    group: 0,
    resource: {
      bufferId: 300 + mipLevel,
      kind: "buffer",
      label: `Antiky reflection pyramid mip ${mipLevel} reconstruction settings`,
      offset: 0,
      size: 16,
    },
    shaderBindings: [{ name: "settings", stage: "fragment" }],
  });
  const consumer = (pipelineId, sequence) => ({
    pipelineId,
    resourceBindings: [
      structuredClone(selected),
      structuredClone(sampler),
    ],
    sequence,
  });
  const selector = {
    dynamicState: { scissor: null, viewport: null },
    instanceCount: 1,
    kind: "draw",
    pipelineId: 220,
    resourceBindings: [
      structuredClone(pyramid),
      structuredClone(surface),
      structuredClone(sampler),
    ],
    sequence: 7,
    vertexCount: 3,
  };
  const mipPasses = Array.from({ length: 5 }, (_, mipLevel) => ({
    colorAttachments: [exactColorAttachment(90, 92 + mipLevel)],
    commandOverflow: 0,
    commands: [
      {
        bufferBindings: [submittedSettingsBinding(mipLevel)],
        dynamicState: { scissor: null, viewport: null },
        instanceCount: 1,
        kind: "draw",
        pipelineId: 230,
        resourceBindings: [
          structuredClone(raw),
          structuredClone(sampler),
          settingsBinding(mipLevel),
        ],
        sequence: 2 + mipLevel,
        vertexCount: 3,
      },
    ],
    label:
      mipLevel === 0
        ? "Antiky AOT reflection pyramid mip 0 copy pass"
        : `Antiky AOT reflection pyramid mip ${mipLevel} reconstruction pass`,
    sequence: 2 + mipLevel,
    submissionSequence: 1,
    telemetryFrameIndex: 11,
    depthStencilAttachment: null,
    kind: "render",
  }));
  const resources = {
    buffers: Array.from({ length: 5 }, (_, mipLevel) => ({
      id: 300 + mipLevel,
      label: `Antiky reflection pyramid mip ${mipLevel} reconstruction settings`,
      lastWrite: {
        bufferOffset: 0,
        byteLength: 16,
        sample: {
          byteLength: 16,
          sampledBytes: 16,
          segments: [
            {
              byteOffset: 0,
              bytes: settingsBytes(mipLevel),
            },
          ],
          truncated: false,
        },
        source: "queue",
      },
      size: 16,
    })),
    pipelines: [
      { fragment: { shaderId: 201 }, id: 200 },
      { fragment: { shaderId: 202 }, id: 210 },
      exactOutputPipeline(220, 203),
      exactOutputPipeline(230, 204),
      exactOutputPipeline(190, 205),
    ],
    shaderModules: [
      { code: finalShader, hash: "final", id: 201 },
      { code: finalShader, hash: "bloom", id: 202 },
      { code: selectShader, hash: "4c0ad554", id: 203 },
      { code: "@fragment fn reconstruct() {}", hash: "449eaaed", id: 204 },
      { code: "@fragment fn rawTrace() {}", hash: "62241419", id: 205 },
    ],
    textures: [
      {
        format: "rgba16float",
        id: 70,
        label: "Antiky roughness-selected reflection",
        usage: 20,
      },
      {
        format: "rgba16float",
        id: 80,
        label: "Antiky raw full-resolution reflection trace",
        usage: 20,
      },
      {
        format: "rgba16float",
        id: 90,
        label: "Antiky five-mip roughness reflection pyramid",
        mipLevelCount: 5,
        usage: 20,
      },
      {
        format: "rgba16float",
        id: 100,
        label: "Antiky AOT forward normal and roughness",
        usage: 20,
      },
    ],
    textureViews: [
      { descriptor: { baseMipLevel: 0, mipLevelCount: 1 }, id: 71, textureId: 70 },
      { descriptor: { baseMipLevel: 0, mipLevelCount: 1 }, id: 81, textureId: 80 },
      { descriptor: { baseMipLevel: 0, mipLevelCount: 5 }, id: 91, textureId: 90 },
      ...Array.from({ length: 5 }, (_, mipLevel) => ({
        descriptor: { baseMipLevel: mipLevel, mipLevelCount: 1 },
        id: 92 + mipLevel,
        textureId: 90,
      })),
      { descriptor: { baseMipLevel: 0, mipLevelCount: 1 }, id: 101, textureId: 100 },
    ],
  };
  const trace = {
    commandOverflow: 0,
    passes: [
      {
        colorAttachments: [exactColorAttachment(80, 81)],
        commandOverflow: 0,
        commands: [{
          dynamicState: { scissor: null, viewport: null },
          instanceCount: 1,
          kind: "draw",
          pipelineId: 190,
          resourceBindings: [],
          sequence: 1,
          vertexCount: 3,
        }],
        label: "Antiky AOT raw full-resolution screen-space reflection trace pass",
        sequence: 1,
        submissionSequence: 1,
        telemetryFrameIndex: 11,
        depthStencilAttachment: null,
        kind: "render",
      },
      ...mipPasses,
      {
        colorAttachments: [exactColorAttachment(70, 71)],
        commandOverflow: 0,
        commands: [selector],
        depthStencilAttachment: null,
        kind: "render",
        label: "Antiky AOT roughness-selected reflection pass",
        sequence: 7,
        submissionSequence: 1,
        telemetryFrameIndex: 11,
      },
      {
        colorAttachments: [{ storeOp: "store", textureId: 110, viewId: 111 }],
        commandOverflow: 0,
        commands: [consumer(200, 8)],
        label: "Antiky AOT bloom bright extraction pass",
        sequence: 8,
        submissionSequence: 1,
        telemetryFrameIndex: 11,
      },
      {
        colorAttachments: [{ storeOp: "store", textureId: null, viewId: 112 }],
        commandOverflow: 0,
        commands: [consumer(210, 9)],
        label: "Antiky final bloom and tone-map pass",
        sequence: 9,
        submissionSequence: 1,
        telemetryFrameIndex: 11,
      },
    ],
    submissions: [{ passSequences: [1, 2, 3, 4, 5, 6, 7, 8, 9], sequence: 1 }],
  };

  const resolution = resolveSelectedReflection(
    trace,
    12,
    resources,
    "typegpu-antiky",
  );
  assert.equal(resolution.status, "ready", JSON.stringify(resolution.issues));
  assert.equal(resolution.reflection.textureId, 70);
  assert.equal(resolution.roughness.textureId, 100);
  assert.equal(resolution.sampleLod, "zero");
  assert.equal(resolution.provenance.lodMeaning, "upstream-selection");
  assert.equal(resolution.provenance.probeSampleLod, 0);
  assert.equal(resolution.provenance.selectionSource.textureId, 90);
  assert.equal(resolution.provenance.formula.channel, "w");
  assert.equal(resolution.provenance.formula.kind, "roughness-squared");
  assert.deepEqual(
    resolution.provenance.mipWrites.map(({ mipLevel }) => mipLevel),
    [0, 1, 2, 3, 4],
  );

  const weslResources = structuredClone(resources);
  const weslTrace = structuredClone(trace);
  const weslLabels = [
    "WESL linked screen-space reflection trace",
    ...Array.from(
      { length: 5 },
      (_, mipLevel) => `WESL reflection reconstruction mip ${mipLevel}`,
    ),
    "WESL roughness-selected reflection pass",
    "WESL bloom bright extraction",
    "WESL linked five-level bloom ACES composite",
  ];
  weslTrace.passes.forEach((pass, index) => {
    pass.label = weslLabels[index];
  });
  const renameBinding = (binding, name) => {
    binding.shaderBindings = [{ name, stage: "fragment" }];
  };
  for (const pass of weslTrace.passes.slice(1, 6)) {
    renameBinding(pass.commands[0].resourceBindings[0], "reconstructionSource");
    renameBinding(pass.commands[0].resourceBindings[1], "reconstructionSampler");
    renameBinding(pass.commands[0].resourceBindings[2], "reconstructionSettings");
  }
  const weslSelectorBindings = weslTrace.passes[6].commands[0].resourceBindings;
  renameBinding(weslSelectorBindings[0], "reconstructionSource");
  renameBinding(weslSelectorBindings[1], "reflectionRoughness");
  renameBinding(weslSelectorBindings[2], "reconstructionSampler");
  renameBinding(weslTrace.passes[7].commands[0].resourceBindings[0], "bloomReflection");
  renameBinding(weslTrace.passes[7].commands[0].resourceBindings[1], "bloomSampler");
  renameBinding(weslTrace.passes[8].commands[0].resourceBindings[0], "reflectionTexture");
  renameBinding(weslTrace.passes[8].commands[0].resourceBindings[1], "bloomSampler");
  const weslModule = `
    @group(0) @binding(0) var reconstructionSource: texture_2d<f32>;
    @group(0) @binding(1) var reflectionRoughness: texture_2d<f32>;
    @group(0) @binding(2) var reconstructionSampler: sampler;
    @fragment fn main(
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    ) -> @location(0) vec4f {
      let pixel = vec2i(floor(position.xy));
      let roughness = clamp(
        textureLoad(reflectionRoughness, pixel, 0).w,
        0.0,
        1.0,
      );
      let lod = roughness * roughness * 4.0;
      return textureSampleLevel(
        reconstructionSource,
        reconstructionSampler,
        uv,
        lod,
      );
    }`;
  weslResources.shaderModules[2].code = weslModule;
  weslResources.shaderModules[0].code = finalShader
    .replaceAll("reflectionSampler", "bloomSampler")
    .replaceAll("reflection", "bloomReflection");
  weslResources.shaderModules[1].code = finalShader
    .replaceAll("reflectionSampler", "bloomSampler")
    .replaceAll("reflection", "reflectionTexture");
  for (const module of weslResources.shaderModules.slice(2)) {
    module.hash = "2ba25fa8";
  }
  const weslResolution = resolveSelectedReflection(
    weslTrace,
    12,
    weslResources,
    "wesl",
  );
  assert.equal(
    weslResolution.status,
    "ready",
    JSON.stringify(weslResolution.issues),
  );
  assert.equal(weslResolution.implementation, "wesl");
  assert.equal(weslResolution.provenance.targetSlug, "wesl");
  assert.equal(weslResolution.provenance.formula.channel, "w");

  const driftedResources = structuredClone(resources);
  driftedResources.shaderModules[2].code = selectShader.replace("* 4f", "* 3f");
  const drifted = resolveSelectedReflection(
    trace,
    12,
    driftedResources,
    "typegpu-antiky",
  );
  assert.equal(drifted.status, "unavailable");
  assert.equal(drifted.issues[0].code, "selection-formula-mismatch");

  const incompleteTrace = structuredClone(trace);
  const missingMipPass = incompleteTrace.passes.find(({ label }) =>
    /pyramid mip 4/i.test(label),
  );
  incompleteTrace.passes = incompleteTrace.passes.filter(
    ({ label }) => !/pyramid mip 4/i.test(label),
  );
  incompleteTrace.submissions[0].passSequences =
    incompleteTrace.submissions[0].passSequences.filter(
      (sequence) => sequence !== missingMipPass.sequence,
    );
  const incomplete = resolveSelectedReflection(
    incompleteTrace,
    12,
    resources,
    "typegpu-antiky",
  );
  assert.equal(incomplete.status, "unavailable");
  assert.equal(incomplete.issues[0].code, "incomplete-mip-writes");

  const wrongKernelResources = structuredClone(resources);
  wrongKernelResources.shaderModules[3].hash = "00000000";
  const wrongKernel = resolveSelectedReflection(
    trace,
    12,
    wrongKernelResources,
    "typegpu-antiky",
  );
  assert.equal(wrongKernel.status, "unavailable");
  assert.equal(wrongKernel.issues[0].code, "reconstruction-shader-mismatch");

  const wrongRawResources = structuredClone(resources);
  wrongRawResources.shaderModules[4].hash = "00000000";
  const wrongRaw = resolveSelectedReflection(
    trace,
    12,
    wrongRawResources,
    "typegpu-antiky",
  );
  assert.equal(wrongRaw.status, "unavailable");
  assert.equal(wrongRaw.issues[0].code, "raw-reflection-shader-mismatch");

  const overwrittenTrace = structuredClone(trace);
  overwrittenTrace.passes[1].commands.push({
    dynamicState: { scissor: null, viewport: null },
    instanceCount: 1,
    kind: "draw",
    pipelineId: 230,
    resourceBindings: [],
    sequence: 99,
    vertexCount: 3,
  });
  const overwritten = resolveSelectedReflection(
    overwrittenTrace,
    12,
    resources,
    "typegpu-antiky",
  );
  assert.equal(overwritten.status, "unavailable");
  assert.equal(overwritten.issues[0].code, "reconstruction-draw-mismatch");

  const viewportTrace = structuredClone(trace);
  viewportTrace.passes[1].commands[0].dynamicState.viewport = {
    height: 1,
    width: 1,
    x: 0,
    y: 0,
  };
  const viewport = resolveSelectedReflection(
    viewportTrace,
    12,
    resources,
    "typegpu-antiky",
  );
  assert.equal(viewport.status, "unavailable");
  assert.equal(viewport.issues[0].code, "reconstruction-draw-mismatch");

  await t.test("rejects an unsubmitted pass in the proof chain", () => {
    const unsubmittedTrace = structuredClone(trace);
    unsubmittedTrace.submissions[0].passSequences.shift();
    delete unsubmittedTrace.passes[0].submissionSequence;
    const unsubmitted = resolveSelectedReflection(
      unsubmittedTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(unsubmitted.status, "unavailable");
  });

  await t.test("uses submitted mip order instead of pass creation order", () => {
    const reorderedTrace = structuredClone(trace);
    reorderedTrace.submissions[0].passSequences = [1, 3, 2, 4, 5, 6, 7, 8, 9];
    const reordered = resolveSelectedReflection(
      reorderedTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(reordered.status, "unavailable");
    assert.equal(reordered.issues[0].code, "reconstruction-order-mismatch");
  });

  await t.test("rejects incoherent submission metadata", () => {
    const incoherentTrace = structuredClone(trace);
    incoherentTrace.passes[6].submissionSequence = 2;
    const incoherent = resolveSelectedReflection(
      incoherentTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(incoherent.status, "unavailable");
    assert.equal(incoherent.issues[0].code, "submission-trace-incoherent");
  });

  await t.test("rejects a raw reflection write between mip reconstructions", () => {
    const overwrittenRawTrace = structuredClone(trace);
    overwrittenRawTrace.passes.push({
      colorAttachments: [exactColorAttachment(80, 81)],
      commandOverflow: 0,
      commands: [],
      depthStencilAttachment: null,
      kind: "render",
      label: "intervening raw reflection write",
      sequence: 50,
      submissionSequence: 1,
      telemetryFrameIndex: 11,
    });
    overwrittenRawTrace.passes.at(-1).colorAttachments[0].storeOp = "discard";
    overwrittenRawTrace.submissions[0].passSequences.splice(3, 0, 50);
    const overwrittenRaw = resolveSelectedReflection(
      overwrittenRawTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(overwrittenRaw.status, "unavailable");
    assert.equal(overwrittenRaw.issues[0].code, "raw-reflection-overwritten");
  });

  await t.test("rejects a selector view that exposes only pyramid mip zero", () => {
    const oneMipResources = structuredClone(resources);
    oneMipResources.textureViews.find(({ id }) => id === 91)
      .descriptor.mipLevelCount = 1;
    const oneMip = resolveSelectedReflection(
      trace,
      12,
      oneMipResources,
      "typegpu-antiky",
    );
    assert.equal(oneMip.status, "unavailable");
    assert.equal(oneMip.issues[0].code, "selector-resource-contract-mismatch");
  });

  await t.test("rejects later discard and resolve writes to the reflection pyramid", () => {
    for (const [sequence, attachment] of [
      [51, { ...exactColorAttachment(90, 96), storeOp: "discard" }],
      [55, {
        ...exactColorAttachment(120, 121),
        resolveTextureId: 90,
        resolveViewId: 96,
      }],
    ]) {
      const overwrittenPyramidTrace = structuredClone(trace);
      overwrittenPyramidTrace.passes.push({
        colorAttachments: [attachment],
        commandOverflow: 0,
        commands: [],
        depthStencilAttachment: null,
        kind: "render",
        label: "later pyramid overwrite",
        sequence,
        submissionSequence: 1,
        telemetryFrameIndex: 11,
      });
      overwrittenPyramidTrace.submissions[0].passSequences.splice(
        6,
        0,
        sequence,
      );
      const overwrittenPyramid = resolveSelectedReflection(
        overwrittenPyramidTrace,
        12,
        resources,
        "typegpu-antiky",
      );
      assert.equal(overwrittenPyramid.status, "unavailable");
      assert.equal(
        overwrittenPyramid.issues[0].code,
        "reflection-pyramid-overwritten",
      );
    }
  });

  await t.test("rejects non-singleton selected, surface, and raw views", () => {
    const cases = [
      {
        code: "resource-contract-mismatch",
        mutate(candidateTrace) {
          for (const pass of candidateTrace.passes.slice(7)) {
            pass.commands[0].resourceBindings[0].resource.viewDescriptor = {
              baseMipLevel: 1,
              mipLevelCount: 1,
            };
          }
        },
      },
      {
        code: "selector-resource-contract-mismatch",
        mutate(candidateTrace) {
          candidateTrace.passes[6].commands[0].resourceBindings[1]
            .resource.viewDescriptor = {
              arrayLayerCount: 2,
              baseArrayLayer: 0,
              baseMipLevel: 0,
              mipLevelCount: 1,
            };
        },
      },
      {
        code: "reconstruction-resource-contract-mismatch",
        mutate(candidateTrace) {
          for (const pass of candidateTrace.passes.slice(1, 6)) {
            const rawResource = pass.commands[0].resourceBindings[0].resource;
            rawResource.size.depthOrArrayLayers = 2;
          }
        },
      },
    ];
    for (const scenario of cases) {
      const candidateTrace = structuredClone(trace);
      scenario.mutate(candidateTrace);
      const candidate = resolveSelectedReflection(
        candidateTrace,
        12,
        resources,
        "typegpu-antiky",
      );
      assert.equal(candidate.status, "unavailable");
      assert.equal(candidate.issues[0].code, scenario.code);
    }
  });

  await t.test("rejects later discard and resolve writes to the selected output", () => {
    for (const [sequence, attachment] of [
      [52, { ...exactColorAttachment(70, 71), storeOp: "discard" }],
      [53, {
        ...exactColorAttachment(120, 121),
        resolveTextureId: 70,
        resolveViewId: 71,
      }],
    ]) {
      const overwrittenSelectedTrace = structuredClone(trace);
      overwrittenSelectedTrace.passes.push({
        colorAttachments: [attachment],
        commandOverflow: 0,
        commands: [],
        depthStencilAttachment: null,
        kind: "render",
        label: "later selected-reflection overwrite",
        sequence,
        submissionSequence: 1,
        telemetryFrameIndex: 11,
      });
      overwrittenSelectedTrace.submissions[0].passSequences.splice(
        7,
        0,
        sequence,
      );
      const overwrittenSelected = resolveSelectedReflection(
        overwrittenSelectedTrace,
        12,
        resources,
        "typegpu-antiky",
      );
      assert.equal(overwrittenSelected.status, "unavailable");
      assert.equal(
        overwrittenSelected.issues[0].code,
        "selected-reflection-overwritten",
      );
    }
  });

  await t.test("rejects a selected-output write after final presentation", () => {
    const postFinalTrace = structuredClone(trace);
    const attachment = exactColorAttachment(70, 71);
    attachment.storeOp = "discard";
    postFinalTrace.passes.push({
      colorAttachments: [attachment],
      commandOverflow: 0,
      commands: [],
      depthStencilAttachment: null,
      kind: "render",
      label: "post-final selected-reflection overwrite",
      sequence: 56,
      submissionSequence: 1,
      telemetryFrameIndex: 11,
    });
    postFinalTrace.submissions[0].passSequences.push(56);
    const postFinal = resolveSelectedReflection(
      postFinalTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(postFinal.status, "unavailable");
    assert.equal(postFinal.issues[0].code, "selected-reflection-overwritten");
  });

  await t.test("rejects a surface-roughness write after selection", () => {
    const postSelectorTrace = structuredClone(trace);
    const attachment = exactColorAttachment(100, 101);
    attachment.storeOp = "discard";
    postSelectorTrace.passes.push({
      colorAttachments: [attachment],
      commandOverflow: 0,
      commands: [],
      depthStencilAttachment: null,
      kind: "render",
      label: "post-selector surface overwrite",
      sequence: 57,
      submissionSequence: 1,
      telemetryFrameIndex: 11,
    });
    postSelectorTrace.submissions[0].passSequences.push(57);
    const postSelector = resolveSelectedReflection(
      postSelectorTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(postSelector.status, "unavailable");
    assert.equal(postSelector.issues[0].code, "surface-roughness-overwritten");
  });

  await t.test("rejects untraced writes to selected, pyramid, and surface textures", () => {
    for (const textureId of [70, 90, 100]) {
      const writableResources = structuredClone(resources);
      writableResources.textures.find(({ id }) => id === textureId).usage |= 8;
      const writable = resolveSelectedReflection(
        trace,
        12,
        writableResources,
        "typegpu-antiky",
      );
      assert.equal(writable.status, "unavailable");
    }
  });

  await t.test("rejects an interleaved submitted write from another traced frame", () => {
    const interleavedTrace = structuredClone(trace);
    const overwrite = {
      colorAttachments: [exactColorAttachment(80, 81)],
      commandOverflow: 0,
      commands: [],
      depthStencilAttachment: null,
      kind: "render",
      label: "interleaved raw write from another frame",
      sequence: 54,
      submissionSequence: 1,
      telemetryFrameIndex: 10,
    };
    overwrite.colorAttachments[0].storeOp = "discard";
    interleavedTrace.passes.push(overwrite);
    interleavedTrace.submissions[0].passSequences.splice(3, 0, 54);
    const interleaved = resolveSelectedReflection(
      interleavedTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(interleaved.status, "unavailable");
    assert.equal(interleaved.issues[0].code, "raw-reflection-overwritten");
  });

  await t.test("rejects raw textures with untraced write paths", () => {
    const writableResources = structuredClone(resources);
    writableResources.textures.find(({ id }) => id === 80).usage |= 8;
    const writable = resolveSelectedReflection(
      trace,
      12,
      writableResources,
      "typegpu-antiky",
    );
    assert.equal(writable.status, "unavailable");
    assert.equal(
      writable.issues[0].code,
      "reconstruction-resource-contract-mismatch",
    );
  });

  await t.test("decodes settings from the state frozen at each submission", () => {
    const wrongSnapshotTrace = structuredClone(trace);
    wrongSnapshotTrace.passes[3].commands[0].bufferBindings[0]
      .submissionSnapshot.sample.segments[0].bytes = settingsBytes(4);
    const wrongSnapshot = resolveSelectedReflection(
      wrongSnapshotTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(wrongSnapshot.status, "unavailable");
    assert.equal(wrongSnapshot.issues[0].code, "reconstruction-settings-mismatch");

    const changedAfterSubmit = structuredClone(resources);
    changedAfterSubmit.buffers[2].lastWrite.sample.segments[0].bytes =
      settingsBytes(4);
    const frozen = resolveSelectedReflection(
      trace,
      12,
      changedAfterSubmit,
      "typegpu-antiky",
    );
    assert.equal(frozen.status, "ready", JSON.stringify(frozen.issues));
  });

  await t.test("rejects additive selector blending", () => {
    const additiveResources = structuredClone(resources);
    additiveResources.pipelines.find(({ id }) => id === 220).fragment.targets[0].blend = {
      alpha: { dstFactor: "one", operation: "add", srcFactor: "one" },
      color: { dstFactor: "one", operation: "add", srcFactor: "one" },
    };
    const additive = resolveSelectedReflection(
      trace,
      12,
      additiveResources,
      "typegpu-antiky",
    );
    assert.equal(additive.status, "unavailable");
    assert.equal(additive.issues[0].code, "selector-output-state-mismatch");
  });

  await t.test("rejects a masked raw-reflection write", () => {
    const maskedResources = structuredClone(resources);
    maskedResources.pipelines.find(({ id }) => id === 190).fragment.targets[0].writeMask = 7;
    const masked = resolveSelectedReflection(
      trace,
      12,
      maskedResources,
      "typegpu-antiky",
    );
    assert.equal(masked.status, "unavailable");
    assert.equal(masked.issues[0].code, "raw-reflection-output-state-mismatch");
  });

  await t.test("rejects reconstruction that preserves attachment contents", () => {
    const loadedTrace = structuredClone(trace);
    loadedTrace.passes[1].colorAttachments[0].loadOp = "load";
    const loaded = resolveSelectedReflection(
      loadedTrace,
      12,
      resources,
      "typegpu-antiky",
    );
    assert.equal(loaded.status, "unavailable");
    assert.equal(loaded.issues[0].code, "reconstruction-output-state-mismatch");
  });
});

test("separates sparse target coverage from active HDR energy", () => {
  assert.deepEqual(summarizeProbeValues([0, 0, 1, 3]), {
    aboveOneFraction: 0.25,
    activeFraction: 0.5,
    maximum: 3,
    mean: 1,
    minimum: 0,
    p10: 0,
    p50: 1,
    p90: 3,
    p99: 3,
    positiveMean: 2,
    rms: 1.581139,
    zeroFraction: 0.5,
  });
});

test("selects representative GPU probe subresources across cube faces and mips", () => {
  assert.equal(typeof webGpuAnalysis.createTextureProbeSubresources, "function");
  const subresources = webGpuAnalysis.createTextureProbeSubresources(
    { depthOrArrayLayers: 6, height: 256, width: 256 },
    9,
  );
  assert.equal(subresources.length, 18);
  assert.deepEqual(
    [...new Set(subresources.map(({ arrayLayer }) => arrayLayer))],
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    [...new Set(subresources.map(({ mipLevel }) => mipLevel))],
    [0, 4, 8],
  );
  assert.deepEqual(subresources.at(-1), {
    arrayLayer: 5,
    height: 1,
    mipLevel: 8,
    width: 1,
  });
});

test("classifyBrowserIssue promotes WebGPU validation warnings and filters duplicate resource noise", () => {
  assert.deepEqual(
    classifyBrowserIssue({
      kind: "console",
      level: "warning",
      message: "WebGPU: validation failed for bind group",
    }),
    {
      kind: "console",
      severity: "error",
      message: "WebGPU: validation failed for bind group",
    },
  );
  assert.equal(
    classifyBrowserIssue({
      kind: "console",
      level: "error",
      message:
        "Failed to load resource: the server responded with a status of 404 (Not Found)",
    }),
    null,
  );
  assert.equal(
    classifyBrowserIssue({
      kind: "response",
      level: "error",
      message: "404 http://127.0.0.1:4173/favicon.ico",
      url: "http://127.0.0.1:4173/favicon.ico",
    }),
    null,
  );
});

test("parseArguments validates comparison controls", () => {
  assert.deepEqual(
    parseArguments([
      "--profile=heavy",
      "--timeout=45000",
      "--frames=12",
      "--capture-frame=18",
      "--only=typegpu",
      "--port=4274",
      "--headless",
      "--output=artifacts/check",
      "--buffer-probe-pattern=(?:particle|camera)",
      "--texture-probe-pattern=(?:HDR|bloom)",
      "--buffer-probe-bytes=65536",
      "--max-buffer-probes=24",
      "--max-texture-probes=32",
      "--trace-commands=50000",
      "--trace-buffer-writes=20000",
      "--trace-buffer-write-bytes=1024",
      "--trace-buffer-write-pattern=(?:camera|material)",
    ]),
    {
      captureFrame: 18,
      bufferProbeBytes: 65_536,
      bufferProbePattern: "(?:particle|camera)",
      channel: "chrome",
      frames: 12,
      headless: true,
      help: false,
      host: "http://127.0.0.1",
      outputDirectory: "artifacts/check",
      maximumBufferProbes: 24,
      maximumTextureProbes: 32,
      maximumTraceCommands: 50_000,
      maximumTraceBufferWrites: 20_000,
      only: "typegpu",
      port: 4274,
      portOffset: 0,
      profile: "heavy",
      timeoutMs: 45_000,
      traceBufferWriteBytes: 1_024,
      traceBufferWritePattern: "(?:camera|material)",
      textureProbePattern: "(?:HDR|bloom)",
    },
  );
  assert.equal(parseArguments(["--port-offset=100"]).portOffset, 100);
  assert.equal(parseArguments([]).traceBufferWriteBytes, 32_768);
  assert.equal(
    parseArguments([]).bufferProbePattern,
    "(?:particle|light|render|frame|cascade)",
  );
  const defaultTexturePattern = new RegExp(
    parseArguments([]).textureProbePattern,
    "i",
  );
  for (const label of [
    "WESL decoded HDR source cube",
    "WESL GGX prefiltered specular cube",
    "WESL cosine-convolved diffuse cube",
    "WESL split-sum BRDF LUT",
    "DFG_LUT",
    "Antiky temporal resolve target 1",
  ]) {
    assert.match(label, defaultTexturePattern);
  }
  for (const label of [
    "WESL resolution settings",
    "absolute threshold",
  ]) {
    assert.doesNotMatch(label, defaultTexturePattern);
  }
  assert.throws(() => parseArguments(["--frames=0"]), /positive integer/);
  assert.throws(
    () => parseArguments(["--buffer-probe-pattern=("]),
    /valid regular expression/,
  );
  assert.throws(() => parseArguments(["--only=unknown"]), /--only must be one of/);
  assert.throws(() => parseArguments(["--port=4273"]), /requires --only/);
  assert.throws(
    () => parseArguments(["--only=brometal", "--port=4273", "--port-offset=100"]),
    /cannot be combined/,
  );
  assert.throws(() => parseArguments(["--wat"]), /Unknown option/);
});

test("reports escape diagnostics and fail when any implementation is unhealthy", () => {
  const results = [
    {
      durationMs: 1250,
      issues: [],
      name: "BroMetal AOT",
      screenshot: "brometal.png",
      slug: "brometal",
      status: "ready",
      telemetry: { latestFrame: { fps: 60.1 } },
      url: "http://127.0.0.1:4173/?profile=smoke",
    },
    {
      durationMs: 30_000,
      issues: [
        {
          kind: "timeout",
          severity: "error",
          message: "Canvas <never> became ready",
        },
      ],
      name: "Three.js native",
      screenshot: "threejs.png",
      slug: "threejs",
      status: "failed",
      telemetry: null,
      url: "http://127.0.0.1:4177/?profile=smoke",
    },
  ];

  assert.equal(comparisonPassed(results), false);
  const html = renderHtmlReport({
    createdAt: "2026-08-08T12:00:00.000Z",
    profile: "smoke",
    results,
    viewport: { width: 1440, height: 900 },
  });
  assert.match(html, /brometal\.png/);
  assert.match(html, /Canvas &lt;never&gt; became ready/);
  assert.doesNotMatch(html, /Canvas <never> became ready/);
});

test("estimates allocated texture storage across layers and mip levels", () => {
  assert.equal(
    estimateTextureBytes({
      format: "rgba16float",
      mipLevelCount: 3,
      sampleCount: 1,
      size: { depthOrArrayLayers: 6, height: 4, width: 4 },
    }),
    1008,
  );
  assert.equal(
    estimateTextureBytes({
      format: "unsupported-format",
      size: [4, 4],
    }),
    null,
  );
});

test("normalizes WebGPU work counters over the observed frame window", () => {
  assert.deepEqual(
    diffGpuCounters(
      { dispatchCalls: 2, drawCalls: 10, submittedCommandBuffers: 3 },
      { dispatchCalls: 7, drawCalls: 20, submittedCommandBuffers: 13 },
      5,
    ),
    {
      frames: 5,
      perFrame: {
        dispatchCalls: 1,
        drawCalls: 2,
        submittedCommandBuffers: 2,
      },
      totals: {
        dispatchCalls: 5,
        drawCalls: 10,
        submittedCommandBuffers: 10,
      },
    },
  );
});

test("attributes pipeline and pass work only to the synchronized frame window", () => {
  const before = {
    passes: [
      { id: 3, drawCalls: 2, label: "bloom", occurrences: 2 },
    ],
    pipelines: [
      { id: 1, drawCalls: 4, label: "particles", passBindings: 4 },
    ],
  };
  const after = {
    passes: [
      { id: 3, drawCalls: 12, label: "bloom", occurrences: 12 },
    ],
    pipelines: [
      { id: 1, drawCalls: 14, label: "particles", passBindings: 14 },
      { id: 2, dispatchCalls: 5, label: "compute", passBindings: 5 },
    ],
  };

  const workload = diffGpuWorkload(before, after, 5);
  assert.deepEqual(workload.pipelines[0], {
    id: 1,
    kind: null,
    label: "particles",
    perFrame: { drawCalls: 2, passBindings: 2 },
    totals: { drawCalls: 10, passBindings: 10 },
  });
  assert.equal(workload.pipelines[1].perFrame.dispatchCalls, 1);
  assert.equal(workload.passes[0].perFrame.occurrences, 2);
});

test("merges physical ping-pong pass variants into one logical workload stage", () => {
  const before = {
    passes: [
      { id: 3, drawCalls: 2, kind: "render", label: "temporal resolve", occurrences: 2 },
      { id: 4, drawCalls: 2, kind: "render", label: "temporal resolve", occurrences: 2 },
    ],
  };
  const after = {
    passes: [
      { id: 3, drawCalls: 5, kind: "render", label: "temporal resolve", occurrences: 5 },
      { id: 4, drawCalls: 4, kind: "render", label: "temporal resolve", occurrences: 4 },
    ],
  };

  const workload = diffGpuWorkload(before, after, 5);
  assert.equal(workload.passes.length, 1);
  assert.deepEqual(workload.passes[0].physicalIds, [3, 4]);
  assert.equal(workload.passes[0].variantCount, 2);
  assert.equal(workload.passes[0].perFrame.drawCalls, 1);
  assert.equal(workload.passes[0].perFrame.occurrences, 1);
});

test("pauses scheduled animation callbacks and resumes their exact pending work", () => {
  let nextNativeId = 100;
  const scheduled = new Map();
  const cancelled = [];
  const gate = createAnimationFrameGate(
    (callback) => {
      const id = nextNativeId++;
      scheduled.set(id, callback);
      return id;
    },
    (id) => {
      cancelled.push(id);
      scheduled.delete(id);
    },
  );
  const timestamps = [];
  const firstId = gate.requestAnimationFrame((timestamp) => timestamps.push(timestamp));
  const secondId = gate.requestAnimationFrame((timestamp) => timestamps.push(timestamp + 1));

  gate.pause();
  scheduled.get(100)(10);
  assert.deepEqual(timestamps, []);
  assert.deepEqual(gate.state(), {
    paused: true,
    pendingCallbacks: 1,
    scheduledCallbacks: 1,
  });

  gate.cancelAnimationFrame(secondId);
  assert.deepEqual(cancelled, [101]);
  gate.resume();
  assert.deepEqual(gate.state(), {
    paused: false,
    pendingCallbacks: 0,
    scheduledCallbacks: 1,
  });
  scheduled.get(102)(20);
  assert.deepEqual(timestamps, [20]);
  assert.equal(firstId, 1);
});

test("gates animation on an absolute telemetry frame without executing the next callback", () => {
  let nativeCallback;
  let frameIndex = 11;
  const gate = createAnimationFrameGate(
    (callback) => {
      nativeCallback = callback;
      return 1;
    },
    () => {},
  );
  let calls = 0;
  gate.pauseWhen(() => frameIndex >= 12);
  gate.requestAnimationFrame(() => {
    calls += 1;
  });

  frameIndex = 12;
  nativeCallback(200);
  assert.equal(calls, 0);
  assert.deepEqual(gate.state(), {
    paused: true,
    pendingCallbacks: 1,
    scheduledCallbacks: 0,
  });
});

test("polls synchronized frame telemetry without depending on animation frames", async () => {
  const previousWindow = globalThis.window;
  const capturedResources = { buffers: [], pipelines: [] };
  const counterState = { drawCalls: 0 };
  const workloadRecords = { passes: [], pipelines: [] };
  let pausePredicate = null;
  let selectedProbeCompleted = false;
  let traceWindow = null;
  globalThis.window = {
    __WEBGPU_AOT__: {
      error: null,
      latestFrame: { frameIndex: 1 },
      status: "ready",
    },
    __WEBGPU_COMPARE__: {
      animation: {
        pause() {},
        pauseWhen(predicate) {
          pausePredicate = predicate;
        },
        resume() {},
        state() {
          return { paused: true, pendingCallbacks: 1, scheduledCallbacks: 0 };
        },
      },
      capture() {
        return capturedResources;
      },
      beginTrace(window) {
        traceWindow = window;
      },
      counters() {
        return { ...counterState };
      },
      async probeTextures() {
        return { errors: [], results: [] };
      },
      async probeBuffers() {
        return {
          errors: [],
          results: [{ label: "Generated particles", size: 1024 }],
        };
      },
      async probeSelectedReflection(trace, frameIndex) {
        assert.equal(trace.endingFrame, 12);
        assert.equal(frameIndex, 12);
        await Promise.resolve();
        capturedResources.buffers.push({ id: 99, label: "diagnostic" });
        counterState.drawCalls = 99;
        workloadRecords.pipelines.push({
          dispatchCalls: 1,
          id: 99,
          kind: "compute",
          label: "diagnostic",
        });
        selectedProbeCompleted = true;
        return {
          capturedFrameIndex: frameIndex,
          issues: [],
          kind: "selected-reflection",
          provenance: {
            measurementPhase: "post-trace-paused",
            targetSlug: "threejs",
          },
          samples: [],
          sampling: { sampleCount: 0 },
          status: "ready",
        };
      },
      endTrace() {
        return {
          commandCount: 17,
          endingFrame: traceWindow.endingFrame,
          startingFrame: traceWindow.startingFrame,
        };
      },
      workload() {
        return workloadRecords;
      },
    },
  };
  const page = {
    evaluate(callback, argument) {
      return callback(argument);
    },
    async waitForFunction(_callback, target, options) {
      assert.equal(options.polling, 50);
      globalThis.window.__WEBGPU_AOT__.latestFrame.frameIndex = target;
      assert.equal(pausePredicate?.(), true);
    },
  };

  try {
    const capture = await captureGpuFrameWindow(page, {
      captureFrame: 12,
      frames: 5,
      timeoutMs: 1000,
    });
    assert.equal(capture.frameWindow.endingFrame, 12);
    assert.equal(capture.frameWindow.startingFrame, 7);
    assert.equal(capture.frameWindow.frames, 5);
    assert.equal(capture.capture.synchronization.requestedFrameIndex, 12);
    assert.deepEqual(capture.capture.executionTrace, {
      commandCount: 17,
      endingFrame: 12,
      startingFrame: 7,
    });
    assert.equal(
      capture.capture.bufferProbes.results[0].label,
      "Generated particles",
    );
    assert.equal(selectedProbeCompleted, true);
    assert.equal(capture.capture.selectedReflectionProbe.status, "ready");
    assert.deepEqual(capture.capture.buffers, []);
    assert.equal(capture.frameWindow.totals.drawCalls, 0);
    assert.deepEqual(capture.workloadWindow.pipelines, []);
    assert.equal(capturedResources.buffers.length, 1);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("captures presentation pixels without the loading interface overlay", async () => {
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousWindow = globalThis.window;
  class TestElement {
    style = { visibility: "" };
  }
  const loadingCard = new TestElement();
  const status = new TestElement();
  let visibilityDuringCapture = null;
  globalThis.HTMLElement = TestElement;
  globalThis.document = {
    querySelector(selector) {
      if (selector === ".loading-card") return loadingCard;
      if (selector === "#status") return status;
      return null;
    },
  };
  globalThis.window = {
    __WEBGPU_COMPARE__: {
      analyzePng() {
        return { regions: {}, spatial: { cells: [] } };
      },
    },
  };
  const canvas = {
    async count() {
      return 1;
    },
    async screenshot() {
      visibilityDuringCapture = loadingCard.style.visibility;
      return Buffer.from("presentation");
    },
  };
  const page = {
    evaluate(callback, argument) {
      return callback(argument);
    },
    locator() {
      return { first: () => canvas };
    },
  };

  try {
    await captureCanvasRendering(page, "/tmp", "demo");
    assert.equal(visibilityDuringCapture, "hidden");
    assert.equal(loadingCard.style.visibility, "");
  } finally {
    globalThis.document = previousDocument;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.window = previousWindow;
  }
});

test("attributes pass-scoped bind groups that were set before a pipeline", () => {
  const pipeline = { uses: { bindGroups: [], bindGroupSlots: [] } };
  const boundBindGroups = new Map([
    [0, 11],
    [1, 22],
    [2, null],
  ]);

  attributePipelineBindGroups(pipeline, boundBindGroups);
  assert.deepEqual(pipeline.uses.bindGroups, [11, 22]);
  assert.deepEqual(pipeline.uses.bindGroupSlots, [
    { bindGroupId: 11, index: 0 },
    { bindGroupId: 22, index: 1 },
  ]);

  boundBindGroups.set(1, 33);
  attributePipelineBindGroups(pipeline, boundBindGroups);
  assert.deepEqual(pipeline.uses.bindGroups, [11, 22, 33]);
  assert.deepEqual(pipeline.uses.bindGroupSlots.at(-1), {
    bindGroupId: 33,
    index: 1,
  });
});

test("attributes vertex and index inputs that were set before a pipeline", () => {
  const pipeline = {
    uses: {
      indexBuffers: [],
      vertexBuffers: [],
      vertexBufferSlots: [],
    },
  };
  const vertexBuffers = new Map([
    [0, { bufferId: 11, offset: 0, size: 96 }],
    [1, { bufferId: 22, offset: 128, size: null }],
  ]);
  const indexBuffer = {
    bufferId: 33,
    format: "uint32",
    offset: 16,
    size: 240,
  };

  attributePipelineBufferBindings(pipeline, vertexBuffers, indexBuffer);
  assert.deepEqual(pipeline.uses.vertexBuffers, [11, 22]);
  assert.deepEqual(pipeline.uses.vertexBufferSlots, [
    { bufferId: 11, offset: 0, size: 96, slot: 0 },
    { bufferId: 22, offset: 128, size: null, slot: 1 },
  ]);
  assert.deepEqual(pipeline.uses.indexBuffers, [
    { bufferId: 33, format: "uint32", offset: 16, size: 240 },
  ]);

  attributePipelineBufferBindings(pipeline, vertexBuffers, indexBuffer);
  assert.equal(pipeline.uses.vertexBufferSlots.length, 2);
  assert.equal(pipeline.uses.indexBuffers.length, 1);
});

test("records bounded draw and dispatch dimensions per generated pipeline", () => {
  const signatures = [];
  const overflow = { count: 0 };

  recordCommandSignature(
    signatures,
    { firstInstance: 0, firstVertex: 0, instanceCount: 406, kind: "draw", vertexCount: 6 },
    2,
    overflow,
  );
  recordCommandSignature(
    signatures,
    { firstInstance: 0, firstVertex: 0, instanceCount: 406, kind: "draw", vertexCount: 6 },
    2,
    overflow,
  );
  recordCommandSignature(
    signatures,
    { kind: "dispatchWorkgroups", x: 7, y: 1, z: 1 },
    2,
    overflow,
  );
  recordCommandSignature(
    signatures,
    { firstInstance: 0, firstVertex: 0, instanceCount: 1, kind: "draw", vertexCount: 3 },
    2,
    overflow,
  );

  assert.deepEqual(signatures, [
    {
      count: 2,
      firstInstance: 0,
      firstVertex: 0,
      instanceCount: 406,
      kind: "draw",
      vertexCount: 6,
    },
    { count: 1, kind: "dispatchWorkgroups", x: 7, y: 1, z: 1 },
  ]);
  assert.equal(overflow.count, 1);
});

test("snapshots exact resource bindings for one draw instead of pipeline-wide history", () => {
  assert.deepEqual(
    describeExecutionBindings(
      new Map([
        [0, 91],
        [2, 93],
      ]),
      new Map([
        [0, { bufferId: 11, offset: 0, size: 96 }],
        [1, { bufferId: 22, offset: 128, size: null }],
      ]),
      { bufferId: 33, format: "uint32", offset: 16, size: 240 },
    ),
    {
      bindGroups: [
        { bindGroupId: 91, slot: 0 },
        { bindGroupId: 93, slot: 2 },
      ],
      indexBuffer: {
        bufferId: 33,
        format: "uint32",
        offset: 16,
        size: 240,
      },
      vertexBuffers: [
        { bufferId: 11, offset: 0, size: 96, slot: 0 },
        { bufferId: 22, offset: 128, size: null, slot: 1 },
      ],
    },
  );
});

test("detects incompatible generated uniform structs bound to one GPU buffer", () => {
  assert.equal(typeof comparisonReport.findBufferContractMismatches, "function");
  const mismatches = comparisonReport.findBufferContractMismatches({
    bindGroups: [
      {
        entries: [{ binding: 0, bufferId: 11, type: "buffer" }],
        id: 31,
      },
      {
        entries: [{ binding: 0, bufferId: 11, type: "buffer" }],
        id: 32,
      },
    ],
    buffers: [{ id: 11, label: "Shared frame uniform" }],
    pipelines: [
      {
        fragment: { shaderId: 1 },
        id: 41,
        label: "Forward",
        uses: { bindGroupSlots: [{ bindGroupId: 31, index: 0 }] },
      },
      {
        fragment: { shaderId: 2 },
        id: 42,
        label: "Particles",
        uses: { bindGroupSlots: [{ bindGroupId: 32, index: 0 }] },
      },
    ],
    shaderModules: [
      {
        analysis: {
          bindings: {
            declarations: [
              {
                addressSpace: "uniform",
                binding: 0,
                group: 0,
                name: "frame",
                type: "FrameA",
              },
            ],
          },
          structures: [
            {
              members: [
                { name: "viewProjection", type: "mat4x4f" },
                { name: "settings", type: "vec4f" },
              ],
              name: "FrameA",
            },
          ],
        },
        id: 1,
      },
      {
        analysis: {
          bindings: {
            declarations: [
              {
                addressSpace: "uniform",
                binding: 0,
                group: 0,
                name: "frame",
                type: "FrameB",
              },
            ],
          },
          structures: [
            {
              members: [
                { name: "viewProjection", type: "mat4x4f" },
                { name: "inverseViewProjection", type: "mat4x4f" },
                { name: "settings", type: "vec4f" },
              ],
              name: "FrameB",
            },
          ],
        },
        id: 2,
      },
    ],
  });

  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].bufferId, 11);
  assert.equal(mismatches[0].bufferLabel, "Shared frame uniform");
  assert.deepEqual(
    mismatches[0].contracts.map(({ pipelineLabel, struct }) => ({
      pipelineLabel,
      struct,
    })),
    [
      { pipelineLabel: "Forward", struct: "FrameA" },
      { pipelineLabel: "Particles", struct: "FrameB" },
    ],
  );

  const rewritten = comparisonReport.findBufferContractMismatches({
    bindGroups: [
      {
        entries: [{ binding: 0, bufferId: 11, type: "buffer" }],
        id: 31,
      },
    ],
    buffers: [{ id: 11, label: "Streaming arena", writeCount: 2 }],
    pipelines: mismatches[0].contracts.map((contract, index) => ({
      fragment: { shaderId: index + 1 },
      id: contract.pipelineId,
      label: contract.pipelineLabel,
      uses: { bindGroupSlots: [{ bindGroupId: 31, index: 0 }] },
    })),
    shaderModules: [
      {
        analysis: {
          bindings: {
            declarations: [{ addressSpace: "uniform", binding: 0, group: 0, type: "A" }],
          },
          structures: [{ members: [{ name: "a", type: "vec4f" }], name: "A" }],
        },
        id: 1,
      },
      {
        analysis: {
          bindings: {
            declarations: [{ addressSpace: "uniform", binding: 0, group: 0, type: "B" }],
          },
          structures: [{ members: [{ name: "b", type: "mat4x4f" }], name: "B" }],
        },
        id: 2,
      },
    ],
  });
  assert.deepEqual(rewritten, []);
});

test("analyzes generated WGSL and preserves both ends of large buffer writes", () => {
  const analysis = analyzeWgsl(`
struct FrameUniforms {
  viewProjection: mat4x4f,
  environment: vec4f,
}
const environmentGain: f32 = 0.22;
override bloomThreshold: f32 = 1.0;
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@binding(3) @group(2)
var<storage, read> values: array<vec4f>;
@compute @workgroup_size(8, 4, 1) fn update() {
  for (var index = 0; index < 4; index += 1) {}
}
@fragment fn shade() -> @location(0) vec4f {
  let environment = frame.environment * environmentGain;
  let projected = frame.viewProjection * environment;
  return textureSample(source, sourceSampler, vec2f(0)) + projected;
}
`);

  assert.deepEqual(analysis.entryPoints.compute, ["update"]);
  assert.deepEqual(analysis.entryPoints.fragment, ["shade"]);
  assert.deepEqual(analysis.bindings.groups, [0, 2]);
  assert.equal(analysis.bindings.total, 4);
  assert.equal(analysis.bindings.uniformBuffers, 1);
  assert.equal(analysis.bindings.sampledTextures, 1);
  assert.equal(analysis.bindings.samplers, 1);
  assert.equal(analysis.bindings.storageBuffers, 1);
  assert.deepEqual(analysis.bindings.declarations[0], {
    addressSpace: "uniform",
    binding: 0,
    group: 0,
    name: "frame",
    type: "FrameUniforms",
  });
  assert.deepEqual(analysis.bindingMemberUses, [
    {
      binding: 0,
      bindingName: "frame",
      group: 0,
      member: "environment",
      type: "vec4f",
      useCount: 1,
      useSites: [
        {
          access: "frame.environment",
          line: 17,
          source: "let environment = frame.environment * environmentGain;",
        },
      ],
      useSitesTruncated: false,
    },
    {
      binding: 0,
      bindingName: "frame",
      group: 0,
      member: "viewProjection",
      type: "mat4x4f",
      useCount: 1,
      useSites: [
        {
          access: "frame.viewProjection",
          line: 18,
          source: "let projected = frame.viewProjection * environment;",
        },
      ],
      useSitesTruncated: false,
    },
  ]);
  assert.deepEqual(analysis.constants, [
    { name: "environmentGain", type: "f32", value: "0.22" },
  ]);
  assert.deepEqual(analysis.overrides, [
    { name: "bloomThreshold", type: "f32", value: "1.0" },
  ]);
  assert.deepEqual(analysis.structures, [
    {
      members: [
        { name: "viewProjection", type: "mat4x4f" },
        { name: "environment", type: "vec4f" },
      ],
      name: "FrameUniforms",
    },
  ]);
  assert.deepEqual(analysis.structureLayouts, [
    {
      alignment: 16,
      members: [
        {
          alignment: 16,
          name: "viewProjection",
          offset: 0,
          size: 64,
          type: "mat4x4f",
        },
        {
          alignment: 16,
          name: "environment",
          offset: 64,
          size: 16,
          type: "vec4f",
        },
      ],
      name: "FrameUniforms",
      size: 80,
      supported: true,
    },
  ]);
  assert.equal(analysis.textureOperations.sample, 1);
  assert.equal(analysis.controlFlow.forLoops, 1);
  assert.deepEqual(analysis.workgroupSizes, [[8, 4, 1]]);
  assert.equal(analysis.functionCalls.textureSample, 1);
  assert.equal(analysis.functionCalls.vec2f, 1);
  assert.equal(analysis.functionCalls.shade, undefined);
  assert.equal(analysis.functionCalls.update, undefined);
  assert.equal(analysis.functionCalls.binding, undefined);
  assert.equal(analysis.functionCalls.group, undefined);
  assert.equal(analysis.functionCalls.workgroup_size, undefined);
  assert.deepEqual(
    analysis.numericLiterals.filter(({ value }) => ["0.22", "1.0"].includes(value)),
    [
      { count: 1, value: "0.22" },
      { count: 1, value: "1.0" },
    ],
  );

  const values = Float32Array.from({ length: 40 }, (_, index) => index);
  const sample = sampleBufferData(values, 32);
  assert.equal(sample.byteLength, 160);
  assert.equal(sample.sampledBytes, 32);
  assert.equal(sample.truncated, true);
  assert.equal(sample.segments.length, 2);
  assert.deepEqual(sample.segments[0].floats, [0, 1, 2, 3]);
  assert.equal(sample.segments[1].byteOffset, 144);
  assert.deepEqual(sample.segments[1].floats, [36, 37, 38, 39]);
});

test("links generated struct-array members to bounded shader use sites", () => {
  const analysis = analyzeWgsl(`
struct Light {
  positionRadius: vec4f,
  colorIntensity: vec4f,
}
@group(0) @binding(0) var<storage, read> lights: array<Light, 64>;
@compute @workgroup_size(1) fn update() {
  let light = (&lights[0]);
  let first = (*light).colorIntensity;
  let second = (*light).colorIntensity;
  let third = (*light).colorIntensity;
  let fourth = (*light).colorIntensity;
}
`);

  assert.deepEqual(analysis.bindingMemberUses, [
    {
      binding: 0,
      bindingName: "lights",
      group: 0,
      member: "colorIntensity",
      type: "vec4f",
      useCount: 4,
      useSites: [
        { access: "(*light).colorIntensity", line: 9, source: "let first = (*light).colorIntensity;" },
        { access: "(*light).colorIntensity", line: 10, source: "let second = (*light).colorIntensity;" },
        { access: "(*light).colorIntensity", line: 11, source: "let third = (*light).colorIntensity;" },
      ],
      useSitesTruncated: true,
    },
  ]);
});

test("normalizes WebGPU callsites back to authored browser modules", () => {
  assert.equal(
    normalizeJavaScriptCallsite(`Error
    at captureCallsite (<anonymous>:318:17)
    at GPUDevice.<anonymous> (<anonymous>:1191:28)
    at createTypedPipeline (http://127.0.0.1:4174/src/pipelines.ts?t=193847:84:11)
    at startRenderer (http://127.0.0.1:4174/src/renderer.ts:122:5)`),
    "/src/pipelines.ts:84:11",
  );
  assert.equal(
    normalizeJavaScriptCallsite("Error\n    at captureCallsite (<anonymous>:1:1)"),
    null,
  );
  assert.equal(
    normalizeJavaScriptCallsite(`Error
    at compileShader (http://127.0.0.1:4174/node_modules/.vite/deps/typegpu.js:14929:25)
    at createPipelines (http://127.0.0.1:4174/src/renderer.ts?t=193847:114:7)`),
    "/src/renderer.ts:114:7",
  );
});

test("retains complete persistent samples for critical model buffers", () => {
  assert.equal(
    selectBufferSampleLimit(
      "TypeGPU Mutable Light Struct Array",
      128,
      32_768,
      "(?:light|frame|cascade)",
    ),
    32_768,
  );
  assert.equal(
    selectBufferSampleLimit(
      "glTF vertex buffer 120",
      128,
      32_768,
      "(?:light|frame|cascade)",
    ),
    128,
  );

  let snapshot = updateCpuBufferSnapshot(
    null,
    16,
    0,
    Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
    32,
  );
  snapshot = updateCpuBufferSnapshot(
    snapshot,
    16,
    8,
    Uint8Array.from([9, 10, 11, 12, 13, 14, 15, 16]),
    32,
  );
  assert.deepEqual(Array.from(snapshot.bytes), [
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  assert.deepEqual(snapshot.ranges, [{ offset: 0, size: 16 }]);
  assert.equal(snapshot.coveredBytes, 16);
  assert.equal(snapshot.coverageComplete, true);
  assert.equal(updateCpuBufferSnapshot(null, 64, 0, new Uint8Array(4), 32), null);
});

test("links compute-mutated storage buffers to the draw that consumes them", () => {
  const commands = [
    {
      kind: "dispatchWorkgroups",
      sequence: 4,
      resourceBindings: [
        {
          resource: { bufferId: 7, kind: "buffer" },
          shaderBindings: [
            { addressSpace: "storage, read_write", name: "lights", stage: "compute" },
          ],
        },
      ],
    },
    {
      kind: "drawIndexed",
      sequence: 5,
      resourceBindings: [
        {
          resource: { bufferId: 7, kind: "buffer" },
          shaderBindings: [
            { addressSpace: "storage, read", name: "lights", stage: "fragment" },
          ],
        },
      ],
    },
  ];

  attributeGpuBufferDependencies(commands);

  assert.equal(
    commands[0].resourceBindings[0].latestGpuWriteCommandSequence,
    null,
  );
  assert.equal(
    commands[0].resourceBindings[0].writesGpuBuffer,
    true,
  );
  assert.equal(
    commands[1].resourceBindings[0].latestGpuWriteCommandSequence,
    4,
  );
  assert.equal(
    commands[1].resourceBindings[0].writesGpuBuffer,
    false,
  );
});

test("summarizes CPU-authored versus GPU-mutated struct records", () => {
  const cpuBytes = new Uint8Array(new Float32Array([
    1, 2, 3, 4,
    5, 6, 7, 8,
  ]).buffer);
  const gpuBytes = new Uint8Array(new Float32Array([
    1, 2, 3, 4,
    5, 9, 7, 8,
  ]).buffer);
  assert.deepEqual(
    compareCpuGpuBufferSnapshots(
      {
        bytes: cpuBytes,
        ranges: [{ offset: 0, size: cpuBytes.byteLength }],
      },
      gpuBytes,
      [{ destinationOffset: 0, size: gpuBytes.byteLength, sourceOffset: 0 }],
      [{ stride: 16 }],
    ),
    {
      changedByteFraction: 0.0625,
      changedBytes: 2,
      comparedBytes: 32,
      float32: {
        changedOffsets: [20],
        changedValues: 1,
        comparedValues: 8,
        maximumAbsoluteDifference: 3,
        meanAbsoluteDifference: 0.375,
      },
      recordChanges: [{ changedRecordIndices: [1], stride: 16 }],
    },
  );
});

test("decodes generated WGSL buffer records across probe ranges", () => {
  const floats = new Float32Array([
    1, 2, 3, 4,
    5, 6, 7, 8,
  ]);
  const bytes = new Uint8Array(floats.buffer);
  const plan = [
    { destinationOffset: 0, size: 16, sourceOffset: 0 },
    { destinationOffset: 16, size: 16, sourceOffset: 16 },
  ];
  assert.deepEqual(
    decodeWgslBufferLayout(
      bytes,
      plan,
      {
        elementCount: 2,
        kind: "array",
        members: [
          { name: "position", offset: 0, size: 12, type: "vec3f" },
          { name: "radius", offset: 12, size: 4, type: "f32" },
        ],
        stride: 16,
        structureSize: 16,
      },
    ),
    {
      decodedRecordCount: 2,
      elementCount: 2,
      records: [
        { index: 0, values: { position: [1, 2, 3], radius: 4 } },
        { index: 1, values: { position: [5, 6, 7], radius: 8 } },
      ],
      truncated: false,
    },
  );
});

test("retains every shader stage when grouping decoded buffer layouts", () => {
  const layout = {
    elementCount: 64,
    members: [{ name: "position", offset: 0, size: 16, type: "vec4f" }],
    stride: 16,
  };
  assert.deepEqual(
    groupWgslBufferLayoutBindings([
      { layout, name: "lights", stage: "compute", type: "array<Light, 64>" },
      { layout, name: "lights", stage: "fragment", type: "array<Light, 64>" },
      { layout, name: "lightData", stage: "vertex", type: "array<Light, 64>" },
    ]),
    [
      {
        bindingNames: ["lightData", "lights"],
        layout,
        stages: ["compute", "fragment", "vertex"],
        type: "array<Light, 64>",
      },
    ],
  );
});

test("calculates uniform offsets for packed generated light structs", () => {
  assert.deepEqual(
    calculateWgslStructureLayouts([
      {
        members: [
          { name: "camera", type: "mat4x4<f32>" },
          { name: "position", type: "vec3<f32>" },
          { name: "distance", type: "f32" },
          { name: "decay", type: "f32" },
          { name: "color", type: "vec3f" },
        ],
        name: "Render",
      },
    ]),
    [
      {
        alignment: 16,
        members: [
          { alignment: 16, name: "camera", offset: 0, size: 64, type: "mat4x4<f32>" },
          { alignment: 16, name: "position", offset: 64, size: 12, type: "vec3<f32>" },
          { alignment: 4, name: "distance", offset: 76, size: 4, type: "f32" },
          { alignment: 4, name: "decay", offset: 80, size: 4, type: "f32" },
          { alignment: 16, name: "color", offset: 96, size: 12, type: "vec3f" },
        ],
        name: "Render",
        size: 112,
        supported: true,
      },
    ],
  );
});

test("describes generated buffer contracts without duplicating full WGSL layouts", () => {
  const layouts = [
    {
      alignment: 16,
      members: [
        { alignment: 16, name: "positionRadius", offset: 0, size: 16, type: "vec4f" },
        { alignment: 16, name: "colorIntensity", offset: 16, size: 16, type: "vec4f" },
      ],
      name: "Light",
      size: 32,
      supported: true,
    },
  ];
  assert.deepEqual(
    describeWgslBindingLayout("array<Light, 64>", layouts, "storage, read"),
    {
      byteSize: 2048,
      elementCount: 64,
      kind: "array",
      stride: 32,
      structureName: "Light",
      structureSize: 32,
    },
  );
  assert.deepEqual(describeWgslBindingLayout("Light", layouts, "uniform"), {
    byteSize: 32,
    elementCount: 1,
    kind: "struct",
    stride: 32,
    structureName: "Light",
    structureSize: 32,
  });
  assert.equal(describeWgslBindingLayout("texture_2d<f32>", layouts, ""), null);
});

test("records the WebGPU pipeline state that materially changes presentation", () => {
  const vertexModule = {};
  const fragmentModule = {};
  const shaderIds = new Map([
    [vertexModule, 11],
    [fragmentModule, 12],
  ]);
  const pipeline = describePipelineDescriptor(
    "render",
    {
      label: "HDR particles",
      layout: "auto",
      vertex: {
        module: vertexModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 32,
            stepMode: "vertex",
            attributes: [
              { format: "float32x3", offset: 0, shaderLocation: 0 },
            ],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: "fragmentMain",
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
      depthStencil: {
        depthCompare: "less-equal",
        depthWriteEnabled: false,
        format: "depth24plus",
      },
      multisample: { count: 4 },
      primitive: { cullMode: "none", topology: "triangle-list" },
    },
    false,
    (module) => shaderIds.get(module) ?? null,
  );

  assert.equal(pipeline.vertex.shaderId, 11);
  assert.equal(pipeline.fragment.shaderId, 12);
  assert.equal(pipeline.fragment.targets[0].format, "rgba16float");
  assert.equal(pipeline.fragment.targets[0].blend.color.srcFactor, "one");
  assert.equal(pipeline.depthStencil.depthCompare, "less-equal");
  assert.equal(pipeline.multisample.count, 4);
  assert.equal(pipeline.vertex.buffers[0].attributes[0].format, "float32x3");
});

test("preserves render-pass clears and attachment subresources", () => {
  const colorView = {};
  const resolveView = {};
  const depthView = {};
  const viewIds = new Map([
    [colorView, { id: 21, textureId: 20 }],
    [resolveView, { id: 23, textureId: 22 }],
    [depthView, { id: 25, textureId: 24 }],
  ]);

  assert.deepEqual(
    describePassDescriptor(
      "render",
      {
        label: "HDR particles",
        colorAttachments: [
          {
            clearValue: { r: 0.25, g: 0.5, b: 1, a: 0 },
            loadOp: "clear",
            resolveTarget: resolveView,
            storeOp: "discard",
            view: colorView,
          },
        ],
        depthStencilAttachment: {
          depthClearValue: 0.75,
          depthLoadOp: "clear",
          depthReadOnly: false,
          depthStoreOp: "store",
          stencilClearValue: 3,
          stencilLoadOp: "clear",
          stencilReadOnly: true,
          stencilStoreOp: "discard",
          view: depthView,
        },
      },
      (view) => viewIds.get(view) ?? null,
    ),
    {
      colorAttachments: [
        {
          clearValue: [0.25, 0.5, 1, 0],
          loadOp: "clear",
          resolveTextureId: 22,
          resolveViewId: 23,
          storeOp: "discard",
          textureId: 20,
          viewId: 21,
        },
      ],
      depthStencilAttachment: {
        depthClearValue: 0.75,
        depthLoadOp: "clear",
        depthReadOnly: false,
        depthStoreOp: "store",
        stencilClearValue: 3,
        stencilLoadOp: "clear",
        stencilReadOnly: true,
        stencilStoreOp: "discard",
        textureId: 24,
        viewId: 25,
      },
      kind: "render",
      label: "HDR particles",
    },
  );
});

test("captures the effective dynamic-offset window used by a bind group", () => {
  assert.deepEqual(normalizeDynamicOffsets(undefined), []);
  assert.deepEqual(normalizeDynamicOffsets([4, 8, 12]), [4, 8, 12]);
  assert.deepEqual(
    normalizeDynamicOffsets(new Uint32Array([16, 32, 48, 64]), 1, 2),
    [32, 48],
  );
  assert.deepEqual(
    describeExecutionBindings(
      new Map([[0, 31]]),
      new Map(),
      null,
      new Map([[0, [256, 512]]]),
    ),
    {
      bindGroups: [
        { bindGroupId: 31, dynamicOffsets: [256, 512], slot: 0 },
      ],
      indexBuffer: null,
      vertexBuffers: [],
    },
  );
});

test("resolves concrete shader buffer ranges from traced bind groups", () => {
  assert.deepEqual(
    resolveExecutionBufferBindings(
      {
        bindGroups: [
          { bindGroupId: 31, dynamicOffsets: [256], slot: 0 },
        ],
        indexBuffer: { bufferId: 14, format: "uint16", offset: 4, size: 12 },
        vertexBuffers: [{ bufferId: 13, offset: 32, size: 96, slot: 1 }],
      },
      [
        {
          entries: [
            { binding: 0, bufferId: 11, offset: 64, size: 128, type: "buffer" },
            { binding: 2, bufferId: 12, offset: 0, size: null, type: "buffer" },
          ],
          id: 31,
          layoutId: 41,
        },
      ],
      [
        {
          entries: [
            { binding: 0, buffer: { hasDynamicOffset: true } },
            { binding: 2, buffer: { hasDynamicOffset: false } },
          ],
          id: 41,
        },
      ],
      [
        { id: 11, size: 2048 },
        { id: 12, size: 512 },
        { id: 13, size: 1024 },
        { id: 14, size: 64 },
      ],
    ),
    [
      {
        bindGroupId: 31,
        binding: 0,
        bufferId: 11,
        dynamicOffset: 256,
        group: 0,
        offset: 320,
        size: 128,
        source: "bindGroup",
      },
      {
        bindGroupId: 31,
        binding: 2,
        bufferId: 12,
        dynamicOffset: 0,
        group: 0,
        offset: 0,
        size: 512,
        source: "bindGroup",
      },
      {
        bufferId: 13,
        offset: 32,
        size: 96,
        slot: 1,
        source: "vertex",
      },
      {
        bufferId: 14,
        format: "uint16",
        offset: 4,
        size: 12,
        source: "index",
      },
    ],
  );
});

test("resolves shader names and concrete resources for one traced command", () => {
  assert.deepEqual(
    resolveExecutionResourceBindings(
      {
        bindGroups: [{ bindGroupId: 31, slot: 1 }],
      },
      [
        {
          entries: [
            { binding: 0, bufferId: 11, offset: 0, size: 256, type: "buffer" },
            { binding: 1, samplerId: 21, type: "sampler" },
            { binding: 2, textureViewId: 41, type: "textureView" },
          ],
          id: 31,
        },
      ],
      [{ descriptor: { baseMipLevel: 2 }, id: 41, textureId: 51 }],
      [
        {
          format: "rgba16float",
          id: 51,
          label: "PMREM.cubeUv",
          mipLevelCount: 9,
          size: { depthOrArrayLayers: 1, height: 1024, width: 768 },
        },
      ],
      [{ id: 21, label: "PMREM sampler", minFilter: "linear" }],
      [{ id: 11, label: "render uniforms", size: 256 }],
      { fragment: { shaderId: 61 }, id: 71, vertex: { shaderId: 62 } },
      [
        {
          analysis: {
            bindings: {
              declarations: [
                {
                  addressSpace: "uniform",
                  binding: 0,
                  group: 1,
                  name: "render",
                  type: "renderStruct",
                },
                {
                  addressSpace: "",
                  binding: 1,
                  group: 1,
                  name: "nodeUniform170_sampler",
                  type: "sampler",
                },
                {
                  addressSpace: "",
                  binding: 2,
                  group: 1,
                  name: "nodeUniform170",
                  type: "texture_2d<f32>",
                },
              ],
            },
          },
          id: 61,
        },
        { analysis: { bindings: { declarations: [] } }, id: 62 },
      ],
    ),
    [
      {
        bindGroupId: 31,
        binding: 0,
        group: 1,
        resource: {
          bufferId: 11,
          kind: "buffer",
          label: "render uniforms",
          offset: 0,
          size: 256,
        },
        shaderBindings: [
          {
            addressSpace: "uniform",
            name: "render",
            stage: "fragment",
            type: "renderStruct",
          },
        ],
      },
      {
        bindGroupId: 31,
        binding: 1,
        group: 1,
        resource: {
          kind: "sampler",
          label: "PMREM sampler",
          samplerId: 21,
          settings: { minFilter: "linear" },
        },
        shaderBindings: [
          {
            addressSpace: "",
            name: "nodeUniform170_sampler",
            stage: "fragment",
            type: "sampler",
          },
        ],
      },
      {
        bindGroupId: 31,
        binding: 2,
        group: 1,
        resource: {
          format: "rgba16float",
          kind: "texture",
          label: "PMREM.cubeUv",
          mipLevelCount: 9,
          size: { depthOrArrayLayers: 1, height: 1024, width: 768 },
          textureId: 51,
          viewDescriptor: { baseMipLevel: 2 },
          viewId: 41,
        },
        shaderBindings: [
          {
            addressSpace: "",
            name: "nodeUniform170",
            stage: "fragment",
            type: "texture_2d<f32>",
          },
        ],
      },
    ],
  );
});

test("selects only the writes that define a bound buffer range at submission", () => {
  const binding = { bufferId: 11, offset: 100, size: 100 };
  const writes = [
    { bufferId: 11, bufferOffset: 100, byteLength: 100, id: 1 },
    { bufferId: 11, bufferOffset: 120, byteLength: 20, id: 2 },
    { bufferId: 12, bufferOffset: 100, byteLength: 100, id: 3 },
  ];
  assert.deepEqual(
    selectEffectiveBufferWrites(binding, writes).map(({ id }) => id),
    [1, 2],
  );
  assert.deepEqual(
    selectEffectiveBufferWrites(binding, [
      ...writes,
      { bufferId: 11, bufferOffset: 100, byteLength: 100, id: 4 },
    ]).map(({ id }) => id),
    [4],
  );
});

test("measures rendered pixels and produces safe shader artifact names", () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
    255, 0, 0, 255,
    128, 128, 128, 255,
  ]);
  const metrics = calculatePixelMetrics(pixels, 2, 2);

  assert.equal(metrics.full.pixelCount, 4);
  assert.equal(metrics.full.blackFraction, 0.25);
  assert.equal(metrics.full.highlightFraction, 0.5);
  assert.ok(metrics.full.luminanceMean > 0.3);
  assert.ok(metrics.full.luminanceMean < 0.6);
  assert.ok(metrics.full.edgeEnergy > 0);
  assert.equal(metrics.full.histogram.length, 16);
  assert.equal(metrics.floor.pixelCount, 2);
  assert.ok(metrics.leftFire.pixelCount >= 1);
  assert.ok(metrics.rightFire.pixelCount >= 1);
  assert.equal(metrics.spatial.columns, 8);
  assert.equal(metrics.spatial.rows, 5);
  assert.equal(metrics.spatial.cells.length, 40);
  assert.equal(typeof metrics.spatial.cells[0].highlightFraction, "number");
  assert.equal(
    sanitizeArtifactName("Directional / Ambient: pass #1"),
    "directional-ambient-pass-1",
  );
});

test("rejects a bright neutral presentation that diverges from the Three.js visual target", () => {
  const visualMetrics = ({ black, contrast, edge, highlight, luminance, rgb, saturation }) => ({
    regions: Object.fromEntries(
      ["center", "floor", "full"].map((region) => [
        region,
        {
          blackFraction: black,
          contrast,
          dynamicRange: contrast * 2,
          edgeEnergy: edge,
          highlightFraction: highlight,
          histogram: Array.from({ length: 16 }, (_, index) =>
            index === Math.round(luminance * 15) ? 100 : 0,
          ),
          luminanceMean: luminance,
          meanRgb: rgb,
          meanSaturation: saturation,
        },
      ]),
    ),
    spatial: {
      cells: Array.from({ length: 40 }, () => ({
        luminanceMean: luminance,
        meanRgb: rgb,
      })),
      columns: 8,
      rows: 5,
    },
  });
  const reference = visualMetrics({
    black: 0.05,
    contrast: 0.13,
    edge: 0.024,
    highlight: 0.015,
    luminance: 0.14,
    rgb: [0.23, 0.11, 0.1],
    saturation: 0.49,
  });
  const neutral = visualMetrics({
    black: 0.004,
    contrast: 0.28,
    edge: 0.058,
    highlight: 0,
    luminance: 0.44,
    rgb: [0.48, 0.44, 0.38],
    saturation: 0.33,
  });

  const comparison = compareVisualPresentation(neutral, reference);
  assert.ok(comparison.score < 0.8);
  assert.equal(comparison.mismatchHotspots.length, 5);
  assert.equal(typeof comparison.mismatchHotspots[0].distance, "number");

  const results = [
    { canvasMetrics: neutral, issues: [], name: "BroMetal AOT", slug: "brometal", status: "ready" },
    { canvasMetrics: reference, issues: [], name: "Three.js native", slug: "threejs", status: "ready" },
  ];
  assert.equal(findVisualParity(results).entries.length, 1);
  assert.equal(comparisonPassed(results), false);
  const html = renderHtmlReport({
    createdAt: "2026-08-08T12:00:00.000Z",
    profile: "heavy",
    results,
    viewport: { height: 900, width: 1440 },
  });
  assert.match(html, /Visual parity failed/);
  assert.match(html, /Presentation parity/);
  assert.match(html, /Mismatch hotspots/);
});

test("accepts independently rendered output that reaches the visual parity threshold", () => {
  const reference = calculatePixelMetrics(
    new Uint8ClampedArray([
      20, 5, 4, 255,
      230, 30, 20, 255,
      30, 9, 8, 255,
      180, 20, 15, 255,
    ]),
    2,
    2,
  );
  const candidate = structuredClone(reference);
  candidate.spatial.cells[0].meanRgb[0] += 0.01;

  const comparison = compareVisualPresentation(candidate, reference);
  assert.ok(comparison.score >= comparison.threshold);
  assert.equal(
    comparisonPassed([
      { canvasMetrics: candidate, issues: [], name: "WESL static", slug: "wesl", status: "ready" },
      { canvasMetrics: reference, issues: [], name: "Three.js native", slug: "threejs", status: "ready" },
    ]),
    true,
  );
});

test("summarizes large GPU captures without copying raw resources", () => {
  const report = {
    createdAt: "2026-08-08T12:00:00.000Z",
    profile: "smoke",
    results: [
      {
        canvasMetrics: { regions: { full: { luminanceMean: 0.2 } } },
        durationMs: 1200,
        frameWindow: { frames: 5, perFrame: { drawCalls: 9 } },
        gpu: {
          bindGroups: [
            {
              id: 31,
              label: "Scene inputs",
              entries: [
                { binding: 0, bufferId: 11, type: "buffer" },
                { binding: 1, textureViewId: 21, type: "textureView" },
              ],
            },
          ],
          buffers: [
            {
              id: 11,
              label: "Object Model GPUBuffer",
              lastWrite: {
                sample: {
                  segments: [{ bytes: [765432], floats: [1, 2, 3, 4] }],
                },
                source: "queue",
              },
              size: 64,
              usage: 72,
            },
            {
              id: 12,
              label: "Particle positions",
              lastWrite: null,
              size: 12992,
              usage: 44,
            },
            {
              id: 13,
              label: "Particle indices",
              lastWrite: null,
              size: 24,
              usage: 20,
            },
            { label: "Timestamp Query", lastWrite: { sample: {} } },
          ],
          bufferProbes: {
            errors: [],
            results: [
              {
                bufferId: 11,
                contracts: [
                  {
                    layout: { elementCount: 4, stride: 16, structureName: "Model" },
                    name: "models",
                    stage: "vertex",
                  },
                ],
                cpuComparison: {
                  changedBytes: 4,
                  float32: {
                    changedOffsets: [16, 20],
                    changedValues: 2,
                    comparedValues: 16,
                  },
                  recordChanges: [{ changedRecordIndices: [1], stride: 16 }],
                },
                decodedLayouts: [
                  {
                    bindingNames: ["models"],
                    decoded: {
                      decodedRecordCount: 4,
                      elementCount: 4,
                      records: [{ index: 0, values: { model: [987654] } }],
                      truncated: false,
                    },
                    stages: ["vertex"],
                    type: "array<Model, 4>",
                  },
                ],
                label: "Object Model GPUBuffer",
                ranges: [
                  {
                    destinationOffset: 0,
                    sample: {
                      byteLength: 64,
                      sampledBytes: 64,
                      segments: [{ byteOffset: 0, bytes: [987654], floats: [1, 2] }],
                      truncated: false,
                    },
                    size: 64,
                    sourceOffset: 0,
                  },
                ],
                size: 64,
              },
            ],
          },
          pipelines: [
            {
              id: 41,
              depthStencil: { depthWriteEnabled: true },
              fragment: {
                targets: [
                  {
                    blend: {
                      color: { operation: "add", srcFactor: "one" },
                    },
                    format: "rgba16float",
                  },
                ],
              },
              kind: "render",
              label: "HDR scene",
              multisample: { count: 4 },
              uses: {
                bindGroups: [31],
                commandSignatures: [
                  {
                    count: 5,
                    firstInstance: 0,
                    firstVertex: 0,
                    instanceCount: 406,
                    kind: "draw",
                    vertexCount: 6,
                  },
                ],
                indexBuffers: [
                  { bufferId: 13, format: "uint16", offset: 0, size: 24 },
                ],
                vertexBufferSlots: [
                  { bufferId: 12, offset: 0, size: 12992, slot: 0 },
                ],
              },
            },
          ],
          passSummaries: [
            {
              bindGroupIds: [],
              colorAttachments: [],
              depthStencilAttachment: null,
              id: 50,
              kind: "render",
              label: "one-time texture initialization",
              occurrences: 1,
              pipelineIds: [],
            },
            {
              bindGroupIds: [31],
              colorAttachments: [
                {
                  loadOp: "clear",
                  resolveTextureId: null,
                  storeOp: "store",
                  textureId: 20,
                },
              ],
              depthStencilAttachment: null,
              id: 51,
              kind: "render",
              label: "HDR scene pass",
              occurrences: 5,
              pipelineIds: [41],
            },
          ],
          resources: { bufferCount: 2, textureCount: 3 },
          shaderManifest: "shaders/demo/manifest.json",
          shaderModules: [
            {
              analysis: {
                bindingMemberUses: [
                  { useCount: 4, useSites: [{ line: 10 }, { line: 11 }] },
                  { useCount: 2, useSites: [{ line: 12 }] },
                ],
                bindings: { total: 3 },
                controlFlow: { forLoops: 1, loops: 0, whileLoops: 0 },
                entryPoints: { compute: [], fragment: ["shade"], vertex: [] },
                functions: 2,
                textureOperations: { load: 0, sample: 4, store: 0 },
              },
              characters: 100,
            },
            { characters: 250 },
          ],
          textureProbes: {
            errors: [],
            results: [
              {
                format: "r8unorm",
                label: "Demo ambient occlusion",
                luminance: { mean: 0.91, p10: 0.72, p90: 1 },
              },
            ],
          },
          synchronization: {
            animation: {
              paused: true,
              pendingCallbacks: 1,
              scheduledCallbacks: 0,
            },
            capturedFrameIndex: 12,
          },
          textures: [
            {
              format: "rgba16float",
              id: 20,
              label: "Resolved HDR color",
              size: { depthOrArrayLayers: 1, height: 720, width: 1280 },
              usage: 20,
            },
          ],
          textureViews: [
            { descriptor: {}, id: 21, label: "HDR view", textureId: 20 },
          ],
        },
        issues: [],
        name: "Demo",
        status: "ready",
        telemetry: { latestFrame: { fps: 60 } },
        workloadWindow: {
          passes: [
            {
              id: 51,
              kind: "render",
              label: "HDR scene pass",
              perFrame: { occurrences: 1 },
              totals: { occurrences: 5 },
            },
          ],
          pipelines: [],
        },
      },
    ],
    viewport: { height: 900, width: 1440 },
  };

  const summary = summarizeReport(report);
  assert.equal(summary.passed, true);
  assert.equal(summary.results[0].shaders.characters, 350);
  assert.equal(summary.results[0].synchronization.capturedFrameIndex, 12);
  assert.equal(summary.results[0].shaders.bindings, 3);
  assert.equal(summary.results[0].shaders.bufferMembers, 2);
  assert.equal(summary.results[0].shaders.bufferMemberUses, 6);
  assert.equal(summary.results[0].shaders.bufferMemberUseSites, 3);
  assert.equal(summary.results[0].shaders.entryPoints, 1);
  assert.equal(summary.results[0].shaders.textureOperations, 4);
  assert.equal(summary.results[0].pipelineState.maxSampleCount, 4);
  assert.equal(summary.results[0].pipelineState.additiveTargets, 1);
  assert.deepEqual(summary.results[0].pipelineState.targetFormats, [
    "rgba16float",
  ]);
  assert.equal(summary.results[0].modelBufferSamples.length, 1);
  assert.equal(summary.results[0].modelBufferSamples[0].label, "Object Model GPUBuffer");
  assert.equal(summary.results[0].pipelineInputs.length, 1);
  assert.equal(summary.results[0].pipelineInputs[0].label, "HDR scene");
  assert.equal(summary.results[0].pipelineInputs[0].inputCount, 4);
  assert.deepEqual(summary.results[0].pipelineInputs[0].commands, [
    {
      count: 5,
      firstInstance: 0,
      firstVertex: 0,
      instanceCount: 406,
      kind: "draw",
      vertexCount: 6,
    },
  ]);
  assert.deepEqual(summary.results[0].pipelineInputs[0].inputs[0], {
    bindGroup: "Scene inputs",
    binding: 0,
    id: 11,
    label: "Object Model GPUBuffer",
    lastWrite: {
      sample: { segments: [{ floats: [1, 2, 3, 4] }] },
      source: "queue",
    },
    size: 64,
    type: "buffer",
    usage: 72,
  });
  assert.deepEqual(summary.results[0].pipelineInputs[0].inputs[1], {
    bindGroup: "Scene inputs",
    binding: 1,
    format: "rgba16float",
    id: 20,
    label: "Resolved HDR color",
    size: { depthOrArrayLayers: 1, height: 720, width: 1280 },
    type: "texture",
    usage: 20,
    viewId: 21,
    viewLabel: "HDR view",
  });
  assert.deepEqual(summary.results[0].pipelineInputs[0].inputs[2], {
    binding: "vertex:0",
    bindingOffset: 0,
    bindingSize: 12992,
    id: 12,
    label: "Particle positions",
    lastWrite: null,
    size: 12992,
    type: "buffer",
    usage: 44,
  });
  assert.deepEqual(summary.results[0].pipelineInputs[0].inputs[3], {
    binding: "index:uint16",
    bindingOffset: 0,
    bindingSize: 24,
    id: 13,
    label: "Particle indices",
    lastWrite: null,
    size: 24,
    type: "buffer",
    usage: 20,
  });
  assert.equal(summary.results[0].renderStages.length, 1);
  assert.deepEqual(summary.results[0].renderStages[0].pipelines, [
    {
      commands: [
        {
          count: 5,
          firstInstance: 0,
          firstVertex: 0,
          instanceCount: 406,
          kind: "draw",
          vertexCount: 6,
        },
      ],
      id: 41,
      label: "HDR scene",
    },
  ]);
  assert.equal(summary.results[0].renderStages[0].inputCount, 4);
  assert.deepEqual(summary.results[0].renderStages[0].outputs[0], {
    attachmentIndex: 0,
    format: "rgba16float",
    id: 20,
    label: "Resolved HDR color",
    loadOp: "clear",
    role: "color",
    size: { depthOrArrayLayers: 1, height: 720, width: 1280 },
    storeOp: "store",
  });
  assert.equal(
    summary.results[0].intermediateTargets.results[0].label,
    "Demo ambient occlusion",
  );
  assert.equal(
    summary.results[0].intermediateBuffers.results[0].label,
    "Object Model GPUBuffer",
  );
  assert.deepEqual(
    summary.results[0].intermediateBuffers.results[0].cpuComparison.recordChanges,
    [{ changedRecordIndices: [1], stride: 16 }],
  );
  assert.equal(
    summary.results[0].intermediateBuffers.results[0].cpuComparison.float32
      .changedOffsetCount,
    2,
  );
  assert.deepEqual(
    summary.results[0].intermediateBuffers.results[0].decodedLayouts,
    [
      {
        bindingNames: ["models"],
        decodedRecordCount: 4,
        elementCount: 4,
        stages: ["vertex"],
        truncated: false,
        type: "array<Model, 4>",
      },
    ],
  );
  assert.equal(
    JSON.stringify(summary.results[0].intermediateBuffers).includes("987654"),
    false,
  );
  assert.equal("buffers" in summary.results[0], false);
});

test("rejects benchmark entries that are the same renderer under different labels", () => {
  const sharedResult = (name, uniqueShader) => ({
    frameWindow: {
      perFrame: {
        computePasses: 5,
        dispatchCalls: 23,
        drawCalls: 10,
        drawIndexedCalls: 299,
        renderPasses: 18,
      },
    },
    gpu: {
      pipelines: new Array(20).fill({ kind: "render" }),
      resources: {
        bufferBytes: 1000,
        bufferCount: 50,
        estimatedTextureBytes: 2000,
        textureCount: 30,
      },
      shaderModules: [
        ...Array.from({ length: 9 }, (_, index) => ({ hash: `shared-${index}` })),
        { hash: uniqueShader },
      ],
    },
    issues: [],
    name,
    status: "ready",
  });
  const first = sharedResult("First label", "first-only");
  const second = sharedResult("Second label", "second-only");

  const pairs = findSharedRendererPairs([first, second]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].first, "First label");
  assert.equal(pairs[0].second, "Second label");
  assert.ok(pairs[0].shaderOverlap > 0.8);
  assert.equal(comparisonPassed([first, second]), false);
});

function createParticleFixtureIds(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 1000 + (state % 900000);
  };
}

function createParticleProbe(bufferId, values, sampledFloatCount = values.length) {
  const sampledValues = Array.from(values.slice(0, sampledFloatCount));
  const sampledBytes = sampledValues.length * Float32Array.BYTES_PER_ELEMENT;
  return {
    bufferId,
    ranges: [
      {
        destinationOffset: 0,
        sample: {
          byteLength: sampledBytes,
          sampledBytes,
          segments: [{ byteOffset: 0, floats: sampledValues }],
          truncated: sampledValues.length < values.length,
        },
        size: sampledBytes,
        sourceOffset: 0,
      },
    ],
    size: values.byteLength,
  };
}

function createSemanticParticles(mutator = () => {}) {
  return Array.from({ length: 406 }, (_, index) => {
    const particle = {
      aux: 1,
      color: [1 + (index % 3), 2, 3],
      position: [index, index * 2, -index],
      radius: 0.25,
    };
    mutator(particle, index);
    return particle;
  });
}

function encodeDirectParticleState(particles) {
  return Float32Array.from(
    particles.flatMap((particle) => [
      ...particle.position,
      particle.radius,
      ...particle.color,
      particle.aux,
    ]),
  );
}

function encodeParticleMatrices(particles) {
  return Float32Array.from(
    particles.flatMap((particle) => {
      const diameter = particle.radius * 2;
      return [
        diameter,
        0,
        0,
        0,
        0,
        diameter,
        0,
        0,
        0,
        0,
        1,
        0,
        ...particle.position,
        1,
      ];
    }),
  );
}

function additiveParticlePipeline(id, vertex = {}) {
  return {
    depthStencil: { depthWriteEnabled: false },
    fragment: {
      targets: [
        {
          blend: {
            color: {
              dstFactor: "one",
              operation: "add",
              srcFactor: "src-alpha",
            },
          },
        },
      ],
    },
    id,
    kind: "render",
    vertex,
  };
}

function createDirectParticleCapture({
  name = "Candidate",
  particles,
  sampledFloatCount,
  seed,
  slug = "candidate",
}) {
  const nextId = createParticleFixtureIds(seed);
  const pipelineId = nextId();
  const shaderId = nextId();
  const particleBufferId = nextId();
  const particleValues = encodeDirectParticleState(particles);
  return {
    gpu: {
      bufferProbes: {
        errors: [],
        results: [
          createParticleProbe(
            particleBufferId,
            particleValues,
            sampledFloatCount,
          ),
        ],
      },
      executionTrace: {
        passes: [
          {
            commands: [
              {
                bindings: { vertexBuffers: [] },
                firstInstance: 0,
                firstVertex: 0,
                instanceCount: 406,
                kind: "draw",
                pipelineId,
                resourceBindings: [
                  {
                    binding: 7,
                    group: 3,
                    resource: {
                      bufferId: particleBufferId,
                      kind: "buffer",
                      offset: 0,
                      size: particleValues.byteLength,
                    },
                    shaderBindings: [
                      {
                        addressSpace: "storage, read",
                        name: "syntheticParticles",
                        stage: "vertex",
                        type: "array<SyntheticParticle>",
                      },
                    ],
                  },
                ],
                sequence: 91,
                vertexCount: 6,
              },
            ],
            sequence: 19,
            telemetryFrameIndex: 12,
          },
        ],
      },
      pipelines: [
        additiveParticlePipeline(pipelineId, { buffers: [], shaderId }),
      ],
      shaderModules: [
        {
          analysis: {
            structureLayouts: [
              {
                alignment: 16,
                members: [
                  {
                    name: "positionSize",
                    offset: 0,
                    size: 16,
                    type: "vec4<f32>",
                  },
                  {
                    name: "colorAux",
                    offset: 16,
                    size: 16,
                    type: "vec4<f32>",
                  },
                ],
                name: "SyntheticParticle",
                size: 32,
                supported: true,
              },
            ],
          },
          id: shaderId,
        },
      ],
    },
    issues: [],
    name,
    slug,
    status: "ready",
  };
}

function createThreeParticleCapture({ conflict = false, particles, seed }) {
  const nextId = createParticleFixtureIds(seed);
  const firstPipelineId = nextId();
  const secondPipelineId = nextId();
  const firstMatrixBufferId = nextId();
  const secondMatrixBufferId = nextId();
  const colorBufferId = nextId();
  const staleBufferId = nextId();
  const matrices = encodeParticleMatrices(particles);
  const alternateMatrices = matrices.slice();
  if (conflict) {
    alternateMatrices[12] += 4;
  }
  const colors = Float32Array.from(
    particles.flatMap((particle) => particle.color),
  );
  const vertex = {
    buffers: [
      {
        arrayStride: 8,
        attributes: [{ format: "float32x2", offset: 0, shaderLocation: 0 }],
        stepMode: "vertex",
      },
      {
        arrayStride: 8,
        attributes: [{ format: "float32x2", offset: 0, shaderLocation: 1 }],
        stepMode: "vertex",
      },
      {
        arrayStride: 12,
        attributes: [{ format: "float32x3", offset: 0, shaderLocation: 2 }],
        stepMode: "instance",
      },
    ],
  };
  const particleCommand = (pipelineId, matrixBufferId, sequence) => ({
    baseVertex: 0,
    bindings: {
      vertexBuffers: [
        { bufferId: nextId(), offset: 0, size: 48, slot: 0 },
        { bufferId: nextId(), offset: 0, size: 48, slot: 1 },
        { bufferId: colorBufferId, offset: 0, size: colors.byteLength, slot: 2 },
        { bufferId: staleBufferId, offset: 0, size: 4096, slot: 3 },
      ],
    },
    firstIndex: 0,
    firstInstance: 0,
    indexCount: 6,
    instanceCount: 406,
    kind: "drawIndexed",
    pipelineId,
    resourceBindings: [
      {
        binding: 1,
        group: 1,
        resource: {
          bufferId: matrixBufferId,
          kind: "buffer",
          offset: 0,
          size: matrices.byteLength,
        },
        shaderBindings: [
          {
            addressSpace: "uniform",
            layout: {
              byteSize: matrices.byteLength,
              elementCount: 1,
              kind: "struct",
              members: [
                {
                  name: "value",
                  offset: 0,
                  size: matrices.byteLength,
                  type: "array< mat4x4<f32>, 406 >",
                },
              ],
              stride: matrices.byteLength,
            },
            name: "matrixValues",
            stage: "vertex",
            type: "SyntheticMatrixStruct",
          },
        ],
      },
    ],
    sequence,
  });
  return {
    gpu: {
      bufferProbes: {
        errors: [],
        results: [
          createParticleProbe(firstMatrixBufferId, matrices),
          createParticleProbe(secondMatrixBufferId, alternateMatrices),
          createParticleProbe(colorBufferId, colors),
        ],
      },
      executionTrace: {
        passes: [
          {
            commands: [
              particleCommand(firstPipelineId, firstMatrixBufferId, 180),
              particleCommand(secondPipelineId, secondMatrixBufferId, 181),
            ],
            sequence: 44,
            telemetryFrameIndex: 12,
          },
        ],
      },
      pipelines: [
        additiveParticlePipeline(firstPipelineId, vertex),
        additiveParticlePipeline(secondPipelineId, vertex),
      ],
      shaderModules: [],
    },
    issues: [],
    name: "Three.js native",
    slug: "threejs",
    status: "ready",
  };
}

test("semantic particle parity is stable across randomized GPU object IDs", () => {
  const referenceParticles = createSemanticParticles();
  const candidateParticles = createSemanticParticles((particle, index) => {
    if (index < 256) {
      particle.position[0] += 1;
    } else {
      particle.radius += 0.5;
      particle.color[1] += 2;
    }
  });
  const compareWithSeed = (seed) =>
    comparisonReport.findParticleParity([
      createDirectParticleCapture({
        particles: candidateParticles,
        seed,
      }),
      createThreeParticleCapture({
        particles: referenceParticles,
        seed: seed + 1,
      }),
    ]);

  const first = compareWithSeed(17);
  const second = compareWithSeed(991);
  const entry = first.entries[0];

  assert.equal(first.reference.status, "ready");
  assert.equal(entry.status, "compared");
  assert.deepEqual(entry.populations.fire.position, {
    count: 256,
    max: 1,
    mean: 1,
    p90: 1,
    rms: 1,
  });
  assert.equal(entry.populations.fire.radius.mean, 0);
  assert.equal(entry.populations.fire.color.mean, 0);
  assert.equal(entry.populations.curve.position.mean, 0);
  assert.equal(entry.populations.curve.radius.mean, 0.5);
  assert.equal(entry.populations.curve.color.mean, 2);
  assert.deepEqual(first.entries[0].populations, second.entries[0].populations);
  assert.notDeepEqual(
    first.entries[0].evidence.variants,
    second.entries[0].evidence.variants,
  );
});

test("semantic particle parity reports incomplete buffer evidence", () => {
  const particles = createSemanticParticles();
  const candidate = createDirectParticleCapture({
    particles,
    sampledFloatCount: (406 * 8) / 2,
    seed: 31,
  });
  const parity = comparisonReport.findParticleParity([
    candidate,
    createThreeParticleCapture({ particles, seed: 32 }),
  ]);
  const entry = parity.entries[0];
  const incomplete = entry.issues.find(
    (issue) => issue.code === "incomplete-particle-buffer-probe",
  );

  assert.equal(entry.status, "unavailable");
  assert.equal(incomplete.requiredBytes, 406 * 32);
  assert.equal(incomplete.coveredBytes, (406 * 32) / 2);
  assert.equal(incomplete.bufferId, candidate.gpu.bufferProbes.results[0].bufferId);
});

test("semantic particle parity reports conflicting state variants as ambiguous", () => {
  const particles = createSemanticParticles();
  const reference = createThreeParticleCapture({
    conflict: true,
    particles,
    seed: 55,
  });
  const extracted = comparisonReport.extractParticleState(reference);
  const conflict = extracted.issues.find(
    (issue) => issue.code === "conflicting-particle-state-variants",
  );

  assert.equal(extracted.status, "ambiguous");
  assert.equal(conflict.variantCount, 2);
  assert.equal(conflict.differingParticleCount, 1);
  assert.equal(conflict.firstDifferingParticle, 0);

  const parity = comparisonReport.findParticleParity([
    createDirectParticleCapture({ particles, seed: 54 }),
    reference,
  ]);
  assert.equal(parity.reference.status, "ambiguous");
  assert.equal(parity.entries[0].status, "unavailable");
  assert.ok(
    parity.entries[0].issues.some(
      (issue) => issue.code === "reference-particle-state-unavailable",
    ),
  );
});

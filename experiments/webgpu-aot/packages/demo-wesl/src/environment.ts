/// <reference types="wesl-plugin/suffixes" />

import { mat4 } from "wgpu-matrix";

import prefilterWGSL from "../shaders/environment_prefilter.wesl?static";
import {
  decodeRadianceHdr,
  type HdrImage,
  rgba16FloatBytes,
  validateWeslEnvironmentFaces,
  WESL_ENVIRONMENT_FACE_URLS,
  WESL_ENVIRONMENT_SOURCE_SIZE,
} from "./environment-data.js";
import type { LoadingDisplay } from "./loading.js";
import { WESL_CAMERA } from "./sun.js";

export {
  decodeRadianceHdr,
  float32ToFloat16Bits,
  type HdrImage,
  validateWeslEnvironmentFaces,
  WESL_ENVIRONMENT_FACE_URLS,
  WESL_ENVIRONMENT_SOURCE_SIZE,
} from "./environment-data.js";

export const WESL_ENVIRONMENT_SPECULAR_MIP_COUNT = 9;
export const WESL_ENVIRONMENT_DIFFUSE_SIZE = 32;
export const WESL_ENVIRONMENT_BRDF_LUT_SIZE = 256;

const PREFILTER_PARAMETER_ALIGNMENT = 256;
const PREFILTER_PARAMETER_COUNT = WESL_ENVIRONMENT_SPECULAR_MIP_COUNT + 1;
const PREFILTER_PARAMETER_BYTES =
  PREFILTER_PARAMETER_ALIGNMENT * PREFILTER_PARAMETER_COUNT;

export interface WeslEnvironment {
  readonly brdfLutTexture: GPUTexture;
  readonly brdfLutView: GPUTextureView;
  readonly diffuseTexture: GPUTexture;
  readonly diffuseView: GPUTextureView;
  destroy(): void;
  readonly estimatedBytes: number;
  readonly sampler: GPUSampler;
  readonly sourceTexture: GPUTexture;
  readonly sourceView: GPUTextureView;
  readonly specularMipLevelCount: number;
  readonly specularTexture: GPUTexture;
  readonly specularView: GPUTextureView;
}

interface PrefilterPipelines {
  readonly brdf: GPUComputePipeline;
  readonly brdfLayout: GPUBindGroupLayout;
  readonly cubeLayout: GPUBindGroupLayout;
  readonly diffuse: GPUComputePipeline;
  readonly specular: GPUComputePipeline;
}

export function createWeslEnvironmentSettings(
  width: number,
  height: number,
): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("WESL environment dimensions must be positive and finite");
  }
  const projection = mat4.perspective(
    WESL_CAMERA.fieldOfViewRadians,
    width / height,
    WESL_CAMERA.near,
    WESL_CAMERA.far,
  );
  const view = mat4.lookAt(
    WESL_CAMERA.position,
    WESL_CAMERA.target,
    WESL_CAMERA.up,
  );
  const values = new Float32Array(24);
  values.set(mat4.inverse(mat4.multiply(projection, view)), 0);
  values.set(
    [...WESL_CAMERA.position, WESL_ENVIRONMENT_SPECULAR_MIP_COUNT - 1],
    16,
  );
  values.set([1, 1, 1, 0], 20);
  return values;
}

async function checkedModule(device: GPUDevice): Promise<GPUShaderModule> {
  const label = "WESL linked environment prefilter module";
  const module = device.createShaderModule({ label, code: prefilterWGSL });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((message) => message.type === "error");
  if (errors.length > 0) {
    throw new Error(
      `${label} failed static linking: ${errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
  return module;
}

async function createPrefilterPipelines(
  device: GPUDevice,
): Promise<PrefilterPipelines> {
  const cubeLayout = device.createBindGroupLayout({
    label: "WESL environment cube prefilter layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        sampler: { type: "filtering" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float", viewDimension: "cube" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: "write-only",
          format: "rgba16float",
          viewDimension: "2d-array",
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform", minBindingSize: 16 },
      },
    ],
  });
  const brdfLayout = device.createBindGroupLayout({
    label: "WESL split-sum BRDF integration layout",
    entries: [
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: "write-only",
          format: "rgba16float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const module = await checkedModule(device);
  const cubePipelineLayout = device.createPipelineLayout({
    label: "WESL environment cube prefilter pipeline layout",
    bindGroupLayouts: [cubeLayout],
  });
  const brdfPipelineLayout = device.createPipelineLayout({
    label: "WESL BRDF integration pipeline layout",
    bindGroupLayouts: [brdfLayout],
  });
  const [specular, diffuse, brdf] = await Promise.all([
    device.createComputePipelineAsync({
      label: "WESL GGX environment prefilter",
      layout: cubePipelineLayout,
      compute: { module, entryPoint: "prefilterSpecular" },
    }),
    device.createComputePipelineAsync({
      label: "WESL cosine environment convolution",
      layout: cubePipelineLayout,
      compute: { module, entryPoint: "convolveDiffuse" },
    }),
    device.createComputePipelineAsync({
      label: "WESL split-sum BRDF integration",
      layout: brdfPipelineLayout,
      compute: { module, entryPoint: "integrateBrdf" },
    }),
  ]);
  return { brdf, brdfLayout, cubeLayout, diffuse, specular };
}

function cubeTextureBytes(size: number, mipLevelCount: number): number {
  let texels = 0;
  for (let mip = 0; mip < mipLevelCount; mip += 1) {
    const dimension = Math.max(1, size >> mip);
    texels += dimension * dimension;
  }
  return texels * 6 * 8;
}

function encodePass(
  encoder: GPUCommandEncoder,
  label: string,
  pipeline: GPUComputePipeline,
  group: GPUBindGroup,
  width: number,
  height: number,
  layers: number,
): void {
  const pass = encoder.beginComputePass({ label });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.dispatchWorkgroups(
    Math.ceil(width / 8),
    Math.ceil(height / 8),
    layers,
  );
  pass.end();
}

export async function createWeslEnvironment(
  device: GPUDevice,
  faces: readonly HdrImage[],
): Promise<WeslEnvironment> {
  validateWeslEnvironmentFaces(faces);
  const pipelines = await createPrefilterPipelines(device);
  const trackedTextures: GPUTexture[] = [];
  const trackedBuffers: GPUBuffer[] = [];
  try {
    const sourceTexture = device.createTexture({
      label: "WESL decoded HDR source cube",
      size: [WESL_ENVIRONMENT_SOURCE_SIZE, WESL_ENVIRONMENT_SOURCE_SIZE, 6],
      mipLevelCount: 1,
      format: "rgba16float",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    trackedTextures.push(sourceTexture);
    const specularTexture = device.createTexture({
      label: "WESL GGX prefiltered specular cube",
      size: [WESL_ENVIRONMENT_SOURCE_SIZE, WESL_ENVIRONMENT_SOURCE_SIZE, 6],
      mipLevelCount: WESL_ENVIRONMENT_SPECULAR_MIP_COUNT,
      format: "rgba16float",
      usage:
        GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    trackedTextures.push(specularTexture);
    const diffuseTexture = device.createTexture({
      label: "WESL cosine-convolved diffuse cube",
      size: [WESL_ENVIRONMENT_DIFFUSE_SIZE, WESL_ENVIRONMENT_DIFFUSE_SIZE, 6],
      mipLevelCount: 1,
      format: "rgba16float",
      usage:
        GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    trackedTextures.push(diffuseTexture);
    const brdfLutTexture = device.createTexture({
      label: "WESL split-sum BRDF LUT",
      size: [WESL_ENVIRONMENT_BRDF_LUT_SIZE, WESL_ENVIRONMENT_BRDF_LUT_SIZE],
      mipLevelCount: 1,
      format: "rgba16float",
      usage:
        GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    trackedTextures.push(brdfLutTexture);
    const parameterBuffer = device.createBuffer({
      label: "WESL environment prefilter parameters",
      size: PREFILTER_PARAMETER_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    trackedBuffers.push(parameterBuffer);

    const sampler = device.createSampler({
      label: "WESL HDR environment sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      lodMaxClamp: WESL_ENVIRONMENT_SPECULAR_MIP_COUNT - 1,
    });
    const sourceView = sourceTexture.createView({
      label: "WESL HDR source cube view",
      dimension: "cube",
      baseArrayLayer: 0,
      arrayLayerCount: 6,
      baseMipLevel: 0,
      mipLevelCount: 1,
    });
    const specularView = specularTexture.createView({
      label: "WESL GGX specular cube view",
      dimension: "cube",
      baseArrayLayer: 0,
      arrayLayerCount: 6,
      baseMipLevel: 0,
      mipLevelCount: WESL_ENVIRONMENT_SPECULAR_MIP_COUNT,
    });
    const diffuseView = diffuseTexture.createView({
      label: "WESL diffuse irradiance cube view",
      dimension: "cube",
      baseArrayLayer: 0,
      arrayLayerCount: 6,
      baseMipLevel: 0,
      mipLevelCount: 1,
    });
    const brdfLutView = brdfLutTexture.createView({
      label: "WESL split-sum BRDF LUT view",
      dimension: "2d",
      baseMipLevel: 0,
      mipLevelCount: 1,
    });

    for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
      const face = faces[faceIndex];
      if (face === undefined) continue;
      device.queue.writeTexture(
        { texture: sourceTexture, origin: [0, 0, faceIndex] },
        rgba16FloatBytes(face.pixels),
        {
          bytesPerRow: WESL_ENVIRONMENT_SOURCE_SIZE * 8,
          rowsPerImage: WESL_ENVIRONMENT_SOURCE_SIZE,
        },
        [WESL_ENVIRONMENT_SOURCE_SIZE, WESL_ENVIRONMENT_SOURCE_SIZE, 1],
      );
    }

    const specularGroups: GPUBindGroup[] = [];
    for (
      let mipLevel = 0;
      mipLevel < WESL_ENVIRONMENT_SPECULAR_MIP_COUNT;
      mipLevel += 1
    ) {
      const dimension = Math.max(1, WESL_ENVIRONMENT_SOURCE_SIZE >> mipLevel);
      const roughness =
        mipLevel / (WESL_ENVIRONMENT_SPECULAR_MIP_COUNT - 1);
      const parameterOffset = mipLevel * PREFILTER_PARAMETER_ALIGNMENT;
      device.queue.writeBuffer(
        parameterBuffer,
        parameterOffset,
        new Float32Array([roughness, dimension, 0, 0]),
      );
      const outputView = specularTexture.createView({
        label: `WESL GGX specular mip ${mipLevel} storage view`,
        dimension: "2d-array",
        baseMipLevel: mipLevel,
        mipLevelCount: 1,
        baseArrayLayer: 0,
        arrayLayerCount: 6,
      });
      specularGroups.push(
        device.createBindGroup({
          label: `WESL GGX specular mip ${mipLevel} group`,
          layout: pipelines.cubeLayout,
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: sourceView },
            { binding: 2, resource: outputView },
            {
              binding: 3,
              resource: {
                buffer: parameterBuffer,
                offset: parameterOffset,
                size: 16,
              },
            },
          ],
        }),
      );
    }

    const diffuseParameterOffset =
      WESL_ENVIRONMENT_SPECULAR_MIP_COUNT * PREFILTER_PARAMETER_ALIGNMENT;
    device.queue.writeBuffer(
      parameterBuffer,
      diffuseParameterOffset,
      new Float32Array([0, WESL_ENVIRONMENT_DIFFUSE_SIZE, 0, 0]),
    );
    const diffuseOutputView = diffuseTexture.createView({
      label: "WESL diffuse irradiance storage view",
      dimension: "2d-array",
      baseMipLevel: 0,
      mipLevelCount: 1,
      baseArrayLayer: 0,
      arrayLayerCount: 6,
    });
    const diffuseGroup = device.createBindGroup({
      label: "WESL cosine diffuse environment group",
      layout: pipelines.cubeLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: sourceView },
        { binding: 2, resource: diffuseOutputView },
        {
          binding: 3,
          resource: {
            buffer: parameterBuffer,
            offset: diffuseParameterOffset,
            size: 16,
          },
        },
      ],
    });
    const brdfGroup = device.createBindGroup({
      label: "WESL split-sum BRDF integration group",
      layout: pipelines.brdfLayout,
      entries: [{ binding: 4, resource: brdfLutView }],
    });

    const encoder = device.createCommandEncoder({
      label: "WESL startup environment prefilter encoder",
    });
    for (
      let mipLevel = 0;
      mipLevel < WESL_ENVIRONMENT_SPECULAR_MIP_COUNT;
      mipLevel += 1
    ) {
      const dimension = Math.max(1, WESL_ENVIRONMENT_SOURCE_SIZE >> mipLevel);
      const group = specularGroups[mipLevel];
      if (group === undefined) continue;
      encodePass(
        encoder,
        `WESL GGX environment mip ${mipLevel}`,
        pipelines.specular,
        group,
        dimension,
        dimension,
        6,
      );
    }
    encodePass(
      encoder,
      "WESL cosine diffuse environment",
      pipelines.diffuse,
      diffuseGroup,
      WESL_ENVIRONMENT_DIFFUSE_SIZE,
      WESL_ENVIRONMENT_DIFFUSE_SIZE,
      6,
    );
    encodePass(
      encoder,
      "WESL split-sum BRDF LUT",
      pipelines.brdf,
      brdfGroup,
      WESL_ENVIRONMENT_BRDF_LUT_SIZE,
      WESL_ENVIRONMENT_BRDF_LUT_SIZE,
      1,
    );
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    trackedBuffers.pop()?.destroy();

    let destroyed = false;
    return {
      brdfLutTexture,
      brdfLutView,
      diffuseTexture,
      diffuseView,
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        for (const buffer of trackedBuffers) buffer.destroy();
        for (const texture of trackedTextures) texture.destroy();
      },
      estimatedBytes:
        cubeTextureBytes(WESL_ENVIRONMENT_SOURCE_SIZE, 1) +
        cubeTextureBytes(
          WESL_ENVIRONMENT_SOURCE_SIZE,
          WESL_ENVIRONMENT_SPECULAR_MIP_COUNT,
        ) +
        cubeTextureBytes(WESL_ENVIRONMENT_DIFFUSE_SIZE, 1) +
        WESL_ENVIRONMENT_BRDF_LUT_SIZE ** 2 * 8,
      sampler,
      sourceTexture,
      sourceView,
      specularMipLevelCount: WESL_ENVIRONMENT_SPECULAR_MIP_COUNT,
      specularTexture,
      specularView,
    };
  } catch (error) {
    for (const buffer of trackedBuffers) buffer.destroy();
    for (const texture of trackedTextures) texture.destroy();
    throw error;
  }
}

async function checkedFetch(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load WESL environment ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

export async function loadWeslEnvironment(
  device: GPUDevice,
  display?: Pick<LoadingDisplay, "update">,
): Promise<WeslEnvironment> {
  display?.update(4, 8, "Decoding six renderer-owned HDR environment faces");
  const faces = await Promise.all(
    WESL_ENVIRONMENT_FACE_URLS.map(async (url) =>
      decodeRadianceHdr(await checkedFetch(url)),
    ),
  );
  display?.update(5, 8, "Prefiltering linked diffuse, specular, and BRDF resources");
  return createWeslEnvironment(device, faces);
}

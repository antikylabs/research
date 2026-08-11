import type { TgpuBindGroup, TgpuRoot } from "typegpu";

import type { LoadingDisplay } from "./loading.js";
import { materialLayout } from "./shaders/forward.js";

interface Accessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
}

interface BufferView {
  readonly byteLength: number;
  readonly byteOffset?: number;
  readonly target?: number;
}

interface TextureInfo {
  readonly index: number;
}

interface MaterialDefinition {
  readonly alphaCutoff?: number;
  readonly alphaMode?: string;
  readonly doubleSided?: boolean;
  readonly normalTexture?: TextureInfo;
  readonly pbrMetallicRoughness?: {
    readonly baseColorFactor?: readonly number[];
    readonly baseColorTexture?: TextureInfo;
    readonly metallicFactor?: number;
    readonly metallicRoughnessTexture?: TextureInfo;
    readonly roughnessFactor?: number;
  };
}

interface PrimitiveDefinition {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices: number;
  readonly material: number;
  readonly mode?: number;
}

interface Manifest {
  readonly accessors: readonly Accessor[];
  readonly buffers: readonly { readonly uri: string }[];
  readonly bufferViews: readonly BufferView[];
  readonly images: readonly { readonly uri: string }[];
  readonly materials: readonly MaterialDefinition[];
  readonly meshes: readonly { readonly primitives: readonly PrimitiveDefinition[] }[];
  readonly textures: readonly { readonly source: number }[];
}

interface VertexSource {
  readonly buffer: GPUBuffer;
}

export interface TypeGpuMaterial {
  readonly bindGroup: TgpuBindGroup;
  readonly doubleSided: boolean;
}

export interface TypeGpuPrimitive {
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly indexOffset: number;
  readonly material: TypeGpuMaterial;
  readonly position: VertexSource;
  readonly normal: VertexSource;
  readonly texcoord: VertexSource;
}

export interface TypeGpuScene {
  readonly bytes: number;
  readonly primitives: readonly TypeGpuPrimitive[];
  readonly textures: number;
}

const ARRAY_BUFFER = 34_962;
const ELEMENT_ARRAY_BUFFER = 34_963;
const UNSIGNED_SHORT = 5_123;
const TRIANGLES = 4;
const TOTAL_STEPS = 73;

function at<T>(array: readonly T[], index: number, label: string): T {
  const value = array[index];
  if (value === undefined) throw new Error(`Invalid ${label} index ${index}`);
  return value;
}

async function checkedFetch(url: URL | string, label: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${label}: ${response.status}`);
  return response;
}

function gpuBuffer(
  device: GPUDevice,
  binary: ArrayBuffer,
  view: BufferView,
  index: number,
): GPUBuffer | null {
  const usage =
    view.target === ARRAY_BUFFER
      ? GPUBufferUsage.VERTEX
      : view.target === ELEMENT_ARRAY_BUFFER
        ? GPUBufferUsage.INDEX
        : 0;
  if (usage === 0) return null;
  const buffer = device.createBuffer({
    label: `TypeGPU glTF buffer view ${index}`,
    size: Math.ceil(view.byteLength / 4) * 4,
    usage,
    mappedAtCreation: true,
  });
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(binary, view.byteOffset ?? 0, view.byteLength),
  );
  buffer.unmap();
  return buffer;
}

function solidTexture(
  device: GPUDevice,
  label: string,
  color: readonly [number, number, number, number],
): GPUTexture {
  const texture = device.createTexture({
    label,
    size: [1, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });
  device.queue.writeTexture(
    { texture },
    new Uint8Array(color),
    { bytesPerRow: 4 },
    [1, 1],
  );
  return texture;
}

function required(attributes: Readonly<Record<string, number>>, semantic: string): number {
  const value = attributes[semantic];
  if (value === undefined) throw new Error(`TypeGPU primitive is missing ${semantic}`);
  return value;
}

function vertexSource(
  manifest: Manifest,
  buffers: readonly (GPUBuffer | null)[],
  accessorIndex: number,
  label: string,
): VertexSource {
  const accessor = at(manifest.accessors, accessorIndex, `${label} accessor`);
  if ((accessor.byteOffset ?? 0) !== 0) {
    throw new Error(`TypeGPU expects a dedicated ${label} vertex buffer view`);
  }
  const buffer = at(buffers, accessor.bufferView, `${label} buffer`);
  if (buffer === null) throw new Error(`${label} is not backed by a vertex buffer`);
  return { buffer };
}

async function loadTextures(
  device: GPUDevice,
  manifest: Manifest,
  baseUrl: URL,
  display: LoadingDisplay,
): Promise<{ textures: readonly GPUTexture[]; bytes: number }> {
  const srgb = new Set<number>();
  for (const material of manifest.materials) {
    const index = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (index !== undefined) srgb.add(index);
  }
  let done = 3;
  let bytes = 0;
  const textures = await Promise.all(
    manifest.textures.map(async (definition, index) => {
      const image = at(manifest.images, definition.source, "texture image");
      const bitmap = await createImageBitmap(
        await (await checkedFetch(new URL(image.uri, baseUrl), image.uri)).blob(),
        { colorSpaceConversion: "none", premultiplyAlpha: "none" },
      );
      const texture = device.createTexture({
        label: `TypeGPU scene texture ${index}`,
        size: [bitmap.width, bitmap.height],
        format: srgb.has(index) ? "rgba8unorm-srgb" : "rgba8unorm",
        usage:
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING,
      });
      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture },
        [bitmap.width, bitmap.height],
      );
      bytes += bitmap.width * bitmap.height * 4;
      bitmap.close();
      done += 1;
      display.update({
        done,
        message: `Creating typed texture views ${done - 3}/${manifest.textures.length}`,
        total: TOTAL_STEPS,
      });
      return texture;
    }),
  );
  return { textures, bytes };
}

export async function loadTypeGpuScene(
  root: TgpuRoot,
  display: LoadingDisplay,
): Promise<TypeGpuScene> {
  const device = root.device;
  display.update({ done: 1, message: "Loading the pinned glTF manifest", total: TOTAL_STEPS });
  const response = await checkedFetch("/sponza/Sponza.gltf", "Sponza manifest");
  const manifest = (await response.json()) as Manifest;
  const baseUrl = new URL(".", response.url);
  const primitives = at(manifest.meshes, 0, "mesh").primitives;
  if (primitives.length !== 103) throw new Error(`Expected 103 primitives, loaded ${primitives.length}`);

  display.update({ done: 2, message: "Streaming packed Sponza geometry", total: TOTAL_STEPS });
  const binaryDefinition = at(manifest.buffers, 0, "binary buffer");
  const binary = await (
    await checkedFetch(new URL(binaryDefinition.uri, baseUrl), "Sponza binary")
  ).arrayBuffer();
  display.update({ done: 3, message: "Uploading independent vertex streams", total: TOTAL_STEPS });
  const buffers = manifest.bufferViews.map((view, index) =>
    gpuBuffer(device, binary, view, index),
  );
  const loadedTextures = await loadTextures(device, manifest, baseUrl, display);
  const white = solidTexture(device, "TypeGPU default white", [255, 255, 255, 255]);
  const flatNormal = solidTexture(device, "TypeGPU default normal", [128, 128, 255, 255]);
  const sampler = device.createSampler({
    label: "TypeGPU material sampler",
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 8,
  });
  const textureView = (info: TextureInfo | undefined, fallback: GPUTexture): GPUTextureView =>
    (info === undefined ? fallback : at(loadedTextures.textures, info.index, "texture")).createView();

  const materials = manifest.materials.map((definition, index) => {
    const pbr = definition.pbrMetallicRoughness ?? {};
    const factor = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const values = new Float32Array([
      factor[0] ?? 1,
      factor[1] ?? 1,
      factor[2] ?? 1,
      factor[3] ?? 1,
      definition.alphaMode === "MASK" ? definition.alphaCutoff ?? 0.5 : 0,
      pbr.metallicFactor ?? 1,
      pbr.roughnessFactor ?? 1,
      0,
    ]);
    const uniform = device.createBuffer({
      label: `TypeGPU material ${index} uniform`,
      size: values.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(uniform, 0, values);
    return {
      doubleSided: definition.doubleSided === true,
      bindGroup: root.createBindGroup(materialLayout, {
        sampler,
        baseColor: textureView(pbr.baseColorTexture, white),
        normal: textureView(definition.normalTexture, flatNormal),
        metallicRoughness: textureView(pbr.metallicRoughnessTexture, white),
        material: uniform,
      }),
    } satisfies TypeGpuMaterial;
  });

  const scenePrimitives = primitives.map((primitive) => {
    if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) throw new Error("TypeGPU only renders triangles");
    const indices = at(manifest.accessors, primitive.indices, "index accessor");
    if (indices.componentType !== UNSIGNED_SHORT) throw new Error("TypeGPU expected uint16 indices");
    const indexBuffer = at(buffers, indices.bufferView, "index buffer");
    if (indexBuffer === null) throw new Error("Index accessor has no GPU index buffer");
    return {
      indexBuffer,
      indexCount: indices.count,
      indexOffset: indices.byteOffset ?? 0,
      material: at(materials, primitive.material, "material"),
      position: vertexSource(manifest, buffers, required(primitive.attributes, "POSITION"), "POSITION"),
      normal: vertexSource(manifest, buffers, required(primitive.attributes, "NORMAL"), "NORMAL"),
      texcoord: vertexSource(manifest, buffers, required(primitive.attributes, "TEXCOORD_0"), "TEXCOORD_0"),
    } satisfies TypeGpuPrimitive;
  });
  display.update({ done: TOTAL_STEPS, message: "Creating 25 typed material bind groups", total: TOTAL_STEPS });
  return {
    bytes:
      loadedTextures.bytes +
      manifest.bufferViews.reduce((sum, view) => sum + (view.target === undefined ? 0 : view.byteLength), 0),
    primitives: scenePrimitives,
    textures: loadedTextures.textures.length + 2,
  };
}

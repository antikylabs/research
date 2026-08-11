import {
  createArtifactBindGroup,
  type CompiledArtifact,
} from "./artifact.js";
import type { LoadingDisplay } from "./loading.js";

interface BufferView {
  readonly byteLength: number;
  readonly byteOffset?: number;
  readonly target?: number;
}

interface Accessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
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

interface VertexBinding {
  readonly buffer: GPUBuffer;
  readonly offset: number;
}

export interface AntikyMaterial {
  readonly bindGroup: GPUBindGroup;
  readonly doubleSided: boolean;
}

export interface AntikyPrimitive {
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly indexOffset: number;
  readonly material: AntikyMaterial;
  readonly position: VertexBinding;
  readonly normal: VertexBinding;
  readonly texcoord: VertexBinding;
}

export interface AntikyScene {
  readonly bytes: number;
  readonly primitives: readonly AntikyPrimitive[];
  readonly textures: number;
}

const ARRAY_BUFFER = 34_962;
const ELEMENT_ARRAY_BUFFER = 34_963;
const UNSIGNED_SHORT = 5_123;
const TRIANGLES = 4;
const TOTAL_STEPS = 73;

function at<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Invalid ${label} index ${index}`);
  return value;
}

async function checkedFetch(url: URL | string, label: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${label}: ${response.status} ${response.statusText}`);
  }
  return response;
}

function createGpuBuffer(
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
    label: `Antiky static glTF buffer view ${index}`,
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

function vertexBinding(
  manifest: Manifest,
  buffers: readonly (GPUBuffer | null)[],
  accessorIndex: number | undefined,
  semantic: string,
): VertexBinding {
  if (accessorIndex === undefined) {
    throw new Error(`Antiky primitive is missing ${semantic}`);
  }
  const accessor = at(manifest.accessors, accessorIndex, `${semantic} accessor`);
  const buffer = at(buffers, accessor.bufferView, `${semantic} buffer view`);
  if (buffer === null) throw new Error(`${semantic} is not backed by a vertex buffer`);
  return { buffer, offset: accessor.byteOffset ?? 0 };
}

function srgbTextureIndices(manifest: Manifest): ReadonlySet<number> {
  const indices = new Set<number>();
  for (const material of manifest.materials) {
    const index = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (index !== undefined) indices.add(index);
  }
  return indices;
}

async function loadTextures(
  device: GPUDevice,
  manifest: Manifest,
  baseUrl: URL,
  display: LoadingDisplay,
): Promise<{ readonly values: readonly GPUTexture[]; readonly bytes: number }> {
  const srgb = srgbTextureIndices(manifest);
  let completed = 3;
  let bytes = 0;
  const values = await Promise.all(
    manifest.textures.map(async (definition, index) => {
      const image = at(manifest.images, definition.source, "texture image");
      const response = await checkedFetch(new URL(image.uri, baseUrl), image.uri);
      const bitmap = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
      const texture = device.createTexture({
        label: `Antiky immutable material texture ${index}`,
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
      completed += 1;
      display.update({
        completed,
        label: `Freezing texture bindings ${completed - 3}/${manifest.textures.length}`,
        total: TOTAL_STEPS,
      });
      return texture;
    }),
  );
  return { values, bytes };
}

export async function loadAntikyScene(
  device: GPUDevice,
  forward: CompiledArtifact,
  display: LoadingDisplay,
): Promise<AntikyScene> {
  display.update({ completed: 1, label: "Fetching the pinned scene manifest", total: TOTAL_STEPS });
  const response = await checkedFetch("/sponza/Sponza.gltf", "Sponza manifest");
  const manifest = (await response.json()) as Manifest;
  const baseUrl = new URL(".", response.url);
  const primitives = at(manifest.meshes, 0, "mesh").primitives;
  if (manifest.meshes.length !== 1 || primitives.length !== 103) {
    throw new Error(`Antiky requires the pinned 103-primitive scene; loaded ${primitives.length}`);
  }

  display.update({ completed: 2, label: "Streaming the packed geometry buffer", total: TOTAL_STEPS });
  const binaryDefinition = at(manifest.buffers, 0, "binary buffer");
  const binary = await (
    await checkedFetch(new URL(binaryDefinition.uri, baseUrl), "Sponza geometry")
  ).arrayBuffer();
  display.update({ completed: 3, label: "Allocating independent GPU vertex streams", total: TOTAL_STEPS });
  const buffers = manifest.bufferViews.map((view, index) =>
    createGpuBuffer(device, binary, view, index),
  );
  const loadedTextures = await loadTextures(device, manifest, baseUrl, display);
  const white = solidTexture(device, "Antiky default white", [255, 255, 255, 255]);
  const flatNormal = solidTexture(device, "Antiky default normal", [128, 128, 255, 255]);
  const sampler = device.createSampler({
    label: "Antiky static anisotropic sampler",
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 8,
  });
  const textureView = (info: TextureInfo | undefined, fallback: GPUTexture): GPUTextureView =>
    (info === undefined ? fallback : at(loadedTextures.values, info.index, "material texture"))
      .createView();

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
      label: `Antiky material ${index} uniform`,
      size: values.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(uniform, 0, values);
    return {
      doubleSided: definition.doubleSided === true,
      bindGroup: createArtifactBindGroup(
        device,
        forward,
        1,
        `Antiky material ${index} static bind group`,
        {
          sampler,
          baseColor: textureView(pbr.baseColorTexture, white),
          normal: textureView(definition.normalTexture, flatNormal),
          metallicRoughness: textureView(pbr.metallicRoughnessTexture, white),
          material: { buffer: uniform },
        },
      ),
    } satisfies AntikyMaterial;
  });

  const scenePrimitives = primitives.map((primitive) => {
    if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
      throw new Error("Antiky only renders triangle-list primitives");
    }
    const indices = at(manifest.accessors, primitive.indices, "index accessor");
    if (indices.componentType !== UNSIGNED_SHORT) {
      throw new Error("Antiky's pinned artifact requires uint16 indices");
    }
    const indexBuffer = at(buffers, indices.bufferView, "index buffer");
    if (indexBuffer === null) throw new Error("Index accessor has no GPU index buffer");
    return {
      indexBuffer,
      indexCount: indices.count,
      indexOffset: indices.byteOffset ?? 0,
      material: at(materials, primitive.material, "material"),
      position: vertexBinding(manifest, buffers, primitive.attributes.POSITION, "POSITION"),
      normal: vertexBinding(manifest, buffers, primitive.attributes.NORMAL, "NORMAL"),
      texcoord: vertexBinding(manifest, buffers, primitive.attributes.TEXCOORD_0, "TEXCOORD_0"),
    } satisfies AntikyPrimitive;
  });

  display.update({ completed: TOTAL_STEPS, label: "Sealing 103 draws into static layouts", total: TOTAL_STEPS });
  return {
    bytes:
      loadedTextures.bytes +
      manifest.bufferViews.reduce(
        (sum, view) => sum + (view.target === undefined ? 0 : view.byteLength),
        0,
      ),
    primitives: scenePrimitives,
    textures: loadedTextures.values.length + 2,
  };
}

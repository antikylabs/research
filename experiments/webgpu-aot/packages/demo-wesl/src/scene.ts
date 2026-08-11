import type { LoadingDisplay } from "./loading.js";
import {
  createWeslMipmapPlan,
  encodeWeslMipmaps,
  weslMipmappedTextureBytes,
} from "./mipmaps.js";
import type { WeslPipelines } from "./pipelines.js";

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

export interface WeslMaterial {
  readonly depthBindGroup: GPUBindGroup;
  readonly doubleSided: boolean;
  readonly forwardBindGroup: GPUBindGroup;
}

export interface WeslPrimitive {
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly indexOffset: number;
  readonly material: WeslMaterial;
  readonly normal: VertexBinding;
  readonly position: VertexBinding;
  readonly tangent: VertexBinding;
  readonly texcoord: VertexBinding;
}

export interface WeslScene {
  readonly bytes: number;
  readonly primitives: readonly WeslPrimitive[];
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
    label: `WESL-owned glTF buffer view ${index}`,
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
  if (accessorIndex === undefined) throw new Error(`WESL primitive is missing ${semantic}`);
  const accessor = at(manifest.accessors, accessorIndex, `${semantic} accessor`);
  const buffer = at(buffers, accessor.bufferView, `${semantic} buffer view`);
  if (buffer === null) throw new Error(`${semantic} is not backed by a vertex buffer`);
  return { buffer, offset: accessor.byteOffset ?? 0 };
}

function srgbTextures(manifest: Manifest): ReadonlySet<number> {
  const result = new Set<number>();
  for (const material of manifest.materials) {
    const index = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (index !== undefined) result.add(index);
  }
  return result;
}

async function loadTextures(
  device: GPUDevice,
  manifest: Manifest,
  baseUrl: URL,
  display: LoadingDisplay,
  pipelines: Pick<
    WeslPipelines,
    "mipmapLayout" | "mipmapLinear" | "mipmapSrgb"
  >,
): Promise<{ readonly bytes: number; readonly values: readonly GPUTexture[] }> {
  const srgb = srgbTextures(manifest);
  const mipmapSampler = device.createSampler({
    label: "WESL material mipmap sampler",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });
  const encoder = device.createCommandEncoder({
    label: "WESL material mipmap encoder",
  });
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
      const format = srgb.has(index) ? "rgba8unorm-srgb" : "rgba8unorm";
      const mipmapPlan = createWeslMipmapPlan(bitmap.width, bitmap.height);
      const texture = device.createTexture({
        label: `WESL material texture ${index}`,
        size: [bitmap.width, bitmap.height],
        format,
        mipLevelCount: mipmapPlan.length + 1,
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
      encodeWeslMipmaps(
        device,
        encoder,
        texture,
        mipmapPlan,
        mipmapSampler,
        pipelines.mipmapLayout,
        format === "rgba8unorm-srgb"
          ? pipelines.mipmapSrgb
          : pipelines.mipmapLinear,
      );
      bytes += weslMipmappedTextureBytes(bitmap.width, bitmap.height);
      bitmap.close();
      completed += 1;
      display.update(
        completed,
        TOTAL_STEPS,
        `Linking texture resources ${completed - 3}/${manifest.textures.length}`,
      );
      return texture;
    }),
  );
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  return { bytes, values };
}

export async function loadWeslScene(
  device: GPUDevice,
  layouts: Pick<
    WeslPipelines,
    | "depthMaterialLayout"
    | "forwardMaterialLayout"
    | "mipmapLayout"
    | "mipmapLinear"
    | "mipmapSrgb"
  >,
  display: LoadingDisplay,
): Promise<WeslScene> {
  display.update(1, TOTAL_STEPS, "Fetching the pinned Sponza manifest");
  const response = await checkedFetch("/sponza/Sponza.gltf", "Sponza manifest");
  const manifest = (await response.json()) as Manifest;
  const baseUrl = new URL(".", response.url);
  const primitives = at(manifest.meshes, 0, "mesh").primitives;
  if (manifest.meshes.length !== 1 || primitives.length !== 103) {
    throw new Error(`WESL requires 103 pinned primitives; loaded ${primitives.length}`);
  }
  display.update(2, TOTAL_STEPS, "Streaming packed geometry for the depth and forward graphs");
  const binaryDefinition = at(manifest.buffers, 0, "binary buffer");
  const binary = await (
    await checkedFetch(new URL(binaryDefinition.uri, baseUrl), "Sponza geometry")
  ).arrayBuffer();
  display.update(3, TOTAL_STEPS, "Allocating renderer-owned vertex and index buffers");
  const buffers = manifest.bufferViews.map((view, index) =>
    gpuBuffer(device, binary, view, index),
  );
  const loadedTextures = await loadTextures(
    device,
    manifest,
    baseUrl,
    display,
    layouts,
  );
  const white = solidTexture(device, "WESL default white", [255, 255, 255, 255]);
  const normal = solidTexture(device, "WESL default normal", [128, 128, 255, 255]);
  const sampler = device.createSampler({
    label: "WESL renderer material sampler",
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 8,
  });
  const fallbackTangent = device.createBuffer({
    label: "WESL fallback tangent",
    size: 16,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(fallbackTangent.getMappedRange()).set([1, 0, 0, 1]);
  fallbackTangent.unmap();
  const fallbackTangentBinding = { buffer: fallbackTangent, offset: 0 };
  const view = (info: TextureInfo | undefined, fallback: GPUTexture): GPUTextureView =>
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
      label: `WESL material ${index} uniform`,
      size: values.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(uniform, 0, values);
    const baseColor = view(pbr.baseColorTexture, white);
    return {
      doubleSided: definition.doubleSided === true,
      depthBindGroup: device.createBindGroup({
        label: `WESL depth material ${index}`,
        layout: layouts.depthMaterialLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: baseColor },
          { binding: 2, resource: { buffer: uniform } },
        ],
      }),
      forwardBindGroup: device.createBindGroup({
        label: `WESL forward material ${index}`,
        layout: layouts.forwardMaterialLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: baseColor },
          { binding: 2, resource: view(definition.normalTexture, normal) },
          { binding: 3, resource: view(pbr.metallicRoughnessTexture, white) },
          { binding: 4, resource: { buffer: uniform } },
        ],
      }),
    } satisfies WeslMaterial;
  });

  const scenePrimitives = primitives.map((primitive) => {
    if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
      throw new Error("WESL only renders triangle-list primitives");
    }
    const indices = at(manifest.accessors, primitive.indices, "index accessor");
    if (indices.componentType !== UNSIGNED_SHORT) {
      throw new Error("WESL's pinned graph requires uint16 indices");
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
      tangent:
        primitive.attributes.TANGENT === undefined
          ? fallbackTangentBinding
          : vertexBinding(manifest, buffers, primitive.attributes.TANGENT, "TANGENT"),
      texcoord: vertexBinding(manifest, buffers, primitive.attributes.TEXCOORD_0, "TEXCOORD_0"),
    } satisfies WeslPrimitive;
  });
  display.update(TOTAL_STEPS, TOTAL_STEPS, "Binding two native WESL material graphs");
  return {
    bytes:
      loadedTextures.bytes +
      16 +
      manifest.bufferViews.reduce(
        (sum, definition) => sum + (definition.target === undefined ? 0 : definition.byteLength),
        0,
      ),
    primitives: scenePrimitives,
    textures: loadedTextures.values.length + 2,
  };
}

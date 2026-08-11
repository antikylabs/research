import type { LoadingProgress } from "./loading.js";

interface GltfBufferView {
  readonly buffer: number;
  readonly byteLength: number;
  readonly byteOffset?: number;
  readonly byteStride?: number;
  readonly target?: number;
}

interface GltfAccessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
}

interface GltfTextureInfo {
  readonly index: number;
}

interface GltfMaterial {
  readonly alphaCutoff?: number;
  readonly alphaMode?: string;
  readonly doubleSided?: boolean;
  readonly normalTexture?: GltfTextureInfo;
  readonly pbrMetallicRoughness?: {
    readonly baseColorFactor?: readonly number[];
    readonly baseColorTexture?: GltfTextureInfo;
    readonly metallicFactor?: number;
    readonly metallicRoughnessTexture?: GltfTextureInfo;
    readonly roughnessFactor?: number;
  };
}

interface GltfPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices: number;
  readonly material: number;
  readonly mode?: number;
}

interface GltfManifest {
  readonly accessors: readonly GltfAccessor[];
  readonly buffers: readonly { readonly uri: string; readonly byteLength: number }[];
  readonly bufferViews: readonly GltfBufferView[];
  readonly images: readonly { readonly uri: string }[];
  readonly materials: readonly GltfMaterial[];
  readonly meshes: readonly { readonly primitives: readonly GltfPrimitive[] }[];
  readonly textures: readonly { readonly source: number }[];
}

interface VertexBinding {
  readonly buffer: GPUBuffer;
  readonly offset: number;
}

export interface BroMetalMaterial {
  readonly bindGroup: GPUBindGroup;
  readonly doubleSided: boolean;
}

export interface BroMetalPrimitive {
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly indexOffset: number;
  readonly material: BroMetalMaterial;
  readonly positions: VertexBinding;
  readonly normals: VertexBinding;
  readonly tangents: VertexBinding;
  readonly texcoords: VertexBinding;
}

export interface BroMetalScene {
  readonly estimatedBytes: number;
  readonly primitives: readonly BroMetalPrimitive[];
  readonly textureCount: number;
}

const ARRAY_BUFFER = 34_962;
const ELEMENT_ARRAY_BUFFER = 34_963;
const UNSIGNED_SHORT = 5_123;
const TRIANGLES = 4;
const LOAD_STEPS = 73;

function requireAt<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Invalid ${label} index ${index}`);
  return value;
}

async function fetchChecked(url: URL | string, label: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${label}: ${response.status} ${response.statusText}`);
  }
  return response;
}

function createSolidTexture(
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

function createGpuBuffer(
  device: GPUDevice,
  binary: ArrayBuffer,
  view: GltfBufferView,
  index: number,
): GPUBuffer | null {
  const usage =
    view.target === ELEMENT_ARRAY_BUFFER
      ? GPUBufferUsage.INDEX
      : view.target === ARRAY_BUFFER
        ? GPUBufferUsage.VERTEX
        : 0;
  if (usage === 0) return null;

  const size = Math.ceil(view.byteLength / 4) * 4;
  const buffer = device.createBuffer({
    label: `BroMetal glTF buffer view ${index}`,
    mappedAtCreation: true,
    size,
    usage,
  });
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(binary, view.byteOffset ?? 0, view.byteLength),
  );
  buffer.unmap();
  return buffer;
}

function vertexBinding(
  manifest: GltfManifest,
  buffers: readonly (GPUBuffer | null)[],
  accessorIndex: number | undefined,
  label: string,
): VertexBinding {
  if (accessorIndex === undefined) {
    throw new Error(`Sponza primitive is missing ${label}`);
  }
  const accessor = requireAt(manifest.accessors, accessorIndex, `${label} accessor`);
  const buffer = requireAt(buffers, accessor.bufferView, `${label} buffer view`);
  if (buffer === null) throw new Error(`${label} accessor is not a vertex buffer`);
  return { buffer, offset: accessor.byteOffset ?? 0 };
}

export function requiredAttributeAccessors(
  attributes: Readonly<Record<string, number>>,
): {
  readonly positions: number;
  readonly normals: number;
  readonly tangents: number | null;
  readonly texcoords: number;
} {
  const requireAttribute = (semantic: string): number => {
    const accessor = attributes[semantic];
    if (accessor === undefined) {
      throw new Error(`Sponza primitive is missing ${semantic}`);
    }
    return accessor;
  };
  return {
    positions: requireAttribute("POSITION"),
    normals: requireAttribute("NORMAL"),
    tangents: attributes.TANGENT ?? null,
    texcoords: requireAttribute("TEXCOORD_0"),
  };
}

export function createBroMetalFallbackTangents(
  vertexCount: number,
): Float32Array<ArrayBuffer> {
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 1) {
    throw new RangeError("BroMetal fallback tangent count must be positive");
  }
  const values = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    values.set([1, 0, 0, 1], index * 4);
  }
  return values;
}

function textureSemantics(manifest: GltfManifest): ReadonlySet<number> {
  const srgb = new Set<number>();
  for (const material of manifest.materials) {
    const index = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (index !== undefined) srgb.add(index);
  }
  return srgb;
}

async function loadTextures(
  device: GPUDevice,
  manifest: GltfManifest,
  baseUrl: URL,
  onProgress: (progress: LoadingProgress) => void,
): Promise<{ readonly textures: readonly GPUTexture[]; readonly bytes: number }> {
  const srgbTextures = textureSemantics(manifest);
  let completed = 3;
  let bytes = 0;
  const textures = await Promise.all(
    manifest.textures.map(async (textureInfo, textureIndex) => {
      const image = requireAt(manifest.images, textureInfo.source, "image");
      const response = await fetchChecked(new URL(image.uri, baseUrl), `texture ${image.uri}`);
      const bitmap = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
      const format: GPUTextureFormat = srgbTextures.has(textureIndex)
        ? "rgba8unorm-srgb"
        : "rgba8unorm";
      const texture = device.createTexture({
        label: `BroMetal material texture ${textureIndex}`,
        size: [bitmap.width, bitmap.height],
        format,
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
      onProgress({
        completed,
        label: `Uploading material textures ${completed - 3}/${manifest.textures.length}`,
        total: LOAD_STEPS,
      });
      return texture;
    }),
  );
  return { textures, bytes };
}

export async function loadBroMetalScene(
  device: GPUDevice,
  materialLayout: GPUBindGroupLayout,
  onProgress: (progress: LoadingProgress) => void,
): Promise<BroMetalScene> {
  onProgress({ completed: 1, label: "Fetching the pinned Sponza manifest", total: LOAD_STEPS });
  const manifestResponse = await fetchChecked("/sponza/Sponza.gltf", "Sponza manifest");
  const manifest = (await manifestResponse.json()) as GltfManifest;
  const baseUrl = new URL(".", manifestResponse.url);

  if (manifest.meshes.length !== 1 || manifest.meshes[0].primitives.length !== 103) {
    throw new Error("BroMetal requires the pinned 103-primitive Sponza asset");
  }
  onProgress({ completed: 2, label: "Streaming 9.1 MiB of geometry", total: LOAD_STEPS });
  const bufferDefinition = requireAt(manifest.buffers, 0, "binary buffer");
  const binary = await (
    await fetchChecked(new URL(bufferDefinition.uri, baseUrl), "Sponza geometry")
  ).arrayBuffer();
  onProgress({ completed: 3, label: "Creating native vertex and index buffers", total: LOAD_STEPS });
  const buffers = manifest.bufferViews.map((view, index) =>
    createGpuBuffer(device, binary, view, index),
  );

  const { textures, bytes: textureBytes } = await loadTextures(
    device,
    manifest,
    baseUrl,
    onProgress,
  );
  const whiteTexture = createSolidTexture(device, "BroMetal default white", [255, 255, 255, 255]);
  const normalTexture = createSolidTexture(device, "BroMetal default normal", [128, 128, 255, 255]);
  const sampler = device.createSampler({
    label: "BroMetal anisotropic material sampler",
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 8,
  });

  const materials = manifest.materials.map((definition, materialIndex) => {
    const pbr = definition.pbrMetallicRoughness ?? {};
    const baseColorFactor = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const values = new Float32Array([
      baseColorFactor[0] ?? 1,
      baseColorFactor[1] ?? 1,
      baseColorFactor[2] ?? 1,
      baseColorFactor[3] ?? 1,
      definition.alphaMode === "MASK" ? definition.alphaCutoff ?? 0.5 : 0,
      pbr.metallicFactor ?? 1,
      pbr.roughnessFactor ?? 1,
      0,
    ]);
    const uniform = device.createBuffer({
      label: `BroMetal material ${materialIndex} uniform`,
      size: values.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    device.queue.writeBuffer(uniform, 0, values);

    const textureView = (info: GltfTextureInfo | undefined, fallback: GPUTexture): GPUTextureView =>
      (info === undefined ? fallback : requireAt(textures, info.index, "material texture")).createView();
    return {
      doubleSided: definition.doubleSided === true,
      bindGroup: device.createBindGroup({
        label: `BroMetal material ${materialIndex} bind group`,
        layout: materialLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: textureView(pbr.baseColorTexture, whiteTexture) },
          { binding: 2, resource: textureView(definition.normalTexture, normalTexture) },
          { binding: 3, resource: textureView(pbr.metallicRoughnessTexture, whiteTexture) },
          { binding: 4, resource: { buffer: uniform } },
        ],
      }),
    } satisfies BroMetalMaterial;
  });

  const fallbackTangentCount = manifest.meshes[0].primitives.reduce(
    (maximum, primitive) => {
      if (primitive.attributes.TANGENT !== undefined) return maximum;
      const positionAccessor = requireAt(
        manifest.accessors,
        primitive.attributes.POSITION ?? -1,
        "fallback tangent position accessor",
      );
      return Math.max(maximum, positionAccessor.count);
    },
    0,
  );
  const fallbackTangentValues = fallbackTangentCount === 0
    ? null
    : createBroMetalFallbackTangents(fallbackTangentCount);
  const fallbackTangentBuffer = fallbackTangentValues === null
    ? null
    : device.createBuffer({
        label: "BroMetal neutral fallback tangents",
        mappedAtCreation: true,
        size: fallbackTangentValues.byteLength,
        usage: GPUBufferUsage.VERTEX,
      });
  if (fallbackTangentBuffer !== null && fallbackTangentValues !== null) {
    new Float32Array(fallbackTangentBuffer.getMappedRange()).set(
      fallbackTangentValues,
    );
    fallbackTangentBuffer.unmap();
  }

  const primitives = manifest.meshes[0].primitives.map((primitive) => {
    if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
      throw new Error("BroMetal only accepts triangle-list glTF primitives");
    }
    const indices = requireAt(manifest.accessors, primitive.indices, "index accessor");
    if (indices.componentType !== UNSIGNED_SHORT) {
      throw new Error("BroMetal's pinned scene requires uint16 indices");
    }
    const indexBuffer = requireAt(buffers, indices.bufferView, "index buffer");
    if (indexBuffer === null) throw new Error("Index accessor is not backed by an index buffer");
    const attributes = requiredAttributeAccessors(primitive.attributes);
    let tangents: VertexBinding;
    if (attributes.tangents === null) {
      if (fallbackTangentBuffer === null) {
        throw new Error("BroMetal fallback tangent buffer is unavailable");
      }
      tangents = { buffer: fallbackTangentBuffer, offset: 0 };
    } else {
      tangents = vertexBinding(manifest, buffers, attributes.tangents, "TANGENT");
    }
    return {
      indexBuffer,
      indexCount: indices.count,
      indexOffset: indices.byteOffset ?? 0,
      material: requireAt(materials, primitive.material, "material"),
      positions: vertexBinding(manifest, buffers, attributes.positions, "POSITION"),
      normals: vertexBinding(manifest, buffers, attributes.normals, "NORMAL"),
      tangents,
      texcoords: vertexBinding(manifest, buffers, attributes.texcoords, "TEXCOORD_0"),
    } satisfies BroMetalPrimitive;
  });

  onProgress({ completed: LOAD_STEPS, label: "Binding 103 primitives across 25 materials", total: LOAD_STEPS });
  return {
    estimatedBytes:
      textureBytes +
      (fallbackTangentValues?.byteLength ?? 0) +
      manifest.bufferViews.reduce((sum, view) => sum + (view.target === undefined ? 0 : view.byteLength), 0),
    primitives,
    textureCount: textures.length + 2,
  };
}

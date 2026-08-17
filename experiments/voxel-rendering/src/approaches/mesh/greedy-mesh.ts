import {
  voxelKey,
  type Vec3Tuple,
  type VoxelCell,
  type VoxelMaterial,
  type VoxelScene,
} from '../../scene/types.ts';

type Axis = 0 | 1 | 2;
type Sign = -1 | 1;
type MutablePoint = [number, number, number];
type QuadAo = readonly [number, number, number, number];

export type GreedyMeshReceipt = Readonly<{
  algorithm: 'ao-greedy-v1';
  voxels: number;
  exposedUnitFaces: number;
  culledInternalFaces: number;
  quads: number;
  triangles: number;
  vertices: number;
  indices: number;
  bufferBytes: number;
  fingerprint: string;
}>;

export type GreedyMesh = Readonly<{
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  colors: Float32Array<ArrayBuffer>;
  /** Perceptual roughness and metallic weight. */
  materials: Float32Array<ArrayBuffer>;
  emissive: Float32Array<ArrayBuffer>;
  /** Local visibility in the 0..1 range. */
  ao: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  bounds: Readonly<{ min: Vec3Tuple; max: Vec3Tuple }>;
  receipt: GreedyMeshReceipt;
}>;

type FaceCell = Readonly<{
  u: number;
  v: number;
  material: VoxelMaterial;
  ao: QuadAo;
  signature: string;
}>;

type FaceBucket = Readonly<{
  axis: Axis;
  sign: Sign;
  plane: number;
  faces: Map<string, FaceCell>;
}>;

const AXES = [0, 1, 2] as const;
// Chosen so u × v points along the positive normal for every axis.
const U_AXIS = [1, 2, 0] as const;
const V_AXIS = [2, 0, 1] as const;

function faceKey(u: number, v: number): string {
  return `${u},${v}`;
}

function occupied(voxels: ReadonlyMap<string, VoxelCell>, point: MutablePoint): boolean {
  return voxels.has(voxelKey(point[0], point[1], point[2]));
}

function moved(point: MutablePoint, axis: Axis, amount: number): MutablePoint {
  const result: MutablePoint = [...point];
  result[axis] += amount;
  return result;
}

function cornerAo(
  voxels: ReadonlyMap<string, VoxelCell>,
  coordinate: MutablePoint,
  axis: Axis,
  sign: Sign,
  uSign: Sign,
  vSign: Sign,
): number {
  const uAxis = U_AXIS[axis];
  const vAxis = V_AXIS[axis];
  const outside = moved(coordinate, axis, sign);
  const sideU = moved(outside, uAxis, uSign);
  const sideV = moved(outside, vAxis, vSign);
  const diagonal = moved(sideU, vAxis, vSign);
  const uBlocked = occupied(voxels, sideU);
  const vBlocked = occupied(voxels, sideV);
  if (uBlocked && vBlocked) return 0;
  return 3 - Number(uBlocked) - Number(vBlocked) - Number(occupied(voxels, diagonal));
}

function faceAo(
  voxels: ReadonlyMap<string, VoxelCell>,
  coordinate: MutablePoint,
  axis: Axis,
  sign: Sign,
): QuadAo {
  return [
    cornerAo(voxels, coordinate, axis, sign, -1, -1),
    cornerAo(voxels, coordinate, axis, sign, 1, -1),
    cornerAo(voxels, coordinate, axis, sign, 1, 1),
    cornerAo(voxels, coordinate, axis, sign, -1, 1),
  ];
}

function signature(paletteIndex: number, ao: QuadAo): string {
  // A palette index identifies one immutable material-table entry. AO belongs
  // here because interpolation cannot reconstruct a value removed by a merge.
  return `${paletteIndex}|${ao[0]}${ao[1]}${ao[2]}${ao[3]}`;
}

function assertCell(
  cell: VoxelCell,
  seen: ReadonlyMap<string, VoxelCell>,
  materials: readonly VoxelMaterial[],
): void {
  if (![cell.x, cell.y, cell.z, cell.paletteIndex].every(Number.isInteger)) {
    throw new Error(`Voxel coordinates and palette index must be integers; received ${JSON.stringify(cell)}`);
  }
  const key = voxelKey(cell.x, cell.y, cell.z);
  if (seen.has(key)) throw new Error(`Duplicate voxel coordinate ${key}`);
  const material = materials[cell.paletteIndex];
  if (material === undefined) {
    throw new Error(`Voxel ${key} references missing palette index ${cell.paletteIndex}`);
  }
  const numeric = [
    ...material.linear,
    material.roughness,
    material.metallic,
    material.emission,
  ];
  if (!numeric.every(Number.isFinite)) {
    throw new Error(`Material ${cell.paletteIndex} contains a non-finite render value`);
  }
}

function createVoxelMap(scene: VoxelScene): Map<string, VoxelCell> {
  const result = new Map<string, VoxelCell>();
  for (const cell of scene.cells) {
    assertCell(cell, result, scene.materials);
    result.set(voxelKey(cell.x, cell.y, cell.z), cell);
  }
  return result;
}

function buildBuckets(
  scene: VoxelScene,
  voxels: ReadonlyMap<string, VoxelCell>,
): { buckets: FaceBucket[]; exposedUnitFaces: number } {
  const byKey = new Map<string, FaceBucket>();
  let exposedUnitFaces = 0;
  const orderedCells = [...voxels.values()].sort((left, right) => (
    left.x - right.x
    || left.y - right.y
    || left.z - right.z
    || left.paletteIndex - right.paletteIndex
  ));

  for (const cell of orderedCells) {
    const coordinate: MutablePoint = [cell.x, cell.y, cell.z];
    const material = scene.materials[cell.paletteIndex]!;
    for (const axis of AXES) {
      for (const sign of [-1, 1] as const) {
        if (occupied(voxels, moved(coordinate, axis, sign))) continue;
        exposedUnitFaces += 1;
        const plane = coordinate[axis] + (sign > 0 ? 1 : 0);
        const key = `${axis}:${sign}:${plane}`;
        let bucket = byKey.get(key);
        if (bucket === undefined) {
          bucket = { axis, sign, plane, faces: new Map() };
          byKey.set(key, bucket);
        }
        const ao = faceAo(voxels, coordinate, axis, sign);
        const u = coordinate[U_AXIS[axis]];
        const v = coordinate[V_AXIS[axis]];
        bucket.faces.set(faceKey(u, v), {
          u,
          v,
          material,
          ao,
          signature: signature(cell.paletteIndex, ao),
        });
      }
    }
  }

  return {
    buckets: [...byKey.values()].sort((left, right) => (
      left.axis - right.axis || left.sign - right.sign || left.plane - right.plane
    )),
    exposedUnitFaces,
  };
}

/**
 * Pick the triangle diagonal that minimizes the AO interpolation anisotropy.
 * AO values are in winding order. The returned indices preserve that winding.
 */
export function chooseQuadIndices(ao: QuadAo, firstVertex: number): readonly number[] {
  return ao[0] + ao[2] > ao[1] + ao[3]
    ? [firstVertex, firstVertex + 1, firstVertex + 3,
      firstVertex + 1, firstVertex + 2, firstVertex + 3]
    : [firstVertex, firstVertex + 1, firstVertex + 2,
      firstVertex, firstVertex + 2, firstVertex + 3];
}

function meshFingerprint(buffers: readonly ArrayBufferView[]): string {
  let hash = 0x811c9dc5;
  for (const buffer of buffers) {
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

export function compileGreedyMesh(scene: VoxelScene): GreedyMesh {
  const voxels = createVoxelMap(scene);
  const { buckets, exposedUnitFaces } = buildBuckets(scene, voxels);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const materialValues: number[] = [];
  const emissive: number[] = [];
  const aoValues: number[] = [];
  const indices: number[] = [];

  const emitQuad = (
    bucket: FaceBucket,
    face: FaceCell,
    uEnd: number,
    vEnd: number,
  ): void => {
    const uAxis = U_AXIS[bucket.axis];
    const vAxis = V_AXIS[bucket.axis];
    const point = (u: number, v: number): MutablePoint => {
      const result: MutablePoint = [0, 0, 0];
      result[bucket.axis] = scene.origin[bucket.axis] + bucket.plane;
      result[uAxis] = scene.origin[uAxis] + u;
      result[vAxis] = scene.origin[vAxis] + v;
      return result;
    };
    const canonicalPoints = [
      point(face.u, face.v),
      point(uEnd, face.v),
      point(uEnd, vEnd),
      point(face.u, vEnd),
    ] as const;
    const pointOrder = bucket.sign > 0 ? [0, 1, 2, 3] as const : [0, 3, 2, 1] as const;
    const firstVertex = positions.length / 3;
    const windingAo: QuadAo = [
      face.ao[pointOrder[0]] / 3,
      face.ao[pointOrder[1]] / 3,
      face.ao[pointOrder[2]] / 3,
      face.ao[pointOrder[3]] / 3,
    ];

    for (let orderIndex = 0; orderIndex < pointOrder.length; orderIndex += 1) {
      const corner = pointOrder[orderIndex]!;
      const position = canonicalPoints[corner];
      positions.push(position[0], position[1], position[2]);
      const normal: MutablePoint = [0, 0, 0];
      normal[bucket.axis] = bucket.sign;
      normals.push(normal[0], normal[1], normal[2]);
      colors.push(...face.material.linear);
      materialValues.push(face.material.roughness, face.material.metallic);
      emissive.push(face.material.emission);
      aoValues.push(windingAo[orderIndex]!);
    }
    indices.push(...chooseQuadIndices(windingAo, firstVertex));
  };

  for (const bucket of buckets) {
    const remaining = new Map(bucket.faces);
    const ordered = [...bucket.faces.values()].sort((left, right) => (
      left.v - right.v || left.u - right.u || left.signature.localeCompare(right.signature)
    ));
    for (const face of ordered) {
      if (!remaining.has(faceKey(face.u, face.v))) continue;
      let width = 1;
      while (remaining.get(faceKey(face.u + width, face.v))?.signature === face.signature) {
        width += 1;
      }
      let height = 1;
      heightLoop: while (true) {
        for (let offset = 0; offset < width; offset += 1) {
          if (
            remaining.get(faceKey(face.u + offset, face.v + height))?.signature
            !== face.signature
          ) break heightLoop;
        }
        height += 1;
      }
      for (let v = 0; v < height; v += 1) {
        for (let u = 0; u < width; u += 1) {
          remaining.delete(faceKey(face.u + u, face.v + v));
        }
      }
      emitQuad(bucket, face, face.u + width, face.v + height);
    }
  }

  const positionBuffer = new Float32Array(positions);
  const normalBuffer = new Float32Array(normals);
  const colorBuffer = new Float32Array(colors);
  const materialBuffer = new Float32Array(materialValues);
  const emissiveBuffer = new Float32Array(emissive);
  const aoBuffer = new Float32Array(aoValues);
  const indexBuffer = new Uint32Array(indices);
  const buffers = [
    positionBuffer,
    normalBuffer,
    colorBuffer,
    materialBuffer,
    emissiveBuffer,
    aoBuffer,
    indexBuffer,
  ] as const;
  const bufferBytes = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);

  const orderedCells = [...voxels.values()].sort((left, right) => (
    left.x - right.x || left.y - right.y || left.z - right.z
  ));
  const firstCell = orderedCells[0];
  const min: MutablePoint = firstCell === undefined
    ? [...scene.origin]
    : [firstCell.x, firstCell.y, firstCell.z];
  const max: MutablePoint = firstCell === undefined
    ? [...scene.origin]
    : [firstCell.x + 1, firstCell.y + 1, firstCell.z + 1];
  for (const cell of orderedCells) {
    min[0] = Math.min(min[0], cell.x);
    min[1] = Math.min(min[1], cell.y);
    min[2] = Math.min(min[2], cell.z);
    max[0] = Math.max(max[0], cell.x + 1);
    max[1] = Math.max(max[1], cell.y + 1);
    max[2] = Math.max(max[2], cell.z + 1);
  }
  if (firstCell !== undefined) {
    for (const axis of AXES) {
      min[axis] += scene.origin[axis];
      max[axis] += scene.origin[axis];
    }
  }

  const vertices = positionBuffer.length / 3;
  return Object.freeze({
    positions: positionBuffer,
    normals: normalBuffer,
    colors: colorBuffer,
    materials: materialBuffer,
    emissive: emissiveBuffer,
    ao: aoBuffer,
    indices: indexBuffer,
    bounds: Object.freeze({ min, max }),
    receipt: Object.freeze({
      algorithm: 'ao-greedy-v1',
      voxels: voxels.size,
      exposedUnitFaces,
      culledInternalFaces: voxels.size * 6 - exposedUnitFaces,
      quads: vertices / 4,
      triangles: indexBuffer.length / 3,
      vertices,
      indices: indexBuffer.length,
      bufferBytes,
      fingerprint: meshFingerprint(buffers),
    }),
  });
}

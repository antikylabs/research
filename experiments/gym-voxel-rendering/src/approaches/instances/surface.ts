import {
  voxelKey,
  voxelWorldCenter,
  type Vec3Tuple,
  type VoxelCell,
  type VoxelScene,
} from '../../scene/types.ts';

export type FaceCode = 0 | 1 | 2 | 3 | 4 | 5;
export type InstanceMaterialPass = 'all' | 'opaque' | 'transmissive';

export type FaceDefinition = Readonly<{
  code: FaceCode;
  name: 'positive-z' | 'negative-z' | 'positive-y' | 'negative-y' | 'positive-x' | 'negative-x';
  normal: Vec3Tuple;
  /** World direction of increasing shared-quad x. */
  uAxis: Vec3Tuple;
  /** World direction of increasing shared-quad y. Cross(uAxis, vAxis) is normal. */
  vAxis: Vec3Tuple;
}>;

function direction(x: number, y: number, z: number): Vec3Tuple {
  return Object.freeze([x, y, z]);
}

/**
 * Stable face codes shared with the shader. The order matches BroMetal's cube face convention.
 * Every `(uAxis, vAxis)` pair is right-handed around `normal`, so the shared indices stay CCW.
 */
export const FACE_DEFINITIONS: readonly FaceDefinition[] = Object.freeze([
  Object.freeze({
    code: 0,
    name: 'positive-z',
    normal: direction(0, 0, 1),
    uAxis: direction(1, 0, 0),
    vAxis: direction(0, 1, 0),
  }),
  Object.freeze({
    code: 1,
    name: 'negative-z',
    normal: direction(0, 0, -1),
    uAxis: direction(-1, 0, 0),
    vAxis: direction(0, 1, 0),
  }),
  Object.freeze({
    code: 2,
    name: 'positive-y',
    normal: direction(0, 1, 0),
    uAxis: direction(1, 0, 0),
    vAxis: direction(0, 0, -1),
  }),
  Object.freeze({
    code: 3,
    name: 'negative-y',
    normal: direction(0, -1, 0),
    uAxis: direction(1, 0, 0),
    vAxis: direction(0, 0, 1),
  }),
  Object.freeze({
    code: 4,
    name: 'positive-x',
    normal: direction(1, 0, 0),
    uAxis: direction(0, 0, -1),
    vAxis: direction(0, 1, 0),
  }),
  Object.freeze({
    code: 5,
    name: 'negative-x',
    normal: direction(-1, 0, 0),
    uAxis: direction(0, 0, 1),
    vAxis: direction(0, 1, 0),
  }),
]);

const SHARED_CORNERS = Object.freeze([
  Object.freeze([-0.5, -0.5] as const),
  Object.freeze([0.5, -0.5] as const),
  Object.freeze([0.5, 0.5] as const),
  Object.freeze([-0.5, 0.5] as const),
]);

const SHARED_POSITIONS = new Float32Array([
  -0.5, -0.5, 0,
  0.5, -0.5, 0,
  0.5, 0.5, 0,
  -0.5, 0.5, 0,
]);
const SHARED_CORNER_CODES = new Float32Array([0, 1, 2, 3]);
const SHARED_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

/** One immutable-by-convention quad shared by every exposed face instance. */
export const SHARED_FACE_QUAD = Object.freeze({
  corners: SHARED_CORNERS,
  positions: SHARED_POSITIONS,
  cornerCodes: SHARED_CORNER_CODES,
  indices: SHARED_INDICES,
  byteLength: SHARED_POSITIONS.byteLength + SHARED_CORNER_CODES.byteLength + SHARED_INDICES.byteLength,
});

export type FaceInstanceReceipt = Readonly<{
  approach: 'instances';
  sceneFingerprint: string;
  voxelCount: number;
  candidateFaces: number;
  exposedFaces: number;
  culledFaces: number;
  triangles: number;
  instanceBytes: number;
  sharedGeometryBytes: number;
  oneTimeBytes: number;
  fingerprint: string;
}>;

export type FaceInstanceBuild = Readonly<{
  /** World-space voxel centres, three floats per exposed face. */
  positions: Float32Array<ArrayBuffer>;
  /** One stable FaceCode encoded as a float per exposed face. */
  faceCodes: Float32Array<ArrayBuffer>;
  /** Linear RGB plus roughness, four floats per exposed face. */
  colorRoughness: Float32Array<ArrayBuffer>;
  /** Metallic, emission, glass approximation, normalized palette index. */
  materialPalette: Float32Array<ArrayBuffer>;
  /** Water weight, separate from generic glass transmission. */
  water: Float32Array<ArrayBuffer>;
  /** AO for shared corners 0, 1, 2, 3, in the 0..1 range. */
  cornerAo: Float32Array<ArrayBuffer>;
  receipt: FaceInstanceReceipt;
}>;

/**
 * Standard three-neighbor voxel corner AO. Two occupied sides close the corner completely;
 * otherwise each occupied side or diagonal removes one of three light levels.
 */
export function vertexAmbientOcclusion(sideU: boolean, sideV: boolean, diagonal: boolean): number {
  if (sideU && sideV) return 0;
  return (3 - Number(sideU) - Number(sideV) - Number(diagonal)) / 3;
}

export function faceVertex(
  center: Vec3Tuple,
  faceCode: FaceCode,
  u: number,
  v: number,
): Vec3Tuple {
  const face = FACE_DEFINITIONS[faceCode]!;
  return [
    center[0] + face.normal[0] * 0.5 + face.uAxis[0] * u + face.vAxis[0] * v,
    center[1] + face.normal[1] * 0.5 + face.uAxis[1] * u + face.vAxis[1] * v,
    center[2] + face.normal[2] * 0.5 + face.uAxis[2] * u + face.vAxis[2] * v,
  ];
}

function validateScene(scene: VoxelScene): void {
  for (const [axis, size] of scene.dimensions.entries()) {
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new Error(`Instance surface needs a positive integer dimension on axis ${axis}.`);
    }
  }
  if (scene.materials.length < 256) {
    throw new Error(`Instance surface needs 256 palette materials, received ${scene.materials.length}.`);
  }
}

function validateCell(scene: VoxelScene, cell: VoxelCell): void {
  const coordinates = [cell.x, cell.y, cell.z] as const;
  for (let axis = 0; axis < coordinates.length; axis += 1) {
    const coordinate = coordinates[axis]!;
    if (!Number.isSafeInteger(coordinate) || coordinate < 0 || coordinate >= scene.dimensions[axis]!) {
      throw new Error(`Voxel (${cell.x},${cell.y},${cell.z}) is outside scene dimensions.`);
    }
  }
  if (!Number.isSafeInteger(cell.paletteIndex) || scene.materials[cell.paletteIndex] === undefined) {
    throw new Error(`Voxel (${cell.x},${cell.y},${cell.z}) has invalid palette index ${cell.paletteIndex}.`);
  }
}

function canonicalCells(scene: VoxelScene): readonly VoxelCell[] {
  const cells = [...scene.cells];
  cells.sort((left, right) => (
    left.x - right.x
    || left.y - right.y
    || left.z - right.z
    || left.paletteIndex - right.paletteIndex
  ));
  return cells;
}

function offsetKey(cell: VoxelCell, offset: Vec3Tuple): string {
  return voxelKey(cell.x + offset[0], cell.y + offset[1], cell.z + offset[2]);
}

function cornerOcclusion(
  occupied: ReadonlySet<string>,
  cell: VoxelCell,
  face: FaceDefinition,
  uSign: number,
  vSign: number,
): number {
  const outsideX = cell.x + face.normal[0];
  const outsideY = cell.y + face.normal[1];
  const outsideZ = cell.z + face.normal[2];
  const uX = face.uAxis[0] * uSign;
  const uY = face.uAxis[1] * uSign;
  const uZ = face.uAxis[2] * uSign;
  const vX = face.vAxis[0] * vSign;
  const vY = face.vAxis[1] * vSign;
  const vZ = face.vAxis[2] * vSign;
  const sideU = occupied.has(voxelKey(outsideX + uX, outsideY + uY, outsideZ + uZ));
  const sideV = occupied.has(voxelKey(outsideX + vX, outsideY + vY, outsideZ + vZ));
  const diagonal = occupied.has(voxelKey(
    outsideX + uX + vX,
    outsideY + uY + vY,
    outsideZ + uZ + vZ,
  ));
  return vertexAmbientOcclusion(sideU, sideV, diagonal);
}

function mixHashByte(hash: number, byte: number): number {
  return Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0;
}

function hashBuild(sceneFingerprint: string, arrays: readonly Float32Array<ArrayBuffer>[]): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sceneFingerprint.length; index += 1) {
    const code = sceneFingerprint.charCodeAt(index);
    hash = mixHashByte(hash, code & 0xff);
    hash = mixHashByte(hash, code >>> 8);
  }
  const scratch = new DataView(new ArrayBuffer(4));
  for (const values of arrays) {
    for (const value of values) {
      scratch.setFloat32(0, value, true);
      for (let byte = 0; byte < 4; byte += 1) hash = mixHashByte(hash, scratch.getUint8(byte));
    }
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildFaceInstances(
  scene: VoxelScene,
  pass: InstanceMaterialPass = 'all',
): FaceInstanceBuild {
  validateScene(scene);
  const cells = canonicalCells(scene);
  const occupied = new Set<string>();
  const cellByKey = new Map<string, VoxelCell>();
  for (const cell of cells) {
    validateCell(scene, cell);
    const key = voxelKey(cell.x, cell.y, cell.z);
    if (occupied.has(key)) throw new Error(`Instance surface received duplicate voxel ${key}.`);
    occupied.add(key);
    cellByKey.set(key, cell);
  }

  const positions: number[] = [];
  const faceCodes: number[] = [];
  const colorRoughness: number[] = [];
  const materialPalette: number[] = [];
  const water: number[] = [];
  const cornerAo: number[] = [];
  let includedCells = 0;

  for (const cell of cells) {
    const material = scene.materials[cell.paletteIndex]!;
    const transmissive = material.glass > 0.5;
    if (pass === 'opaque' && transmissive) continue;
    if (pass === 'transmissive' && !transmissive) continue;
    includedCells += 1;
    const center = voxelWorldCenter(scene, cell);
    for (const face of FACE_DEFINITIONS) {
      const neighborKey = offsetKey(cell, face.normal);
      const neighbor = cellByKey.get(neighborKey);
      if (pass === 'all' && neighbor !== undefined) continue;
      if (pass === 'opaque' && neighbor !== undefined
        && scene.materials[neighbor.paletteIndex]!.glass <= 0.5) continue;
      if (pass === 'transmissive' && neighbor?.paletteIndex === cell.paletteIndex) continue;

      positions.push(center[0], center[1], center[2]);
      faceCodes.push(face.code);
      colorRoughness.push(
        material.linear[0],
        material.linear[1],
        material.linear[2],
        material.roughness,
      );
      materialPalette.push(
        material.metallic,
        material.emission,
        material.glass,
        material.paletteIndex / 255,
      );
      water.push(material.water);
      for (const [u, v] of SHARED_CORNERS) {
        cornerAo.push(cornerOcclusion(occupied, cell, face, Math.sign(u), Math.sign(v)));
      }
    }
  }

  const immutablePositions = new Float32Array(positions);
  const immutableFaceCodes = new Float32Array(faceCodes);
  const immutableColorRoughness = new Float32Array(colorRoughness);
  const immutableMaterialPalette = new Float32Array(materialPalette);
  const immutableWater = new Float32Array(water);
  const immutableCornerAo = new Float32Array(cornerAo);
  const exposedFaces = immutableFaceCodes.length;
  const candidateFaces = includedCells * FACE_DEFINITIONS.length;
  const instanceBytes = immutablePositions.byteLength
    + immutableFaceCodes.byteLength
    + immutableColorRoughness.byteLength
    + immutableMaterialPalette.byteLength
    + immutableWater.byteLength
    + immutableCornerAo.byteLength;
  const fingerprint = hashBuild(scene.fingerprint, [
    immutablePositions,
    immutableFaceCodes,
    immutableColorRoughness,
    immutableMaterialPalette,
    immutableWater,
    immutableCornerAo,
  ]);
  const receipt: FaceInstanceReceipt = Object.freeze({
    approach: 'instances',
    sceneFingerprint: scene.fingerprint,
    voxelCount: cells.length,
    candidateFaces,
    exposedFaces,
    culledFaces: candidateFaces - exposedFaces,
    triangles: exposedFaces * 2,
    instanceBytes,
    sharedGeometryBytes: SHARED_FACE_QUAD.byteLength,
    oneTimeBytes: instanceBytes + SHARED_FACE_QUAD.byteLength,
    fingerprint,
  });

  return Object.freeze({
    positions: immutablePositions,
    faceCodes: immutableFaceCodes,
    colorRoughness: immutableColorRoughness,
    materialPalette: immutableMaterialPalette,
    water: immutableWater,
    cornerAo: immutableCornerAo,
    receipt,
  });
}

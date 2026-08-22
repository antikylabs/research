import { describe, expect, it } from 'vitest';

import type {
  Vec3Tuple,
  VoxelCell,
  VoxelMaterial,
  VoxelScene,
} from '../../scene/types.ts';
import {
  chooseQuadIndices,
  compileGreedyMesh,
  type GreedyMesh,
} from './greedy-mesh.ts';

const material = (
  paletteIndex: number,
  overrides: Partial<VoxelMaterial> = {},
): VoxelMaterial => {
  const result: VoxelMaterial = {
    paletteIndex,
    srgb: [0.5, 0.5, 0.5],
    linear: [0.214, 0.214, 0.214],
    roughness: 0.7,
    metallic: 0,
    emission: 0,
    glass: 0,
    water: 0,
    sourceType: '_diffuse',
    ...overrides,
  };
  return Object.freeze(result);
};

function scene(
  cells: readonly VoxelCell[],
  dimensions: Vec3Tuple = [4, 4, 4],
  materialOverrides: Readonly<Record<number, Partial<VoxelMaterial>>> = {},
): VoxelScene {
  const materials = Array.from(
    { length: 256 },
    (_, paletteIndex) => material(paletteIndex, materialOverrides[paletteIndex]),
  );
  return Object.freeze({
    name: 'mesh test',
    dimensions,
    origin: [0, 0, 0] as const,
    cells: Object.freeze([...cells]),
    materials: Object.freeze(materials),
    bounds: Object.freeze({ min: [0, 0, 0] as const, max: dimensions }),
    receipt: Object.freeze({
      source: 'built-in',
      sourceBytes: 0,
      parseMilliseconds: 0,
      modelCount: 1,
      selectedModel: 0,
      voxelCount: cells.length,
      warnings: Object.freeze([]),
    }),
    fingerprint: 'fixture',
  });
}

function quadsWithNormal(mesh: GreedyMesh, normal: Vec3Tuple): readonly number[][] {
  const result: number[][] = [];
  for (let quad = 0; quad < mesh.receipt.quads; quad += 1) {
    const offset = quad * 12;
    if (
      mesh.normals[offset] !== normal[0]
      || mesh.normals[offset + 1] !== normal[1]
      || mesh.normals[offset + 2] !== normal[2]
    ) continue;
    result.push(Array.from(mesh.positions.slice(offset, offset + 12)));
  }
  return result;
}

function expectIntegrity(mesh: GreedyMesh): void {
  const vertices = mesh.receipt.vertices;
  expect(mesh.positions).toHaveLength(vertices * 3);
  expect(mesh.normals).toHaveLength(vertices * 3);
  expect(mesh.colors).toHaveLength(vertices * 3);
  expect(mesh.materials).toHaveLength(vertices * 4);
  expect(mesh.emissive).toHaveLength(vertices);
  expect(mesh.water).toHaveLength(vertices);
  expect(mesh.ao).toHaveLength(vertices);
  expect(mesh.indices).toHaveLength(mesh.receipt.triangles * 3);
  expect(mesh.receipt.indices).toBe(mesh.indices.length);
  expect(mesh.receipt.bufferBytes).toBe(
    mesh.positions.byteLength
      + mesh.normals.byteLength
      + mesh.colors.byteLength
      + mesh.materials.byteLength
      + mesh.emissive.byteLength
      + mesh.water.byteLength
      + mesh.ao.byteLength
      + mesh.indices.byteLength,
  );

  for (const value of [
    ...mesh.positions,
    ...mesh.normals,
    ...mesh.colors,
    ...mesh.materials,
    ...mesh.emissive,
    ...mesh.water,
    ...mesh.ao,
  ]) expect(Number.isFinite(value)).toBe(true);
  for (const index of mesh.indices) expect(index).toBeLessThan(vertices);
  for (const value of mesh.ao) expect(value).toBeGreaterThanOrEqual(0);
  for (const value of mesh.ao) expect(value).toBeLessThanOrEqual(1);

  for (let quad = 0; quad < mesh.receipt.quads; quad += 1) {
    const vertex = quad * 4;
    const index = quad * 6;
    const quadAo = [
      mesh.ao[vertex]!,
      mesh.ao[vertex + 1]!,
      mesh.ao[vertex + 2]!,
      mesh.ao[vertex + 3]!,
    ] as const;
    expect(Array.from(mesh.indices.slice(index, index + 6))).toEqual(
      chooseQuadIndices(quadAo, vertex),
    );

    const ia = mesh.indices[index]! * 3;
    const ib = mesh.indices[index + 1]! * 3;
    const ic = mesh.indices[index + 2]! * 3;
    const ab = [
      mesh.positions[ib]! - mesh.positions[ia]!,
      mesh.positions[ib + 1]! - mesh.positions[ia + 1]!,
      mesh.positions[ib + 2]! - mesh.positions[ia + 2]!,
    ] as const;
    const ac = [
      mesh.positions[ic]! - mesh.positions[ia]!,
      mesh.positions[ic + 1]! - mesh.positions[ia + 1]!,
      mesh.positions[ic + 2]! - mesh.positions[ia + 2]!,
    ] as const;
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ] as const;
    const normalOffset = vertex * 3;
    const alignment = cross[0] * mesh.normals[normalOffset]!
      + cross[1] * mesh.normals[normalOffset + 1]!
      + cross[2] * mesh.normals[normalOffset + 2]!;
    expect(alignment).toBeGreaterThan(0);
  }
}

describe('AO-aware greedy surface mesh', () => {
  it('returns an honest empty receipt without inventing geometry', () => {
    const mesh = compileGreedyMesh(scene([], [0, 0, 0]));

    expect(mesh.receipt).toMatchObject({
      voxels: 0,
      exposedUnitFaces: 0,
      culledInternalFaces: 0,
      quads: 0,
      triangles: 0,
      vertices: 0,
      indices: 0,
      bufferBytes: 0,
    });
    expect(mesh.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    expectIntegrity(mesh);
  });

  it('emits all six faces of one voxel with complete attributes', () => {
    const mesh = compileGreedyMesh(scene([{ x: 1, y: 2, z: 3, paletteIndex: 7 }]));

    expect(mesh.receipt).toMatchObject({
      voxels: 1,
      exposedUnitFaces: 6,
      culledInternalFaces: 0,
      quads: 6,
      triangles: 12,
      vertices: 24,
      indices: 36,
    });
    expect(mesh.bounds).toEqual({ min: [1, 2, 3], max: [2, 3, 4] });
    expect(new Set(mesh.normals)).toEqual(new Set([-1, 0, 1]));
    expect(new Set(mesh.colors).size).toBe(1);
    expect(mesh.colors[0]).toBeCloseTo(0.214);
    expect(new Set(mesh.materials).size).toBe(3);
    expect(mesh.materials[0]).toBeCloseTo(0.7);
    expect(mesh.materials[1]).toBe(0);
    expect(mesh.materials[2]).toBe(0);
    expect(mesh.materials[3]).toBeCloseTo(7 / 255);
    expect(new Set(mesh.emissive)).toEqual(new Set([0]));
    expect(new Set(mesh.ao)).toEqual(new Set([1]));
    expectIntegrity(mesh);
  });

  it('removes an internal face pair and legally merges a solid prism', () => {
    const mesh = compileGreedyMesh(scene([
      { x: 0, y: 0, z: 0, paletteIndex: 3 },
      { x: 1, y: 0, z: 0, paletteIndex: 3 },
    ], [2, 1, 1]));

    expect(mesh.receipt).toMatchObject({
      voxels: 2,
      exposedUnitFaces: 10,
      culledInternalFaces: 2,
      quads: 6,
      triangles: 12,
    });
    const tops = quadsWithNormal(mesh, [0, 1, 0]);
    expect(tops).toHaveLength(1);
    expect(Math.max(...tops[0]!.filter((_, index) => index % 3 === 0))).toBe(2);
    expectIntegrity(mesh);
  });

  it('refuses to merge adjacent faces with different materials', () => {
    const mesh = compileGreedyMesh(scene([
      { x: 0, y: 0, z: 0, paletteIndex: 3 },
      { x: 1, y: 0, z: 0, paletteIndex: 4 },
    ], [2, 1, 1]));

    expect(mesh.receipt.exposedUnitFaces).toBe(10);
    expect(mesh.receipt.quads).toBe(10);
    expect(quadsWithNormal(mesh, [0, 1, 0])).toHaveLength(2);
  });

  it('splits opaque and transmissive boundaries without deleting either surface', () => {
    const fixture = scene([
      { x: 0, y: 0, z: 0, paletteIndex: 3 },
      { x: 1, y: 0, z: 0, paletteIndex: 17 },
    ], [2, 1, 1], {
      17: { glass: 0.94, water: 1, sourceType: '_water' },
    });

    const opaque = compileGreedyMesh(fixture, 'opaque');
    const transmissive = compileGreedyMesh(fixture, 'transmissive');

    expect(opaque.receipt.exposedUnitFaces).toBe(6);
    expect(transmissive.receipt.exposedUnitFaces).toBe(6);
    expect(new Set(opaque.water)).toEqual(new Set([0]));
    expect(new Set(transmissive.water)).toEqual(new Set([1]));
  });

  it('culls only same-material internal water faces in the transmissive pass', () => {
    const water = scene([
      { x: 0, y: 0, z: 0, paletteIndex: 17 },
      { x: 1, y: 0, z: 0, paletteIndex: 17 },
    ], [2, 1, 1], {
      17: { glass: 0.94, water: 1, sourceType: '_water' },
    });

    const mesh = compileGreedyMesh(water, 'transmissive');
    expect(mesh.receipt.exposedUnitFaces).toBe(10);
    expect(mesh.receipt.quads).toBe(6);
  });

  it('refuses a material-equal merge when the corner AO signatures differ', () => {
    const mesh = compileGreedyMesh(scene([
      { x: 0, y: 0, z: 0, paletteIndex: 3 },
      { x: 1, y: 0, z: 0, paletteIndex: 3 },
      // This voxel sits outside the two top faces. It changes their corner AO
      // without directly covering either face.
      { x: 0, y: 1, z: 1, paletteIndex: 3 },
    ], [2, 2, 2]));

    const lowerTops = quadsWithNormal(mesh, [0, 1, 0]).filter((quad) => (
      quad.every((value, index) => index % 3 !== 1 || value === 1)
    ));
    expect(lowerTops).toHaveLength(2);
    expect(lowerTops.every((quad) => (
      Math.max(...quad.filter((_, index) => index % 3 === 0))
      - Math.min(...quad.filter((_, index) => index % 3 === 0))
    ) === 1)).toBe(true);
  });

  it('selects the quad diagonal from opposite-corner AO sums', () => {
    expect(chooseQuadIndices([1, 0, 1, 0], 8)).toEqual([
      8, 9, 11,
      9, 10, 11,
    ]);
    expect(chooseQuadIndices([1, 1, 0, 1], 8)).toEqual([
      8, 9, 10,
      8, 10, 11,
    ]);
  });

  it('keeps a detailed checker fixture split where palette data changes', () => {
    const mesh = compileGreedyMesh(scene([
      { x: 0, y: 0, z: 0, paletteIndex: 1 },
      { x: 1, y: 0, z: 0, paletteIndex: 2 },
      { x: 0, y: 0, z: 1, paletteIndex: 2 },
      { x: 1, y: 0, z: 1, paletteIndex: 1 },
    ], [2, 1, 2]));

    expect(mesh.receipt).toMatchObject({
      voxels: 4,
      exposedUnitFaces: 16,
      culledInternalFaces: 8,
      quads: 16,
      triangles: 32,
    });
    expect(quadsWithNormal(mesh, [0, 1, 0])).toHaveLength(4);
    expectIntegrity(mesh);
  });

  it('is byte-deterministic even when input cells arrive in another order', () => {
    const cells = [
      { x: 0, y: 0, z: 0, paletteIndex: 1 },
      { x: 1, y: 0, z: 0, paletteIndex: 2 },
      { x: 0, y: 1, z: 0, paletteIndex: 3 },
      { x: 2, y: 0, z: 1, paletteIndex: 4 },
    ] as const;
    const forward = compileGreedyMesh(scene(cells));
    const reverse = compileGreedyMesh(scene([...cells].reverse()));

    expect(reverse.receipt).toEqual(forward.receipt);
    expect(reverse.receipt.fingerprint).toBe(forward.receipt.fingerprint);
    for (const key of [
      'positions',
      'normals',
      'colors',
      'materials',
      'emissive',
      'ao',
      'indices',
    ] as const) expect(Array.from(reverse[key])).toEqual(Array.from(forward[key]));
  });

  it('rejects duplicate occupied coordinates rather than depending on input order', () => {
    expect(() => compileGreedyMesh(scene([
      { x: 0, y: 0, z: 0, paletteIndex: 1 },
      { x: 0, y: 0, z: 0, paletteIndex: 2 },
    ]))).toThrow(/duplicate voxel/i);
  });
});

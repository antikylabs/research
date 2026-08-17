import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { VoxelMaterial, VoxelScene } from '../../scene/types.ts';
import {
  FACE_DEFINITIONS,
  SHARED_FACE_QUAD,
  buildFaceInstances,
  faceVertex,
  vertexAmbientOcclusion,
} from './surface.ts';
import voxelInstancesShader from './voxel-instances.shader.gen.ts';

function material(paletteIndex: number): VoxelMaterial {
  const value = paletteIndex / 255;
  return Object.freeze({
    paletteIndex,
    srgb: [value, value * 0.75, value * 0.5] as const,
    linear: [value * value, value * 0.5, value * 0.25] as const,
    roughness: 0.2 + value * 0.6,
    metallic: value * 0.8,
    emission: value * 0.4,
    glass: value * 0.25,
    sourceType: 'test',
  });
}

const MATERIALS = Object.freeze(Array.from({ length: 256 }, (_, index) => material(index)));

function scene(
  cells: readonly Readonly<{ x: number; y: number; z: number; paletteIndex: number }>[],
  dimensions: readonly [number, number, number] = [4, 4, 4],
): VoxelScene {
  const origin = [-dimensions[0] / 2, -dimensions[1] / 2, -dimensions[2] / 2] as const;
  const maximum = [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2] as const;
  return Object.freeze({
    name: 'instance-test',
    dimensions,
    origin,
    cells: Object.freeze(cells.map((cell) => Object.freeze(cell))),
    materials: MATERIALS,
    bounds: Object.freeze({
      min: origin,
      max: maximum,
    }),
    receipt: Object.freeze({
      source: 'built-in',
      sourceBytes: 0,
      parseMilliseconds: 0,
      modelCount: 1,
      selectedModel: 0,
      voxelCount: cells.length,
      warnings: Object.freeze([]),
    }),
    fingerprint: `fixture-${cells.length}`,
  });
}

function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subtract(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): readonly [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

test('the six stable face codes reconstruct outward CCW quads with exact normals', () => {
  assert.deepEqual(FACE_DEFINITIONS.map((face) => face.name), [
    'positive-z',
    'negative-z',
    'positive-y',
    'negative-y',
    'positive-x',
    'negative-x',
  ]);
  assert.deepEqual([...SHARED_FACE_QUAD.indices], [0, 1, 2, 0, 2, 3]);

  for (const face of FACE_DEFINITIONS) {
    const vertices = SHARED_FACE_QUAD.corners.map(([u, v]) => faceVertex([0, 0, 0], face.code, u, v));
    const firstEdge = subtract(vertices[1]!, vertices[0]!);
    const secondEdge = subtract(vertices[2]!, vertices[0]!);
    const triangleNormal = cross(firstEdge, secondEdge);
    const outwardDot = triangleNormal[0] * face.normal[0]
      + triangleNormal[1] * face.normal[1]
      + triangleNormal[2] * face.normal[2];

    assert.ok(outwardDot > 0, `${face.name} winding must face outward`);
    for (const vertex of vertices) {
      const planeDistance = vertex[0] * face.normal[0]
        + vertex[1] * face.normal[1]
        + vertex[2] * face.normal[2];
      assert.equal(planeDistance, 0.5, `${face.name} must lie on its voxel boundary`);
    }
  }
});

test('adjacent voxels remove both directions of their shared internal face', () => {
  const built = buildFaceInstances(scene([
    { x: 1, y: 1, z: 1, paletteIndex: 5 },
    { x: 2, y: 1, z: 1, paletteIndex: 9 },
  ]));

  assert.equal(built.receipt.candidateFaces, 12);
  assert.equal(built.receipt.exposedFaces, 10);
  assert.equal(built.receipt.culledFaces, 2);
  assert.equal(built.receipt.triangles, 20);

  const faces = Array.from(built.faceCodes);
  const centers = Array.from({ length: built.receipt.exposedFaces }, (_, index) => (
    Array.from(built.positions.slice(index * 3, index * 3 + 3))
  ));
  assert.equal(centers.some((center, index) => center[0] === -0.5 && faces[index] === 4), false);
  assert.equal(centers.some((center, index) => center[0] === 0.5 && faces[index] === 5), false);
});

test('corner AO uses the two sides and diagonal on the exposed face plane', () => {
  assert.equal(vertexAmbientOcclusion(false, false, false), 1);
  assert.equal(vertexAmbientOcclusion(true, false, false), 2 / 3);
  assert.equal(vertexAmbientOcclusion(false, false, true), 2 / 3);
  assert.equal(vertexAmbientOcclusion(true, false, true), 1 / 3);
  assert.equal(vertexAmbientOcclusion(true, true, false), 0);
  assert.equal(vertexAmbientOcclusion(true, true, true), 0);

  const built = buildFaceInstances(scene([
    { x: 1, y: 1, z: 1, paletteIndex: 7 },
    { x: 0, y: 1, z: 2, paletteIndex: 1 },
    { x: 1, y: 0, z: 2, paletteIndex: 1 },
  ]));
  const targetFace = Array.from(built.faceCodes).findIndex((face, index) => (
    face === 0
      && built.positions[index * 3] === -0.5
      && built.positions[index * 3 + 1] === -0.5
      && built.positions[index * 3 + 2] === -0.5
  ));
  assert.notEqual(targetFace, -1);

  const ao = Array.from(built.cornerAo.slice(targetFace * 4, targetFace * 4 + 4));
  assert.deepEqual(ao, Array.from(new Float32Array([0, 2 / 3, 1, 2 / 3])));
});

test('solid and porous fixtures report honest exposed-face counts', () => {
  const solidCells = [];
  for (let x = 0; x < 2; x += 1) {
    for (let y = 0; y < 2; y += 1) {
      for (let z = 0; z < 2; z += 1) solidCells.push({ x, y, z, paletteIndex: 3 });
    }
  }
  const solid = buildFaceInstances(scene(solidCells, [2, 2, 2]));
  assert.equal(solid.receipt.exposedFaces, 24);
  assert.equal(solid.receipt.culledFaces, 24);

  const porous = buildFaceInstances(scene([
    { x: 0, y: 0, z: 0, paletteIndex: 1 },
    { x: 2, y: 0, z: 0, paletteIndex: 2 },
    { x: 0, y: 2, z: 0, paletteIndex: 3 },
    { x: 0, y: 0, z: 2, paletteIndex: 4 },
  ], [3, 3, 3]));
  assert.equal(porous.receipt.exposedFaces, 24);
  assert.equal(porous.receipt.culledFaces, 0);
});

test('all instance attributes agree and preserve palette/material values', () => {
  const built = buildFaceInstances(scene([{ x: 1, y: 1, z: 1, paletteIndex: 64 }]));
  const count = built.receipt.exposedFaces;

  assert.equal(built.positions.length, count * 3);
  assert.equal(built.faceCodes.length, count);
  assert.equal(built.colorRoughness.length, count * 4);
  assert.equal(built.materialPalette.length, count * 4);
  assert.equal(built.cornerAo.length, count * 4);
  assert.equal(built.receipt.instanceBytes,
    built.positions.byteLength
      + built.faceCodes.byteLength
      + built.colorRoughness.byteLength
      + built.materialPalette.byteLength
      + built.cornerAo.byteLength);

  const expected = MATERIALS[64]!;
  for (let index = 0; index < count; index += 1) {
    assert.deepEqual(Array.from(built.colorRoughness.slice(index * 4, index * 4 + 4)), Array.from(new Float32Array([
      ...expected.linear,
      expected.roughness,
    ])));
    assert.deepEqual(Array.from(built.materialPalette.slice(index * 4, index * 4 + 4)), Array.from(new Float32Array([
      expected.metallic,
      expected.emission,
      expected.glass,
      expected.paletteIndex / 255,
    ])));
  }
});

test('canonical cell and face order makes arrays and receipts deterministic', () => {
  const cells = [
    { x: 1, y: 0, z: 2, paletteIndex: 18 },
    { x: 0, y: 2, z: 1, paletteIndex: 9 },
    { x: 3, y: 1, z: 0, paletteIndex: 27 },
  ];
  const forward = buildFaceInstances(scene(cells));
  const reversed = buildFaceInstances(scene([...cells].reverse()));

  assert.deepEqual(forward.receipt, reversed.receipt);
  assert.deepEqual(forward.positions, reversed.positions);
  assert.deepEqual(forward.faceCodes, reversed.faceCodes);
  assert.deepEqual(forward.colorRoughness, reversed.colorRoughness);
  assert.deepEqual(forward.materialPalette, reversed.materialPalette);
  assert.deepEqual(forward.cornerAo, reversed.cornerAo);
});

test('an empty scene builds a valid zero-draw receipt', () => {
  const built = buildFaceInstances(scene([], [1, 1, 1]));
  assert.equal(built.receipt.exposedFaces, 0);
  assert.equal(built.receipt.triangles, 0);
  assert.equal(built.receipt.instanceBytes, 0);
  assert.equal(built.receipt.oneTimeBytes, SHARED_FACE_QUAD.byteLength);
  assert.equal(built.positions.length, 0);
  assert.match(built.receipt.fingerprint, /^[0-9a-f]{8}$/);
});

test('the generated shader keeps shared vertices separate from per-face instance data', () => {
  const attributes = voxelInstancesShader.layout.attributes;
  assert.deepEqual(
    attributes.filter(({ divisor }) => divisor === 0).map(({ name }) => name),
    ['aPosition', 'aCorner'],
  );
  assert.deepEqual(
    attributes.filter(({ divisor }) => divisor === 1).map(({ name }) => name),
    ['iPosition', 'iFace', 'iColorRoughness', 'iMaterialPalette', 'iAo'],
  );
  assert.match(voxelInstancesShader.wgslSrc, /fn toonShade/);
  assert.match(voxelInstancesShader.wgslSrc, /fn specGGX/);
  assert.match(voxelInstancesShader.wgslSrc, /bm_u\.uStyle/);
});

test('the generated shader reconstructs all six face orientations and outward normals', () => {
  for (const statement of [
    'vec3f(bm_in.aPosition.x, bm_in.aPosition.y, 0.5)',
    'vec3f(-bm_in.aPosition.x, bm_in.aPosition.y, -0.5)',
    'vec3f(bm_in.aPosition.x, 0.5, -bm_in.aPosition.y)',
    'vec3f(bm_in.aPosition.x, -0.5, bm_in.aPosition.y)',
    'vec3f(0.5, bm_in.aPosition.y, -bm_in.aPosition.x)',
    'vec3f(-0.5, bm_in.aPosition.y, bm_in.aPosition.x)',
    'vec3f(0.0, 0.0, 1.0)',
    'vec3f(0.0, 0.0, -1.0)',
    'vec3f(0.0, 1.0, 0.0)',
    'vec3f(0.0, -1.0, 0.0)',
    'vec3f(1.0, 0.0, 0.0)',
    'vec3f(-1.0, 0.0, 0.0)',
  ]) {
    assert.ok(voxelInstancesShader.wgslSrc.includes(statement), `missing generated WGSL: ${statement}`);
  }
});

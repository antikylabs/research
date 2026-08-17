import { describe, expect, it } from 'vitest';

import { buildFaceInstances } from '../approaches/instances/surface.ts';
import { compileGreedyMesh } from '../approaches/mesh/greedy-mesh.ts';
import {
  composeStudioScene,
  ENVIRONMENT_PRESETS,
  listBundledSubjects,
} from './studio-scenes.ts';
import { voxelKey } from './types.ts';

describe('bundled studio subjects', () => {
  it('provides three deterministic, materially complete original subjects', () => {
    const first = listBundledSubjects();
    const second = listBundledSubjects();

    expect(first).toHaveLength(3);
    expect(new Set(first.map((subject) => subject.name)).size).toBe(3);
    expect(first.map((subject) => subject.fingerprint)).toEqual(
      second.map((subject) => subject.fingerprint),
    );
    for (const subject of first) {
      expect(subject.cells.length).toBeGreaterThan(8_000);
      expect(new Set(subject.cells.map((cell) => voxelKey(cell.x, cell.y, cell.z))).size)
        .toBe(subject.cells.length);
      expect(subject.materials.some((material) => material.metallic > 0.5)).toBe(true);
      expect(subject.materials.some((material) => material.glass > 0.5)).toBe(true);
      expect(subject.materials.some((material) => material.emission > 1)).toBe(true);

      const extents = [0, 1, 2].map((axis) => {
        const values = subject.cells.map((cell) => [cell.x, cell.y, cell.z][axis]!);
        const low = values.reduce((minimum, value) => Math.min(minimum, value), Infinity);
        const high = values.reduce((maximum, value) => Math.max(maximum, value), -Infinity);
        return {
          low: subject.cells.filter((cell) => [cell.x, cell.y, cell.z][axis] === low).length,
          high: subject.cells.filter((cell) => [cell.x, cell.y, cell.z][axis] === high).length,
        };
      });
      for (const extent of extents) {
        expect(extent.low).toBeGreaterThan(20);
        expect(extent.high).toBeGreaterThan(20);
      }
    }
  });

  it('exposes substantial geometry from all six inspection directions without renderer holes', () => {
    for (const subject of listBundledSubjects()) {
      const instances = buildFaceInstances(subject);
      const mesh = compileGreedyMesh(subject);
      const directionCounts = Array.from({ length: 6 }, (_, face) => (
        [...instances.faceCodes].filter((code) => code === face).length
      ));

      expect(directionCounts.every((count) => count > 100)).toBe(true);
      expect(mesh.receipt.exposedUnitFaces).toBe(instances.receipt.exposedFaces);
      expect(mesh.receipt.culledInternalFaces).toBe(instances.receipt.culledFaces);
    }
  });
});

describe('studio environments', () => {
  it('provides the complete requested preset catalog', () => {
    expect(ENVIRONMENT_PRESETS.map((preset) => preset.id)).toEqual([
      'pedestal',
      'forest',
      'snow-forest',
      'mountains',
      'beach',
      'swamp',
    ]);
  });

  it('composes one subject with every environment without changing the subject', () => {
    const subject = listBundledSubjects()[0]!;
    const scenes = ENVIRONMENT_PRESETS.map((preset) => composeStudioScene(subject, preset.id));

    expect(new Set(scenes.map((scene) => scene.fingerprint)).size).toBe(ENVIRONMENT_PRESETS.length);
    for (const [index, scene] of scenes.entries()) {
      const environment = ENVIRONMENT_PRESETS[index]!.id;
      expect(scene.dimensions).toEqual([384, 128, 384]);
      expect(scene.cells.length).toBeGreaterThan(subject.cells.length);
      expect(scene.receipt.warnings.some((warning) => warning.includes(subject.fingerprint))).toBe(true);
      expect(scene.cells.every((cell) => (
        Number.isInteger(cell.x) && cell.x >= 0 && cell.x < scene.dimensions[0]
        && Number.isInteger(cell.y) && cell.y >= 0 && cell.y < scene.dimensions[1]
        && Number.isInteger(cell.z) && cell.z >= 0 && cell.z < scene.dimensions[2]
      ))).toBe(true);

      if (environment !== 'pedestal') {
        const edgeCoverage = [
          new Set(scene.cells.filter((cell) => cell.x === 0).map((cell) => cell.z)),
          new Set(scene.cells.filter((cell) => cell.x === 383).map((cell) => cell.z)),
          new Set(scene.cells.filter((cell) => cell.z === 0).map((cell) => cell.x)),
          new Set(scene.cells.filter((cell) => cell.z === 383).map((cell) => cell.x)),
        ];
        const elevatedColumns = new Set(scene.cells
          .filter((cell) => cell.y > 40)
          .map((cell) => `${cell.x},${cell.z}`));
        expect(scene.cells.length).toBeGreaterThan(700_000);
        expect(edgeCoverage.map((edge) => edge.size)).toEqual([384, 384, 384, 384]);
        expect(elevatedColumns.size).toBeGreaterThan(15_000);
        expect(new Set(scene.cells.map((cell) => cell.paletteIndex)).size).toBeGreaterThan(12);
      }
    }
  }, 15_000);

  it('uses transmissive material cells in beach and swamp water', () => {
    const subject = listBundledSubjects()[1]!;
    for (const environment of ['beach', 'swamp'] as const) {
      const scene = composeStudioScene(subject, environment);
      const glassIndices = new Set(scene.materials
        .filter((material) => material.glass > 0.5)
        .map((material) => material.paletteIndex));
      expect(scene.cells.filter((cell) => glassIndices.has(cell.paletteIndex)).length)
        .toBeGreaterThan(75_000);
    }
  });

  it('integrates the subject into the snow biome with deterministic surface accretion', () => {
    const subject = listBundledSubjects()[0]!;
    const scene = composeStudioScene(subject, 'snow-forest');
    const materialByIndex = new Map(subject.materials.map((material) => [material.paletteIndex, material]));
    const mappedSubject = subject.cells.map((cell) => Object.freeze({
      x: Math.round(subject.origin[0] + cell.x + 192),
      y: Math.round(25 + subject.origin[1] + cell.y - subject.bounds.min[1]),
      z: Math.round(subject.origin[2] + cell.z + 192),
      paletteIndex: cell.paletteIndex,
    }));
    const subjectKeys = new Set(mappedSubject.map((cell) => voxelKey(cell.x, cell.y, cell.z)));
    const sceneCells = new Map(scene.cells.map((cell) => [voxelKey(cell.x, cell.y, cell.z), cell]));
    const snowMaterial = scene.materials
      .filter((material) => material.metallic < 0.25 && material.glass < 0.25)
      .reduce((nearest, material) => {
        const distance = (candidate: typeof material): number => (
          (candidate.srgb[0] - 0.9) ** 2
          + (candidate.srgb[1] - 0.94) ** 2
          + (candidate.srgb[2] - 1) ** 2
        );
        return distance(material) < distance(nearest) ? material : nearest;
      });
    const accreted = mappedSubject.filter((cell) => {
      const material = materialByIndex.get(cell.paletteIndex);
      const above = voxelKey(cell.x, cell.y + 1, cell.z);
      return !subjectKeys.has(above)
        && material !== undefined
        && material.glass <= 0.2
        && material.water <= 0.2
        && material.emission <= 0.5
        && sceneCells.get(above)?.paletteIndex === snowMaterial.paletteIndex;
    });
    const receipt = scene.receipt.warnings.find((warning) => warning.startsWith('Snow weathering adds'));

    expect(accreted.length).toBeGreaterThan(4_000);
    expect(receipt).toBe(`Snow weathering adds ${accreted.length.toLocaleString()} exposed-surface cells.`);
  });

  it('supports every bundled subject on continuous ground in every environment', () => {
    for (const subject of listBundledSubjects()) {
      const lowest = subject.cells.reduce((minimum, cell) => Math.min(minimum, cell.y), Infinity);
      const footprint = subject.cells.filter((cell) => cell.y === lowest);
      for (const preset of ENVIRONMENT_PRESETS) {
        const scene = composeStudioScene(subject, preset.id);
        const occupied = new Set(scene.cells.map((cell) => voxelKey(cell.x, cell.y, cell.z)));
        for (const cell of footprint) {
          const x = Math.round(subject.origin[0] + cell.x + 192);
          const z = Math.round(subject.origin[2] + cell.z + 192);
          expect(occupied.has(voxelKey(x, 24, z))).toBe(true);
        }
      }
    }
  }, 60_000);
});

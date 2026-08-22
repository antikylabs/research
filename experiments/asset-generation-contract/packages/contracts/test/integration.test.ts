import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { compileContract, validateResolvedContract } from '../src/compiler/index.js';
import { scene } from '../src/dsl/index.js';

const experimentRoot = fileURLToPath(new URL('../../../', import.meta.url));
const semanticEntry = fileURLToPath(
  new URL('../../examples/src/blue-winter-grove/blue-winter-grove.contract.ts', import.meta.url),
);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

async function outputDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'antiky-contract-test-'));
  temporaryDirectories.push(path);
  return path;
}

describe('Blue Winter Grove vertical slice', () => {
  it('compiles a minimal scene with the documented default profile', async () => {
    const result = await compileContract(scene({ key: 'minimal-scene', name: 'Minimal scene' }));

    expect(result.ok, result.diagnostics.map(({ message }) => message).join('\n')).toBe(true);
    expect(result.resolvedContract?.definitions.profiles?.['profile.voxel-diorama']).toEqual(
      expect.objectContaining({ selection: 'default', version: '0.1.0' }),
    );
    expect(result.resolvedContract?.imports).toEqual([
      expect.objectContaining({
        id: 'antikylabs.core-component-catalog',
        optional: false,
        version: '0.1.0',
      }),
    ]);
  });

  it('compiles the complete module graph to all five validated outputs', async () => {
    const out = await outputDirectory();
    const result = await compileContract(semanticEntry, { outputDirectory: out, projectRoot: experimentRoot });

    expect(result.ok, result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toBe(true);
    expect(Object.keys(result.files).sort()).toEqual([
      'build-manifest.json',
      'contract-index.json',
      'contract.refs.ts',
      'diagnostics.json',
      'resolved-contract.json',
    ]);

    for (const [fileName, expectedContents] of Object.entries(result.files)) {
      expect(await readFile(join(out, fileName), 'utf8')).toBe(expectedContents);
    }

    const resolved = JSON.parse(result.files['resolved-contract.json'] ?? 'null');
    const validation = await validateResolvedContract(resolved);
    expect(validation.valid, validation.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toBe(true);
    expect(JSON.stringify(resolved)).not.toContain('"extends"');

    const semantic = resolved.contract.provenance.authoring.semantic;
    expect(semantic.experience.fantasy).toContain('three companions');
    expect(semantic.visual.lighting).toContain('periwinkle and lilac');
    expect(semantic.gameplay.playAs).toEqual({ ref: 'population.blue-winter-grove.travellingParty' });
    expect(semantic.definitions.frostBentLandmark.parts.crown).toEqual({
      ref: 'prototype.blue-winter-grove.roundedSnowCrown',
    });
    expect(semantic.cast.clearing.features.surfaces).toEqual({
      ref: 'prototype.blue-winter-grove.winterSurfaces',
    });
    expect(semantic.cast.roundedGrove.variation.vary).toContain('cluster depth');
    expect(semantic.rules.must).toContain('powder, water, and thin ice remain visibly distinct');
    expect(semantic.acceptance.review).toContain(
      'Can every important visual decision be traced to a tagged reference image?',
    );

    const index = JSON.parse(result.files['contract-index.json'] ?? 'null');
    const referenceUseCount = Object.values(index.referenceUsesByImageHash as Record<string, unknown[]>).reduce(
      (count, uses) => count + uses.length,
      0,
    );
    expect(referenceUseCount).toBe(38);
    expect(Object.keys(index.byId)).toContain('prototype.blue-winter-grove.roundedSnowCrown');
    expect(index.dependenciesBySourceId['prototype.blue-winter-grove.roundedWinterTree']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'part',
          role: 'crown',
          targetId: 'prototype.blue-winter-grove.roundedSnowCrown',
        }),
      ]),
    );
  });

  it('emits byte-identical output for identical source and reference bytes', async () => {
    const first = await compileContract(semanticEntry, {
      outputDirectory: await outputDirectory(),
      projectRoot: experimentRoot,
    });
    const second = await compileContract(semanticEntry, {
      outputDirectory: await outputDirectory(),
      projectRoot: experimentRoot,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.files).toEqual(first.files);
    const allOutput = Object.values(first.files).join('\n');
    expect(allOutput).not.toContain(experimentRoot);
    expect(allOutput).not.toMatch(/"timestamp"|randomUUID|file:\/\//u);
  });
});

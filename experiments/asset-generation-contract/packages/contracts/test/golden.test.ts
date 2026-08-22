import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compileContract } from '../src/compiler/index.js';
import {
  between,
  frames,
  population,
  region,
  scene,
  thing,
} from '../src/dsl/index.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('canonical compiler golden', () => {
  it('pins every emitted byte for a representative semantic scene', async () => {
    const pine = thing({
      name: 'Snow pine',
      identity: ['layered branches', 'uneven snow load'],
      shape: { form: 'mature pine silhouette' },
    });
    const clearing = region({ name: 'Clearing', purpose: ['negative space'] });
    const grove = population({
      name: 'Pine grove',
      of: pine,
      amount: between(3, 5),
      placement: { around: clearing, pattern: 'loose clusters' },
    });
    const contract = scene({
      key: 'golden-grove',
      name: 'Golden Grove',
      experience: { fantasy: 'Cross a quiet winter grove.' },
      visual: { language: 'layered voxel winter diorama', density: 'medium-high' },
      definitions: { pine },
      cast: { clearing, grove },
      composition: [frames(grove, clearing, { opening: 'keep the center readable' })],
      acceptance: {
        checks: [{
          key: 'grove-count',
          subject: grove,
          measure: 'population count',
          expected: between(3, 5),
        }],
      },
    });
    const packageRoot = fileURLToPath(new URL('../', import.meta.url));
    const result = await compileContract(contract, {
      projectRoot: packageRoot,
      entryPath: fileURLToPath(new URL('../golden.contract.ts', import.meta.url)),
    });

    expect(result.ok, result.diagnostics.map(({ message }) => message).join('\n')).toBe(true);
    expect(result.resolvedContract).toEqual(expect.objectContaining({
      schemaVersion: '0.2.0',
      contract: expect.objectContaining({ id: 'antikylabs.scene.golden-grove' }),
      imports: [{
        id: 'antikylabs.core-component-catalog',
        uri: 'https://antikylabs.dev/schemas/component-catalog.json',
        version: '0.1.0',
        optional: false,
      }],
      relationships: [expect.objectContaining({
        id: 'rel.golden-grove.frames.grove.clearing',
        type: 'composition.frames',
        source: 'population.golden-grove.grove',
        target: 'region.golden-grove.clearing',
      })],
    }));

    const hashes = Object.fromEntries(
      Object.entries(result.files).map(([fileName, contents]) => [fileName, sha256(contents)]),
    );
    expect(hashes).toEqual({
      'build-manifest.json': '127cc6ab62e3532f87805bedde7052887fe89002b2d40789af578229f643cc6a',
      'contract-index.json': '3ef3a68dcb86bf4631f5f43acd150f5afc61cca68823e54e7974d51c4588e234',
      'contract.refs.ts': 'caa6475079ac91caba2b822d08ce682c9cb93ca076751a6a3d4fe04bfde59e9a',
      'diagnostics.json': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
      'resolved-contract.json': '18684448328728d1619f8c8bb0d237032da7627456ec91cd1c8337cb814130b3',
    });
  });
});

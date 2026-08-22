import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  compileContract,
  type CompilationResult,
} from '../src/compiler/index.js';
import {
  between,
  population,
  referenceImage,
  region,
  scene,
  thing,
  voxelDiorama,
  type ReferenceImage,
  type SceneDefinition,
} from '../src/dsl/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'antiky-contract-reference-test-'));
  temporaryDirectories.push(path);
  return path;
}

function referencedScene(image: ReferenceImage): SceneDefinition {
  const tree = thing({
    name: 'Reference tree',
    references: [{ image, use: 'tree silhouette' }],
  });
  const clearing = region({
    name: 'Reference clearing',
    references: [{ image, use: 'clearing composition' }],
  });
  const grove = population({
    name: 'Reference grove',
    of: tree,
    amount: between(2, 3),
    placement: { around: clearing },
    references: [{ image, use: 'population spacing' }],
  });
  return scene({
    key: 'reference-images',
    name: 'Reference images',
    profiles: [voxelDiorama],
    references: [{ image, use: 'scene mood' }],
    definitions: { tree },
    cast: { clearing, grove },
  });
}

function parseOutput<Value>(result: CompilationResult, fileName: keyof CompilationResult['files']): Value {
  const contents = result.files[fileName];
  if (contents === undefined) throw new Error(`Compilation did not emit ${fileName}.`);
  return JSON.parse(contents) as Value;
}

function expectReferenceFailure(
  result: CompilationResult,
  code: string,
  semanticPath: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.resolvedContract).toBeUndefined();
  expect(Object.keys(result.files)).toEqual(['diagnostics.json']);
  expect(result.diagnostics).toContainEqual(expect.objectContaining({
    code,
    severity: 'error',
    semanticPath,
  }));
}

describe('reference-image compilation through the public API', () => {
  it('hashes one reused image once and retains every declaration-use edge', async () => {
    const projectRoot = await temporaryDirectory();
    const contractsDirectory = join(projectRoot, 'contracts');
    const entryPath = join(contractsDirectory, 'references.contract.ts');
    const imageBytes = Buffer.from('one deterministic image payload\n', 'utf8');
    await mkdir(contractsDirectory, { recursive: true });
    await writeFile(join(contractsDirectory, 'shared-image.png'), imageBytes);

    const sharedImage = referenceImage('./shared-image.png');
    const result = await compileContract(referencedScene(sharedImage), { entryPath, projectRoot });

    expect(
      result.ok,
      result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join('\n'),
    ).toBe(true);
    const expectedHash = createHash('sha256').update(imageBytes).digest('hex');
    const manifest = parseOutput<{
      readonly inputs: {
        readonly referenceImages: readonly {
          readonly path: string;
          readonly sha256: string;
          readonly uses: readonly {
            readonly ownerId: string;
            readonly semanticPath: string;
            readonly use: string;
          }[];
        }[];
      };
    }>(result, 'build-manifest.json');
    expect(manifest.inputs.referenceImages).toEqual([
      {
        path: './shared-image.png',
        sha256: expectedHash,
        uses: [
          {
            ownerId: 'region.reference-images.clearing',
            semanticPath: '$.cast.clearing.references[0]',
            use: 'clearing composition',
          },
          {
            ownerId: 'population.reference-images.grove',
            semanticPath: '$.cast.grove.references[0]',
            use: 'population spacing',
          },
          {
            ownerId: 'prototype.reference-images.tree',
            semanticPath: '$.definitions.tree.references[0]',
            use: 'tree silhouette',
          },
          {
            ownerId: 'scene.reference-images',
            semanticPath: '$.references[0]',
            use: 'scene mood',
          },
        ],
      },
    ]);

    const index = parseOutput<{
      readonly referenceUsesByImageHash: Readonly<Record<string, readonly unknown[]>>;
    }>(result, 'contract-index.json');
    expect(Object.keys(index.referenceUsesByImageHash)).toEqual([expectedHash]);
    expect(index.referenceUsesByImageHash[expectedHash]).toHaveLength(4);
  });

  it('returns a semantic-path diagnostic for a missing entry-relative image', async () => {
    const projectRoot = await temporaryDirectory();
    const entryPath = join(projectRoot, 'missing.contract.ts');

    const result = await compileContract(referencedScene(referenceImage('./missing.png')), {
      entryPath,
      projectRoot,
    });

    expectReferenceFailure(
      result,
      'DSL_REFERENCE_MISSING',
      '$.cast.clearing.references[0].image.path',
    );
  });

  it('rejects an absolute image path before reading it', async () => {
    const projectRoot = await temporaryDirectory();
    const imagePath = join(projectRoot, 'absolute.png');
    await writeFile(imagePath, 'absolute image\n', 'utf8');

    const result = await compileContract(referencedScene(referenceImage(imagePath)), {
      entryPath: join(projectRoot, 'absolute.contract.ts'),
      projectRoot,
    });

    expectReferenceFailure(
      result,
      'DSL_REFERENCE_PATH',
      '$.cast.clearing.references[0].image.path',
    );
  });

  it('rejects a lexical path that leaves the configured project', async () => {
    const temporaryRoot = await temporaryDirectory();
    const projectRoot = join(temporaryRoot, 'project');
    const contractsDirectory = join(projectRoot, 'contracts');
    await mkdir(contractsDirectory, { recursive: true });
    await writeFile(join(temporaryRoot, 'outside.png'), 'outside image\n', 'utf8');

    const result = await compileContract(referencedScene(referenceImage('../../outside.png')), {
      entryPath: join(contractsDirectory, 'outside.contract.ts'),
      projectRoot,
    });

    expectReferenceFailure(
      result,
      'DSL_REFERENCE_OUTSIDE_PROJECT',
      '$.cast.clearing.references[0].image.path',
    );
  });

  it.runIf(process.platform !== 'win32')('rejects a symlink that resolves outside the project', async () => {
    const temporaryRoot = await temporaryDirectory();
    const projectRoot = join(temporaryRoot, 'project');
    const outsidePath = join(temporaryRoot, 'outside.png');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(outsidePath, 'outside image\n', 'utf8');
    await symlink(outsidePath, join(projectRoot, 'linked.png'));

    const result = await compileContract(referencedScene(referenceImage('./linked.png')), {
      entryPath: join(projectRoot, 'symlink.contract.ts'),
      projectRoot,
    });

    expectReferenceFailure(
      result,
      'DSL_REFERENCE_OUTSIDE_PROJECT',
      '$.cast.clearing.references[0].image.path',
    );
  });

  it('requires entryPath for an in-memory declaration that cites an image', async () => {
    const projectRoot = await temporaryDirectory();
    await writeFile(join(projectRoot, 'image.png'), 'in-memory image\n', 'utf8');
    const contract = scene({
      key: 'entry-required',
      name: 'Entry required',
      profiles: [voxelDiorama],
      references: [{ image: referenceImage('./image.png'), use: 'scene evidence' }],
    });

    const result = await compileContract(contract, { projectRoot });

    expectReferenceFailure(result, 'DSL_REFERENCE_ENTRY_REQUIRED', '$.references[0]');
  });
});

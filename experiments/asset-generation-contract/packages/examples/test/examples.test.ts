import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { compileContract, validateResolvedContract } from '@antiky/contracts/compiler';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const outputFileNames = [
  'build-manifest.json',
  'contract-index.json',
  'contract.refs.ts',
  'diagnostics.json',
  'resolved-contract.json',
] as const;
const examples = [
  {
    key: 'blue-winter-grove',
    entry: 'src/blue-winter-grove/blue-winter-grove.contract.ts',
  },
  {
    key: 'quiet-canal-market',
    entry: 'src/quiet-canal-market/quiet-canal-market.contract.ts',
  },
] as const;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'antiky-contract-example-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('committed contract examples', () => {
  it('keeps source and compiled scene inventories aligned', async () => {
    const sourceDirectories = await readdir(join(packageRoot, 'src'));
    const compiledDirectories = await readdir(join(packageRoot, 'compiled'));
    const packageJson: unknown = JSON.parse(
      await readFile(join(packageRoot, 'package.json'), 'utf8'),
    );

    expect(sourceDirectories.sort()).toEqual(examples.map(({ key }) => key));
    expect(compiledDirectories.sort()).toEqual(examples.map(({ key }) => key));
    expect(packageJson).toMatchObject({ files: ['compiled', 'README.md', 'src'] });
  });

  for (const example of examples) {
    it(`reproduces and validates ${example.key}`, async () => {
      const outputDirectory = await temporaryDirectory();
      const result = await compileContract(join(packageRoot, example.entry), {
        outputDirectory,
      });

      expect(result.ok, result.diagnostics.map(({ message }) => message).join('\n')).toBe(true);
      if (example.key === 'quiet-canal-market') {
        expect(Object.keys(result.resolvedContract?.entities ?? {}).sort()).toEqual([
          'region.quiet-canal-market.canals',
          'region.quiet-canal-market.dock',
          'region.quiet-canal-market.market',
          'region.quiet-canal-market.residential',
          'scene.quiet-canal-market',
        ]);
        expect(result.resolvedContract?.relationships).toEqual([]);
        expect(result.resolvedContract?.contract.provenance).toMatchObject({
          authoring: { referenceImages: [] },
        });
      }
      expect((await readdir(outputDirectory)).sort()).toEqual(outputFileNames);

      const committedDirectory = join(packageRoot, 'compiled', example.key);
      expect((await readdir(committedDirectory)).sort()).toEqual(outputFileNames);

      for (const fileName of outputFileNames) {
        const actual = await readFile(join(outputDirectory, fileName), 'utf8');
        const expected = await readFile(join(committedDirectory, fileName), 'utf8');
        expect(actual, `${example.key}/${fileName}`).toBe(expected);
      }

      const resolved: unknown = JSON.parse(
        await readFile(join(outputDirectory, 'resolved-contract.json'), 'utf8'),
      );
      const validation = await validateResolvedContract(resolved);
      expect(validation.valid, validation.diagnostics.map(({ message }) => message).join('\n')).toBe(true);
    });
  }
});

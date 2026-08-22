import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { loadComponentCatalog } from '@antiky/contracts/catalog';

const fixtureDirectory = new URL('../src/blue-winter-grove/', import.meta.url);
const fixtureFiles = [
  'blue-winter-grove.references.ts',
  'blue-winter-grove.characters.ts',
  'blue-winter-grove.environment.ts',
  'blue-winter-grove.definitions.ts',
  'blue-winter-grove.layout.ts',
  'blue-winter-grove.contract.ts',
] as const;

function physicalLines(source: string): readonly string[] {
  const lines = source.split(/\r?\n/u);
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

describe('semantic fixture usability guard', () => {
  it('keeps the scene entry below 120 physical lines and every module line at 120 columns or fewer', async () => {
    for (const fileName of fixtureFiles) {
      const source = await readFile(new URL(fileName, fixtureDirectory), 'utf8');
      const lines = physicalLines(source);
      if (fileName === 'blue-winter-grove.contract.ts') {
        expect(lines.length).toBeLessThan(120);
      }
      expect(Math.max(...lines.map((line) => line.length)), fileName).toBeLessThanOrEqual(120);
    }
  });

  it('contains no raw backend authoring vocabulary', async () => {
    const registry = loadComponentCatalog();
    const rawCatalogNames = [...Object.keys(registry.componentTypes), ...Object.keys(registry.relationshipTypes)];
    const rawPatterns = [
      /\bcomponent\s*\(/u,
      /\bref\s*\(/u,
      /\bdefineSystem\b/u,
      /\b(positionM|lookAtM|focalLengthMm|orthographicWidthM)\b/u,
      /\bgenerated\//u,
      /\bresolved-contract\.json\b/u,
      /\b(?:prototype|region|population|scene)\.[a-z0-9-]+\.[a-z0-9.-]+\b/u,
      /["']\d+\.\d+\.\d+["']/u,
    ];

    for (const fileName of fixtureFiles) {
      const source = await readFile(new URL(fileName, fixtureDirectory), 'utf8');
      for (const pattern of rawPatterns) {
        expect(source, `${fileName} matched ${pattern.source}`).not.toMatch(pattern);
      }
      for (const name of [...rawCatalogNames, ...registry.systemPhaseOrder]) {
        expect(source, `${fileName} contains raw backend name ${name}`).not.toContain(`'${name}'`);
      }
    }
  });

  it('resolves all retained image files cited by the reference module', async () => {
    const referenceSource = await readFile(new URL('blue-winter-grove.references.ts', fixtureDirectory), 'utf8');
    const paths = [...referenceSource.matchAll(/referenceImage\('([^']+)'\)/gu)].map((match) => match[1]);
    expect(paths).toHaveLength(4);
    for (const path of paths) {
      expect(path).toBeDefined();
      await expect(readFile(new URL(path ?? '', fixtureDirectory))).resolves.not.toHaveLength(0);
    }
  });
});

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compileContract,
  type CompilationResult,
} from '../src/compiler/index.js';

const experimentRoot = fileURLToPath(new URL('../../../', import.meta.url));
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const semanticEntry = fileURLToPath(
  new URL('../../examples/src/blue-winter-grove/blue-winter-grove.contract.ts', import.meta.url),
);
const preManifestOutputNames = [
  'resolved-contract.json',
  'diagnostics.json',
  'contract-index.json',
  'contract.refs.ts',
] as const;

let outputDirectory: string;
let compilation: CompilationResult;

beforeAll(async () => {
  outputDirectory = await mkdtemp(join(tmpdir(), 'antiky-contract-artifact-test-'));
  compilation = await compileContract(semanticEntry, {
    outputDirectory,
    projectRoot: experimentRoot,
  });
  expect(
    compilation.ok,
    compilation.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
  ).toBe(true);
});

afterAll(async () => {
  await rm(outputDirectory, { force: true, recursive: true });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function collectKeysAndStrings(
  value: unknown,
  keys: string[] = [],
  strings: string[] = [],
): { readonly keys: readonly string[]; readonly strings: readonly string[] } {
  if (typeof value === 'string') {
    strings.push(value);
    return { keys, strings };
  }
  if (Array.isArray(value)) {
    for (const child of value) collectKeysAndStrings(child, keys, strings);
    return { keys, strings };
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeysAndStrings(child, keys, strings);
    }
  }
  return { keys, strings };
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

interface GeneratedRefRecord {
  readonly category: string;
  readonly key: string;
  readonly kind: string;
  readonly value: string;
}

function parseGeneratedRefs(source: string): readonly GeneratedRefRecord[] {
  const sourceFile = ts.createSourceFile(
    'contract.refs.ts',
    source,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === 'refs');
  if (declaration?.initializer === undefined) throw new Error('Generated refs did not declare refs.');

  const root = unwrapExpression(declaration.initializer);
  if (!ts.isObjectLiteralExpression(root)) throw new Error('Generated refs was not an object literal.');

  const records: GeneratedRefRecord[] = [];
  for (const categoryProperty of root.properties) {
    if (!ts.isPropertyAssignment(categoryProperty)) throw new Error('Unexpected generated refs property.');
    const category = propertyName(categoryProperty.name);
    const categoryValue = unwrapExpression(categoryProperty.initializer);
    if (category === undefined || !ts.isObjectLiteralExpression(categoryValue)) {
      throw new Error('Generated ref category was not an object literal.');
    }

    for (const refProperty of categoryValue.properties) {
      if (!ts.isPropertyAssignment(refProperty)) throw new Error('Unexpected generated ref mapping.');
      const key = propertyName(refProperty.name);
      const call = unwrapExpression(refProperty.initializer);
      const argument = ts.isCallExpression(call) ? call.arguments[0] : undefined;
      const typeArgument = ts.isCallExpression(call) ? call.typeArguments?.[0] : undefined;
      const kind = typeArgument !== undefined && ts.isLiteralTypeNode(typeArgument)
        && ts.isStringLiteralLike(typeArgument.literal)
        ? typeArgument.literal.text
        : undefined;
      if (
        key === undefined
        || argument === undefined
        || !ts.isStringLiteralLike(argument)
        || kind === undefined
      ) {
        throw new Error(`Generated ref ${category}.${key ?? '(unknown)'} lost its exact typed value.`);
      }
      records.push({ category, key, kind, value: argument.text });
    }
  }
  return records;
}

describe('compiler artifacts', () => {
  it('hashes the raw bytes of exactly the four pre-manifest outputs', async () => {
    const manifestBytes = await readFile(join(outputDirectory, 'build-manifest.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
      readonly outputHashes?: Readonly<Record<string, string>>;
    };
    expect(manifest.outputHashes).toBeDefined();
    expect(Object.keys(manifest.outputHashes ?? {}).sort()).toEqual(
      [...preManifestOutputNames].sort(),
    );

    for (const fileName of preManifestOutputNames) {
      const outputBytes = await readFile(join(outputDirectory, fileName));
      expect(manifest.outputHashes?.[fileName], fileName).toBe(sha256(outputBytes));
    }
    expect(manifest.outputHashes).not.toHaveProperty('build-manifest.json');
  });

  it('keeps the manifest free of timestamps, self hashes, and absolute paths', async () => {
    const manifestText = await readFile(join(outputDirectory, 'build-manifest.json'), 'utf8');
    const manifest: unknown = JSON.parse(manifestText);
    const { keys, strings } = collectKeysAndStrings(manifest);

    expect(keys.filter((key) => /timestamp|createdAt|generatedAt/iu.test(key))).toEqual([]);
    expect(keys.filter((key) => /(?:manifest.*sha|sha.*manifest)/iu.test(key))).toEqual([]);
    expect(strings.filter((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(value))).toEqual([]);
    expect(strings.filter((value) => /^(?:\/|[A-Za-z]:[\\/]|file:\/\/)/u.test(value))).toEqual([]);
    expect(manifestText).not.toContain(experimentRoot);
    expect(manifestText).not.toContain(outputDirectory);
  });

  it('emits type-correct ID-keyed refs without lossy aliases or collisions', async () => {
    const refsPath = join(outputDirectory, 'contract.refs.ts');
    const refsSource = await readFile(refsPath, 'utf8');
    const resolved = JSON.parse(await readFile(join(outputDirectory, 'resolved-contract.json'), 'utf8')) as {
      readonly definitions: { readonly prototypes: Readonly<Record<string, unknown>> };
      readonly entities: Readonly<Record<string, unknown>>;
      readonly relationships: readonly { readonly id: string }[];
      readonly systems: readonly { readonly id: string }[];
    };
    const expected = {
      entities: { kind: 'entity', ids: Object.keys(resolved.entities).sort() },
      prototypes: { kind: 'prototype', ids: Object.keys(resolved.definitions.prototypes).sort() },
      relationships: { kind: 'relationship', ids: resolved.relationships.map(({ id }) => id).sort() },
      systems: { kind: 'system', ids: resolved.systems.map(({ id }) => id).sort() },
    } as const;
    const records = parseGeneratedRefs(refsSource);

    for (const [category, categoryExpectation] of Object.entries(expected)) {
      const categoryRecords = records.filter((record) => record.category === category);
      expect(categoryRecords.map(({ key }) => key).sort(), category).toEqual(categoryExpectation.ids);
      expect(categoryRecords.map(({ value }) => value).sort(), category).toEqual(categoryExpectation.ids);
      expect(categoryRecords.every(({ key, value }) => key === value), category).toBe(true);
      expect(categoryRecords.every(({ kind }) => kind === categoryExpectation.kind), category).toBe(true);
    }
    expect(new Set(records.map(({ category }) => category))).toEqual(new Set(Object.keys(expected)));
    expect(new Set(records.map(({ key }) => key)).size).toBe(records.length);

    await writeFile(join(outputDirectory, 'package.json'), '{"type":"module"}\n', 'utf8');
    const program = ts.createProgram({
      rootNames: [refsPath],
      options: {
        baseUrl: packageRoot,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
        paths: { '@antiky/contracts/ir': ['./src/ir/index.ts'] },
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2023,
      },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(
      diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);
  });
});

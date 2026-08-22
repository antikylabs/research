import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const experimentRoot = fileURLToPath(new URL('../../../', import.meta.url));
const sourceRoot = resolve(packageRoot, 'src');
const builtIrRoot = resolve(packageRoot, 'dist/ir');

const publicSubpaths = [
  '@antiky/contracts/catalog',
  '@antiky/contracts/compiler',
  '@antiky/contracts/dsl',
  '@antiky/contracts/ir',
] as const;

function isWithin(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === ''
    || (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`));
}

function moduleSpecifiers(source: string, fileName: string, scriptKind: ts.ScriptKind): readonly string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2023, true, scriptKind);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] !== undefined
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

async function filesBelow(directory: string, extension: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(path);
  }
  return files.sort();
}

async function compiledRelativeImportGraph(entryPath: string): Promise<ReadonlySet<string>> {
  const visited = new Set<string>();
  const pending = [entryPath];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || visited.has(path)) continue;
    visited.add(path);
    const source = await readFile(path, 'utf8');
    for (const specifier of moduleSpecifiers(source, path, ts.ScriptKind.JS)) {
      if (!specifier.startsWith('.')) continue;
      pending.push(resolve(dirname(path), specifier));
    }
  }
  return visited;
}

async function importBuiltSubpaths(): Promise<Readonly<Record<string, readonly string[]>>> {
  const script = [
    `const specifiers = ${JSON.stringify(publicSubpaths)};`,
    'const result = {};',
    'for (const specifier of specifiers) {',
    '  result[specifier] = Object.keys(await import(specifier)).sort();',
    '}',
    'process.stdout.write(JSON.stringify(result));',
  ].join('\n');
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { cwd: experimentRoot, encoding: 'utf8' },
  );
  expect(stderr).toBe('');
  return JSON.parse(stdout) as Readonly<Record<string, readonly string[]>>;
}

describe('built package boundaries', () => {
  it('keeps long-form documentation outside the TypeScript package', async () => {
    const rootEntries = await readdir(packageRoot, { withFileTypes: true });
    const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
      readonly files: readonly string[];
    };

    expect(rootEntries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))).toEqual([]);
    expect(packageJson.files).toEqual(['dist']);
  });

  it('resolves every declared subpath export after the package build', async () => {
    const exportsBySubpath = await importBuiltSubpaths();

    expect(Object.keys(exportsBySubpath).sort()).toEqual([...publicSubpaths].sort());
    expect(exportsBySubpath['@antiky/contracts/catalog']).toContain('validateResolvedContract');
    expect(exportsBySubpath['@antiky/contracts/compiler']).toContain('compileContract');
    expect(exportsBySubpath['@antiky/contracts/dsl']).toContain('scene');
    expect(exportsBySubpath['@antiky/contracts/ir']).toContain('contractRef');
  });

  it('keeps raw ECS builders out of the ordinary DSL and compiler exports', async () => {
    const exportsBySubpath = await importBuiltSubpaths();
    const forbiddenBuilders = [
      'component',
      'defineSystem',
      'isNumericRange',
      'isPopulationDefinition',
      'ref',
    ];

    expect(exportsBySubpath['@antiky/contracts/dsl']).not.toEqual(
      expect.arrayContaining(forbiddenBuilders),
    );
    expect(exportsBySubpath['@antiky/contracts/compiler']).not.toEqual(
      expect.arrayContaining(forbiddenBuilders),
    );
  });

  it('keeps the compiled IR import graph inside the IR subpath', async () => {
    const entryPath = resolve(builtIrRoot, 'index.js');
    const graph = await compiledRelativeImportGraph(entryPath);
    const bareBoundaryImports: string[] = [];
    for (const path of graph) {
      const source = await readFile(path, 'utf8');
      for (const specifier of moduleSpecifiers(source, path, ts.ScriptKind.JS)) {
        if (
          specifier === '@antiky/contracts/compiler'
          || specifier === '@antiky/contracts/dsl'
        ) {
          bareBoundaryImports.push(`${relative(builtIrRoot, path)} -> ${specifier}`);
        }
      }
    }

    expect([...graph].every((path) => isWithin(builtIrRoot, path))).toBe(true);
    expect([...graph].some((path) => path.includes(`${sep}compiler${sep}`))).toBe(false);
    expect([...graph].some((path) => path.includes(`${sep}dsl${sep}`))).toBe(false);
    expect(bareBoundaryImports).toEqual([]);
  });

  it('has no source import that reaches an Antiky runtime or escapes the package source root', async () => {
    const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {
      readonly dependencies: Readonly<Record<string, string>>;
    };
    const sourceFiles = await filesBelow(sourceRoot, '.ts');
    const antikyImports: string[] = [];
    const escapedRelativeImports: string[] = [];
    const undeclaredExternalImports: string[] = [];

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8');
      for (const specifier of moduleSpecifiers(source, sourceFile, ts.ScriptKind.TS)) {
        if (specifier.startsWith('.')) {
          if (!isWithin(sourceRoot, resolve(dirname(sourceFile), specifier))) {
            escapedRelativeImports.push(`${relative(sourceRoot, sourceFile)} -> ${specifier}`);
          }
          continue;
        }
        if (specifier.startsWith('node:')) continue;
        if (specifier.startsWith('@antiky/')) {
          antikyImports.push(`${relative(sourceRoot, sourceFile)} -> ${specifier}`);
          continue;
        }
        const dependency = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0];
        if (dependency === undefined || packageJson.dependencies[dependency] === undefined) {
          undeclaredExternalImports.push(`${relative(sourceRoot, sourceFile)} -> ${specifier}`);
        }
      }
    }

    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(antikyImports).toEqual([]);
    expect(escapedRelativeImports).toEqual([]);
    expect(undeclaredExternalImports).toEqual([]);
  });
});

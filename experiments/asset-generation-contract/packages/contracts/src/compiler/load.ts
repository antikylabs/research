import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

import type { SceneDefinition } from '../dsl/index.js';
import { sha256Bytes } from './canonical.js';

export interface LoadedContract {
  readonly entryAbsolutePath: string;
  readonly entryRelativePath: string;
  readonly projectRoot: string;
  readonly scene: SceneDefinition;
  readonly sourceFiles: readonly LoadedSourceFile[];
}

export interface LoadedSourceFile {
  readonly path: string;
  readonly sha256: string;
}

export interface LoadContractOptions {
  readonly projectRoot?: string;
}

export class ContractLoadError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ContractLoadError';
    this.code = code;
  }
}

function isWithin(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

function isSceneDefinition(value: unknown): value is SceneDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(value, 'kind') && Reflect.get(value, 'kind') === 'scene';
}

async function hashSourceFiles(
  inputPaths: readonly string[],
  workingDirectory: string,
  projectRoot: string,
): Promise<readonly LoadedSourceFile[]> {
  const contractsPackageRoot = fileURLToPath(new URL('../../', import.meta.url));
  const records: LoadedSourceFile[] = [];
  for (const inputPath of inputPaths) {
    const absolutePath = isAbsolute(inputPath) ? inputPath : resolve(workingDirectory, inputPath);
    if (
      !isWithin(projectRoot, absolutePath)
      || isWithin(contractsPackageRoot, absolutePath)
      || absolutePath.includes(`${sep}node_modules${sep}`)
    ) {
      continue;
    }
    const bytes = await readFile(absolutePath);
    records.push({
      path: relative(projectRoot, absolutePath).split(sep).join('/'),
      sha256: sha256Bytes(bytes),
    });
  }
  records.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return records;
}

/** Load trusted repository TypeScript by bundling its complete local module graph to a temporary ESM file. */
export async function loadContractEntry(
  entryPath: string,
  options: LoadContractOptions = {},
): Promise<LoadedContract> {
  const entryAbsolutePath = resolve(entryPath);
  const projectRoot = resolve(options.projectRoot ?? dirname(entryAbsolutePath));

  if (!entryAbsolutePath.endsWith('.contract.ts')) {
    throw new ContractLoadError('DSL_ENTRY_EXTENSION', `Contract entry must end with .contract.ts: ${basename(entryPath)}`);
  }
  if (!isWithin(projectRoot, entryAbsolutePath)) {
    throw new ContractLoadError('DSL_ENTRY_OUTSIDE_PROJECT', 'Contract entry must be inside the configured project root.');
  }

  try {
    const entryStats = await stat(entryAbsolutePath);
    if (!entryStats.isFile()) {
      throw new ContractLoadError('DSL_ENTRY_NOT_FILE', `Contract entry is not a file: ${basename(entryPath)}`);
    }
  } catch (error: unknown) {
    if (error instanceof ContractLoadError) {
      throw error;
    }
    throw new ContractLoadError('DSL_ENTRY_MISSING', `Contract entry does not exist: ${basename(entryPath)}`, {
      cause: error,
    });
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'antiky-contract-'));
  const outputPath = join(temporaryDirectory, 'entry.mjs');

  try {
    const buildResult = await build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: [entryAbsolutePath],
      format: 'esm',
      logLevel: 'silent',
      metafile: true,
      outfile: outputPath,
      packages: 'bundle',
      platform: 'node',
      sourcemap: false,
      target: 'node22',
    });

    const sourceFiles = await hashSourceFiles(
      Object.keys(buildResult.metafile.inputs),
      projectRoot,
      projectRoot,
    );
    const loadedModule: unknown = await import(pathToFileURL(outputPath).href);
    if (typeof loadedModule !== 'object' || loadedModule === null) {
      throw new ContractLoadError('DSL_ENTRY_EXPORT', 'Contract entry did not produce an ES module namespace.');
    }

    const exportNames = Object.keys(loadedModule).sort();
    if (exportNames.length !== 1 || exportNames[0] !== 'default') {
      throw new ContractLoadError(
        'DSL_ENTRY_EXPORT',
        `Contract entry must export only default; received: ${exportNames.join(', ') || '(none)'}.`,
      );
    }

    const defaultExport: unknown = Reflect.get(loadedModule, 'default');
    if (!isSceneDefinition(defaultExport)) {
      throw new ContractLoadError('DSL_ENTRY_DEFAULT', 'Contract default export must be a scene(...) declaration.');
    }

    return {
      entryAbsolutePath,
      entryRelativePath: relative(projectRoot, entryAbsolutePath).split(sep).join('/'),
      projectRoot,
      scene: defaultExport,
      sourceFiles,
    };
  } catch (error: unknown) {
    if (error instanceof ContractLoadError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ContractLoadError('DSL_ENTRY_LOAD_FAILED', `Unable to load contract entry: ${message}`, { cause: error });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

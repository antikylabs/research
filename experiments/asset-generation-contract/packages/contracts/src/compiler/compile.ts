import { dirname, join, relative, resolve, sep } from 'node:path';

import {
  loadComponentCatalog,
  loadContractSchema,
  validateResolvedContract as validateBackendContract,
  type ValidateResolvedContractOptions,
} from '../catalog/index.js';
import { voxelDiorama, type SceneDefinition } from '../dsl/index.js';
import type { ResolvedContract } from '../ir/index.js';

import { canonicalStringify, hashCanonical, sha256Bytes } from './canonical.js';
import { collectSemanticGraph } from './collect.js';
import { buildContractIndex } from './contract-index.js';
import {
  compareStableText,
  createDiagnostic,
  diagnosticCodes,
  hasBlockingDiagnostics,
  sortDiagnostics,
  type Diagnostic,
} from './diagnostics.js';
import {
  emitCompilationFiles,
  renderGeneratedRefs,
  type CompilationFiles,
} from './emission.js';
import { loadContractEntry, type LoadedSourceFile } from './load.js';
import {
  lowerSemanticScene,
  type Derivation,
  type SemanticLoweringResult,
} from './lower.js';
import { expandProfiles } from './profiles.js';
import {
  ReferenceImageError,
  resolveReferenceImages,
  type ResolvedReferenceImage,
} from './reference-images.js';
import { compilerIdentity, compilerPasses, semanticLowerers } from './versions.js';

export interface CompileContractOptions {
  readonly outputDirectory?: string;
  readonly projectRoot?: string;
  /** Required for in-memory declarations that cite entry-relative reference images. */
  readonly entryPath?: string;
}

export interface CompilationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly files: CompilationFiles;
  readonly resolvedContract?: ResolvedContract;
}

export interface ContractValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly systemOrder: readonly string[];
}

interface CompilationInput {
  readonly scene: SceneDefinition;
  readonly entryAbsolutePath: string;
  readonly entryRelativePath: string;
  readonly projectRoot: string;
  readonly sourceFiles: readonly LoadedSourceFile[];
}

function portablePath(from: string, to: string): string {
  return relative(from, to).split(sep).join('/');
}

async function prepareInput(
  input: string | SceneDefinition,
  options: CompileContractOptions,
): Promise<CompilationInput> {
  if (typeof input === 'string') return loadContractEntry(input, { projectRoot: options.projectRoot });

  const entryAbsolutePath = resolve(options.entryPath ?? join(options.projectRoot ?? process.cwd(), 'in-memory.contract.ts'));
  const projectRoot = resolve(options.projectRoot ?? dirname(entryAbsolutePath));
  return {
    scene: input,
    entryAbsolutePath,
    entryRelativePath: portablePath(projectRoot, entryAbsolutePath),
    projectRoot,
    sourceFiles: [],
  };
}

function diagnosticForError(error: unknown): Diagnostic {
  if (error instanceof ReferenceImageError) {
    return createDiagnostic({
      code: error.code,
      severity: 'error',
      message: error.message,
      semanticPath: error.semanticPath,
    });
  }
  if (typeof error === 'object' && error !== null) {
    const code = Reflect.get(error, 'code');
    const message = Reflect.get(error, 'message');
    return createDiagnostic({
      code: typeof code === 'string' ? code : 'DSL_COMPILATION_FAILED',
      severity: 'error',
      message: typeof message === 'string' ? message : String(error),
    });
  }
  return createDiagnostic({
    code: 'DSL_COMPILATION_FAILED',
    severity: 'error',
    message: String(error),
  });
}

async function finishFailure(
  diagnostics: readonly Diagnostic[],
  outputDirectory: string | undefined,
): Promise<CompilationResult> {
  const ordered = sortDiagnostics(diagnostics);
  const files: CompilationFiles = { 'diagnostics.json': canonicalStringify(ordered) };
  if (outputDirectory !== undefined) await emitCompilationFiles(outputDirectory, files);
  return { ok: false, diagnostics: ordered, files };
}

function semanticPathForTechnicalPath(
  technicalPath: string,
  derivations: readonly Derivation[],
): string | undefined {
  const candidates = derivations
    .filter(({ outputPath }) => technicalPath.startsWith(outputPath))
    .sort((left, right) => right.outputPath.length - left.outputPath.length);
  return candidates[0]?.semanticPaths[0];
}

/** Validate either compiler output or a complete hand-authored technical fixture. */
export async function validateResolvedContract(
  input: unknown,
  options: ValidateResolvedContractOptions = {},
): Promise<ContractValidationResult> {
  const result = validateBackendContract(input, {
    expectedCatalogUri: voxelDiorama.schema.catalog.uri,
    expectedSchemaId: voxelDiorama.schema.contract.id,
    expectedSchemaVersion: voxelDiorama.schema.contract.version,
    ...options,
  });
  const diagnostics = result.errors.map((error) => createDiagnostic({
    code: error.code,
    severity: 'error',
    message: error.message,
    technicalPath: error.technicalPath,
  }));
  return { valid: result.ok, diagnostics: sortDiagnostics(diagnostics), systemOrder: result.systemOrder };
}

function countDiagnostics(diagnostics: readonly Diagnostic[]): Readonly<Record<string, number>> {
  return {
    total: diagnostics.length,
    errors: diagnostics.filter(({ severity }) => severity === 'error').length,
    warnings: diagnostics.filter(({ severity }) => severity === 'warning').length,
    info: diagnostics.filter(({ severity }) => severity === 'info').length,
  };
}

function buildManifest(
  prepared: CompilationInput,
  semanticProjection: unknown,
  profiles: ReturnType<typeof expandProfiles>,
  referenceImages: readonly ResolvedReferenceImage[],
  contract: ResolvedContract,
  diagnostics: readonly Diagnostic[],
  systemOrder: readonly string[],
  outputFiles: Readonly<Record<string, string>>,
): unknown {
  const schema = loadContractSchema();
  const catalog = loadComponentCatalog();
  return {
    compiler: compilerIdentity,
    passes: compilerPasses,
    lowerers: semanticLowerers,
    inputs: {
      entry: prepared.entryRelativePath,
      sourceFiles: prepared.sourceFiles,
      semanticSha256: hashCanonical(semanticProjection),
      referenceImages: referenceImages.map((image) => ({
        path: image.path,
        sha256: image.sha256,
        uses: image.uses.map((use) => ({
          ownerId: use.ownerId,
          semanticPath: use.semanticPath,
          use: use.use,
        })),
      })),
    },
    profiles: profiles.profiles.map(({ id, version, selection, profile }) => ({
      id,
      version,
      selection,
      sha256: hashCanonical(profile),
    })),
    schema: {
      id: profiles.profiles[0]?.profile.schema.contract.id ?? 'generative-scene-contract',
      version: contract.schemaVersion,
      sha256: hashCanonical(schema),
    },
    catalog: {
      id: catalog.id,
      version: catalog.catalogVersion,
      sha256: hashCanonical(catalog),
    },
    resolvedContractSha256: hashCanonical(contract),
    systemOrder,
    outputHashes: Object.fromEntries(
      Object.entries(outputFiles)
        .sort(([left], [right]) => compareStableText(left, right))
        .map(([fileName, contents]) => [fileName, sha256Bytes(contents)]),
    ),
    diagnostics: countDiagnostics(diagnostics),
  };
}

/** Compile trusted, local declarative TypeScript or an already constructed scene declaration. */
export async function compileContract(
  input: string | SceneDefinition,
  options: CompileContractOptions = {},
): Promise<CompilationResult> {
  let prepared: CompilationInput;
  try {
    prepared = await prepareInput(input, options);
  } catch (error: unknown) {
    return finishFailure([diagnosticForError(error)], options.outputDirectory);
  }

  if (typeof prepared.scene !== 'object' || prepared.scene === null || Array.isArray(prepared.scene)) {
    return finishFailure([createDiagnostic({
      code: diagnosticCodes.semanticShape,
      severity: 'error',
      message: 'The compiler input must be a declarative scene object.',
      semanticPath: '$',
    })], options.outputDirectory);
  }

  let graph: ReturnType<typeof collectSemanticGraph>;
  try {
    graph = collectSemanticGraph(prepared.scene);
  } catch (error: unknown) {
    return finishFailure([diagnosticForError(error)], options.outputDirectory);
  }
  const diagnostics: Diagnostic[] = [...graph.diagnostics];
  if (hasBlockingDiagnostics(diagnostics)) return finishFailure(diagnostics, options.outputDirectory);
  let profiles: ReturnType<typeof expandProfiles>;
  try {
    profiles = expandProfiles(prepared.scene);
  } catch (error: unknown) {
    diagnostics.push(diagnosticForError(error));
    return finishFailure(diagnostics, options.outputDirectory);
  }
  diagnostics.push(...profiles.diagnostics);
  if (hasBlockingDiagnostics(diagnostics)) return finishFailure(diagnostics, options.outputDirectory);

  let referenceImages: readonly ResolvedReferenceImage[];
  try {
    if (typeof input !== 'string' && graph.referenceImages.length > 0 && options.entryPath === undefined) {
      diagnostics.push(createDiagnostic({
        code: 'DSL_REFERENCE_ENTRY_REQUIRED',
        severity: 'error',
        message: 'In-memory declarations with reference images require options.entryPath.',
        semanticPath: graph.referenceImages[0]?.semanticPath,
      }));
      return finishFailure(diagnostics, options.outputDirectory);
    }
    referenceImages = await resolveReferenceImages(
      graph.referenceImages,
      prepared.entryAbsolutePath,
      prepared.projectRoot,
    );
  } catch (error: unknown) {
    diagnostics.push(diagnosticForError(error));
    return finishFailure(diagnostics, options.outputDirectory);
  }

  let lowering: SemanticLoweringResult;
  try {
    lowering = lowerSemanticScene(prepared.scene, graph, profiles, referenceImages);
  } catch (error: unknown) {
    diagnostics.push(diagnosticForError(error));
    return finishFailure(diagnostics, options.outputDirectory);
  }
  diagnostics.push(...lowering.diagnostics);
  if (hasBlockingDiagnostics(diagnostics)) return finishFailure(diagnostics, options.outputDirectory);

  const backend = validateBackendContract(lowering.contract, {
    expectedCatalogUri: profiles.profiles[0]?.profile.schema.catalog.uri,
    expectedSchemaId: profiles.profiles[0]?.profile.schema.contract.id,
    expectedSchemaVersion: profiles.profiles[0]?.profile.schema.contract.version,
  });
  diagnostics.push(...backend.errors.map((error) => createDiagnostic({
    code: error.code,
    severity: 'error',
    message: error.message,
    technicalPath: error.technicalPath,
    semanticPath: semanticPathForTechnicalPath(error.technicalPath, lowering.derivations),
  })));
  const orderedDiagnostics = sortDiagnostics(diagnostics);
  if (!backend.ok || hasBlockingDiagnostics(orderedDiagnostics)) {
    return finishFailure(orderedDiagnostics, options.outputDirectory);
  }

  const index = buildContractIndex(lowering.contract, graph, lowering.derivations, referenceImages);
  const resolvedContractFile = canonicalStringify(lowering.contract);
  const diagnosticsFile = canonicalStringify(orderedDiagnostics);
  const contractIndexFile = canonicalStringify(index);
  const refsFile = renderGeneratedRefs({
    entities: Object.keys(lowering.contract.entities),
    prototypes: Object.keys(lowering.contract.definitions.prototypes),
    relationships: lowering.contract.relationships.map(({ id }) => id),
    systems: lowering.contract.systems.map(({ id }) => id),
  });
  const filesBeforeManifest = {
    'resolved-contract.json': resolvedContractFile,
    'diagnostics.json': diagnosticsFile,
    'contract-index.json': contractIndexFile,
    'contract.refs.ts': refsFile,
  };
  const manifest = buildManifest(
    prepared,
    lowering.semanticProjection,
    profiles,
    referenceImages,
    lowering.contract,
    orderedDiagnostics,
    backend.systemOrder,
    filesBeforeManifest,
  );
  const files: CompilationFiles = {
    ...filesBeforeManifest,
    'build-manifest.json': canonicalStringify(manifest),
  };
  if (options.outputDirectory !== undefined) await emitCompilationFiles(options.outputDirectory, files);
  return {
    ok: true,
    diagnostics: orderedDiagnostics,
    files,
    resolvedContract: lowering.contract,
  };
}

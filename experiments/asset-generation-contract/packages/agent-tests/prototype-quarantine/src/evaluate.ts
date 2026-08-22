import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { compileContract, validateResolvedContract } from '@antiky/contracts/compiler';

import { evaluateAssertions } from './assertions.js';
import {
  checkProtectedInventory,
  listFiles,
  resolveInside,
  writeJson,
} from './files.js';
import {
  evaluationRoot,
  evidenceRoot,
  repositoryRoot,
  workspaceRoot,
} from './paths.js';
import { runProcess } from './process.js';
import { renderEvaluationMarkdown } from './report.js';
import {
  loadExecutionAttemptEvidence,
  loadExecutionEvidence,
  loadPostExecutionWorkspaceInventory,
  loadProtectedInventory,
  loadRunMetadata,
  loadRunTask,
} from './run.js';
import { assertRunId } from './runtime-validation.js';
import type {
  CheckResult,
  EvaluationMode,
  EvaluationReport,
  ExecutionProvenance,
  RunMetadata,
} from './types.js';

export interface EvaluateOptions {
  readonly mode?: EvaluationMode;
}

function result(id: string, label: string, passed: boolean, details: string): CheckResult {
  return { id, label, passed, details };
}

function evaluationMode(options: EvaluateOptions): EvaluationMode {
  const unknownKeys = Object.keys(options).filter((key) => key !== 'mode');
  if (unknownKeys.length > 0) {
    throw new TypeError(`Evaluation options have unknown field(s): ${unknownKeys.join(', ')}.`);
  }
  if (options.mode === undefined) return 'agent';
  if (options.mode !== 'agent' && options.mode !== 'manual') {
    throw new TypeError('Evaluation mode must be agent or manual.');
  }
  return options.mode;
}

async function executionProvenance(
  runId: string,
  metadata: RunMetadata,
  mode: EvaluationMode,
): Promise<{ readonly integrityCheck?: CheckResult; readonly provenance: ExecutionProvenance }> {
  const [attempt, evidence] = await Promise.all([
    loadExecutionAttemptEvidence(runId),
    loadExecutionEvidence(runId),
  ]);
  if (mode === 'manual') {
    if (attempt !== undefined || evidence !== undefined) {
      throw new Error(`Run ${runId} has agent execution-attempt evidence and cannot be evaluated as manual.`);
    }
    return {
      provenance: {
        status: 'manual',
        adapter: metadata.adapter,
        model: metadata.model ?? null,
        adapterVersion: null,
        details: 'Evaluation was explicitly requested in manual mode; no agent execution is claimed.',
        exitCode: null,
        evidenceFile: null,
      },
    };
  }
  if (evidence === undefined) {
    if (attempt !== undefined) {
      if (
        attempt.runId !== runId
        || attempt.adapter !== metadata.adapter
        || metadata.model === undefined
        || attempt.model !== metadata.model
      ) {
        throw new TypeError(`Execution attempt does not match run metadata for ${runId}.`);
      }
      return {
        provenance: {
          status: 'failed',
          adapter: attempt.adapter,
          model: attempt.model,
          adapterVersion: null,
          details: 'Execution was reserved but did not produce complete execution evidence.',
          exitCode: null,
          evidenceFile: 'evidence/execution-attempt.json',
        },
      };
    }
    return {
      provenance: {
        status: 'not-run',
        adapter: metadata.adapter,
        model: metadata.model ?? null,
        adapterVersion: null,
        details: 'No execution evidence exists for this prepared run.',
        exitCode: null,
        evidenceFile: null,
      },
    };
  }
  if (attempt === undefined) {
    throw new TypeError(`Execution evidence for ${runId} has no append-only attempt reservation.`);
  }
  if (
    attempt.runId !== runId
    || attempt.adapter !== metadata.adapter
    || attempt.model !== metadata.model
  ) {
    throw new TypeError(`Execution attempt does not match run metadata for ${runId}.`);
  }
  if (evidence.adapter !== metadata.adapter) {
    throw new TypeError(`Execution adapter does not match run metadata for ${runId}.`);
  }
  if (metadata.model === undefined || evidence.model !== metadata.model) {
    throw new TypeError(`Execution model does not match run metadata for ${runId}.`);
  }
  if (evidence.environment.gitCeilingDirectories !== workspaceRoot(runId)) {
    throw new TypeError(`Execution Git ceiling does not match the run workspace for ${runId}.`);
  }
  const workspaceInventory = await loadPostExecutionWorkspaceInventory(runId);
  if (workspaceInventory.allowedWrites.length !== 0) {
    throw new TypeError(`Post-execution workspace inventory for ${runId} must protect every file.`);
  }
  const integrity = await checkProtectedInventory(workspaceRoot(runId), workspaceInventory);
  const processSucceeded = evidence.exitCode === 0 && evidence.signal === null;
  const succeeded = processSucceeded && integrity.ok;
  return {
    provenance: {
      status: succeeded ? 'succeeded' : 'failed',
      adapter: evidence.adapter,
      model: evidence.model,
      adapterVersion: evidence.adapterVersion,
      details: succeeded
        ? 'The adapter exited successfully and the workspace matches its post-execution inventory.'
        : [
          processSucceeded
            ? undefined
            : `The adapter exited ${String(evidence.exitCode)} with signal ${String(evidence.signal)}.`,
          integrity.ok
            ? undefined
            : `Post-execution workspace drift: ${integrity.violations.join(' | ')}`,
        ].filter((item): item is string => item !== undefined).join(' '),
      exitCode: evidence.exitCode,
      evidenceFile: 'evidence/execution.json',
    },
    integrityCheck: result(
      'isolation:post-execution-workspace',
      'Post-execution workspace byte inventory',
      integrity.ok,
      integrity.ok
        ? `${workspaceInventory.files.length} workspace file(s) still match execution evidence.`
        : integrity.violations.join(' | '),
    ),
  };
}

export function deriveOverallStatus(
  execution: ExecutionProvenance['status'],
  machine: EvaluationReport['machine']['status'],
  human: EvaluationReport['human']['status'],
): EvaluationReport['overallStatus'] {
  if (execution === 'manual') return 'manual';
  if (execution === 'not-run') return 'execution-not-run';
  if (execution === 'failed') return 'execution-failed';
  if (machine === 'fail') return 'machine-failed';
  return human === 'complete' ? 'complete' : 'pending-human-review';
}

async function runTypecheck(runId: string): Promise<CheckResult> {
  const workspace = workspaceRoot(runId);
  const tsc = resolve(repositoryRoot, 'node_modules/typescript/bin/tsc');
  const processResult = await runProcess(
    process.execPath,
    [tsc, '--project', resolve(workspace, 'tsconfig.json'), '--noEmit', '--pretty', 'false'],
    workspace,
  );
  await Promise.all([
    writeFile(resolve(evaluationRoot(runId), 'typecheck.stdout'), processResult.stdout, 'utf8'),
    writeFile(resolve(evaluationRoot(runId), 'typecheck.stderr'), processResult.stderr, 'utf8'),
  ]);
  const passed = processResult.exitCode === 0;
  return result(
    'typescript:typecheck',
    'Strict TypeScript typecheck',
    passed,
    passed
      ? 'tsc exited 0.'
      : `tsc exited ${String(processResult.exitCode)}; see typecheck.stdout and typecheck.stderr.`,
  );
}

async function compareDirectories(left: string, right: string): Promise<CheckResult> {
  const [leftFiles, rightFiles] = await Promise.all([listFiles(left), listFiles(right)]);
  if (JSON.stringify(leftFiles) !== JSON.stringify(rightFiles)) {
    return result(
      'compiler:byte-parity',
      'Compile-twice byte parity for every emitted file',
      false,
      `File lists differ: ${JSON.stringify(leftFiles)} versus ${JSON.stringify(rightFiles)}.`,
    );
  }
  const differences: string[] = [];
  for (const file of leftFiles) {
    const [leftBytes, rightBytes] = await Promise.all([
      readFile(resolveInside(left, file, 'first compile file')),
      readFile(resolveInside(right, file, 'second compile file')),
    ]);
    if (!leftBytes.equals(rightBytes)) differences.push(file);
  }
  return result(
    'compiler:byte-parity',
    'Compile-twice byte parity for every emitted file',
    differences.length === 0,
    differences.length === 0
      ? `${leftFiles.length} emitted file(s) matched byte-for-byte.`
      : `Byte differences: ${differences.join(', ')}.`,
  );
}

interface CompilationEvidence {
  readonly checks: readonly CheckResult[];
  readonly first: Awaited<ReturnType<typeof compileContract>>;
}

async function compileTwice(runId: string, entry: string): Promise<CompilationEvidence> {
  const workspace = workspaceRoot(runId);
  const firstDirectory = resolve(evaluationRoot(runId), 'compile-first');
  const secondDirectory = resolve(evaluationRoot(runId), 'compile-second');
  await Promise.all([
    rm(firstDirectory, { recursive: true, force: true }),
    rm(secondDirectory, { recursive: true, force: true }),
  ]);
  const entryPath = resolveInside(workspace, entry, 'task entry');
  const first = await compileContract(entryPath, {
    outputDirectory: firstDirectory,
    projectRoot: workspace,
  });
  const second = await compileContract(entryPath, {
    outputDirectory: secondDirectory,
    projectRoot: workspace,
  });
  const compileDetails = (which: string, compilation: typeof first): CheckResult => result(
    `compiler:${which}`,
    `${which === 'first' ? 'First' : 'Second'} compilation`,
    compilation.ok,
    compilation.ok
      ? `${Object.keys(compilation.files).length} files emitted with no blocking diagnostics.`
      : compilation.diagnostics.map(({ code, message }) => `${code}: ${message}`).join(' | '),
  );
  return {
    first,
    checks: [
      compileDetails('first', first),
      compileDetails('second', second),
      await compareDirectories(firstDirectory, secondDirectory),
    ],
  };
}

function pendingReport(
  runId: string,
  taskId: string,
  checks: readonly CheckResult[],
  rubric: EvaluationReport['human']['rubric'],
  execution: ExecutionProvenance,
): EvaluationReport {
  const passed = checks.filter((item) => item.passed).length;
  const failed = checks.length - passed;
  return {
    schemaVersion: 2,
    runId,
    taskId,
    evaluatedAt: new Date().toISOString(),
    execution,
    checks,
    machine: {
      status: failed === 0 ? 'pass' : 'fail',
      passed,
      failed,
      maximum: checks.length,
    },
    human: {
      status: 'pending',
      rubric,
      review: null,
      score: null,
      maximum: rubric.length * 4,
    },
    overallStatus: deriveOverallStatus(
      execution.status,
      failed === 0 ? 'pass' : 'fail',
      'pending',
    ),
  };
}

export async function writeEvaluationReport(report: EvaluationReport): Promise<void> {
  const directory = evaluationRoot(report.runId);
  await Promise.all([
    writeJson(resolve(directory, 'evaluation.json'), report),
    writeFile(resolve(directory, 'evaluation.md'), renderEvaluationMarkdown(report), 'utf8'),
  ]);
}

export async function evaluateRun(
  runIdValue: string,
  options: EvaluateOptions = {},
): Promise<EvaluationReport> {
  const runId = assertRunId(runIdValue);
  const mode = evaluationMode(options);
  const [metadata, task, inventory] = await Promise.all([
    loadRunMetadata(runId),
    loadRunTask(runId),
    loadProtectedInventory(runId),
  ]);
  const execution = await executionProvenance(runId, metadata, mode);
  const workspace = workspaceRoot(runId);
  const checks: CheckResult[] = [];
  if (execution.integrityCheck !== undefined) checks.push(execution.integrityCheck);
  const protection = await checkProtectedInventory(workspace, inventory);
  checks.push(result(
    'isolation:protected-inputs',
    'Protected inputs and allowed-write boundary',
    protection.ok,
    protection.ok ? 'All protected hashes match and no out-of-scope writes exist.' : protection.violations.join(' | '),
  ));
  checks.push(await runTypecheck(runId));
  const compilation = await compileTwice(runId, task.entry);
  checks.push(...compilation.checks);

  if (compilation.first.resolvedContract === undefined) {
    checks.push(result(
      'resolved:validation',
      'Resolved-contract validation',
      false,
      'No resolved contract was produced by the first compilation.',
    ));
    checks.push(result(
      'assertions:manifest',
      'Manifest-driven semantic and graph assertions',
      false,
      'Assertions could not run because no resolved contract was produced.',
    ));
  } else {
    const validation = await validateResolvedContract(compilation.first.resolvedContract);
    checks.push(result(
      'resolved:validation',
      'Resolved-contract validation',
      validation.valid,
      validation.valid
        ? `Validated with ${validation.systemOrder.length} systems in dependency order.`
        : validation.diagnostics.map(({ code, message }) => `${code}: ${message}`).join(' | '),
    ));
    const buildManifest = compilation.first.files['build-manifest.json'];
    if (buildManifest === undefined) {
      checks.push(result('assertions:manifest', 'Manifest-driven semantic and graph assertions', false, 'Missing build-manifest.json.'));
    } else {
      checks.push(...await evaluateAssertions(
        workspace,
        compilation.first.resolvedContract,
        buildManifest,
        task,
        resolve(evidenceRoot(runId), 'baseline-resolved-contract.json'),
      ));
    }
  }
  const report = pendingReport(metadata.runId, task.id, checks, task.rubric, execution.provenance);
  await writeEvaluationReport(report);
  return report;
}

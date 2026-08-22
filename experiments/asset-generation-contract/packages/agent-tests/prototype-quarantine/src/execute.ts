import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { adapterPrompt, adapters } from './adapters.js';
import {
  checkProtectedInventory,
  createProtectedInventory,
  isFileError,
  pathExists,
  writeJson,
  writeJsonExclusive,
} from './files.js';
import { record, textValue } from './json.js';
import { evidenceRoot, packageRoot, workspaceRoot } from './paths.js';
import { probeProcess, runProcess } from './process.js';
import { loadProtectedInventory, loadRunMetadata } from './run.js';
import { assertRunId } from './runtime-validation.js';
import type { ExecutionAttemptEvidence, ExecutionEvidence } from './types.js';

export interface ExecutionResult {
  readonly adapterExitCode: number | null;
  readonly protectionPassed: boolean;
  readonly runId: string;
}

async function loadHarnessVersion(): Promise<string> {
  const value: unknown = JSON.parse(
    await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
  ) as unknown;
  return textValue(record(value, 'agent-tests package metadata').version, 'agent-tests package version');
}

async function probeAdapterVersion(
  adapter: (typeof adapters)[keyof typeof adapters],
  cwd: string,
): Promise<string> {
  const result = await probeProcess(adapter.command, adapter.versionArgs, cwd);
  if (result === undefined || result.exitCode !== 0) {
    throw new Error(`Adapter command is unavailable: ${adapter.command}`);
  }
  const version = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/)[0];
  if (version === undefined || version === '') {
    throw new Error(`Adapter command returned no version: ${adapter.command}`);
  }
  return version;
}

export async function executeRun(runIdValue: string): Promise<ExecutionResult> {
  const runId = assertRunId(runIdValue);
  const evidence = evidenceRoot(runId);
  const executionPath = resolve(evidence, 'execution.json');
  const attemptPath = resolve(evidence, 'execution-attempt.json');
  if (await pathExists(executionPath)) {
    throw new Error(`Run ${runId} already has execution evidence; prepare a new run to retry.`);
  }
  const [metadata, inventory] = await Promise.all([
    loadRunMetadata(runId),
    loadProtectedInventory(runId),
  ]);
  if (metadata.model === undefined) {
    throw new Error(`Run ${runId} has no explicit model; prepare a new run with --model before execute.`);
  }
  const attempt: ExecutionAttemptEvidence = {
    schemaVersion: 1,
    runId,
    adapter: metadata.adapter,
    model: metadata.model,
    reservedAt: new Date().toISOString(),
  };
  try {
    await writeJsonExclusive(attemptPath, attempt);
  } catch (error: unknown) {
    if (isFileError(error, 'EEXIST')) {
      throw new Error(`Run ${runId} already has an execution attempt; prepare a new run to retry.`);
    }
    throw error;
  }
  const adapter = adapters[metadata.adapter];
  const workspace = workspaceRoot(runId);
  const invocation = adapter.invocation(workspace, metadata.model, adapterPrompt);
  const [adapterVersion, harnessVersion] = await Promise.all([
    probeAdapterVersion(adapter, workspace),
    loadHarnessVersion(),
  ]);
  const startedAt = new Date().toISOString();
  const result = await runProcess(invocation.command, invocation.args, invocation.cwd, {
    environment: { GIT_CEILING_DIRECTORIES: workspace },
  });
  const finishedAt = new Date().toISOString();
  await mkdir(evidence, { recursive: true });
  await Promise.all([
    writeFile(resolve(evidence, 'transcript.stdout.raw'), result.stdout, 'utf8'),
    writeFile(resolve(evidence, 'transcript.stderr.raw'), result.stderr, 'utf8'),
    writeFile(resolve(evidence, 'final-response.txt'), `${adapter.extractFinalResponse(result.stdout)}\n`, 'utf8'),
  ]);
  const [protection, workspaceInventory] = await Promise.all([
    checkProtectedInventory(workspace, inventory),
    createProtectedInventory(workspace, []),
  ]);
  await Promise.all([
    writeJson(resolve(evidence, 'post-execution-protection.json'), protection),
    writeJson(resolve(evidence, 'post-execution-workspace.json'), workspaceInventory),
  ]);
  const executionEvidence: ExecutionEvidence = {
    schemaVersion: 2,
    adapter: metadata.adapter,
    adapterVersion,
    model: metadata.model,
    command: result.command,
    args: result.args,
    prompt: adapterPrompt,
    startedAt,
    finishedAt,
    exitCode: result.exitCode,
    signal: result.signal,
    stdoutFile: 'transcript.stdout.raw',
    stderrFile: 'transcript.stderr.raw',
    finalResponseFile: 'final-response.txt',
    nodeVersion: process.version,
    harnessVersion,
    environment: { gitCeilingDirectories: workspace },
    workspaceInventoryFile: 'post-execution-workspace.json',
  };
  await writeJsonExclusive(executionPath, executionEvidence);
  return {
    runId,
    adapterExitCode: result.exitCode,
    protectionPassed: protection.ok,
  };
}

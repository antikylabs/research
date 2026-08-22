import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { isFileError } from './files.js';
import {
  assertRunId,
  parseExecutionAttemptEvidence,
  parseExecutionEvidence,
  parseProtectedInventory,
  parseRunMetadata,
} from './runtime-validation.js';
import { evidenceRoot, runRoot } from './paths.js';
import { parseTaskManifest } from './task-manifest.js';
import type {
  ExecutionEvidence,
  ExecutionAttemptEvidence,
  ProtectedInventory,
  RunMetadata,
  TaskManifest,
} from './types.js';

async function readUnknownJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export async function loadRunMetadata(runIdValue: string): Promise<RunMetadata> {
  const runId = assertRunId(runIdValue);
  const metadata = parseRunMetadata(
    await readUnknownJson(resolve(runRoot(runId), 'run.json')),
    `${runId}/run.json`,
  );
  if (metadata.runId !== runId) throw new TypeError(`Run metadata id does not match ${runId}.`);
  return metadata;
}

export async function loadRunTask(runIdValue: string): Promise<TaskManifest> {
  const runId = assertRunId(runIdValue);
  const metadata = await loadRunMetadata(runId);
  const snapshotPath = resolve(evidenceRoot(runId), 'task-manifest.json');
  let parsed: unknown;
  try {
    parsed = await readUnknownJson(snapshotPath);
  } catch (error: unknown) {
    if (isFileError(error, 'ENOENT')) {
      throw new Error(`Run ${runId} has no evaluator task snapshot; prepare a new run.`);
    }
    throw error;
  }
  const task = parseTaskManifest(parsed, `${runId}/evidence/task-manifest.json`);
  if (task.id !== metadata.taskId) {
    throw new TypeError(`Evaluator task snapshot id does not match ${metadata.taskId}.`);
  }
  return task;
}

export async function loadProtectedInventory(runIdValue: string): Promise<ProtectedInventory> {
  const runId = assertRunId(runIdValue);
  return parseProtectedInventory(
    await readUnknownJson(resolve(evidenceRoot(runId), 'protected-inputs.json')),
    `${runId}/protected-inputs.json`,
  );
}

export async function loadExecutionEvidence(
  runIdValue: string,
): Promise<ExecutionEvidence | undefined> {
  const runId = assertRunId(runIdValue);
  try {
    return parseExecutionEvidence(
      await readUnknownJson(resolve(evidenceRoot(runId), 'execution.json')),
      `${runId}/evidence/execution.json`,
    );
  } catch (error: unknown) {
    if (isFileError(error, 'ENOENT')) return undefined;
    throw error;
  }
}

export async function loadExecutionAttemptEvidence(
  runIdValue: string,
): Promise<ExecutionAttemptEvidence | undefined> {
  const runId = assertRunId(runIdValue);
  try {
    return parseExecutionAttemptEvidence(
      await readUnknownJson(resolve(evidenceRoot(runId), 'execution-attempt.json')),
      `${runId}/evidence/execution-attempt.json`,
    );
  } catch (error: unknown) {
    if (isFileError(error, 'ENOENT')) return undefined;
    throw error;
  }
}

export async function loadPostExecutionWorkspaceInventory(
  runIdValue: string,
): Promise<ProtectedInventory> {
  const runId = assertRunId(runIdValue);
  return parseProtectedInventory(
    await readUnknownJson(resolve(evidenceRoot(runId), 'post-execution-workspace.json')),
    `${runId}/evidence/post-execution-workspace.json`,
  );
}

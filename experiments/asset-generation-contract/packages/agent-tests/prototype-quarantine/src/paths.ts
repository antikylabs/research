import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertRunId } from './runtime-validation.js';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export const repositoryRoot = resolve(packageRoot, '../..');
export const tasksRoot = resolve(packageRoot, 'tasks');
export const runsRoot = resolve(packageRoot, 'runs');

export function runRoot(runId: string): string {
  return resolve(runsRoot, assertRunId(runId));
}

export function workspaceRoot(runId: string): string {
  return resolve(runRoot(runId), 'workspace');
}

export function evidenceRoot(runId: string): string {
  return resolve(runRoot(runId), 'evidence');
}

export function evaluationRoot(runId: string): string {
  return resolve(runRoot(runId), 'evaluation');
}

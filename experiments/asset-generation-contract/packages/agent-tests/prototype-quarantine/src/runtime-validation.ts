import {
  arrayOf,
  exactKeys,
  integerValue,
  literalValue,
  oneOf,
  record,
  textValue,
} from './json.js';
import { adapterIds } from './types.js';
import type {
  AdapterId,
  ExecutionAttemptEvidence,
  ExecutionEvidence,
  HumanReviewInput,
  HumanScore,
  ProtectedFileHash,
  ProtectedInventory,
  RunMetadata,
} from './types.js';

export function parseAdapterId(value: unknown, context = 'adapter'): AdapterId {
  return oneOf(value, adapterIds, context);
}

export function assertRunId(value: unknown, context = 'run id'): string {
  const runId = textValue(value, context);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
    throw new TypeError(`${context} contains unsafe characters.`);
  }
  return runId;
}

export function parseRunMetadata(value: unknown, context = 'run metadata'): RunMetadata {
  const item = record(value, context);
  exactKeys(item, context, ['schemaVersion', 'runId', 'taskId', 'adapter', 'createdAt'], ['model']);
  const model = item.model === undefined ? undefined : textValue(item.model, `${context}.model`);
  return {
    schemaVersion: literalValue(item.schemaVersion, 1, `${context}.schemaVersion`),
    runId: assertRunId(item.runId, `${context}.runId`),
    taskId: textValue(item.taskId, `${context}.taskId`),
    adapter: parseAdapterId(item.adapter, `${context}.adapter`),
    createdAt: textValue(item.createdAt, `${context}.createdAt`),
    ...(model === undefined ? {} : { model }),
  };
}

export function parseExecutionEvidence(
  value: unknown,
  context = 'execution evidence',
): ExecutionEvidence {
  const item = record(value, context);
  exactKeys(item, context, [
    'schemaVersion',
    'adapter',
    'adapterVersion',
    'model',
    'command',
    'args',
    'prompt',
    'startedAt',
    'finishedAt',
    'exitCode',
    'signal',
    'stdoutFile',
    'stderrFile',
    'finalResponseFile',
    'nodeVersion',
    'harnessVersion',
    'environment',
    'workspaceInventoryFile',
  ]);
  const environment = record(item.environment, `${context}.environment`);
  exactKeys(environment, `${context}.environment`, ['gitCeilingDirectories']);
  return {
    schemaVersion: literalValue(item.schemaVersion, 2, `${context}.schemaVersion`),
    adapter: parseAdapterId(item.adapter, `${context}.adapter`),
    adapterVersion: textValue(item.adapterVersion, `${context}.adapterVersion`),
    model: textValue(item.model, `${context}.model`),
    command: textValue(item.command, `${context}.command`),
    args: arrayOf(item.args, `${context}.args`, textValue),
    prompt: textValue(item.prompt, `${context}.prompt`),
    startedAt: textValue(item.startedAt, `${context}.startedAt`),
    finishedAt: textValue(item.finishedAt, `${context}.finishedAt`),
    exitCode: item.exitCode === null
      ? null
      : integerValue(item.exitCode, `${context}.exitCode`),
    signal: item.signal === null ? null : textValue(item.signal, `${context}.signal`),
    stdoutFile: textValue(item.stdoutFile, `${context}.stdoutFile`),
    stderrFile: textValue(item.stderrFile, `${context}.stderrFile`),
    finalResponseFile: textValue(item.finalResponseFile, `${context}.finalResponseFile`),
    nodeVersion: textValue(item.nodeVersion, `${context}.nodeVersion`),
    harnessVersion: textValue(item.harnessVersion, `${context}.harnessVersion`),
    environment: {
      gitCeilingDirectories: textValue(
        environment.gitCeilingDirectories,
        `${context}.environment.gitCeilingDirectories`,
      ),
    },
    workspaceInventoryFile: literalValue(
      item.workspaceInventoryFile,
      'post-execution-workspace.json',
      `${context}.workspaceInventoryFile`,
    ),
  };
}

export function parseExecutionAttemptEvidence(
  value: unknown,
  context = 'execution attempt evidence',
): ExecutionAttemptEvidence {
  const item = record(value, context);
  exactKeys(item, context, ['schemaVersion', 'runId', 'adapter', 'model', 'reservedAt']);
  return {
    schemaVersion: literalValue(item.schemaVersion, 1, `${context}.schemaVersion`),
    runId: assertRunId(item.runId, `${context}.runId`),
    adapter: parseAdapterId(item.adapter, `${context}.adapter`),
    model: textValue(item.model, `${context}.model`),
    reservedAt: textValue(item.reservedAt, `${context}.reservedAt`),
  };
}

function parseProtectedFile(value: unknown, context: string): ProtectedFileHash {
  const item = record(value, context);
  exactKeys(item, context, ['path', 'sha256']);
  const sha256 = textValue(item.sha256, `${context}.sha256`);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError(`${context}.sha256 must be lowercase SHA-256.`);
  return { path: textValue(item.path, `${context}.path`), sha256 };
}

export function parseProtectedInventory(value: unknown, context = 'protected inventory'): ProtectedInventory {
  const item = record(value, context);
  exactKeys(item, context, ['schemaVersion', 'algorithm', 'allowedWrites', 'files']);
  return {
    schemaVersion: literalValue(item.schemaVersion, 1, `${context}.schemaVersion`),
    algorithm: literalValue(item.algorithm, 'sha256', `${context}.algorithm`),
    allowedWrites: arrayOf(item.allowedWrites, `${context}.allowedWrites`, textValue),
    files: arrayOf(item.files, `${context}.files`, parseProtectedFile),
  };
}

function parseHumanScore(value: unknown, context: string): HumanScore {
  const item = record(value, context);
  exactKeys(item, context, ['criterionId', 'score', 'notes']);
  const score = integerValue(item.score, `${context}.score`);
  if (score < 0 || score > 4) throw new TypeError(`${context}.score must be an integer from 0 through 4.`);
  return {
    criterionId: textValue(item.criterionId, `${context}.criterionId`),
    score,
    notes: textValue(item.notes, `${context}.notes`),
  };
}

export function parseHumanReviewInput(value: unknown, context = 'human review'): HumanReviewInput {
  const item = record(value, context);
  exactKeys(item, context, ['reviewer', 'scores']);
  const scores = arrayOf(item.scores, `${context}.scores`, parseHumanScore);
  if (new Set(scores.map(({ criterionId }) => criterionId)).size !== scores.length) {
    throw new TypeError(`${context}.scores contains duplicate criterion ids.`);
  }
  return { reviewer: textValue(item.reviewer, `${context}.reviewer`), scores };
}

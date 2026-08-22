import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { executeRun } from '../src/execute.js';
import { pathExists, writeJson } from '../src/files.js';
import { evidenceRoot, packageRoot, runRoot, workspaceRoot } from '../src/paths.js';
import { prepareRun } from '../src/prepare.js';
import { runProcess } from '../src/process.js';

const createdRuns: string[] = [];

function runId(label: string): string {
  const id = `test-${label}-${randomUUID()}`;
  createdRuns.push(id);
  return id;
}

afterEach(async () => {
  await Promise.all(createdRuns.splice(0).map((id) => rm(runRoot(id), { recursive: true, force: true })));
});

describe('append-only execution', () => {
  it('refuses an existing execution record before invoking an adapter', async () => {
    const id = runId('existing-execution');
    await prepareRun('author-quiet-canal-market', {
      adapter: 'codex',
      model: 'test/model',
      runId: id,
    });
    await writeJson(resolve(evidenceRoot(id), 'execution.json'), { alreadyRecorded: true });

    await expect(executeRun(id)).rejects.toThrow('already has execution evidence');
    expect(await pathExists(resolve(evidenceRoot(id), 'transcript.stdout.raw'))).toBe(false);
  });

  it('refuses a pre-existing exclusive attempt reservation before probing an adapter', async () => {
    const id = runId('existing-attempt');
    await prepareRun('author-quiet-canal-market', {
      adapter: 'codex',
      model: 'test/model',
      runId: id,
    });
    await writeJson(resolve(evidenceRoot(id), 'execution-attempt.json'), {
      schemaVersion: 1,
      runId: id,
      adapter: 'codex',
      model: 'test/model',
      reservedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(executeRun(id)).rejects.toThrow('already has an execution attempt');
    expect(await pathExists(resolve(evidenceRoot(id), 'transcript.stdout.raw'))).toBe(false);
  });

  it('requires a model before reserving an execution attempt', async () => {
    const id = runId('missing-model');
    await prepareRun('author-quiet-canal-market', { adapter: 'codex', runId: id });

    await expect(executeRun(id)).rejects.toThrow('has no explicit model');
    expect(await pathExists(resolve(evidenceRoot(id), 'execution-attempt.json'))).toBe(false);
  });
});

describe('child process environment', () => {
  it('preserves the process environment while setting the run workspace as the Git ceiling', async () => {
    const ceiling = workspaceRoot('test-environment-probe');
    const script = [
      'const value = {',
      '  ceiling: process.env.GIT_CEILING_DIRECTORIES,',
      "  pathPreserved: typeof process.env.PATH === 'string' && process.env.PATH.length > 0,",
      '};',
      'process.stdout.write(JSON.stringify(value));',
    ].join('\n');
    const result = await runProcess(process.execPath, ['--eval', script], packageRoot, {
      environment: { GIT_CEILING_DIRECTORIES: ceiling },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout) as unknown).toEqual({ ceiling, pathPreserved: true });
  });
});

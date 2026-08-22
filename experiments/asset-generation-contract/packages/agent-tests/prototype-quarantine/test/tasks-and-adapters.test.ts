import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { adapterPrompt, adapters } from '../src/adapters.js';
import { evaluationCommandExitCode } from '../src/cli.js';
import { parseTaskManifest } from '../src/task-manifest.js';
import { listTasks } from '../src/tasks.js';
import { packageRoot, runRoot, workspaceRoot } from '../src/paths.js';
import { listFiles, sha256File } from '../src/files.js';
import { prepareRun } from '../src/prepare.js';
import { runProcess } from '../src/process.js';
import type { AdapterId } from '../src/types.js';

const createdRuns: string[] = [];

function runId(label: string): string {
  const id = `test-${label}-${randomUUID()}`;
  createdRuns.push(id);
  return id;
}

afterEach(async () => {
  await Promise.all(createdRuns.splice(0).map((id) => rm(runRoot(id), { recursive: true, force: true })));
});

describe('task and adapter registry', () => {
  it('loads both real task manifests with strict unknown-field rejection', async () => {
    const tasks = await listTasks();
    expect(tasks.map(({ id }) => id)).toEqual([
      'author-quiet-canal-market',
      'revise-blue-winter-grove',
    ]);
    expect(tasks.every(({ rubric }) => rubric.length === 4)).toBe(true);
    const expectedGuidance = [
      'docs/usage-docs/reference/dsl.md',
      'docs/usage-docs/how-to/compile-and-validate.md',
      'docs/usage-docs/how-to/organize-large-contracts.md',
    ];
    for (const task of tasks) {
      expect(task.seeds.filter(({ source }) => source.startsWith('docs/usage-docs')).map(({ source }) => source))
        .toEqual(expectedGuidance);
    }

    const raw: unknown = JSON.parse(await readFile(
      resolve(packageRoot, 'tasks/author-quiet-canal-market/task.json'),
      'utf8',
    )) as unknown;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Fixture manifest is malformed.');
    expect(() => parseTaskManifest({ ...raw, unexpectedOracle: true })).toThrow(/unknown field/);
  });

  it('builds direct argv invocations for every adapter with one shared prompt', () => {
    const workspace = '/tmp/contracts-agent-test-workspace';
    const expected: Readonly<Record<AdapterId, readonly string[]>> = {
      codex: [
        'exec',
        '--json',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        '--cd',
        workspace,
        '--model',
        'provider/model',
        adapterPrompt,
      ],
      claude: [
        '--print',
        '--output-format',
        'stream-json',
        '--verbose',
        '--permission-mode',
        'acceptEdits',
        '--no-session-persistence',
        '--model',
        'provider/model',
        adapterPrompt,
      ],
      opencode: [
        'run',
        '--format',
        'json',
        '--pure',
        '--dir',
        workspace,
        '--model',
        'provider/model',
        adapterPrompt,
      ],
    };
    expect(Object.keys(adapters).sort()).toEqual(['claude', 'codex', 'opencode']);
    for (const adapter of Object.values(adapters)) {
      const invocation = adapter.invocation(workspace, 'provider/model', adapterPrompt);
      expect(invocation.command).toBe(adapter.command);
      expect(invocation.cwd).toBe(workspace);
      expect(invocation.args).toEqual(expected[adapter.id]);
    }
    expect(adapterPrompt).toContain('do not inspect parent or outside-workspace files');
  });

  it('extracts final responses from each raw event format and falls back without discarding output', () => {
    expect(adapters.codex.extractFinalResponse([
      '{"type":"thread.started","thread_id":"one"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"Codex final"}}',
    ].join('\n'))).toBe('Codex final');
    expect(adapters.claude.extractFinalResponse([
      '{"type":"assistant","message":{"content":[]}}',
      '{"type":"result","result":"Claude final"}',
    ].join('\n'))).toBe('Claude final');
    expect(adapters.opencode.extractFinalResponse([
      '{"type":"step_start"}',
      '{"type":"message.part.updated","part":{"type":"text","text":"OpenCode final"}}',
    ].join('\n'))).toBe('OpenCode final');
    expect(adapters.codex.extractFinalResponse('not-json\nraw fallback')).toBe('not-json\nraw fallback');
  });

  it('uses execution provenance for default CLI exits while preserving explicit manual evaluation', () => {
    expect(evaluationCommandExitCode('pass', 'succeeded', false)).toBe(0);
    expect(evaluationCommandExitCode('pass', 'not-run', false)).toBe(1);
    expect(evaluationCommandExitCode('pass', 'failed', false)).toBe(1);
    expect(evaluationCommandExitCode('pass', 'manual', true)).toBe(0);
    expect(evaluationCommandExitCode('fail', 'succeeded', false)).toBe(1);
    expect(evaluationCommandExitCode('fail', 'manual', true)).toBe(1);
  });

  it('runs the built public CLI entry for tasks and doctor', async () => {
    const cli = resolve(packageRoot, 'dist/cli.js');
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'contracts-agent-bin-'));
    const bin = resolve(temporaryDirectory, 'contracts-agent-tests');
    try {
      await symlink(cli, bin);
      const tasks = await runProcess(process.execPath, [bin, 'tasks', '--json'], packageRoot);
      expect(tasks.exitCode).toBe(0);
      expect(JSON.parse(tasks.stdout) as unknown).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'author-quiet-canal-market' }),
        expect.objectContaining({ id: 'revise-blue-winter-grove' }),
      ]));
      const diagnosis = await runProcess(process.execPath, [bin, 'doctor', '--json'], packageRoot);
      expect(diagnosis.exitCode).toBe(0);
      expect(JSON.parse(diagnosis.stdout) as unknown).toEqual(expect.objectContaining({ coreReady: true }));
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

describe('adapter-neutral preparation', () => {
  it('copies identical agent-visible inputs without exposing task.json or the Quiet oracle', async () => {
    const ids: Readonly<Record<AdapterId, string>> = {
      codex: runId('prepare-codex'),
      claude: runId('prepare-claude'),
      opencode: runId('prepare-opencode'),
    };
    for (const adapter of Object.keys(ids) as readonly AdapterId[]) {
      await prepareRun('author-quiet-canal-market', { adapter, model: 'matrix/model', runId: ids[adapter] });
    }
    const baselineFiles = await listFiles(workspaceRoot(ids.codex));
    expect(baselineFiles).toContain('TASK.md');
    expect(baselineFiles).not.toContain('task.json');
    expect(baselineFiles.some((path) => path.endsWith('quiet-canal-market.contract.ts'))).toBe(false);
    expect(baselineFiles.some((path) => path.startsWith('guidance/'))).toBe(true);
    expect(baselineFiles.filter((path) => path.startsWith('guidance/'))).toEqual([
      'guidance/how-to/compile-and-validate.md',
      'guidance/how-to/organize-large-contracts.md',
      'guidance/reference/dsl.md',
    ]);
    const guidance = await Promise.all(
      baselineFiles
        .filter((path) => path.startsWith('guidance/'))
        .map((path) => readFile(resolve(workspaceRoot(ids.codex), path), 'utf8')),
    );
    expect(guidance.join('\n')).not.toMatch(/Quiet Canal Market|quiet-canal-market/i);

    const baselineHashes = await Promise.all(
      baselineFiles.map((path) => sha256File(resolve(workspaceRoot(ids.codex), path))),
    );
    for (const adapter of ['claude', 'opencode'] as const) {
      const files = await listFiles(workspaceRoot(ids[adapter]));
      const hashes = await Promise.all(files.map((path) => sha256File(resolve(workspaceRoot(ids[adapter]), path))));
      expect(files).toEqual(baselineFiles);
      expect(hashes).toEqual(baselineHashes);
    }
  });
});

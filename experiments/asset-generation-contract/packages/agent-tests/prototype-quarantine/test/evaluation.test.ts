import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { evaluateRun } from '../src/evaluate.js';
import { createProtectedInventory, resolveInside, writeJson } from '../src/files.js';
import { record } from '../src/json.js';
import { prepareRun } from '../src/prepare.js';
import { ingestReview } from '../src/review.js';
import {
  evaluationRoot,
  evidenceRoot,
  runRoot,
  tasksRoot,
  workspaceRoot,
} from '../src/paths.js';
import type { AdapterId, ExecutionEvidence } from '../src/types.js';

const createdRuns: string[] = [];

function runId(label: string): string {
  const id = `test-${label}-${randomUUID()}`;
  createdRuns.push(id);
  return id;
}

afterEach(async () => {
  await Promise.all(createdRuns.splice(0).map((id) => rm(runRoot(id), { recursive: true, force: true })));
});

const passingQuietSubmission = `import { region, scene, voxelDiorama } from '@antiky/contracts/dsl';

const canals = region({ name: 'Canals', purpose: ['primary streets'] });
const market = region({ name: 'Market district' });
const residential = region({ name: 'Residential district' });
const dock = region({ name: 'Dock district' });

export default scene({
  key: 'quiet-canal-market',
  name: 'Quiet Canal Market',
  profiles: [voxelDiorama],
  experience: {
    fantasy: 'A fantasy canal town inspired by layered JRPG towns.',
    firstRead: ['canals as primary streets', 'arched stone bridges', 'market, residential, and dock districts'],
    closerLook: [
      'stucco, brick, wood, and stone architecture',
      'window boxes, lanterns, cracked plaster, moss, and trim',
      'varied cobblestones with cracks and moss',
      'boats, crates, barrels, awnings, signs, and plants',
    ],
  },
  visual: {
    language: 'fantasy canal town inspired by layered JRPG towns',
    avoid: ['Minecraft style', 'generic German cottage style'],
  },
  cast: { canals, market, residential, dock },
  rules: {
    must: [
      'facades have depth',
      'cobblestone size varies from source values 2–7 without an inferred unit',
      'cobblestone height varies',
      'cobblestone includes cracks and moss',
    ],
    avoid: ['flat walls', 'cobblestone tiling', 'empty facades'],
  },
  acceptance: {
    review: [
      'Is shopfront density high?',
      'Are empty facades absent?',
      'Are Minecraft-like forms absent?',
      'Are generic German cottage forms absent?',
    ],
  },
});
`;

const failingQuietSubmission = `import { scene, voxelDiorama } from '@antiky/contracts/dsl';

export default scene({
  key: 'quiet-canal-market',
  name: 'Quiet Canal Market',
  profiles: [voxelDiorama],
  acceptance: { review: ['One review only'] },
});
`;

async function applyBlueRevision(workspace: string): Promise<void> {
  const layoutPath = resolveInside(
    workspace,
    'src/blue-winter-grove/blue-winter-grove.layout.ts',
    'layout path',
  );
  const contractPath = resolveInside(
    workspace,
    'src/blue-winter-grove/blue-winter-grove.contract.ts',
    'contract path',
  );
  const layout = (await readFile(layoutPath, 'utf8'))
    .replace('amount: between(28, 42)', 'amount: between(32, 38)')
    .replace(
      "leave: ['a broad opening aligned with the creek', 'gaps into misty deep forest']",
      "leave: [\n      'a broad opening aligned with the creek',\n      'gaps into misty deep forest',\n      'two clear sightlines from the creek into the grove',\n    ]",
    );
  const contract = (await readFile(contractPath, 'utf8'))
    .replace('expected: between(28, 42)', 'expected: between(32, 38)')
    .replace(
      "'Can every important visual decision be traced to a tagged reference image?',",
      "'Can every important visual decision be traced to a tagged reference image?',\n      'Do two clear sightlines carry the eye from the creek into the grove?',",
    );
  await Promise.all([
    writeFile(layoutPath, layout, 'utf8'),
    writeFile(contractPath, contract, 'utf8'),
  ]);
}

async function recordExecutionEvidence(
  id: string,
  adapter: AdapterId,
  model: string,
  exitCode = 0,
): Promise<void> {
  const workspace = workspaceRoot(id);
  const inventory = await createProtectedInventory(workspace, []);
  const execution: ExecutionEvidence = {
    schemaVersion: 2,
    adapter,
    adapterVersion: `${adapter} test fixture 1.0.0`,
    model,
    command: adapter,
    args: ['test-fixture'],
    prompt: 'Test fixture; no external agent was invoked.',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    exitCode,
    signal: null,
    stdoutFile: 'transcript.stdout.raw',
    stderrFile: 'transcript.stderr.raw',
    finalResponseFile: 'final-response.txt',
    nodeVersion: process.version,
    harnessVersion: '0.1.0-test',
    environment: { gitCeilingDirectories: workspace },
    workspaceInventoryFile: 'post-execution-workspace.json',
  };
  await Promise.all([
    writeJson(resolve(evidenceRoot(id), 'execution-attempt.json'), {
      schemaVersion: 1,
      runId: id,
      adapter,
      model,
      reservedAt: '2026-01-01T00:00:00.000Z',
    }),
    writeJson(resolve(evidenceRoot(id), 'post-execution-workspace.json'), inventory),
    writeJson(resolve(evidenceRoot(id), 'execution.json'), execution),
  ]);
}

describe('end-to-end evaluation', () => {
  it('prepares and evaluates a passing authored contract, then ingests a complete 0-4 review', async () => {
    const id = runId('passing-quiet');
    await prepareRun('author-quiet-canal-market', {
      adapter: 'codex',
      model: 'test/codex-model',
      runId: id,
    });
    await writeFile(
      resolve(workspaceRoot(id), 'src/quiet-canal-market.contract.ts'),
      passingQuietSubmission,
      'utf8',
    );
    await recordExecutionEvidence(id, 'codex', 'test/codex-model');
    const report = await evaluateRun(id);
    expect(report.execution.status).toBe('succeeded');
    expect(report.machine.status).toBe('pass');
    expect(report.human.status).toBe('pending');
    expect(report.overallStatus).toBe('pending-human-review');
    expect(report.checks.find(({ id: checkId }) => checkId === 'compiler:byte-parity')?.passed).toBe(true);
    expect(report.checks.find(({ id: checkId }) => checkId === 'resolved:validation')?.passed).toBe(true);
    expect(await readFile(resolve(evaluationRoot(id), 'evaluation.json'), 'utf8')).toContain('"status": "pending"');
    expect(await readFile(resolve(evaluationRoot(id), 'evaluation.md'), 'utf8')).toContain('Machine checks and human judgement');

    const reviewPath = resolve(evaluationRoot(id), 'review-input.json');
    await writeFile(reviewPath, `${JSON.stringify({
      reviewer: 'Harness test reviewer',
      scores: report.human.rubric.map(({ id: criterionId }) => ({
        criterionId,
        score: 0,
        notes: 'Criterion checked against the prepared submission.',
      })),
    }, null, 2)}\n`, 'utf8');
    const reviewed = await ingestReview(id, reviewPath);
    expect(reviewed.human.status).toBe('complete');
    expect(reviewed.human.score).toBe(0);
    expect(reviewed.overallStatus).toBe('complete');
  });

  it('keeps evaluation and review bound to the task manifest captured at prepare time', async () => {
    const taskId = `snapshot-probe-${randomUUID()}`;
    const taskDirectory = resolve(tasksRoot, taskId);
    const canonicalTaskPath = resolve(taskDirectory, 'task.json');
    try {
      const sourceTaskDirectory = resolve(tasksRoot, 'author-quiet-canal-market');
      const sourceManifest = record(
        JSON.parse(await readFile(resolve(sourceTaskDirectory, 'task.json'), 'utf8')) as unknown,
        'source task manifest',
      );
      const temporaryManifest = { ...sourceManifest, id: taskId };
      await mkdir(taskDirectory, { recursive: true });
      await Promise.all([
        writeFile(canonicalTaskPath, `${JSON.stringify(temporaryManifest, null, 2)}\n`, 'utf8'),
        writeFile(
          resolve(taskDirectory, 'TASK.md'),
          await readFile(resolve(sourceTaskDirectory, 'TASK.md')),
        ),
      ]);

      const id = runId('manifest-snapshot');
      await prepareRun(taskId, { adapter: 'codex', runId: id });
      await writeFile(
        resolve(workspaceRoot(id), 'src/quiet-canal-market.contract.ts'),
        passingQuietSubmission,
        'utf8',
      );
      const assertions = record(sourceManifest.assertions, 'temporary task assertions');
      if (!Array.isArray(assertions.entityIds)) throw new Error('Temporary entity assertion is malformed.');
      await writeFile(canonicalTaskPath, `${JSON.stringify({
        ...temporaryManifest,
        assertions: {
          ...assertions,
          entityIds: [...assertions.entityIds, 'scene.changed-after-prepare'],
        },
      }, null, 2)}\n`, 'utf8');

      const report = await evaluateRun(id, { mode: 'manual' });
      expect(report.machine.status).toBe('pass');
      expect(report.execution.status).toBe('manual');
      expect(report.overallStatus).toBe('manual');
      const snapshot = await readFile(resolve(evidenceRoot(id), 'task-manifest.json'), 'utf8');
      expect(snapshot).toContain('region.quiet-canal-market.canals');
      expect(snapshot).not.toContain('scene.changed-after-prepare');
      expect(await readFile(resolve(workspaceRoot(id), 'TASK.md'), 'utf8')).toContain('zero prototypes');

      await rm(taskDirectory, { recursive: true, force: true });
      const reviewPath = resolve(evaluationRoot(id), 'snapshot-review.json');
      await writeFile(reviewPath, `${JSON.stringify({
        reviewer: 'Snapshot test reviewer',
        scores: report.human.rubric.map(({ id: criterionId }) => ({
          criterionId,
          score: 4,
          notes: 'Scored against the task snapshot stored with the prepared run.',
        })),
      }, null, 2)}\n`, 'utf8');
      const reviewed = await ingestReview(id, reviewPath, { mode: 'manual' });
      expect(reviewed.overallStatus).toBe('manual');
      expect(reviewed.human.score).toBe(16);
    } finally {
      await rm(taskDirectory, { recursive: true, force: true });
    }
  });

  it('invalidates successful execution provenance after an allowed submission file changes', async () => {
    const id = runId('post-execution-drift');
    await prepareRun('author-quiet-canal-market', {
      adapter: 'codex',
      model: 'test/codex-model',
      runId: id,
    });
    const submission = resolve(workspaceRoot(id), 'src/quiet-canal-market.contract.ts');
    await writeFile(submission, passingQuietSubmission, 'utf8');
    await recordExecutionEvidence(id, 'codex', 'test/codex-model');
    await appendFile(submission, '\n// changed after recorded execution\n', 'utf8');

    const report = await evaluateRun(id);
    expect(report.execution.status).toBe('failed');
    expect(report.execution.details).toContain('Post-execution workspace drift');
    expect(report.overallStatus).toBe('execution-failed');
    expect(
      report.checks.find(({ id: checkId }) => checkId === 'isolation:post-execution-workspace')?.passed,
    ).toBe(false);
    expect(report.checks.filter(({ passed }) => !passed).map(({ id: checkId }) => checkId)).toEqual([
      'isolation:post-execution-workspace',
    ]);
  });

  it('reports a reserved but incomplete execution attempt as failed', async () => {
    const id = runId('partial-execution');
    await prepareRun('author-quiet-canal-market', {
      adapter: 'opencode',
      model: 'test/provider-model',
      runId: id,
    });
    await writeFile(
      resolve(workspaceRoot(id), 'src/quiet-canal-market.contract.ts'),
      passingQuietSubmission,
      'utf8',
    );
    await writeJson(resolve(evidenceRoot(id), 'execution-attempt.json'), {
      schemaVersion: 1,
      runId: id,
      adapter: 'opencode',
      model: 'test/provider-model',
      reservedAt: '2026-01-01T00:00:00.000Z',
    });

    const report = await evaluateRun(id);
    expect(report.machine.status).toBe('pass');
    expect(report.execution.status).toBe('failed');
    expect(report.execution.evidenceFile).toBe('evidence/execution-attempt.json');
    expect(report.overallStatus).toBe('execution-failed');
  });

  it('evaluates a compiling but structurally failing submission', async () => {
    const id = runId('failing-quiet');
    await prepareRun('author-quiet-canal-market', {
      adapter: 'claude',
      model: 'test/claude-model',
      runId: id,
    });
    await writeFile(
      resolve(workspaceRoot(id), 'src/quiet-canal-market.contract.ts'),
      failingQuietSubmission,
      'utf8',
    );
    await recordExecutionEvidence(id, 'claude', 'test/claude-model', 1);
    const report = await evaluateRun(id);
    expect(report.execution.status).toBe('failed');
    expect(report.overallStatus).toBe('execution-failed');
    expect(report.machine.status).toBe('fail');
    expect(report.checks.find(({ id: checkId }) => checkId === 'typescript:typecheck')?.passed).toBe(true);
    expect(report.checks.find(({ id: checkId }) => checkId === 'compiler:first')?.passed).toBe(true);
    expect(report.checks.find(({ id: checkId }) => checkId === 'graph:entities')?.passed).toBe(false);
    expect(report.checks.find(({ id: checkId }) => checkId === 'resolved:semantic-review-count')?.passed).toBe(false);
  });

  it('rejects a compiling raw technical override even when every structural gate passes', async () => {
    const id = runId('technical-quiet');
    await prepareRun('author-quiet-canal-market', { adapter: 'claude', runId: id });
    const technicalSubmission = passingQuietSubmission.replace(
      "const canals = region({ name: 'Canals', purpose: ['primary streets'] });",
      "const canals = region({\n  name: 'Canals',\n  purpose: ['primary streets'],\n  technical : { components: { 'layout.clearance': { allowGroundCover: true } } },\n});",
    );
    await writeFile(
      resolve(workspaceRoot(id), 'src/quiet-canal-market.contract.ts'),
      technicalSubmission,
      'utf8',
    );
    const report = await evaluateRun(id);
    expect(report.execution.status).toBe('not-run');
    expect(report.overallStatus).toBe('execution-not-run');
    expect(report.checks.find(({ id: checkId }) => checkId === 'compiler:first')?.passed).toBe(true);
    expect(report.checks.find(({ id: checkId }) => checkId === 'graph:entities')?.passed).toBe(true);
    expect(report.checks.find(({ id: checkId }) => checkId === 'resolved:no-technical-authoring')?.passed).toBe(false);
    expect(report.machine.status).toBe('fail');
  });

  it('detects a protected-input modification independently of contract success', async () => {
    const id = runId('protected-input');
    await prepareRun('author-quiet-canal-market', { adapter: 'opencode', runId: id });
    await writeFile(
      resolve(workspaceRoot(id), 'src/quiet-canal-market.contract.ts'),
      passingQuietSubmission,
      'utf8',
    );
    await appendFile(resolve(workspaceRoot(id), 'TASK.md'), '\nunauthorized edit\n', 'utf8');
    await writeFile(resolve(workspaceRoot(id), 'NOT_ALLOWED.md'), 'out-of-scope write\n', 'utf8');
    const report = await evaluateRun(id, { mode: 'manual' });
    const protection = report.checks.find(({ id: checkId }) => checkId === 'isolation:protected-inputs');
    expect(protection?.passed).toBe(false);
    expect(protection?.details).toContain('protected file modified: TASK.md');
    expect(protection?.details).toContain('write outside allowed paths: NOT_ALLOWED.md');
  });

  it('evaluates the exact bounded Blue Winter Grove revision with baseline parity', async () => {
    const id = runId('passing-blue');
    await prepareRun('revise-blue-winter-grove', { adapter: 'codex', runId: id });
    const workspace = workspaceRoot(id);
    await applyBlueRevision(workspace);
    const report = await evaluateRun(id, { mode: 'manual' });
    expect(
      report.checks.filter(({ passed }) => !passed),
      JSON.stringify(report.checks.filter(({ passed }) => !passed), null, 2),
    ).toEqual([]);
    expect(report.checks.find(({ id: checkId }) => checkId === 'resolved:baseline-parity')?.passed).toBe(true);
    expect(report.checks.find(({ id: checkId }) => checkId === 'graph:references')?.passed).toBe(true);
    expect(report.checks.find(({ id: checkId }) => checkId === 'graph:relationships')?.passed).toBe(true);
  });

  it('rejects unrelated semantic drift after the exact Blue Winter Grove revision', async () => {
    const id = runId('drift-blue');
    await prepareRun('revise-blue-winter-grove', { adapter: 'opencode', runId: id });
    const workspace = workspaceRoot(id);
    await applyBlueRevision(workspace);
    const contractPath = resolveInside(
      workspace,
      'src/blue-winter-grove/blue-winter-grove.contract.ts',
      'contract path',
    );
    const contract = (await readFile(contractPath, 'utf8')).replace(
      'Guide three companions into a quiet winter grove where careful observation makes the place feel alive.',
      'Guide three companions into a loud winter grove where hasty movement makes the place feel dangerous.',
    );
    await writeFile(contractPath, contract, 'utf8');
    const report = await evaluateRun(id, { mode: 'manual' });
    expect(report.checks.filter(({ passed }) => !passed).map(({ id: checkId }) => checkId)).toEqual([
      'resolved:baseline-parity',
    ]);
  });
});

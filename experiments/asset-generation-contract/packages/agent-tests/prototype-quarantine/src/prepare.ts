import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { compileContract, validateResolvedContract } from '@antiky/contracts/compiler';

import {
  copyTree,
  createProtectedInventory,
  pathExists,
  resolveInside,
  writeJson,
} from './files.js';
import {
  evidenceRoot,
  evaluationRoot,
  packageRoot,
  repositoryRoot,
  runRoot,
  tasksRoot,
  workspaceRoot,
} from './paths.js';
import { assertRunId } from './runtime-validation.js';
import { loadTask } from './tasks.js';
import type { AdapterId, RunMetadata } from './types.js';

export interface PrepareOptions {
  readonly adapter: AdapterId;
  readonly model?: string;
  readonly runId?: string;
}

export interface PreparedRun {
  readonly metadata: RunMetadata;
  readonly path: string;
}

function defaultRunId(taskId: string, adapter: AdapterId): string {
  const timestamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, '');
  return `${taskId}-${adapter}-${timestamp}-${randomUUID().slice(0, 8)}`;
}

async function writeWorkspaceScaffold(workspace: string): Promise<void> {
  await mkdir(resolve(workspace, 'src'), { recursive: true });
  await writeJson(resolve(workspace, 'package.json'), {
    name: '@antiky/contracts-agent-submission',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: { '@antiky/contracts': '0.1.0' },
  });
  await writeJson(resolve(workspace, 'tsconfig.json'), {
    compilerOptions: {
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      lib: ['ES2023'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      noUncheckedIndexedAccess: true,
      strict: true,
      target: 'ES2023',
      types: ['node'],
      useUnknownInCatchVariables: true,
      verbatimModuleSyntax: true,
    },
    include: ['src/**/*.ts'],
  });
}

async function prepareBaseline(runId: string, entry: string, workspace: string): Promise<void> {
  const output = resolve(evidenceRoot(runId), 'baseline-compile');
  const result = await compileContract(resolveInside(workspace, entry, 'task entry'), {
    outputDirectory: output,
    projectRoot: workspace,
  });
  if (!result.ok || result.resolvedContract === undefined) {
    const messages = result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join('\n');
    throw new Error(`Unable to compile the seeded baseline.\n${messages}`);
  }
  const validation = await validateResolvedContract(result.resolvedContract);
  if (!validation.valid) throw new Error('Seeded baseline did not pass resolved-contract validation.');
  const resolvedContract = result.files['resolved-contract.json'];
  if (resolvedContract === undefined) throw new Error('Seeded baseline did not emit resolved-contract.json.');
  await writeFile(
    resolve(evidenceRoot(runId), 'baseline-resolved-contract.json'),
    resolvedContract,
    'utf8',
  );
}

async function copyNeutralTaskFiles(taskId: string, workspace: string): Promise<void> {
  const source = resolve(tasksRoot, taskId, 'TASK.md');
  const target = resolve(workspace, 'TASK.md');
  await copyTree(source, target);
  const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
  if (!sourceBytes.equals(targetBytes)) throw new Error('TASK.md was not copied byte-for-byte.');
}

export async function prepareRun(taskId: string, options: PrepareOptions): Promise<PreparedRun> {
  const task = await loadTask(taskId);
  const runId = assertRunId(options.runId ?? defaultRunId(taskId, options.adapter));
  const root = runRoot(runId);
  if (await pathExists(root)) throw new Error(`Run already exists: ${runId}`);

  const workspace = workspaceRoot(runId);
  await Promise.all([
    mkdir(workspace, { recursive: true }),
    mkdir(evidenceRoot(runId), { recursive: true }),
    mkdir(evaluationRoot(runId), { recursive: true }),
  ]);
  await writeJson(resolve(evidenceRoot(runId), 'task-manifest.json'), task);
  await writeWorkspaceScaffold(workspace);
  await copyNeutralTaskFiles(task.id, workspace);
  for (const [index, seed] of task.seeds.entries()) {
    const source = resolveInside(repositoryRoot, seed.source, `seeds[${index}].source`);
    if (!(await pathExists(source))) {
      if (seed.optional) continue;
      throw new Error(`Required seed input does not exist: ${seed.source}`);
    }
    const target = resolveInside(workspace, seed.target, `seeds[${index}].target`);
    await copyTree(source, target);
  }

  if (task.assertions.baseline !== undefined) await prepareBaseline(runId, task.entry, workspace);
  const inventory = await createProtectedInventory(workspace, task.allowedWrites);
  await writeJson(resolve(evidenceRoot(runId), 'protected-inputs.json'), inventory);

  const metadata: RunMetadata = {
    schemaVersion: 1,
    runId,
    taskId: task.id,
    adapter: options.adapter,
    createdAt: new Date().toISOString(),
    ...(options.model === undefined ? {} : { model: options.model }),
  };
  await writeJson(resolve(root, 'run.json'), metadata);
  return { metadata, path: root };
}

export const agentTestsPackageRoot = packageRoot;

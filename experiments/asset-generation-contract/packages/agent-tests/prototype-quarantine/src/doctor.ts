import { resolve } from 'node:path';

import { adapters } from './adapters.js';
import { pathExists } from './files.js';
import { packageRoot, repositoryRoot } from './paths.js';
import { probeProcess } from './process.js';
import { listTasks } from './tasks.js';
import type { AdapterId } from './types.js';

export interface DoctorAdapterResult {
  readonly available: boolean;
  readonly id: AdapterId;
  readonly version: string | null;
}

export interface DoctorReport {
  readonly adapters: readonly DoctorAdapterResult[];
  readonly coreReady: boolean;
  readonly inputs: Readonly<Record<string, boolean>>;
  readonly taskIds: readonly string[];
}

export async function doctor(): Promise<DoctorReport> {
  const taskIds = (await listTasks()).map(({ id }) => id);
  const inputPaths = {
    compiler: resolve(repositoryRoot, 'packages/contracts/dist/compiler/index.js'),
    dslTypes: resolve(repositoryRoot, 'packages/contracts/dist/dsl/index.d.ts'),
    typescript: resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
    usageDocs: resolve(repositoryRoot, 'docs/usage-docs'),
  };
  const inputEntries = await Promise.all(
    Object.entries(inputPaths).map(async ([name, path]) => [name, await pathExists(path)] as const),
  );
  const inputs = Object.fromEntries(inputEntries);
  const adapterResults = await Promise.all(
    Object.values(adapters).map(async (adapter): Promise<DoctorAdapterResult> => {
      const probe = await probeProcess(adapter.command, adapter.versionArgs, packageRoot);
      if (probe === undefined) return { id: adapter.id, available: false, version: null };
      const output = `${probe.stdout}\n${probe.stderr}`.trim().split(/\r?\n/)[0] ?? '';
      return {
        id: adapter.id,
        available: probe.exitCode === 0,
        version: output || null,
      };
    }),
  );
  return {
    adapters: adapterResults,
    inputs,
    coreReady: inputs.compiler === true
      && inputs.dslTypes === true
      && inputs.typescript === true
      && inputs.usageDocs === true,
    taskIds,
  };
}

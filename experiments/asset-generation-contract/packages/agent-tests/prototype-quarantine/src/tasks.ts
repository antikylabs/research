import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseTaskManifest } from './task-manifest.js';
import { tasksRoot } from './paths.js';
import type { TaskManifest } from './types.js';

export async function loadTask(taskId: string): Promise<TaskManifest> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(taskId)) {
    throw new TypeError(`Invalid task id ${JSON.stringify(taskId)}.`);
  }
  const manifestPath = resolve(tasksRoot, taskId, 'task.json');
  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  const manifest = parseTaskManifest(parsed, `${taskId}/task.json`);
  if (manifest.id !== taskId) {
    throw new TypeError(`${taskId}/task.json declares mismatched id ${JSON.stringify(manifest.id)}.`);
  }
  return manifest;
}

export async function listTasks(): Promise<readonly TaskManifest[]> {
  const entries = await readdir(tasksRoot, { withFileTypes: true });
  const taskIds = entries
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .sort();
  return Promise.all(taskIds.map(loadTask));
}

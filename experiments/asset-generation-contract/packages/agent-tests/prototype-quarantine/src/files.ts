import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import type { ProtectedFileHash, ProtectedInventory } from './types.js';

export function portablePath(path: string): string {
  return path.split(sep).join('/');
}

export function resolveInside(root: string, path: string, context: string): string {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\')) {
    throw new TypeError(`${context} must be a non-empty portable relative path.`);
  }
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || resolve(root) === absolute) {
    throw new TypeError(`${context} escapes its root.`);
  }
  return absolute;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error: unknown) {
    if (isFileError(error, 'ENOENT')) return false;
    throw error;
  }
}

export function isFileError(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && typeof error.code === 'string'
    && error.code === code;
}

export async function copyTree(source: string, target: string): Promise<void> {
  const stats = await lstat(source);
  if (stats.isSymbolicLink()) throw new TypeError(`Seed input cannot be a symbolic link: ${source}`);
  if (stats.isDirectory()) {
    await mkdir(target, { recursive: true });
    const entries = (await readdir(source, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await copyTree(resolve(source, entry.name), resolve(target, entry.name));
    }
    return;
  }
  if (!stats.isFile()) throw new TypeError(`Seed input must be a regular file or directory: ${source}`);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

export async function listFiles(root: string): Promise<readonly string[]> {
  if (!(await pathExists(root))) return [];
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new TypeError(`Workspace cannot contain symbolic links: ${absolute}`);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        result.push(portablePath(relative(root, absolute)));
      } else {
        throw new TypeError(`Workspace contains a non-regular entry: ${absolute}`);
      }
    }
  }
  await visit(root);
  return result;
}

export async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export function isAllowedWrite(path: string, allowedWrites: readonly string[]): boolean {
  return allowedWrites.some((allowed) => {
    if (allowed.endsWith('/**')) {
      const prefix = allowed.slice(0, -3);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === allowed;
  });
}

export async function createProtectedInventory(
  workspace: string,
  allowedWrites: readonly string[],
): Promise<ProtectedInventory> {
  const files: ProtectedFileHash[] = [];
  for (const path of await listFiles(workspace)) {
    if (!isAllowedWrite(path, allowedWrites)) {
      files.push({ path, sha256: await sha256File(resolveInside(workspace, path, 'inventory path')) });
    }
  }
  return { schemaVersion: 1, algorithm: 'sha256', allowedWrites, files };
}

export interface ProtectionResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

export async function checkProtectedInventory(
  workspace: string,
  inventory: ProtectedInventory,
): Promise<ProtectionResult> {
  const expected = new Map(inventory.files.map((file) => [file.path, file.sha256] as const));
  const current = await listFiles(workspace);
  const currentSet = new Set(current);
  const violations: string[] = [];
  for (const [path, hash] of expected) {
    if (!currentSet.has(path)) {
      violations.push(`protected file deleted: ${path}`);
      continue;
    }
    const actual = await sha256File(resolveInside(workspace, path, 'protected path'));
    if (actual !== hash) violations.push(`protected file modified: ${path}`);
  }
  for (const path of current) {
    if (!expected.has(path) && !isAllowedWrite(path, inventory.allowedWrites)) {
      violations.push(`write outside allowed paths: ${path}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeJsonExclusive(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

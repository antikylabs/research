import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { ReferenceImage } from '../dsl/index.js';
import { sha256Bytes } from './canonical.js';

export interface UnresolvedReferenceUse {
  readonly image: ReferenceImage;
  readonly ownerId: string;
  readonly semanticPath: string;
  readonly use: string;
}

export interface ResolvedReferenceUse {
  readonly ownerId: string;
  readonly semanticPath: string;
  readonly use: string;
}

export interface ResolvedReferenceImage {
  readonly path: string;
  readonly sha256: string;
  readonly uses: readonly ResolvedReferenceUse[];
}

export class ReferenceImageError extends Error {
  readonly code: string;
  readonly semanticPath: string;

  constructor(code: string, message: string, semanticPath: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReferenceImageError';
    this.code = code;
    this.semanticPath = semanticPath;
  }
}

function isWithin(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

function entryRelativePath(entryPath: string, targetPath: string): string {
  const normalized = relative(dirname(entryPath), targetPath).split(sep).join('/');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

function compareUses(left: ResolvedReferenceUse, right: ResolvedReferenceUse): number {
  if (left.semanticPath !== right.semanticPath) {
    return left.semanticPath < right.semanticPath ? -1 : 1;
  }
  if (left.ownerId !== right.ownerId) {
    return left.ownerId < right.ownerId ? -1 : 1;
  }
  return left.use < right.use ? -1 : left.use > right.use ? 1 : 0;
}

/** Resolve image bytes once per entry-relative path while preserving every declaration-use edge. */
export async function resolveReferenceImages(
  uses: readonly UnresolvedReferenceUse[],
  entryPath: string,
  projectRoot: string,
): Promise<readonly ResolvedReferenceImage[]> {
  const realProjectRoot = await realpath(projectRoot);
  const records = new Map<string, { absolutePath: string; path: string; uses: ResolvedReferenceUse[] }>();

  for (const referenceUse of uses) {
    const authoredPath = referenceUse.image.path;
    if (typeof authoredPath !== 'string' || authoredPath.length === 0 || isAbsolute(authoredPath)) {
      throw new ReferenceImageError(
        'DSL_REFERENCE_PATH',
        'Reference image paths must be non-empty and entry-relative.',
        `${referenceUse.semanticPath}.image.path`,
      );
    }

    const absolutePath = resolve(dirname(entryPath), authoredPath);
    if (!isWithin(projectRoot, absolutePath)) {
      throw new ReferenceImageError(
        'DSL_REFERENCE_OUTSIDE_PROJECT',
        `Reference image leaves the project: ${authoredPath}`,
        `${referenceUse.semanticPath}.image.path`,
      );
    }

    let realImagePath: string;
    try {
      realImagePath = await realpath(absolutePath);
    } catch (error: unknown) {
      throw new ReferenceImageError(
        'DSL_REFERENCE_MISSING',
        `Reference image does not exist: ${authoredPath}`,
        `${referenceUse.semanticPath}.image.path`,
        { cause: error },
      );
    }
    if (!isWithin(realProjectRoot, realImagePath)) {
      throw new ReferenceImageError(
        'DSL_REFERENCE_OUTSIDE_PROJECT',
        `Reference image resolves outside the project: ${authoredPath}`,
        `${referenceUse.semanticPath}.image.path`,
      );
    }

    const normalizedPath = entryRelativePath(entryPath, absolutePath);
    const record = records.get(normalizedPath) ?? { absolutePath: realImagePath, path: normalizedPath, uses: [] };
    record.uses.push({
      ownerId: referenceUse.ownerId,
      semanticPath: referenceUse.semanticPath,
      use: referenceUse.use,
    });
    records.set(normalizedPath, record);
  }

  const resolvedImages: ResolvedReferenceImage[] = [];
  for (const record of [...records.values()].sort((left, right) => (left.path < right.path ? -1 : 1))) {
    const bytes = await readFile(record.absolutePath);
    resolvedImages.push({
      path: record.path,
      sha256: sha256Bytes(bytes),
      uses: record.uses.sort(compareUses),
    });
  }
  return resolvedImages;
}

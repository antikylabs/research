import { describe, expect, it } from 'vitest';

import { evaluateRun } from '../src/evaluate.js';
import { executeRun } from '../src/execute.js';
import { evidenceRoot, evaluationRoot, runRoot, workspaceRoot } from '../src/paths.js';
import { ingestReview } from '../src/review.js';
import {
  loadProtectedInventory,
  loadRunMetadata,
  loadRunTask,
} from '../src/run.js';

describe('run path boundary', () => {
  it('rejects traversal before every programmatic run operation can resolve a path', async () => {
    const unsafeRunId = '../outside-runs-root';
    const operations: readonly (() => Promise<unknown>)[] = [
      () => executeRun(unsafeRunId),
      () => evaluateRun(unsafeRunId),
      () => ingestReview(unsafeRunId, 'unused-review.json'),
      () => loadRunMetadata(unsafeRunId),
      () => loadRunTask(unsafeRunId),
      () => loadProtectedInventory(unsafeRunId),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toThrow('run id contains unsafe characters');
    }
  });

  it('rejects traversal at every run-directory resolver', () => {
    for (const resolver of [runRoot, workspaceRoot, evidenceRoot, evaluationRoot]) {
      expect(() => resolver('../outside-runs-root')).toThrow('run id contains unsafe characters');
    }
  });
});

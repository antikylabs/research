import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot, repositoryRoot } from '../src/paths.js';

describe('harness documentation and package shape', () => {
  it('documents every CLI command, adapter, scoring boundary, and isolation caveat', async () => {
    const readme = await readFile(resolve(packageRoot, 'README.md'), 'utf8');
    for (const command of ['tasks', 'doctor', 'prepare', 'execute', 'evaluate', 'review']) {
      expect(readme).toContain(` ${command}`);
    }
    for (const adapter of ['Codex', 'Claude', 'OpenCode', 'Other provider through OpenCode']) {
      expect(readme).toContain(adapter);
    }
    expect(readme).toContain('instruction-level read isolation, not OS-level read isolation');
    expect(readme).toContain('It does not plan future artifacts, generate game assets');
    expect(readme).toContain('integer from 0 through 4');
    expect(readme).toContain('scores describe quality');
    expect(readme).toContain('requested command/argv');
    expect(readme).toContain('GIT_CEILING_DIRECTORIES');
    expect(readme).toContain('execution-attempt.json');
    expect(readme).toContain('does not invoke a model or prove authentication/model access');
    expect(readme).toContain('task-manifest.json        strict evaluator oracle frozen');
    expect(readme).toContain('affects newly prepared runs only');
  });

  it('discloses every restrictive Quiet Canal Market graph gate to the agent', async () => {
    const task = await readFile(
      resolve(packageRoot, 'tasks/author-quiet-canal-market/TASK.md'),
      'utf8',
    );
    for (const disclosure of [
      'zero population entities',
      'zero prototypes',
      'zero relationships',
      'zero references',
      'exactly one purpose item: `primary streets`',
      'Keep bridges, architecture, ground, and props as scene-level semantic prose',
    ]) {
      expect(task).toContain(disclosure);
    }
  });

  it('links to shipped usage docs and real examples that exist', async () => {
    const linkedTargets = [
      'docs/usage-docs/README.md',
      'docs/usage-docs/quick-start.md',
      'docs/usage-docs/reference/dsl.md',
      'docs/usage-docs/how-to/compile-and-validate.md',
      'packages/examples/README.md',
      'packages/examples/src/quiet-canal-market/quiet-canal-market.contract.ts',
      'packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts',
    ];
    for (const target of linkedTargets) {
      expect((await stat(resolve(repositoryRoot, target))).isFile()).toBe(true);
    }
  });

  it('keeps every production TypeScript module below 500 physical lines', async () => {
    const moduleNames = [
      'adapters.ts',
      'assertions.ts',
      'cli.ts',
      'doctor.ts',
      'evaluate.ts',
      'execute.ts',
      'files.ts',
      'index.ts',
      'json.ts',
      'paths.ts',
      'prepare.ts',
      'process.ts',
      'report.ts',
      'review.ts',
      'run.ts',
      'runtime-validation.ts',
      'task-manifest.ts',
      'tasks.ts',
      'types.ts',
    ];
    for (const moduleName of moduleNames) {
      const source = await readFile(resolve(packageRoot, 'src', moduleName), 'utf8');
      expect(source.split('\n').length, moduleName).toBeLessThan(500);
    }
  });
});

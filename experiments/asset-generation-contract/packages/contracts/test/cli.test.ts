import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { runCli, type CliIo } from '../src/cli.js';

const semanticEntry = fileURLToPath(
  new URL('../../examples/src/blue-winter-grove/blue-winter-grove.contract.ts', import.meta.url),
);
const resolvedFixture = fileURLToPath(
  new URL('../../../docs/asset-contract/blue_winter_grove.scene.json', import.meta.url),
);
const installedBinary = fileURLToPath(
  new URL('../../../node_modules/.bin/antiky-contract', import.meta.url),
);
const execFileAsync = promisify(execFile);
const successfulOutputNames = [
  'build-manifest.json',
  'contract-index.json',
  'contract.refs.ts',
  'diagnostics.json',
  'resolved-contract.json',
] as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'antiky-contract-cli-test-'));
  temporaryDirectories.push(path);
  return path;
}

function captureIo(): {
  readonly io: CliIo;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    },
    stdout,
    stderr,
  };
}

describe('public contract CLI', () => {
  it('runs the installed executable through its workspace symlink', async () => {
    const { stdout, stderr } = await execFileAsync(installedBinary, ['--help']);

    expect(stderr).toBe('');
    expect(stdout).toContain('antiky-contract compile <entry.contract.ts>');
    expect(stdout).toContain('antiky-contract validate <resolved-contract.json>');
  });

  it('compiles the real semantic fixture to five files, then leaves only diagnostics after a blocking failure', async () => {
    const outputDirectory = await temporaryDirectory();
    const success = captureIo();

    const successCode = await runCli(
      ['compile', semanticEntry, '--out', outputDirectory],
      success.io,
    );

    expect(successCode).toBe(0);
    expect(success.stderr).toEqual([]);
    expect(success.stdout.join('')).toMatch(/5 files, 0 errors/u);
    expect((await readdir(outputDirectory)).sort()).toEqual(successfulOutputNames);
    for (const fileName of successfulOutputNames) {
      await expect(readFile(join(outputDirectory, fileName))).resolves.not.toHaveLength(0);
    }

    const failure = captureIo();
    const missingEntry = join(dirname(semanticEntry), 'missing-blue-winter-grove.contract.ts');
    const failureCode = await runCli(
      ['compile', missingEntry, '--out', outputDirectory],
      failure.io,
    );

    expect(failureCode).toBe(1);
    expect(failure.stdout).toEqual([]);
    expect(failure.stderr.join('')).toContain('DSL_ENTRY_MISSING');
    expect(failure.stderr.join('')).toMatch(/Compilation failed with 1 diagnostic\(s\)\./u);
    expect(await readdir(outputDirectory)).toEqual(['diagnostics.json']);
    expect(JSON.parse(await readFile(join(outputDirectory, 'diagnostics.json'), 'utf8'))).toEqual([
      expect.objectContaining({ code: 'DSL_ENTRY_MISSING', severity: 'error' }),
    ]);
  });

  it('validates the real resolved fixture and returns failure for an invalid copy', async () => {
    const success = captureIo();
    const successCode = await runCli(['validate', resolvedFixture], success.io);

    expect(successCode).toBe(0);
    expect(success.stderr).toEqual([]);
    expect(success.stdout.join('')).toMatch(/0 errors, 18 systems\./u);

    const invalidDirectory = await temporaryDirectory();
    const invalidPath = join(invalidDirectory, 'invalid-resolved-contract.json');
    const invalidFixture = JSON.parse(await readFile(resolvedFixture, 'utf8')) as Record<string, unknown>;
    invalidFixture.schemaVersion = '9.9.9';
    await writeFile(invalidPath, `${JSON.stringify(invalidFixture)}\n`, 'utf8');

    const failure = captureIo();
    const failureCode = await runCli(['validate', invalidPath], failure.io);

    expect(failureCode).toBe(1);
    expect(failure.stdout).toEqual([]);
    expect(failure.stderr.join('')).toContain('CONTRACT_SCHEMA_VERSION');
    expect(failure.stderr.join('')).toMatch(/Validation failed with \d+ error\(s\)\./u);
  });

  it('uses exit code 2 for invocation errors', async () => {
    const missingCommand = captureIo();
    expect(await runCli([], missingCommand.io)).toBe(2);
    expect(missingCommand.stdout.join('')).toContain('antiky-contract compile');
    expect(missingCommand.stderr).toEqual([]);

    const unknownCommand = captureIo();
    expect(await runCli(['unknown'], unknownCommand.io)).toBe(2);
    expect(unknownCommand.stdout).toEqual([]);
    expect(unknownCommand.stderr.join('')).toContain('Unknown command "unknown"');
  });
});

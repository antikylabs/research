#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { compileContract, validateResolvedContract } from './compiler/index.js';
import { formatDiagnostic, type Diagnostic } from './compiler/diagnostics.js';

export interface CliIo {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

const usage = `Usage:
  antiky-contract compile <entry.contract.ts> --out <directory>
  antiky-contract validate <resolved-contract.json>
`;

function defaultIo(): CliIo {
  return {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
  };
}

function writeDiagnostics(diagnostics: readonly Diagnostic[], io: CliIo): void {
  for (const diagnostic of diagnostics) io.stderr(`${formatDiagnostic(diagnostic)}\n`);
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

/** Run the public CLI through the same programmatic APIs used by library callers and tests. */
export async function runCli(args: readonly string[], io: CliIo = defaultIo()): Promise<number> {
  const command = args[0];
  if (command === undefined || command === '--help' || command === '-h') {
    io.stdout(usage);
    return command === undefined ? 2 : 0;
  }

  if (command === 'compile') {
    const entry = args[1];
    const outputDirectory = optionValue(args, '--out');
    if (entry === undefined || outputDirectory === undefined) {
      io.stderr(usage);
      return 2;
    }
    const result = await compileContract(entry, { outputDirectory });
    if (!result.ok) {
      writeDiagnostics(result.diagnostics, io);
      io.stderr(`Compilation failed with ${result.diagnostics.length} diagnostic(s).\n`);
      return 1;
    }
    io.stdout(`Compiled ${entry} to ${outputDirectory}: ${Object.keys(result.files).length} files, 0 errors.\n`);
    return 0;
  }

  if (command === 'validate') {
    const contractPath = args[1];
    if (contractPath === undefined) {
      io.stderr(usage);
      return 2;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(contractPath, 'utf8')) as unknown;
    } catch (error: unknown) {
      io.stderr(`Unable to read ${contractPath}: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    const result = await validateResolvedContract(parsed);
    if (!result.valid) {
      writeDiagnostics(result.diagnostics, io);
      io.stderr(`Validation failed with ${result.diagnostics.length} error(s).\n`);
      return 1;
    }
    io.stdout(`Validated ${contractPath}: 0 errors, ${result.systemOrder.length} systems.\n`);
    return 0;
  }

  io.stderr(`Unknown command ${JSON.stringify(command)}.\n${usage}`);
  return 2;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === realpathSync(invokedPath)) {
  process.exitCode = await runCli(process.argv.slice(2));
}

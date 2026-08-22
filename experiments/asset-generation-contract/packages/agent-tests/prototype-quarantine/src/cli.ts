#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { adapters } from './adapters.js';
import { doctor } from './doctor.js';
import { evaluateRun } from './evaluate.js';
import { executeRun } from './execute.js';
import { prepareRun } from './prepare.js';
import { ingestReview } from './review.js';
import { assertRunId, parseAdapterId } from './runtime-validation.js';
import { listTasks } from './tasks.js';
import type { EvaluationReport } from './types.js';

export interface CliIo {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

const usage = `Usage:
  contracts-agent-tests tasks [--json]
  contracts-agent-tests doctor [--json]
  contracts-agent-tests prepare <task-id> --adapter <codex|claude|opencode> [--model <model>] [--run <run-id>]
  contracts-agent-tests execute <run-id>
  contracts-agent-tests evaluate <run-id> [--manual]
  contracts-agent-tests review <run-id> --input <review.json> [--manual]
`;

function defaultIo(): CliIo {
  return {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
  };
}

interface ParsedOptions {
  readonly flags: ReadonlySet<string>;
  readonly values: ReadonlyMap<string, string>;
}

function parseOptions(
  args: readonly string[],
  valueNames: readonly string[],
  flagNames: readonly string[] = [],
): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueSet = new Set(valueNames);
  const flagSet = new Set(flagNames);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === undefined || !name.startsWith('--')) throw new TypeError(`Unexpected argument ${JSON.stringify(name)}.`);
    if (flagSet.has(name)) {
      if (flags.has(name)) throw new TypeError(`Duplicate option ${name}.`);
      flags.add(name);
      continue;
    }
    if (!valueSet.has(name)) throw new TypeError(`Unknown option ${name}.`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new TypeError(`Option ${name} requires a value.`);
    if (values.has(name)) throw new TypeError(`Duplicate option ${name}.`);
    values.set(name, value);
    index += 1;
  }
  return { flags, values };
}

function requiredOption(options: ParsedOptions, name: string): string {
  const value = options.values.get(name);
  if (value === undefined) throw new TypeError(`Missing required option ${name}.`);
  return value;
}

export function evaluationCommandExitCode(
  machine: EvaluationReport['machine']['status'],
  execution: EvaluationReport['execution']['status'],
  manual: boolean,
): 0 | 1 {
  return machine === 'pass' && (manual || execution === 'succeeded') ? 0 : 1;
}

async function runTasks(args: readonly string[], io: CliIo): Promise<number> {
  const options = parseOptions(args, [], ['--json']);
  const tasks = await listTasks();
  if (options.flags.has('--json')) {
    io.stdout(`${JSON.stringify(tasks.map(({ id, title, summary }) => ({ id, title, summary })), null, 2)}\n`);
  } else {
    for (const task of tasks) io.stdout(`${task.id}\t${task.title}\n`);
  }
  return 0;
}

async function runDoctor(args: readonly string[], io: CliIo): Promise<number> {
  const options = parseOptions(args, [], ['--json']);
  const report = await doctor();
  if (options.flags.has('--json')) {
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    io.stdout(`Core: ${report.coreReady ? 'ready' : 'not ready'}\n`);
    for (const adapter of report.adapters) {
      io.stdout(`${adapter.id}: ${adapter.available ? adapter.version : 'unavailable'}\n`);
    }
  }
  return report.coreReady ? 0 : 1;
}

async function runPrepare(taskId: string | undefined, args: readonly string[], io: CliIo): Promise<number> {
  if (taskId === undefined) throw new TypeError('prepare requires a task id.');
  const options = parseOptions(args, ['--adapter', '--model', '--run']);
  const adapter = parseAdapterId(requiredOption(options, '--adapter'));
  const prepared = await prepareRun(taskId, {
    adapter,
    ...(options.values.get('--model') === undefined ? {} : { model: options.values.get('--model') }),
    ...(options.values.get('--run') === undefined ? {} : { runId: options.values.get('--run') }),
  });
  io.stdout(`${prepared.metadata.runId}\n`);
  return 0;
}

async function runExecute(runIdValue: string | undefined, args: readonly string[], io: CliIo): Promise<number> {
  if (runIdValue === undefined) throw new TypeError('execute requires a run id.');
  parseOptions(args, []);
  const outcome = await executeRun(assertRunId(runIdValue));
  io.stdout(`${JSON.stringify(outcome, null, 2)}\n`);
  return outcome.adapterExitCode === 0 && outcome.protectionPassed ? 0 : 1;
}

async function runEvaluate(runIdValue: string | undefined, args: readonly string[], io: CliIo): Promise<number> {
  if (runIdValue === undefined) throw new TypeError('evaluate requires a run id.');
  const options = parseOptions(args, [], ['--manual']);
  const report = await evaluateRun(assertRunId(runIdValue), {
    mode: options.flags.has('--manual') ? 'manual' : 'agent',
  });
  io.stdout(`${report.machine.passed}/${report.machine.maximum} machine checks passed; ${report.overallStatus}.\n`);
  return evaluationCommandExitCode(
    report.machine.status,
    report.execution.status,
    options.flags.has('--manual'),
  );
}

async function runReview(runIdValue: string | undefined, args: readonly string[], io: CliIo): Promise<number> {
  if (runIdValue === undefined) throw new TypeError('review requires a run id.');
  const options = parseOptions(args, ['--input'], ['--manual']);
  const report = await ingestReview(
    assertRunId(runIdValue),
    resolve(requiredOption(options, '--input')),
    { mode: options.flags.has('--manual') ? 'manual' : 'agent' },
  );
  io.stdout(`Human score ${report.human.score}/${report.human.maximum}; ${report.overallStatus}.\n`);
  return evaluationCommandExitCode(
    report.machine.status,
    report.execution.status,
    options.flags.has('--manual'),
  );
}

export async function runCli(args: readonly string[], io: CliIo = defaultIo()): Promise<number> {
  const command = args[0];
  if (command === undefined || command === '--help' || command === '-h') {
    io.stdout(usage);
    return command === undefined ? 2 : 0;
  }
  try {
    switch (command) {
      case 'tasks': return await runTasks(args.slice(1), io);
      case 'doctor': return await runDoctor(args.slice(1), io);
      case 'prepare': return await runPrepare(args[1], args.slice(2), io);
      case 'execute': return await runExecute(args[1], args.slice(2), io);
      case 'evaluate': return await runEvaluate(args[1], args.slice(2), io);
      case 'review': return await runReview(args[1], args.slice(2), io);
      default:
        io.stderr(`Unknown command ${JSON.stringify(command)}.\n${usage}`);
        return 2;
    }
  } catch (error: unknown) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === realpathSync(resolve(invokedPath))) {
  process.exitCode = await runCli(process.argv.slice(2));
}

export const adapterNames = Object.keys(adapters);

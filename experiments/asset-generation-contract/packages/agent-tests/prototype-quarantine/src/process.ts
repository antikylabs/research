import { spawn } from 'node:child_process';

export interface ProcessResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
}

export interface ProcessOptions {
  readonly environment?: Readonly<Record<string, string>>;
}

export function runProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  return new Promise((fulfill, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...options.environment },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      fulfill({
        command,
        args,
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

export async function probeProcess(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<ProcessResult | undefined> {
  try {
    return await runProcess(command, args, cwd);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

import type { AdapterId } from './types.js';

export interface AdapterInvocation {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
}

export interface AdapterDefinition {
  readonly command: string;
  readonly id: AdapterId;
  readonly label: string;
  readonly versionArgs: readonly string[];
  readonly invocation: (workspace: string, model: string | undefined, prompt: string) => AdapterInvocation;
  readonly extractFinalResponse: (stdout: string) => string;
}

function parsedLines(stdout: string): readonly unknown[] {
  const values: unknown[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      values.push(JSON.parse(line) as unknown);
    } catch {
      continue;
    }
  }
  return values;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function extractCodex(stdout: string): string {
  let response = '';
  for (const value of parsedLines(stdout)) {
    const event = objectValue(value);
    if (event?.type !== 'item.completed') continue;
    const item = objectValue(event.item);
    if (item === undefined) continue;
    if (item.type === 'agent_message' && typeof item.text === 'string') response = item.text;
  }
  return response || stdout.trim();
}

function extractClaude(stdout: string): string {
  let response = '';
  for (const value of parsedLines(stdout)) {
    const event = objectValue(value);
    if (event?.type === 'result' && typeof event.result === 'string') response = event.result;
  }
  return response || stdout.trim();
}

function extractOpenCode(stdout: string): string {
  let response = '';
  for (const value of parsedLines(stdout)) {
    const event = objectValue(value);
    if (event === undefined) continue;
    if (typeof event.text === 'string') response = event.text;
    if (event.part !== undefined) {
      const part = objectValue(event.part);
      if (part?.type === 'text' && typeof part.text === 'string') response = part.text;
    }
  }
  return response || stdout.trim();
}

function withModel(args: string[], flag: string, model: string | undefined): void {
  if (model !== undefined) args.push(flag, model);
}

export const adapterPrompt = [
  'Read TASK.md in the current workspace and complete the task.',
  'Treat this run workspace as the complete task context and do not inspect parent or outside-workspace files.',
  'Write only to the paths that TASK.md declares writable.',
  'Finish with a concise account of the files you changed.',
].join(' ');

export const adapters: Readonly<Record<AdapterId, AdapterDefinition>> = {
  codex: {
    id: 'codex',
    label: 'Codex CLI',
    command: 'codex',
    versionArgs: ['--version'],
    invocation: (workspace, model, prompt) => {
      const args = [
        'exec',
        '--json',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        '--cd',
        workspace,
      ];
      withModel(args, '--model', model);
      args.push(prompt);
      return { command: 'codex', args, cwd: workspace };
    },
    extractFinalResponse: extractCodex,
  },
  claude: {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    versionArgs: ['--version'],
    invocation: (workspace, model, prompt) => {
      const args = [
        '--print',
        '--output-format',
        'stream-json',
        '--verbose',
        '--permission-mode',
        'acceptEdits',
        '--no-session-persistence',
      ];
      withModel(args, '--model', model);
      args.push(prompt);
      return { command: 'claude', args, cwd: workspace };
    },
    extractFinalResponse: extractClaude,
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    versionArgs: ['--version'],
    invocation: (workspace, model, prompt) => {
      const args = ['run', '--format', 'json', '--pure', '--dir', workspace];
      withModel(args, '--model', model);
      args.push(prompt);
      return { command: 'opencode', args, cwd: workspace };
    },
    extractFinalResponse: extractOpenCode,
  },
};

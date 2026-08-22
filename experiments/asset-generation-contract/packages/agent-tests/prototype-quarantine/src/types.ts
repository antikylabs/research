import type { JsonValue } from '@antiky/contracts/ir';

export const adapterIds = ['codex', 'claude', 'opencode'] as const;
export type AdapterId = (typeof adapterIds)[number];

export interface SeedSpec {
  readonly source: string;
  readonly target: string;
  readonly optional: boolean;
}

export interface ExpectedRelationship {
  readonly description?: string;
  readonly id: string;
  readonly required?: boolean;
  readonly rule?: Readonly<Record<string, JsonValue>>;
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

export interface ExpectedReference {
  readonly path: string;
  readonly sha256: string;
}

export interface ResolvedValueAssertion {
  readonly id: string;
  readonly path: string;
  readonly value: JsonValue;
}

export interface ArrayLengthAssertion {
  readonly id: string;
  readonly length: number;
  readonly path: string;
}

export interface ForbiddenKeyAssertion {
  readonly id: string;
  readonly key: string;
  readonly path: string;
}

export type SourceAssertionMode = 'excludes' | 'includes' | 'occurs';

export interface SourceAssertion {
  readonly count?: number;
  readonly file: string;
  readonly id: string;
  readonly mode: SourceAssertionMode;
  readonly text: string;
}

export interface BaselineComparison {
  readonly ignorePointers: readonly string[];
}

export interface TaskAssertions {
  readonly arrayLengths: readonly ArrayLengthAssertion[];
  readonly entityIds: readonly string[];
  readonly forbiddenKeys: readonly ForbiddenKeyAssertion[];
  readonly prototypeIds: readonly string[];
  readonly references: readonly ExpectedReference[];
  readonly relationships: readonly ExpectedRelationship[];
  readonly resolvedValues: readonly ResolvedValueAssertion[];
  readonly source: readonly SourceAssertion[];
  readonly systemIds: readonly string[];
  readonly baseline?: BaselineComparison;
}

export interface RubricCriterion {
  readonly description: string;
  readonly id: string;
  readonly title: string;
}

export interface TaskManifest {
  readonly allowedWrites: readonly string[];
  readonly assertions: TaskAssertions;
  readonly entry: string;
  readonly id: string;
  readonly rubric: readonly RubricCriterion[];
  readonly schemaVersion: 1;
  readonly seeds: readonly SeedSpec[];
  readonly summary: string;
  readonly title: string;
}

export interface RunMetadata {
  readonly adapter: AdapterId;
  readonly createdAt: string;
  readonly model?: string;
  readonly runId: string;
  readonly schemaVersion: 1;
  readonly taskId: string;
}

export type EvaluationMode = 'agent' | 'manual';
export type ExecutionStatus = 'failed' | 'manual' | 'not-run' | 'succeeded';

export interface ExecutionAttemptEvidence {
  readonly adapter: AdapterId;
  readonly model: string;
  readonly reservedAt: string;
  readonly runId: string;
  readonly schemaVersion: 1;
}

export interface ExecutionEvidence {
  readonly adapter: AdapterId;
  readonly adapterVersion: string;
  readonly args: readonly string[];
  readonly command: string;
  readonly environment: {
    readonly gitCeilingDirectories: string;
  };
  readonly exitCode: number | null;
  readonly finalResponseFile: string;
  readonly finishedAt: string;
  readonly harnessVersion: string;
  readonly model: string;
  readonly nodeVersion: string;
  readonly prompt: string;
  readonly schemaVersion: 2;
  readonly signal: string | null;
  readonly startedAt: string;
  readonly stderrFile: string;
  readonly stdoutFile: string;
  readonly workspaceInventoryFile: 'post-execution-workspace.json';
}

export interface ExecutionProvenance {
  readonly adapter: AdapterId;
  readonly adapterVersion: string | null;
  readonly details: string;
  readonly evidenceFile:
    | 'evidence/execution-attempt.json'
    | 'evidence/execution.json'
    | null;
  readonly exitCode: number | null;
  readonly model: string | null;
  readonly status: ExecutionStatus;
}

export interface ProtectedFileHash {
  readonly path: string;
  readonly sha256: string;
}

export interface ProtectedInventory {
  readonly algorithm: 'sha256';
  readonly allowedWrites: readonly string[];
  readonly files: readonly ProtectedFileHash[];
  readonly schemaVersion: 1;
}

export interface CheckResult {
  readonly details: string;
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
}

export interface HumanScore {
  readonly criterionId: string;
  readonly notes: string;
  readonly score: number;
}

export interface HumanReviewInput {
  readonly reviewer: string;
  readonly scores: readonly HumanScore[];
}

export interface EvaluationReport {
  readonly checks: readonly CheckResult[];
  readonly evaluatedAt: string;
  readonly execution: ExecutionProvenance;
  readonly human: {
    readonly maximum: number;
    readonly review: HumanReviewInput | null;
    readonly rubric: readonly RubricCriterion[];
    readonly score: number | null;
    readonly status: 'complete' | 'pending';
  };
  readonly machine: {
    readonly failed: number;
    readonly maximum: number;
    readonly passed: number;
    readonly status: 'fail' | 'pass';
  };
  readonly overallStatus:
    | 'complete'
    | 'execution-failed'
    | 'execution-not-run'
    | 'machine-failed'
    | 'manual'
    | 'pending-human-review';
  readonly runId: string;
  readonly schemaVersion: 2;
  readonly taskId: string;
}

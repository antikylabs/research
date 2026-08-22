import { readFile } from 'node:fs/promises';

import {
  deriveOverallStatus,
  evaluateRun,
  writeEvaluationReport,
} from './evaluate.js';
import type { EvaluateOptions } from './evaluate.js';
import { assertRunId, parseHumanReviewInput } from './runtime-validation.js';
import type { EvaluationReport } from './types.js';

export async function ingestReview(
  runIdValue: string,
  inputPath: string,
  options: EvaluateOptions = {},
): Promise<EvaluationReport> {
  const runId = assertRunId(runIdValue);
  const pending = await evaluateRun(runId, options);
  const parsed: unknown = JSON.parse(await readFile(inputPath, 'utf8')) as unknown;
  const review = parseHumanReviewInput(parsed, inputPath);
  const expected = pending.human.rubric.map(({ id }) => id).sort();
  const received = review.scores.map(({ criterionId }) => criterionId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(received)) {
    throw new TypeError(
      `Review criterion ids must match the task rubric. Expected ${JSON.stringify(expected)}; received ${JSON.stringify(received)}.`,
    );
  }
  const score = review.scores.reduce((total, item) => total + item.score, 0);
  const report: EvaluationReport = {
    ...pending,
    human: {
      ...pending.human,
      status: 'complete',
      review,
      score,
    },
    overallStatus: deriveOverallStatus(
      pending.execution.status,
      pending.machine.status,
      'complete',
    ),
  };
  await writeEvaluationReport(report);
  return report;
}

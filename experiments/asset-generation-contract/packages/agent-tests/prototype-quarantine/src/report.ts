import type { EvaluationReport } from './types.js';

function escapeTable(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderEvaluationMarkdown(report: EvaluationReport): string {
  const lines = [
    `# Evaluation: ${report.taskId}`,
    '',
    `Run: \`${report.runId}\``,
    '',
    `Overall status: **${report.overallStatus}**`,
    '',
    `Execution status: **${report.execution.status}** (${report.execution.adapter}, model ${report.execution.model ?? 'not recorded'}, adapter version ${report.execution.adapterVersion ?? 'not recorded'}).`,
    '',
    `Execution evidence: ${report.execution.details}`,
    '',
    `Machine checks: ${report.machine.passed}/${report.machine.maximum} passed; ${report.machine.failed} failed.`,
    '',
    '| Machine check | Result | Evidence |',
    '| --- | --- | --- |',
    ...report.checks.map((item) =>
      `| ${escapeTable(item.label)} | ${item.passed ? 'PASS' : 'FAIL'} | ${escapeTable(item.details)} |`),
    '',
    '## Human rubric',
    '',
  ];
  if (report.human.status === 'pending') {
    lines.push(
      `Status: **pending**. A reviewer must score every criterion from 0 through 4 (${report.human.maximum} maximum).`,
      '',
      '| Criterion | Question | Score |',
      '| --- | --- | --- |',
      ...report.human.rubric.map((criterion) =>
        `| ${escapeTable(criterion.title)} | ${escapeTable(criterion.description)} | pending / 4 |`),
    );
  } else {
    const scores = new Map(report.human.review?.scores.map((score) => [score.criterionId, score] as const));
    lines.push(
      `Reviewer: ${report.human.review?.reviewer ?? 'unknown'}`,
      '',
      `Human score: ${report.human.score ?? 0}/${report.human.maximum}.`,
      '',
      '| Criterion | Score | Notes |',
      '| --- | --- | --- |',
      ...report.human.rubric.map((criterion) => {
        const score = scores.get(criterion.id);
        return `| ${escapeTable(criterion.title)} | ${score?.score ?? 0} / 4 | ${escapeTable(score?.notes ?? '')} |`;
      }),
    );
  }
  lines.push(
    '',
    'The human 0–4 scores report quality; they are not pass/fail thresholds.',
    '',
    'Overall complete means execution, machine, and human evidence are complete. Machine checks and human judgement remain separate.',
    '',
  );
  return lines.join('\n');
}

function rankedByAverageFps(summary) {
  return summary.demos
    .filter((demo) => Number.isFinite(demo.summary.averageFps?.mean))
    .sort((left, right) => right.summary.averageFps.mean - left.summary.averageFps.mean);
}

export function summarizeRepresentative(summary) {
  const ranking = rankedByAverageFps(summary);
  const leader = ranking[0];
  return {
    detail: `${summary.demos.length} renderers × ${summary.configuration.runs} runs · ${new Date(summary.generatedAt).toLocaleString()}`,
    status: leader === undefined ? "Frame-rate result unavailable" : `${leader.name} leads at ${leader.summary.averageFps.mean.toFixed(1)} fps`,
    tone: leader === undefined ? "limited" : "matched",
  };
}

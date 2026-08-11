import { summarizeRepresentative } from "./report-summaries.js";

const reports = [
  {
    id: "representative",
    url: "/representative/results/latest/summary.json",
    summarize: summarizeRepresentative,
  },
  {
    id: "null",
    url: "/controlled/results/latest/summary.json",
    summarize(summary) {
      const matched = summary.nullControl?.artifactHashMatched === true && summary.nullControl?.contractMatched === true;
      const spread = Number(summary.nullControl?.fpsRelativeSpread);
      return {
        detail: `${summary.implementations.length} labels × ${summary.configuration.runs} runs · ${Number.isFinite(spread) ? `${(spread * 100).toFixed(4)}% FPS spread` : "spread unavailable"}`,
        status: matched ? "Artifact and command contract matched" : "Null-control gate failed",
        tone: matched ? "matched" : "failed",
      };
    },
  },
  {
    id: "architecture",
    url: "/controlled/architecture-results/latest/summary.json",
    summarize(summary) {
      const matched = summary.architectureControl?.taskMatched === true;
      return {
        detail: `${summary.implementations.length} renderers × ${summary.configuration.runs} runs · ${formatDate(summary.generatedAt)}`,
        status: matched ? "Controlled static task matched" : "Architecture task gate failed",
        tone: matched ? "matched" : "failed",
      };
    },
  },
];

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function updateCard(id, result) {
  const card = document.querySelector(`[data-report="${id}"]`);
  if (card === null) return;
  card.dataset.tone = result.tone;
  card.querySelector('[data-field="status"]').textContent = result.status;
  card.querySelector('[data-field="detail"]').textContent = result.detail;
}

for (const report of reports) {
  fetch(report.url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((summary) => updateCard(report.id, report.summarize(summary)))
    .catch((error) => updateCard(report.id, {
      detail: String(error),
      status: "Dataset unavailable",
      tone: "failed",
    }));
}

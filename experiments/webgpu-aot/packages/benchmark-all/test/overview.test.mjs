import assert from "node:assert/strict";
import test from "node:test";

import { summarizeRepresentative } from "../public/report-summaries.js";

test("the suite overview leads with the measured renderer winner", () => {
  const summary = {
    configuration: { runs: 5 },
    demos: [
      { name: "Three.js", summary: { averageFps: { mean: 10.8 } } },
      { name: "BroMetal", summary: { averageFps: { mean: 50.7 } } },
      { name: "TypeGPU-Antiky", summary: { averageFps: { mean: 43.8 } } },
    ],
    generatedAt: "2026-08-10T00:00:00.000Z",
  };

  assert.equal(summarizeRepresentative(summary).status, "BroMetal leads at 50.7 fps");
});

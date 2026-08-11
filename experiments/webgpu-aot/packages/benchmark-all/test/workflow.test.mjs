import assert from "node:assert/strict";
import test from "node:test";

import {
  createBenchmarkWorkflow,
  createReportBuildWorkflow,
  parseReportArguments,
  parseRunAllArguments,
} from "../scripts/workflow.mjs";
import { launchReport, runAll } from "../scripts/commands.mjs";

test("runs all scientific campaigns sequentially before building reports", () => {
  const workflow = createBenchmarkWorkflow({ headed: false });
  assert.deepEqual(workflow.map(({ label }) => label), [
    "representative renderer campaign",
    "byte-identical null campaign",
    "raw WebGPU versus Three.js architecture campaign",
  ]);
  assert.deepEqual(workflow.map(({ arguments: arguments_ }) => arguments_), [
    ["run", "benchmark", "--workspace", "benchmark"],
    ["run", "benchmark", "--workspace", "benchmark-controlled"],
    ["run", "benchmark:architecture", "--workspace", "benchmark-controlled"],
  ]);
});

test("headed mode reaches every browser campaign", () => {
  const workflow = createBenchmarkWorkflow({ headed: true });
  assert.ok(workflow.every(({ arguments: arguments_ }) => arguments_.at(-1) === "--headed"));
});

test("builds existing reports with stable subpath bases", () => {
  assert.deepEqual(createReportBuildWorkflow().map(({ arguments: arguments_ }) => arguments_), [
    ["run", "build", "--workspace", "benchmark", "--", "--base=/representative/"],
    ["run", "build", "--workspace", "benchmark-controlled", "--", "--base=/controlled/"],
  ]);
});

test("parses only the small run-all surface", () => {
  assert.deepEqual(parseRunAllArguments([]), { headed: false, help: false });
  assert.deepEqual(parseRunAllArguments(["--headed"]), { headed: true, help: false });
  assert.throws(() => parseRunAllArguments(["--runs=1"]), /Unknown option/);
  assert.throws(() => parseRunAllArguments(["--port=5000"]), /Unknown option/);
  assert.deepEqual(parseReportArguments([]), { help: false, port: 4173 });
  assert.deepEqual(parseReportArguments(["--port=5000"]), { help: false, port: 5000 });
  assert.throws(() => parseReportArguments(["--port=0"]), /positive integer/);
});

test("benchmark:all runs campaigns and builds the site without launching a server", async () => {
  const events = [];
  await runAll({ headed: false }, {
    buildReport: async () => events.push("build"),
    cwd: "/repo",
    runWorkflow: async (workflow, { cwd }) => {
      events.push(`campaigns:${workflow.length}:${cwd}`);
    },
  });
  assert.deepEqual(events, ["campaigns:3:/repo", "build"]);
});

test("report:all only launches the assembled site", async () => {
  const events = [];
  await launchReport({ port: 5000 }, {
    serveReport: async ({ port }) => events.push(`serve:${port}`),
  });
  assert.deepEqual(events, ["serve:5000"]);
});

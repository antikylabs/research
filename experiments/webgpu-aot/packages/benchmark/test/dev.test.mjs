import assert from "node:assert/strict";
import test from "node:test";

import { createDevWorkflow } from "../scripts/dev.mjs";

test("dev runs fresh benchmarks before starting the report server", () => {
  const workflow = createDevWorkflow(["--runs=2", "--profile=smoke"], {
    nodePath: "/runtime/node",
    npmCliPath: "/runtime/npm-cli.js",
    scriptDirectory: "/repo/packages/benchmark/scripts",
  });

  assert.deepEqual(workflow, [
    {
      arguments: [
        "/repo/packages/benchmark/scripts/run.mjs",
        "--runs=2",
        "--profile=smoke",
      ],
      command: "/runtime/node",
      label: "benchmarks",
    },
    {
      arguments: ["/runtime/npm-cli.js", "run", "report"],
      command: "/runtime/node",
      label: "dashboard",
    },
  ]);
});

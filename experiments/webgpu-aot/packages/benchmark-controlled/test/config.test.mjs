import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROLLED_IMPLEMENTATIONS,
  parseControlledArguments,
} from "../scripts/config.mjs";

test("the controlled campaign is separate and counterbalanceable by default", () => {
  assert.deepEqual(CONTROLLED_IMPLEMENTATIONS.map(({ id }) => id), [
    "brometal-aot",
    "typegpu-runtime",
    "antiky-aot",
    "wesl-static",
    "threejs-framework",
  ]);
  const options = parseControlledArguments([]);
  assert.equal(options.runs, 10);
  assert.equal(options.sampleDurationMs, 10_000);
  assert.equal(options.warmupDurationMs, 5_000);
  assert.equal(options.output, "public/results");
});

test("the controlled campaign refuses captures shorter than ten seconds", () => {
  assert.throws(
    () => parseControlledArguments(["--sample-seconds=9"]),
    /at least 10 seconds/,
  );
  assert.equal(
    parseControlledArguments(["--sample-seconds=12"]).sampleDurationMs,
    12_000,
  );
});

test("the controlled campaign only accepts its own identities", () => {
  assert.equal(
    parseControlledArguments(["--only=typegpu-runtime"]).only,
    "typegpu-runtime",
  );
  assert.throws(
    () => parseControlledArguments(["--only=threejs"]),
    /--only must be one of/,
  );
});

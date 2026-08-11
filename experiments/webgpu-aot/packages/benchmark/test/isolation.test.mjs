import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_ISOLATION_ARGUMENTS,
  createCaptureUrl,
} from "../scripts/isolation.mjs";

test("gives every capture a unique no-cache URL", () => {
  const first = createCaptureUrl("http://127.0.0.1:4100", "heavy", "brometal-1");
  const second = createCaptureUrl("http://127.0.0.1:4100", "heavy", "brometal-2");
  assert.notEqual(first, second);
  assert.equal(new URL(first).searchParams.get("profile"), "heavy");
  assert.equal(new URL(first).searchParams.get("benchmarkRun"), "brometal-1");
});

test("disables Chrome's persistent GPU shader cache", () => {
  assert.ok(BROWSER_ISOLATION_ARGUMENTS.includes("--disable-gpu-shader-disk-cache"));
});

import assert from "node:assert/strict";
import test from "node:test";

import { capturePresentation } from "../scripts/capture.mjs";

test("captures only the presentation canvas as a PNG", async () => {
  const calls = [];
  const canvas = {
    async screenshot(options) {
      calls.push(options);
    },
  };
  const page = {
    locator(selector) {
      assert.equal(selector, "canvas");
      return { first: () => canvas };
    },
  };

  await capturePresentation(page, "/results/captures/brometal.png");

  assert.deepEqual(calls, [{ path: "/results/captures/brometal.png", type: "png" }]);
});

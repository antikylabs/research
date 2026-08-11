import assert from "node:assert/strict";
import test from "node:test";

import { DEMOS, parseArguments } from "../scripts/config.mjs";

test("defines the five comparable implementations in display order", () => {
  assert.deepEqual(DEMOS.map(({ name }) => name), ["BroMetal", "TypeGPU", "TypeGPU-Antiky", "WESL", "Three.js"]);
});

test("pins every implementation and profile to the same analytic-light workload", () => {
  for (const demo of DEMOS) {
    assert.deepEqual(demo.scene.analyticLights, {
      smoke: 32,
      heavy: 32,
      extreme: 32,
    });
  }
});

test("separates the native authoring-system cohort from the framework reference", () => {
  assert.deepEqual(DEMOS.map(({ id, comparisonRole }) => [id, comparisonRole]), [
    ["brometal", "native-authoring-system"],
    ["typegpu", "native-authoring-system"],
    ["typegpu-antiky", "native-authoring-system"],
    ["wesl", "native-authoring-system"],
    ["threejs", "framework-reference"],
  ]);
  for (const demo of DEMOS) {
    assert.equal(typeof demo.rendererContract.shadingPath, "string");
    assert.equal(typeof demo.rendererContract.directLighting, "string");
    assert.equal(typeof demo.rendererContract.environmentLighting, "string");
    assert.equal(typeof demo.rendererContract.ambientOcclusion, "string");
    assert.equal(typeof demo.rendererContract.reflections, "string");
    assert.equal(typeof demo.rendererContract.temporalResolve, "string");
    assert.equal(typeof demo.rendererContract.bloom, "string");
  }
});

test("parses repeat, fixed-duration sampling, and warmup controls", () => {
  assert.deepEqual(parseArguments(["--runs=3", "--sample-frames=90", "--sample-seconds=12", "--warmup-seconds=7", "--only=wesl", "--headed"]), {
    channel: "chrome", headless: false, help: false, only: "wesl", output: "public/results", profile: "heavy", runs: 3, sampleDurationMs: 12_000, sampleFrames: 90, timeoutMs: 120_000, warmupDurationMs: 7_000,
  });
  assert.equal(parseArguments([]).sampleFrames, 10);
});

test("rejects ambiguous implementations and invalid repetitions", () => {
  assert.throws(() => parseArguments(["--only=nope"]), /must be one of/);
  assert.throws(() => parseArguments(["--runs=0"]), /positive integer/);
  assert.throws(() => parseArguments(["--sample-seconds=9"]), /at least 10 seconds/);
  assert.throws(() => parseArguments(["--warmup-seconds=0"]), /positive integer/);
});

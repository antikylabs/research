import { describe, expect, it } from "vitest";
import * as THREE from "three/webgpu";

import {
  createLightRig,
  NATIVE_ANALYTIC_POINT_LIGHT_COUNT,
} from "../src/light-rig.js";

import {
  ANIMATED_POINT_LIGHT_COUNT,
  BILLBOARD_COUNT,
  CORRIDOR_LIGHT_COUNT,
  createAnimatedLightSeeds,
  createAnimatedLightState,
  CURVE_LIGHT_COUNT,
  FIRE_LIGHT_COUNT,
  POINT_LIGHT_COUNT,
  stepAnimatedLights,
} from "../src/lights.js";

describe("deterministic Three.js light workload", () => {
  it("reproduces the authoritative point-light categories and seed", () => {
    const first = createAnimatedLightSeeds();
    const second = createAnimatedLightSeeds();

    expect(first).toEqual(second);
    expect(first).toHaveLength(ANIMATED_POINT_LIGHT_COUNT);
    expect(first.filter(({ kind }) => kind === "fire")).toHaveLength(
      FIRE_LIGHT_COUNT,
    );
    expect(first.filter(({ kind }) => kind === "curve")).toHaveLength(
      CURVE_LIGHT_COUNT,
    );
    expect(first.filter(({ kind }) => kind === "corridor")).toHaveLength(
      CORRIDOR_LIGHT_COUNT,
    );
    expect(BILLBOARD_COUNT).toBe(406);
    expect(POINT_LIGHT_COUNT).toBe(474);
    expect(first[0].origin).toEqual([
      3.950380580034107,
      3,
      1.1279563811607658,
    ]);
  });

  it("advances identical fixed-step states identically", () => {
    const seeds = createAnimatedLightSeeds();
    const first = createAnimatedLightState(seeds);
    const second = createAnimatedLightState(seeds);

    for (let frame = 1; frame <= 300; frame += 1) {
      stepAnimatedLights(seeds, first, frame / 60, 1 / 60);
      stepAnimatedLights(seeds, second, frame / 60, 1 / 60);
    }

    expect([...first.life]).toEqual([...second.life]);
    expect([...first.positions]).toEqual([...second.positions]);
    expect(first.positions[1]).toBeGreaterThan(3);
    expect(first.positions[FIRE_LIGHT_COUNT * 3]).not.toBe(0);
  });

  it("bounds native forward lights while retaining the complete simulation", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const lightRig = createLightRig(scene, camera);
    const analyticPointLights = scene.children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight,
    );

    expect(lightRig.pointLightCount).toBe(POINT_LIGHT_COUNT);
    expect(NATIVE_ANALYTIC_POINT_LIGHT_COUNT).toBe(32);
    expect(lightRig.analyticPointLightCount).toBe(
      NATIVE_ANALYTIC_POINT_LIGHT_COUNT,
    );
    expect(analyticPointLights).toHaveLength(
      NATIVE_ANALYTIC_POINT_LIGHT_COUNT,
    );
  });
});

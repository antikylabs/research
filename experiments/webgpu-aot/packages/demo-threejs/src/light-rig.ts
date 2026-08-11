import * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/addons/csm/CSMShadowNode.js";

import {
  BILLBOARD_COUNT,
  CORRIDOR_LIGHT_COUNT,
  createAnimatedLightSeeds,
  createAnimatedLightState,
  CURVE_LIGHT_COUNT,
  FIRE_LIGHT_COUNT,
  MAIN_POINT_LIGHT_POSITIONS,
  POINT_LIGHT_COUNT,
  stepAnimatedLights,
} from "./lights.js";

const MAIN_FIRE_COLOR = new THREE.Color(10, 0.1, 0.1);
const FRAMEWORK_POINT_LIGHT_SCALE = 4;
const FORWARD_FIRE_LIGHT_COUNT = 16;
const FORWARD_CURVE_LIGHT_COUNT = 8;
const FORWARD_CORRIDOR_LIGHT_COUNT = 4;
export const NATIVE_ANALYTIC_POINT_LIGHT_COUNT =
  MAIN_POINT_LIGHT_POSITIONS.length +
  FORWARD_FIRE_LIGHT_COUNT +
  FORWARD_CURVE_LIGHT_COUNT +
  FORWARD_CORRIDOR_LIGHT_COUNT;

export interface LightRig {
  readonly analyticPointLightCount: number;
  readonly pointLightCount: number;
  step(timeSeconds: number, timeStepSeconds: number): void;
  updateBillboards(): void;
}

function sampleIndices(
  start: number,
  population: number,
  sampleCount: number,
): readonly number[] {
  return Array.from({ length: sampleCount }, (_, index) =>
    Math.floor(start + (index * population) / sampleCount),
  );
}

export function createLightRig(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): LightRig {
  const sun = new THREE.DirectionalLight(
    new THREE.Color(0.2156, 0.2627, 0.3333),
    2,
  );
  sun.position.set(0.1, 100, 0.1);
  sun.target.position.set(0, 2, 0);
  sun.castShadow = true;
  sun.name = "Two-cascade native CSM sun";
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.015;

  // CSMShadowNode is Three.js's native WebGPU cascaded-shadow implementation.
  // It clones this 4096² shadow configuration once for each of the two cascades.
  const shadowNode = new CSMShadowNode(sun, {
    cascades: 2,
    maxFar: 100,
    mode: "practical",
    lightMargin: 20,
  });
  shadowNode.fade = true;
  (
    sun.shadow as THREE.DirectionalLightShadow & {
      shadowNode?: CSMShadowNode;
    }
  ).shadowNode = shadowNode;
  scene.add(sun, sun.target);

  for (const position of MAIN_POINT_LIGHT_POSITIONS) {
    const light = new THREE.PointLight(
      MAIN_FIRE_COLOR,
      0.3 * FRAMEWORK_POINT_LIGHT_SCALE,
      6,
      2,
    );
    light.position.fromArray(position);
    scene.add(light);
  }

  const seeds = createAnimatedLightSeeds();
  const state = createAnimatedLightState(seeds);
  // Three's native forward-light graph specializes every material for every
  // analytic light. Expanding all 474 lights made Chrome spend minutes building
  // enormous shaders. Keep the complete deterministic simulation and all 406
  // visible particles, but sample a representative fixed set of forward-light
  // slots. The reference avoids this specialization cost with deferred volumes.
  const activeAnimatedIndices = [
    ...sampleIndices(0, FIRE_LIGHT_COUNT, FORWARD_FIRE_LIGHT_COUNT),
    ...sampleIndices(
      FIRE_LIGHT_COUNT,
      CURVE_LIGHT_COUNT,
      FORWARD_CURVE_LIGHT_COUNT,
    ),
    ...sampleIndices(
      FIRE_LIGHT_COUNT + CURVE_LIGHT_COUNT,
      CORRIDOR_LIGHT_COUNT,
      FORWARD_CORRIDOR_LIGHT_COUNT,
    ),
  ];
  const animatedLights = activeAnimatedIndices.map((sourceIndex) => {
    const seed = seeds[sourceIndex];
    const offset = sourceIndex * 3;
    const light = new THREE.PointLight(
      new THREE.Color(...seed.color),
      state.intensities[sourceIndex] * FRAMEWORK_POINT_LIGHT_SCALE,
      state.lightRadii[sourceIndex] * 2,
      2,
    );
    light.position.set(
      state.positions[offset],
      state.positions[offset + 1],
      state.positions[offset + 2],
    );
    return { light, sourceIndex };
  });
  scene.add(...animatedLights.map(({ light }) => light));

  const billboardGeometry = new THREE.PlaneGeometry(1, 1);
  const billboardMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    vertexColors: true,
  });
  const billboards = new THREE.InstancedMesh(
    billboardGeometry,
    billboardMaterial,
    BILLBOARD_COUNT,
  );
  billboards.name = "406 deterministic light billboards";
  billboards.frustumCulled = false;
  billboards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let index = 0; index < BILLBOARD_COUNT; index += 1) {
    billboards.setColorAt(index, new THREE.Color(...seeds[index].color));
  }
  if (billboards.instanceColor !== null) {
    billboards.instanceColor.needsUpdate = true;
  }
  scene.add(billboards);

  const transform = new THREE.Object3D();

  const applyStateToLights = (): void => {
    for (const { light, sourceIndex } of animatedLights) {
      const offset = sourceIndex * 3;
      light.position.set(
        state.positions[offset],
        state.positions[offset + 1],
        state.positions[offset + 2],
      );
      light.intensity =
        state.intensities[sourceIndex] * FRAMEWORK_POINT_LIGHT_SCALE;
      light.distance = Math.max(
        0.001,
        state.lightRadii[sourceIndex] * 2,
      );
    }
  };

  const updateBillboards = (): void => {
    for (let index = 0; index < BILLBOARD_COUNT; index += 1) {
      const offset = index * 3;
      const diameter = state.billboardRadii[index] * 2;
      transform.position.set(
        state.positions[offset],
        state.positions[offset + 1],
        state.positions[offset + 2],
      );
      transform.quaternion.copy(camera.quaternion);
      transform.scale.set(diameter, diameter, diameter);
      transform.updateMatrix();
      billboards.setMatrixAt(index, transform.matrix);
    }
    billboards.instanceMatrix.needsUpdate = true;
  };

  applyStateToLights();
  updateBillboards();

  return {
    analyticPointLightCount: NATIVE_ANALYTIC_POINT_LIGHT_COUNT,
    pointLightCount: POINT_LIGHT_COUNT,
    step(timeSeconds, timeStepSeconds): void {
      stepAnimatedLights(seeds, state, timeSeconds, timeStepSeconds);
      applyStateToLights();
    },
    updateBillboards,
  };
}

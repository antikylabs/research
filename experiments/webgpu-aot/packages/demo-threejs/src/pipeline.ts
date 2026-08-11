import * as THREE from "three/webgpu";
import {
  builtinAOContext,
  metalness,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  roughness,
  sample,
  screenUV,
  unpackRGBToNormal,
  vec2,
  velocity,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import { traa } from "three/addons/tsl/display/TRAANode.js";

export interface NativeRenderPipeline {
  readonly stageCount: number;
  render(): void;
}

export function createNativeRenderPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): NativeRenderPipeline {
  const targetOptions: THREE.RenderTargetOptions = {
    depthBuffer: true,
    // These depth textures are sampled by GTAO, TRAA, and SSR. WebGPU cannot
    // bind a combined depth/stencil view as a depth-only sampled texture, so
    // the post-processing passes use a depth-only attachment.
    stencilBuffer: false,
  };

  // A normal/velocity prepass supplies the full-resolution GTAO denoiser and TRAA.
  const prePass = pass(scene, camera, targetOptions);
  prePass.transparent = false;
  prePass.setMRT(
    mrt({
      output: packNormalToRGB(normalView),
      velocity,
    }),
  );
  const preNormalTexture = prePass.getTextureNode("output");
  const preNormal = sample((uv) =>
    unpackRGBToNormal(preNormalTexture.sample(uv)),
  );
  const preDepth = prePass.getTextureNode("depth");
  const velocityTexture = prePass.getTextureNode("velocity");
  const ambientOcclusion = ao(preDepth, preNormal, camera);
  ambientOcclusion.resolutionScale = 1;
  ambientOcclusion.samples.value = 8;
  ambientOcclusion.radius.value = 0.5;
  ambientOcclusion.scale.value = 2;
  ambientOcclusion.useTemporalFiltering = true;

  // Three.js performs lighting naturally while emitting the three-target MRT data.
  const scenePass = pass(scene, camera, targetOptions);
  scenePass.setMRT(
    mrt({
      output,
      normal: packNormalToRGB(normalView),
      metalrough: vec2(metalness, roughness),
    }),
  );
  scenePass.contextNode = builtinAOContext(
    ambientOcclusion.getTextureNode().sample(screenUV).r,
  );
  scenePass.getTexture("normal").type = THREE.UnsignedByteType;
  scenePass.getTexture("metalrough").type = THREE.UnsignedByteType;

  const sceneColor = scenePass.getTextureNode("output");
  const sceneDepth = scenePass.getTextureNode("depth");
  const normalTexture = scenePass.getTextureNode("normal");
  const metalRoughTexture = scenePass.getTextureNode("metalrough");
  const sampledNormal = sample((uv) =>
    unpackRGBToNormal(normalTexture.sample(uv)),
  );
  const sampledMetalRough = sample((uv) => metalRoughTexture.sample(uv));

  const temporalResolve = traa(
    sceneColor,
    sceneDepth,
    velocityTexture,
    camera,
  );
  const reflections = ssr(sceneColor, sceneDepth, sampledNormal, {
    camera,
    metalnessNode: sampledMetalRough.x,
    roughnessNode: sampledMetalRough.y,
    reflectNonMetals: true,
    binaryRefine: true,
    stochastic: false,
  });
  reflections.resolutionScale = 1;
  reflections.quality.value = 30 / 64;
  reflections.maxDistance.value = 100;
  reflections.thickness.value = 0.05;
  reflections.intensity.value = 0.7;
  reflections.blurQuality = 3;

  const reflectedScene = temporalResolve.add(reflections.rgb);
  const bloomPass = bloom(reflectedScene, 0.18, 0.0035, 1);
  bloomPass.setResolutionScale(1);

  const renderPipeline = new THREE.RenderPipeline(renderer);
  renderPipeline.outputNode = reflectedScene.add(bloomPass);

  return {
    // 2 CSM + normal/velocity + GTAO/denoise + scene MRT + TRAA + SSR/blur +
    // bloom + final composition. This conservative count is exposed for QA.
    stageCount: 10,
    render(): void {
      renderPipeline.render();
    },
  };
}

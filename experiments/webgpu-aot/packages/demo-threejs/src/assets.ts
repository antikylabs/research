import * as THREE from "three/webgpu";
import { HDRCubeTextureLoader } from "three/addons/loaders/HDRCubeTextureLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface LoadedWorkloadAssets {
  readonly meshCount: number;
}

const ENVIRONMENT_FACE_URLS = [
  "/textures/px.hdr",
  "/textures/nx.hdr",
  "/textures/py.hdr",
  "/textures/ny.hdr",
  "/textures/pz.hdr",
  "/textures/nz.hdr",
] as const;

function tuneMaterialTextures(
  material: THREE.Material,
  maxAnisotropy: number,
): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.anisotropy = Math.min(8, maxAnisotropy);
    }
  }
}

export async function loadEnvironmentAndSponza(
  scene: THREE.Scene,
  renderer: THREE.WebGPURenderer,
): Promise<LoadedWorkloadAssets> {
  const manager = new THREE.LoadingManager();
  const environmentLoader = new HDRCubeTextureLoader(manager).setDataType(
    THREE.HalfFloatType,
  );
  const gltfLoader = new GLTFLoader(manager);
  const [environment, gltf] = await Promise.all([
    environmentLoader.loadAsync(ENVIRONMENT_FACE_URLS),
    gltfLoader.loadAsync("/sponza/Sponza.gltf"),
  ]);

  environment.mapping = THREE.CubeReflectionMapping;
  scene.background = environment;
  scene.environment = environment;
  scene.backgroundIntensity = 1;
  scene.environmentIntensity = 1;

  gltf.scene.name = "Pinned Khronos Sponza workload";
  gltf.scene.position.y = 2;
  let meshCount = 0;
  const maxAnisotropy = renderer.getMaxAnisotropy();
  gltf.scene.traverse((object): void => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    meshCount += 1;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      tuneMaterialTextures(material, maxAnisotropy);
    }
  });

  if (meshCount !== 103) {
    throw new Error(`Expected 103 Sponza primitive meshes, loaded ${meshCount}`);
  }
  scene.add(gltf.scene);
  return { meshCount };
}

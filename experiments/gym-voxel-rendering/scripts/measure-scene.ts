import { buildFaceInstances } from '../src/approaches/instances/surface.ts';
import { compileGreedyMesh } from '../src/approaches/mesh/greedy-mesh.ts';
import { createDenseVoxelStorage } from '../src/approaches/raytrace/volume.ts';
import { createBuiltInScene } from '../src/scene/built-in.ts';

const scene = createBuiltInScene();
const mesh = compileGreedyMesh(scene);
const instances = buildFaceInstances(scene);
const volume = createDenseVoxelStorage(scene);

const measurement = Object.freeze({
  scene: Object.freeze({
    name: scene.name,
    fingerprint: scene.fingerprint,
    dimensions: scene.dimensions,
    voxels: scene.cells.length,
  }),
  mesh: mesh.receipt,
  instances: instances.receipt,
  raytrace: Object.freeze({
    representation: 'dense-vec4',
    dimensions: volume.dimensions,
    occupiedVoxels: volume.occupiedVoxels,
    vec4Elements: volume.vec4Elements,
    volumeBytes: volume.volumeByteLength,
    materialBytes: volume.materialColor.byteLength + volume.materialSurface.byteLength,
    totalBytes: volume.byteLength,
    traversalCap: volume.traversalCap,
  }),
});

process.stdout.write(`${JSON.stringify(measurement, null, 2)}\n`);

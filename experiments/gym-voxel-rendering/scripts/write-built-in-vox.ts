import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createBuiltInScene } from '../src/scene/built-in.ts';
import { assertVoxEncodableScene } from '../src/vox/write-validation.ts';

function int32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeInt32LE(value);
  return buffer;
}

function chunk(id: string, content: Buffer, children = Buffer.alloc(0)): Buffer {
  return Buffer.concat([
    Buffer.from(id, 'ascii'),
    int32(content.length),
    int32(children.length),
    content,
    children,
  ]);
}

function voxString(value: string): Buffer {
  const encoded = Buffer.from(value, 'utf8');
  return Buffer.concat([int32(encoded.length), encoded]);
}

function dictionary(entries: Readonly<Record<string, string>>): Buffer {
  return Buffer.concat([
    int32(Object.keys(entries).length),
    ...Object.entries(entries).flatMap(([key, value]) => [voxString(key), voxString(value)]),
  ]);
}

const scene = createBuiltInScene();
assertVoxEncodableScene(scene);
const size = Buffer.concat([
  int32(scene.dimensions[0]),
  int32(scene.dimensions[2]),
  int32(scene.dimensions[1]),
]);
const voxels = Buffer.allocUnsafe(4 + scene.cells.length * 4);
voxels.writeInt32LE(scene.cells.length, 0);
for (let index = 0; index < scene.cells.length; index += 1) {
  const cell = scene.cells[index]!;
  const offset = 4 + index * 4;
  voxels[offset] = cell.x;
  voxels[offset + 1] = cell.z;
  voxels[offset + 2] = cell.y;
  voxels[offset + 3] = cell.paletteIndex;
}

const palette = Buffer.alloc(1024);
for (let index = 1; index <= 255; index += 1) {
  const material = scene.materials[index]!;
  const offset = (index - 1) * 4;
  palette[offset] = Math.round(material.srgb[0] * 255);
  palette[offset + 1] = Math.round(material.srgb[1] * 255);
  palette[offset + 2] = Math.round(material.srgb[2] * 255);
  palette[offset + 3] = 255;
}

const usedMaterials = [...new Set(scene.cells.map((cell) => cell.paletteIndex))]
  .sort((left, right) => left - right);
const materialChunks = usedMaterials.map((paletteIndex) => {
  const material = scene.materials[paletteIndex]!;
  const sourceType = material.emission > 0
    ? '_emit'
    : material.glass > 0
      ? '_glass'
      : material.metallic > 0
        ? '_metal'
        : '_diffuse';
  const weight = material.emission > 0
    ? 1
    : material.metallic > 0
      ? material.metallic
      : material.glass > 0
        ? material.glass
        : 1;
  const values: Record<string, string> = {
    _type: sourceType,
    _rough: material.roughness.toFixed(3),
    _weight: weight.toFixed(3),
  };
  if (material.emission > 0) values._flux = (material.emission / 3).toFixed(3);
  return chunk('MATL', Buffer.concat([int32(paletteIndex), dictionary(values)]));
});

const children = Buffer.concat([
  chunk('SIZE', size),
  chunk('XYZI', voxels),
  chunk('RGBA', palette),
  ...materialChunks,
]);
const output = Buffer.concat([
  Buffer.from('VOX ', 'ascii'),
  int32(150),
  chunk('MAIN', Buffer.alloc(0), children),
]);
const outputDirectory = path.resolve(import.meta.dirname, '../public/models');
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'golden-hour-valley-atelier.vox'), output);

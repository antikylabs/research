import { createDefaultPalette } from './default-palette.ts';

export type VoxRawVoxel = Readonly<{
  x: number;
  y: number;
  z: number;
  paletteIndex: number;
}>;

export type VoxModel = Readonly<{
  size: readonly [number, number, number];
  voxels: readonly VoxRawVoxel[];
}>;

export type VoxDocument = Readonly<{
  version: number;
  models: readonly VoxModel[];
  palette: readonly (readonly [number, number, number, number])[];
  materials: ReadonlyMap<number, Readonly<Record<string, string>>>;
  declaredModelCount: number | null;
  unsupportedChunks: readonly string[];
  warnings: readonly string[];
  sourceBytes: number;
}>;

export type VoxParseLimits = Readonly<{
  maxFileBytes: number;
  maxChunks: number;
  maxModels: number;
  maxVoxelsPerModel: number;
  maxTotalVoxels: number;
  maxDictionaryPairs: number;
  maxStringBytes: number;
}>;

const DEFAULT_LIMITS: VoxParseLimits = Object.freeze({
  maxFileBytes: 32 * 1024 * 1024,
  maxChunks: 16_384,
  maxModels: 64,
  maxVoxelsPerModel: 1_000_000,
  maxTotalVoxels: 2_000_000,
  maxDictionaryPairs: 256,
  maxStringBytes: 64 * 1024,
});

const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class VoxParseError extends Error {
  constructor(message: string) {
    super(`VOX parse failed: ${message}`);
    this.name = 'VoxParseError';
  }
}
function checkedEnd(start: number, length: number, limit: number, label: string): number {
  if (!Number.isSafeInteger(length) || length < 0 || start > limit - length) {
    throw new VoxParseError(`${label} exceeds file bounds`);
  }
  return start + length;
}

class Cursor {
  offset: number;

  constructor(
    private readonly bytes: Uint8Array<ArrayBuffer>,
    private readonly view: DataView<ArrayBuffer>,
    start: number,
    readonly end: number,
  ) {
    this.offset = start;
  }

  remaining(): number {
    return this.end - this.offset;
  }

  readU32(label: string): number {
    this.require(4, label);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readI32(label: string): number {
    this.require(4, label);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readU8(label: string): number {
    this.require(1, label);
    const value = this.bytes[this.offset]!;
    this.offset += 1;
    return value;
  }

  readText(length: number, label: string): string {
    this.require(length, label);
    const value = textDecoder.decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  finish(label: string): void {
    if (this.offset !== this.end) {
      throw new VoxParseError(`${label} has ${this.remaining()} unexpected content bytes`);
    }
  }

  private require(length: number, label: string): void {
    checkedEnd(this.offset, length, this.end, label);
  }
}

function readDictionary(cursor: Cursor, limits: VoxParseLimits): Readonly<Record<string, string>> {
  const count = cursor.readI32('dictionary pair count');
  if (count < 0 || count > limits.maxDictionaryPairs) {
    throw new VoxParseError(`dictionary pair count ${count} exceeds limit ${limits.maxDictionaryPairs}`);
  }
  const result: Record<string, string> = {};
  for (let pair = 0; pair < count; pair += 1) {
    const keyLength = cursor.readI32('dictionary key length');
    if (keyLength < 0 || keyLength > limits.maxStringBytes) {
      throw new VoxParseError(`dictionary key length ${keyLength} exceeds limit`);
    }
    const key = cursor.readText(keyLength, 'dictionary key');
    const valueLength = cursor.readI32('dictionary value length');
    if (valueLength < 0 || valueLength > limits.maxStringBytes) {
      throw new VoxParseError(`dictionary value length ${valueLength} exceeds limit`);
    }
    result[key] = cursor.readText(valueLength, 'dictionary value');
  }
  return Object.freeze(result);
}

type ChunkHeader = Readonly<{
  id: string;
  contentStart: number;
  contentEnd: number;
  childrenStart: number;
  end: number;
}>;

function readChunkHeader(
  bytes: Uint8Array<ArrayBuffer>,
  view: DataView<ArrayBuffer>,
  offset: number,
  rangeEnd: number,
): ChunkHeader {
  checkedEnd(offset, 12, rangeEnd, 'chunk header');
  const id = String.fromCharCode(
    bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!,
  );
  const contentLength = view.getUint32(offset + 4, true);
  const childrenLength = view.getUint32(offset + 8, true);
  const contentStart = offset + 12;
  const contentEnd = checkedEnd(contentStart, contentLength, rangeEnd, `${id} content length`);
  const end = checkedEnd(contentEnd, childrenLength, rangeEnd, `${id} children length`);
  return { id, contentStart, contentEnd, childrenStart: contentEnd, end };
}

export function parseVox(
  input: ArrayBuffer,
  overrides: Partial<VoxParseLimits> = {},
): VoxDocument {
  const limits = Object.freeze({ ...DEFAULT_LIMITS, ...overrides });
  if (input.byteLength > limits.maxFileBytes) {
    throw new VoxParseError(`file byte limit ${limits.maxFileBytes} exceeded by ${input.byteLength}`);
  }
  if (input.byteLength < 20) throw new VoxParseError('file is truncated before MAIN');

  const bytes = new Uint8Array(input);
  const view = new DataView(input);
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== 'VOX ') throw new VoxParseError(`expected VOX magic, found ${JSON.stringify(magic)}`);
  const version = view.getUint32(4, true);
  if (version < 150) throw new VoxParseError(`unsupported version ${version}; expected 150 or newer`);

  const root = readChunkHeader(bytes, view, 8, input.byteLength);
  if (root.id !== 'MAIN') throw new VoxParseError(`expected MAIN root, found ${root.id}`);
  if (root.contentStart !== root.contentEnd) throw new VoxParseError('MAIN content must be empty');
  if (root.end !== input.byteLength) throw new VoxParseError('MAIN length does not cover the file');

  const models: VoxModel[] = [];
  const materials = new Map<number, Readonly<Record<string, string>>>();
  const unsupported = new Set<string>();
  const warnings: string[] = [];
  let palette = createDefaultPalette();
  let declaredModelCount: number | null = null;
  let pendingSize: readonly [number, number, number] | null = null;
  let chunkCount = 1;
  let totalVoxels = 0;

  const ranges: Array<readonly [number, number]> = [[root.childrenStart, root.end]];
  while (ranges.length > 0) {
    const range = ranges.pop()!;
    let offset = range[0];
    while (offset < range[1]) {
      const header = readChunkHeader(bytes, view, offset, range[1]);
      chunkCount += 1;
      if (chunkCount > limits.maxChunks) {
        throw new VoxParseError(`chunk count exceeds limit ${limits.maxChunks}`);
      }
      const cursor = new Cursor(bytes, view, header.contentStart, header.contentEnd);
      switch (header.id) {
        case 'PACK': {
          declaredModelCount = cursor.readI32('PACK model count');
          if (declaredModelCount < 0 || declaredModelCount > limits.maxModels) {
            throw new VoxParseError(`PACK model count ${declaredModelCount} exceeds limit ${limits.maxModels}`);
          }
          cursor.finish('PACK');
          break;
        }
        case 'SIZE': {
          if (pendingSize !== null) throw new VoxParseError('SIZE appeared before the previous model had XYZI');
          const size = [
            cursor.readI32('SIZE x'), cursor.readI32('SIZE y'), cursor.readI32('SIZE z'),
          ] as const;
          if (size.some((dimension) => dimension <= 0 || dimension > 256)) {
            throw new VoxParseError(`model dimensions ${size.join('×')} are outside 1..256`);
          }
          pendingSize = size;
          cursor.finish('SIZE');
          break;
        }
        case 'XYZI': {
          if (pendingSize === null) throw new VoxParseError('XYZI has no preceding SIZE');
          if (models.length >= limits.maxModels) {
            throw new VoxParseError(`model count exceeds limit ${limits.maxModels}`);
          }
          const count = cursor.readI32('XYZI voxel count');
          if (count < 0 || count > limits.maxVoxelsPerModel) {
            throw new VoxParseError(`voxel count ${count} exceeds per-model limit ${limits.maxVoxelsPerModel}`);
          }
          if (count > Math.floor(cursor.remaining() / 4) || cursor.remaining() !== count * 4) {
            throw new VoxParseError(`XYZI voxel count ${count} does not match chunk length`);
          }
          totalVoxels += count;
          if (totalVoxels > limits.maxTotalVoxels) {
            throw new VoxParseError(`total voxel count exceeds limit ${limits.maxTotalVoxels}`);
          }
          const voxels: VoxRawVoxel[] = [];
          const occupied = new Set<string>();
          for (let index = 0; index < count; index += 1) {
            const x = cursor.readU8('voxel x');
            const y = cursor.readU8('voxel y');
            const z = cursor.readU8('voxel z');
            const paletteIndex = cursor.readU8('voxel palette index');
            if (x >= pendingSize[0] || y >= pendingSize[1] || z >= pendingSize[2]) {
              throw new VoxParseError(`voxel ${x},${y},${z} lies outside SIZE ${pendingSize.join('×')}`);
            }
            if (paletteIndex === 0) throw new VoxParseError('palette index zero is reserved');
            const key = `${x},${y},${z}`;
            if (occupied.has(key)) throw new VoxParseError(`duplicate voxel coordinate ${key}`);
            occupied.add(key);
            voxels.push(Object.freeze({ x, y, z, paletteIndex }));
          }
          models.push(Object.freeze({ size: pendingSize, voxels: Object.freeze(voxels) }));
          pendingSize = null;
          break;
        }
        case 'RGBA': {
          if (cursor.remaining() !== 1024) throw new VoxParseError('RGBA must contain 256 colors');
          const colors: [number, number, number, number][] = [[0, 0, 0, 0]];
          for (let index = 1; index <= 255; index += 1) {
            colors.push([
              cursor.readU8('palette red'), cursor.readU8('palette green'),
              cursor.readU8('palette blue'), cursor.readU8('palette alpha'),
            ]);
          }
          // The 256th stored color has no ordinary palette index, but still belongs to the chunk.
          cursor.readU32('unused palette color');
          palette = Object.freeze(colors);
          break;
        }
        case 'MATL': {
          const id = cursor.readI32('MATL material id');
          if (id < 1 || id > 255) throw new VoxParseError(`MATL id ${id} is outside 1..255`);
          materials.set(id, readDictionary(cursor, limits));
          cursor.finish('MATL');
          break;
        }
        default:
          unsupported.add(header.id);
      }
      if (header.childrenStart < header.end) ranges.push([header.childrenStart, header.end]);
      offset = header.end;
    }
    if (offset !== range[1]) throw new VoxParseError('chunk range length mismatch');
  }

  if (pendingSize !== null) throw new VoxParseError('SIZE has no following XYZI');
  if (models.length === 0) throw new VoxParseError('file contains no models');
  if (declaredModelCount !== null && declaredModelCount !== models.length) {
    warnings.push(`PACK declares ${declaredModelCount} models; parsed ${models.length}.`);
  }
  if (unsupported.size > 0) {
    warnings.push(`Preserved only as diagnostics: ${[...unsupported].sort().join(', ')}.`);
  }
  return Object.freeze({
    version,
    models: Object.freeze(models),
    palette,
    materials,
    declaredModelCount,
    unsupportedChunks: Object.freeze([...unsupported].sort()),
    warnings: Object.freeze(warnings),
    sourceBytes: input.byteLength,
  });
}

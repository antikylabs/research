export const WESL_TEMPORAL_JITTER_COUNT = 31;

function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let remaining = index;
  while (remaining > 0) {
    fraction /= base;
    result += fraction * (remaining % base);
    remaining = Math.floor(remaining / base);
  }
  return result;
}

export function weslTemporalJitter(
  frameIndex: number,
  width: number,
  height: number,
): readonly [number, number] {
  const sample = frameIndex % WESL_TEMPORAL_JITTER_COUNT + 1;
  const x = halton(sample, 2) - 0.5;
  const y = halton(sample, 3) - 0.5;
  return [x === 0 ? 0 : -2 * x / width, 2 * y / height];
}

export function writeWeslTemporalFrame(
  frame: Float32Array,
  baseViewProjection: Float32Array,
  width: number,
  height: number,
  frameIndex: number,
): void {
  const [jitterX, jitterY] = weslTemporalJitter(frameIndex, width, height);
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const clipW = baseViewProjection[offset + 3] ?? 0;
    frame[offset] = (baseViewProjection[offset] ?? 0) + jitterX * clipW;
    frame[offset + 1] = (baseViewProjection[offset + 1] ?? 0) + jitterY * clipW;
    frame[offset + 2] = baseViewProjection[offset + 2] ?? 0;
    frame[offset + 3] = clipW;
  }
}

export function createWeslTemporalSettings(
  width: number,
  height: number,
  frameIndex: number,
): Float32Array<ArrayBuffer> {
  return new Float32Array([width, height, frameIndex === 0 ? 0 : 1, frameIndex]);
}

export function weslTemporalHistoryIndices(
  frameIndex: number,
): readonly [read: number, write: number] {
  const read = frameIndex % 2;
  return [read, 1 - read];
}

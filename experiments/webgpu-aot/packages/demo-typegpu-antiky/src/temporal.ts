export const ANTIKY_TEMPORAL_JITTER_COUNT = 31;

function assertTemporalInputs(
  frameIndex: number,
  width: number,
  height: number,
): void {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("Antiky temporal frame index must be a non-negative integer");
  }
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0
  ) {
    throw new Error("Antiky temporal dimensions must be positive integers");
  }
}

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

export function antikyTemporalJitter(
  frameIndex: number,
  width: number,
  height: number,
): readonly [number, number] {
  assertTemporalInputs(frameIndex, width, height);
  const cycleIndex = frameIndex % ANTIKY_TEMPORAL_JITTER_COUNT;
  const sampleIndex = cycleIndex + 1;
  const offsetX = halton(sampleIndex, 2) - 0.5;
  const offsetY = halton(sampleIndex, 3) - 0.5;
  const jitterX = offsetX === 0 ? 0 : -2 * offsetX / width;
  return [jitterX, 2 * offsetY / height];
}

export function writeAntikyTemporalFrame(
  frame: Float32Array,
  baseViewProjection: Float32Array,
  width: number,
  height: number,
  frameIndex: number,
): void {
  if (frame.length < 72) {
    throw new Error("Antiky forward frame requires 72 floats");
  }
  if (baseViewProjection.length !== 16) {
    throw new Error("Antiky temporal base view-projection requires 16 floats");
  }
  const [jitterX, jitterY] = antikyTemporalJitter(
    frameIndex,
    width,
    height,
  );
  for (let column = 0; column < 4; column += 1) {
    const offset = column * 4;
    const clipW = baseViewProjection[offset + 3]!;
    frame[offset] = baseViewProjection[offset]! + jitterX * clipW;
    frame[offset + 1] = baseViewProjection[offset + 1]! + jitterY * clipW;
    frame[offset + 2] = baseViewProjection[offset + 2]!;
    frame[offset + 3] = clipW;
  }
}

export function createAntikyTemporalSettings(
  width: number,
  height: number,
  frameIndex: number,
): Float32Array<ArrayBuffer> {
  assertTemporalInputs(frameIndex, width, height);
  return new Float32Array([
    width,
    height,
    frameIndex === 0 ? 0 : 1,
    frameIndex,
  ]);
}

export function antikyTemporalHistoryIndices(
  frameIndex: number,
): readonly [read: number, write: number] {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("Antiky temporal frame index must be a non-negative integer");
  }
  const read = frameIndex % 2;
  return [read, 1 - read];
}

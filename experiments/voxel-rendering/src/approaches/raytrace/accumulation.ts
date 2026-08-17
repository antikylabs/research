export type LinearRgba = readonly [number, number, number, number];

export type RaytraceResetReason =
  | 'initial'
  | 'scene'
  | 'camera'
  | 'viewport'
  | 'material-light'
  | 'integrator';

export type RaytraceSampleDefinition = Readonly<{
  sceneFingerprint: string;
  cameraRevision: number;
  viewportWidth: number;
  viewportHeight: number;
  materialLightKey: string;
  integratorKey: string;
  /** Presentation is deliberately tracked but excluded from sample validity. */
  presentationKey: string;
}>;

export type RaytraceResetDecision = Readonly<{
  generation: number;
  reason: Exclude<RaytraceResetReason, 'initial'> | null;
  sampleCount: number;
}>;

function finiteRgba(value: LinearRgba, label: string): void {
  if (!value.every(Number.isFinite)) throw new Error(`${label} radiance must be finite.`);
}

export function updateRunningMean(
  previousMean: LinearRgba,
  sample: LinearRgba,
  previousSampleCount: number,
): LinearRgba {
  if (!Number.isSafeInteger(previousSampleCount) || previousSampleCount < 0) {
    throw new Error('Running-mean previous sample count must be a non-negative safe integer.');
  }
  finiteRgba(previousMean, 'Previous mean');
  finiteRgba(sample, 'Sample');
  const nextCount = previousSampleCount + 1;
  return [
    previousMean[0] + (sample[0] - previousMean[0]) / nextCount,
    previousMean[1] + (sample[1] - previousMean[1]) / nextCount,
    previousMean[2] + (sample[2] - previousMean[2]) / nextCount,
    previousMean[3] + (sample[3] - previousMean[3]) / nextCount,
  ];
}

export function classifyRaytraceReset(
  previous: RaytraceSampleDefinition,
  next: RaytraceSampleDefinition,
): Exclude<RaytraceResetReason, 'initial'> | null {
  if (previous.sceneFingerprint !== next.sceneFingerprint) return 'scene';
  if (previous.cameraRevision !== next.cameraRevision) return 'camera';
  if (previous.viewportWidth !== next.viewportWidth
    || previous.viewportHeight !== next.viewportHeight) return 'viewport';
  if (previous.materialLightKey !== next.materialLightKey) return 'material-light';
  if (previous.integratorKey !== next.integratorKey) return 'integrator';
  return null;
}

export class RaytraceResetTracker {
  #definition: RaytraceSampleDefinition;
  #generation = 1;
  #sampleCount = 0;
  #lastResetReason: RaytraceResetReason = 'initial';

  constructor(initial: RaytraceSampleDefinition) {
    this.#definition = Object.freeze({ ...initial });
  }

  get generation(): number {
    return this.#generation;
  }

  get sampleCount(): number {
    return this.#sampleCount;
  }

  get lastResetReason(): RaytraceResetReason {
    return this.#lastResetReason;
  }

  update(next: RaytraceSampleDefinition): RaytraceResetDecision {
    const reason = classifyRaytraceReset(this.#definition, next);
    this.#definition = Object.freeze({ ...next });
    if (reason !== null) {
      this.#generation += 1;
      this.#sampleCount = 0;
      this.#lastResetReason = reason;
    }
    return Object.freeze({ generation: this.#generation, reason, sampleCount: this.#sampleCount });
  }

  recordSample(): number {
    this.#sampleCount += 1;
    return this.#sampleCount;
  }
}

import { immutableRecord } from "./immutable.js";
import type { Meters, NumericRange, ReferenceImage } from "./types.js";

function finiteNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${path} must be a finite number`);
  }
}

export function between(min: number, max: number): NumericRange {
  finiteNumber(min, "between min");
  finiteNumber(max, "between max");

  if (min > max) {
    throw new RangeError(`between min (${min}) must not exceed max (${max})`);
  }

  return immutableRecord<NumericRange>("range", { min, max });
}

export function meters(value: number): Meters;
export function meters(min: number, max: number): Meters;
export function meters(minOrValue: number, max?: number): Meters {
  finiteNumber(minOrValue, "meters value");

  if (max === undefined) {
    return immutableRecord<Meters>("meters", { value: minOrValue });
  }

  return immutableRecord<Meters>("meters", { value: between(minOrValue, max) });
}

export function referenceImage(path: string): ReferenceImage {
  if (path.length === 0) {
    throw new TypeError("referenceImage path must not be empty");
  }

  return immutableRecord<ReferenceImage>("reference-image", { path });
}

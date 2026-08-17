import type { Vec3Tuple } from '../scene/types.ts';

export type LightingState = Readonly<{
  sunDirection: Vec3Tuple;
  sunColor: Vec3Tuple;
  sunIntensity: number;
  moonDirection: Vec3Tuple;
  moonColor: Vec3Tuple;
  moonIntensity: number;
  skyColor: Vec3Tuple;
  groundColor: Vec3Tuple;
  fogColor: Vec3Tuple;
  ambientIntensity: number;
  key: string;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(vector: Vec3Tuple): Vec3Tuple {
  const magnitude = Math.hypot(...vector);
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

function mixColor(low: Vec3Tuple, high: Vec3Tuple, amount: number): Vec3Tuple {
  return [
    low[0] + (high[0] - low[0]) * amount,
    low[1] + (high[1] - low[1]) * amount,
    low[2] + (high[2] - low[2]) * amount,
  ];
}

/** Deterministic 24-hour solar arc and independent night-only moon contribution. */
export function createLightingState(timeOfDay: number, moonEnabled: boolean): LightingState {
  const hour = ((timeOfDay % 24) + 24) % 24;
  const solarAngle = (hour - 6) / 12 * Math.PI;
  const altitude = Math.sin(solarAngle);
  const azimuth = (hour - 6) / 24 * Math.PI * 2;
  const sunDirection = normalize([
    Math.cos(azimuth) * 0.72,
    altitude,
    Math.sin(azimuth) * 0.72,
  ]);
  const moonDirection: Vec3Tuple = [-sunDirection[0], -sunDirection[1], -sunDirection[2]];
  const daylight = clamp(altitude, 0, 1);
  const twilight = clamp(1 - Math.abs(altitude) * 2.6, 0, 1);
  const night = clamp(-altitude, 0, 1);
  const warm = mixColor([1, 0.31, 0.1], [1, 0.93, 0.78], daylight ** 0.4);
  const skyDay: Vec3Tuple = [0.16, 0.36, 0.72];
  const skyNight: Vec3Tuple = [0.018, 0.04, 0.1];
  const skyColor = mixColor(skyNight, skyDay, daylight ** 0.55);
  const fogColor = mixColor(
    mixColor([0.035, 0.055, 0.12], [0.42, 0.12, 0.045], twilight),
    [0.28, 0.42, 0.62],
    daylight,
  );
  const moonIntensity = moonEnabled && night > 0.05 ? night * 1.45 : 0;
  return Object.freeze({
    sunDirection,
    sunColor: warm,
    sunIntensity: daylight ** 0.7 * 5.2,
    moonDirection,
    moonColor: [0.28, 0.42, 0.72] as const,
    moonIntensity,
    skyColor,
    groundColor: mixColor([0.018, 0.025, 0.055], [0.15, 0.085, 0.045], daylight),
    fogColor,
    ambientIntensity: 0.16 + daylight * 0.5 + moonIntensity * 0.22,
    key: `${hour.toFixed(3)}:${Number(moonEnabled)}:${daylight.toFixed(4)}:${moonIntensity.toFixed(4)}`,
  });
}

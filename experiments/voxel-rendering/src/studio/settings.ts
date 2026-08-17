import type { PresentationStyle } from '../render/types.ts';

export type RenderSettings = Readonly<{
  style: PresentationStyle;
  depthOfField: Readonly<{
    enabled: boolean;
    focusDistance: number;
    aperture: number;
  }>;
  lighting: Readonly<{
    timeOfDay: number;
    moonEnabled: boolean;
  }>;
  exposure: number;
  finalColorGrade: boolean;
  materialVariation: number;
}>;

export const DEFAULT_RENDER_SETTINGS: RenderSettings = Object.freeze({
  style: 'physical',
  depthOfField: Object.freeze({ enabled: true, focusDistance: 118, aperture: 0.8 }),
  lighting: Object.freeze({ timeOfDay: 17.5, moonEnabled: true }),
  exposure: 1.15,
  finalColorGrade: true,
  materialVariation: 0.32,
});

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeRenderSettings(settings: RenderSettings): RenderSettings {
  const rawTime = finite(settings.lighting.timeOfDay, DEFAULT_RENDER_SETTINGS.lighting.timeOfDay);
  const timeOfDay = ((rawTime % 24) + 24) % 24;
  return Object.freeze({
    style: settings.style === 'graphic' ? 'graphic' : 'physical',
    depthOfField: Object.freeze({
      enabled: Boolean(settings.depthOfField.enabled),
      focusDistance: clamp(finite(settings.depthOfField.focusDistance, 118), 1, 600),
      aperture: clamp(finite(settings.depthOfField.aperture, 0.8), 0, 2.5),
    }),
    lighting: Object.freeze({
      timeOfDay,
      moonEnabled: Boolean(settings.lighting.moonEnabled),
    }),
    exposure: clamp(finite(settings.exposure, DEFAULT_RENDER_SETTINGS.exposure), 0.25, 3),
    finalColorGrade: Boolean(settings.finalColorGrade),
    materialVariation: clamp(finite(settings.materialVariation, 0.32), 0, 1),
  });
}

export function renderSettingsKey(settings: RenderSettings): Readonly<{
  camera: string;
  materialLight: string;
  sample: string;
  presentation: string;
}> {
  const normalized = normalizeRenderSettings(settings);
  const camera = [
    Number(normalized.depthOfField.enabled),
    normalized.depthOfField.focusDistance.toFixed(3),
    normalized.depthOfField.aperture.toFixed(3),
  ].join(':');
  const materialLight = [
    normalized.style,
    normalized.lighting.timeOfDay.toFixed(3),
    Number(normalized.lighting.moonEnabled),
    normalized.materialVariation.toFixed(3),
  ].join(':');
  return Object.freeze({
    camera,
    materialLight,
    sample: `${camera}:${materialLight}`,
    presentation: [
      normalized.exposure.toFixed(3),
      Number(normalized.finalColorGrade),
    ].join(':'),
  });
}

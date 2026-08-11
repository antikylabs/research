export const ANTIKY_REFLECTION_HIT_TRANSFER = {
  intensity: 0.7,
  luminanceWeights: [0.2126, 0.7152, 0.0722] as const,
  maxDistance: 100,
  maxLuminance: 10,
} as const;

export interface AntikyReflectionHitTransferInput {
  readonly hitColor: readonly [number, number, number];
  readonly incidentDotReflected: number;
  readonly metallic: number;
  readonly planeDistance: number;
}

export function applyAntikyReflectionHitTransfer({
  hitColor,
  incidentDotReflected,
  metallic,
  planeDistance,
}: AntikyReflectionHitTransferInput): readonly [number, number, number] {
  const distanceRatio =
    1 - planeDistance / ANTIKY_REFLECTION_HIT_TRANSFER.maxDistance;
  const attenuation = distanceRatio * distanceRatio;
  const grazing = (incidentDotReflected + 1) / 2;
  const hitWeight = metallic * attenuation * grazing;
  const weightedColor = [
    hitColor[0] * hitWeight,
    hitColor[1] * hitWeight,
    hitColor[2] * hitWeight,
  ] as const;
  const luminance =
    weightedColor[0] * ANTIKY_REFLECTION_HIT_TRANSFER.luminanceWeights[0] +
    weightedColor[1] * ANTIKY_REFLECTION_HIT_TRANSFER.luminanceWeights[1] +
    weightedColor[2] * ANTIKY_REFLECTION_HIT_TRANSFER.luminanceWeights[2];
  const luminanceScale = Math.min(
    ANTIKY_REFLECTION_HIT_TRANSFER.maxLuminance /
      Math.max(luminance, 0.0001),
    1,
  );
  const finalScale =
    luminanceScale * ANTIKY_REFLECTION_HIT_TRANSFER.intensity;
  return [
    weightedColor[0] * finalScale,
    weightedColor[1] * finalScale,
    weightedColor[2] * finalScale,
  ];
}

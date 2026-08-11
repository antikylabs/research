import { createHash } from "node:crypto";

const SUMMARY_KEYS = Object.freeze([
  "aboveOneFraction",
  "activeFraction",
  "maximum",
  "mean",
  "minimum",
  "p10",
  "p50",
  "p90",
  "p99",
  "positiveMean",
  "rms",
  "zeroFraction",
]);
const RAW_PUBLIC_KEY = /raw|sample|value|pixel|channel|byte|segment|payload/i;

function safePublicKey(value) {
  return typeof value === "string" && !RAW_PUBLIC_KEY.test(value);
}

function selected(value, keys) {
  if (value === null || typeof value !== "object") return null;
  return Object.fromEntries(
    keys.map((key) => [key, publicScalar(value[key])]),
  );
}

function publicScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return ["boolean", "string"].includes(typeof value) ? value : null;
}

function publicSummary(value) {
  return selected(value, SUMMARY_KEYS);
}

function publicChannelSummaries(values) {
  return Array.isArray(values)
    ? values.slice(0, 4).map((value) => publicSummary(value))
    : null;
}

function publicRegions(regions) {
  return Object.fromEntries(
    Object.entries(regions ?? {})
      .filter(([name]) => safePublicKey(name))
      .map(([name, measurements]) => [
        name,
        {
          channels: publicChannelSummaries(measurements?.channels),
          lod: publicSummary(measurements?.lod),
          luminance: publicSummary(measurements?.luminance),
          roughness: publicSummary(measurements?.roughness),
          sampleCount: publicScalar(measurements?.sampleCount),
        },
      ]),
  );
}

function publicConsumer(value) {
  return selected(value, [
    "commandSequence",
    "passSequence",
    "pipelineId",
    "shaderHash",
    "shaderId",
  ]);
}

function publicTexture(value) {
  return selected(value, [
    "channel",
    "format",
    "label",
    "mipLevelCount",
    "textureId",
    "viewId",
  ]);
}

function publicSamplerSettings(value) {
  return selected(value, [
    "addressModeU",
    "addressModeV",
    "addressModeW",
    "magFilter",
    "minFilter",
    "mipmapFilter",
    "lodMinClamp",
    "lodMaxClamp",
    "compare",
    "maxAnisotropy",
  ]);
}

function publicProvenance(value) {
  if (value === null || typeof value !== "object") return null;
  const consumers = Object.fromEntries(
    Object.entries(value.consumers ?? {})
      .filter(([name]) => safePublicKey(name))
      .slice(0, 16)
      .map(([name, consumer]) => [name, publicConsumer(consumer)]),
  );
  const mipWrites = Array.isArray(value.mipWrites)
    ? value.mipWrites.slice(0, 16).map((write) => ({
        mipLevel: publicScalar(write?.mipLevel),
        passSequence: publicScalar(write?.passSequence),
        pipelineIds: Array.isArray(write?.pipelineIds)
          ? write.pipelineIds.slice(0, 8).map(publicScalar)
          : [],
        viewId: publicScalar(write?.viewId),
      }))
    : [];
  return {
    consumers,
    formula: selected(value.formula, [
      "channel",
      "kind",
      "lod",
      "maxMipLevel",
      "minMipLevel",
      "multiplier",
    ]),
    latestWriter:
      value.latestWriter === null || value.latestWriter === undefined
        ? null
        : {
            label: publicScalar(value.latestWriter.label),
            passSequence: publicScalar(value.latestWriter.passSequence),
            textureId: publicScalar(value.latestWriter.textureId),
            viewIds: Array.isArray(value.latestWriter.viewIds)
              ? value.latestWriter.viewIds.slice(0, 8).map(publicScalar)
              : [],
          },
    lodMeaning: publicScalar(value.lodMeaning),
    measurementPhase: publicScalar(value.measurementPhase),
    mipWrites,
    resources:
      value.resources === null || value.resources === undefined
        ? null
        : {
            reflection: publicTexture(value.resources.reflection),
            roughness: publicTexture(value.resources.roughness),
            sampler: {
              samplerId: publicScalar(value.resources.sampler?.samplerId),
              settings: publicSamplerSettings(
                value.resources.sampler?.settings,
              ),
            },
            source: publicScalar(value.resources.source),
          },
    selectionSource:
      value.selectionSource === null || value.selectionSource === undefined
        ? null
        : {
            ...publicTexture(value.selectionSource),
            rawTextureId: publicScalar(value.selectionSource.rawTextureId),
            samplerId: publicScalar(value.selectionSource.samplerId),
            surfaceTextureId: publicScalar(
              value.selectionSource.surfaceTextureId,
            ),
            surfaceViewId: publicScalar(value.selectionSource.surfaceViewId),
          },
    selectionFormula: publicScalar(value.selectionFormula),
    probeSampleLod: publicScalar(value.probeSampleLod),
    targetSlug: publicScalar(value.targetSlug),
    traceFrameIndex: publicScalar(value.traceFrameIndex),
  };
}

function isPublicDiagnosticScalar(value) {
  return (
    value === null ||
    value === undefined ||
    ["boolean", "string"].includes(typeof value) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function publicDiagnosticEvidence(value) {
  if (isPublicDiagnosticScalar(value)) return publicScalar(value);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    ArrayBuffer.isView(value)
  ) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(value).slice(0, 64).flatMap(([key, entry]) => {
      if (safePublicKey(key) && isPublicDiagnosticScalar(entry)) {
        return [[key, publicScalar(entry)]];
      }
      return [];
    }),
  );
}

export function selectedReflectionIssues(probe) {
  if (!Array.isArray(probe?.issues)) return [];
  return probe.issues.slice(0, 64).map((entry) => ({
    code: publicScalar(entry?.code),
    evidence: publicDiagnosticEvidence(entry?.evidence),
    message: publicScalar(entry?.message),
  }));
}

export function selectedReflectionSampleFingerprint(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const hash = createHash("sha256");
  for (const sample of samples) {
    const scalarValues = [
      sample?.x,
      sample?.y,
      sample?.luminance,
      sample?.roughness,
      sample?.lod,
    ];
    if (
      typeof sample?.region !== "string" ||
      !Array.isArray(sample?.channels) ||
      !sample.channels.every(Number.isFinite) ||
      !scalarValues.every(
        (value) => value === null || Number.isFinite(value),
      )
    ) {
      return null;
    }
    hash.update(
      JSON.stringify([
        sample.region,
        sample.x,
        sample.y,
        ...(sample.channels ?? []),
        sample.luminance,
        sample.roughness,
        sample.lod,
      ]),
    );
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function publicSelectedReflectionProbe(result, probe) {
  return {
    capturedFrameIndex: Number.isInteger(probe?.capturedFrameIndex)
      ? probe.capturedFrameIndex
      : null,
    evidence: {
      kind: publicScalar(probe?.kind),
      provenance: publicProvenance(probe?.provenance),
      sampling: selected(probe?.sampling, [
        "coordinateSpace",
        "pixelRule",
        "planSampleCount",
        "recordStrideBytes",
        "sampleCount",
      ]),
    },
    issues: selectedReflectionIssues(probe),
    measurements: {
      lod: publicSummary(probe?.lod),
      luminance: publicSummary(probe?.luminance),
      regions: publicRegions(probe?.regions),
      roughness: publicSummary(probe?.roughness),
    },
    name: publicScalar(result?.name),
    sampleFingerprint: selectedReflectionSampleFingerprint(probe?.samples),
    slug: publicScalar(result?.slug),
    status: probe?.status === "ready" ? "ready" : "unavailable",
  };
}

import {
  decodeParticleStateEvidence,
  findParticleVariantDifferences,
  PARTICLE_COUNT,
  particleIssue,
} from "./comparison-particle-state.mjs";

const FIRE_PARTICLE_COUNT = 256;
const CURVE_PARTICLE_COUNT = PARTICLE_COUNT - FIRE_PARTICLE_COUNT;

const PARTICLE_POPULATIONS = Object.freeze({
  fire: Object.freeze({ count: FIRE_PARTICLE_COUNT, start: 0 }),
  curve: Object.freeze({
    count: CURVE_PARTICLE_COUNT,
    start: FIRE_PARTICLE_COUNT,
  }),
});

function roundMetric(value) {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function publicExtraction(extraction) {
  return {
    evidence: extraction.evidence,
    issues: extraction.issues,
    name: extraction.name,
    slug: extraction.slug,
    status: extraction.status,
  };
}

export function extractParticleState(result) {
  const { direct, matrices, selected } = decodeParticleStateEvidence(
    result?.gpu,
  );
  const base = {
    evidence: selected.evidence,
    issues: [],
    name: result?.name ?? null,
    particles: null,
    slug: result?.slug ?? null,
    status: "unavailable",
  };
  if (selected.commands.length === 0) {
    base.issues.push(
      particleIssue(
        "particle-draw-not-found",
        "No additive, depth-read-only draw with 406 instances and six elements was captured.",
      ),
    );
    return base;
  }

  const representationCount =
    Number(direct.recognizedCommands > 0) +
    Number(matrices.recognizedCommands > 0);
  if (representationCount > 1) {
    return {
      ...base,
      issues: [
        particleIssue(
          "ambiguous-particle-state",
          "Both supported particle state representations matched the captured draw.",
          {
            directCommandCount: direct.recognizedCommands,
            matrixCommandCount: matrices.recognizedCommands,
          },
        ),
      ],
      status: "ambiguous",
    };
  }

  const extraction =
    direct.recognizedCommands > 0
      ? direct
      : matrices.recognizedCommands > 0
        ? matrices
        : null;
  if (extraction === null) {
    base.issues.push(
      particleIssue(
        "particle-representation-not-found",
        "The matching draw did not expose a supported structural particle state representation.",
      ),
    );
    return base;
  }
  if (
    extraction.issues.length > 0 ||
    extraction.variants.length !== selected.commands.length
  ) {
    return {
      ...base,
      evidence: {
        ...selected.evidence,
        extractedVariantCount: extraction.variants.length,
        variants: extraction.variants.map((variant) => variant.evidence),
      },
      issues:
        extraction.issues.length > 0
          ? extraction.issues
          : [
              particleIssue(
                "incomplete-particle-state-evidence",
                "Not every selected particle draw produced a complete state variant.",
                {
                  extractedVariantCount: extraction.variants.length,
                  selectedCommandCount: selected.commands.length,
                },
              ),
            ],
      status: extraction.issues.some(
        (issue) => issue.code === "ambiguous-particle-state",
      )
        ? "ambiguous"
        : "unavailable",
    };
  }

  const differingIndices = findParticleVariantDifferences(
    extraction.variants,
  );
  const evidence = {
    ...selected.evidence,
    representation: extraction.variants[0].evidence.representation,
    variantCount: extraction.variants.length,
    variants: extraction.variants.map((variant) => variant.evidence),
  };
  if (differingIndices.length > 0) {
    return {
      ...base,
      evidence,
      issues: [
        particleIssue(
          "conflicting-particle-state-variants",
          "Repeated particle draws in the captured frame consume different particle state.",
          {
            differingParticleCount: differingIndices.length,
            firstDifferingParticle: differingIndices[0],
            variantCount: extraction.variants.length,
          },
        ),
      ],
      status: "ambiguous",
    };
  }
  return {
    ...base,
    evidence,
    issues: [],
    particles: extraction.variants[0].particles,
    status: "ready",
  };
}

function vectorDistance(first, second) {
  return Math.hypot(...first.map((value, index) => value - second[index]));
}

function deltaStatistics(values) {
  const sorted = values.toSorted((first, second) => first - second);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const rms = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );
  return {
    count: values.length,
    max: roundMetric(sorted.at(-1)),
    mean: roundMetric(mean),
    p90: roundMetric(sorted[Math.ceil(sorted.length * 0.9) - 1]),
    rms: roundMetric(rms),
  };
}

function comparePopulation(candidate, reference, { count, start }) {
  const indices = Array.from({ length: count }, (_, index) => start + index);
  return {
    color: deltaStatistics(
      indices.map((index) =>
        vectorDistance(candidate[index].color, reference[index].color),
      ),
    ),
    position: deltaStatistics(
      indices.map((index) =>
        vectorDistance(candidate[index].position, reference[index].position),
      ),
    ),
    radius: deltaStatistics(
      indices.map((index) =>
        Math.abs(candidate[index].radius - reference[index].radius),
      ),
    ),
  };
}

function unavailableReference() {
  return {
    evidence: {},
    issues: [
      particleIssue(
        "particle-reference-result-missing",
        "The comparison has no Three.js reference capture.",
      ),
    ],
    name: null,
    slug: "threejs",
    status: "unavailable",
  };
}

export function findParticleParity(results) {
  const referenceResult = (results ?? []).find(
    (result) => result.slug === "threejs",
  );
  const referenceExtraction =
    referenceResult === undefined
      ? null
      : extractParticleState(referenceResult);
  const reference =
    referenceExtraction === null
      ? unavailableReference()
      : publicExtraction(referenceExtraction);
  const entries = (results ?? [])
    .filter((result) => result !== referenceResult)
    .map((result) => {
      const candidate = extractParticleState(result);
      const entry = publicExtraction(candidate);
      if (referenceExtraction?.status !== "ready") {
        return {
          ...entry,
          issues: [
            ...entry.issues,
            particleIssue(
              "reference-particle-state-unavailable",
              "Particle deltas cannot be calculated without complete, unambiguous reference state.",
              {
                referenceIssueCodes: reference.issues.map(({ code }) => code),
                referenceStatus: reference.status,
              },
            ),
          ],
          status: "unavailable",
        };
      }
      if (candidate.status !== "ready") {
        return entry;
      }
      return {
        ...entry,
        populations: {
          curve: comparePopulation(
            candidate.particles,
            referenceExtraction.particles,
            PARTICLE_POPULATIONS.curve,
          ),
          fire: comparePopulation(
            candidate.particles,
            referenceExtraction.particles,
            PARTICLE_POPULATIONS.fire,
          ),
        },
        status: "compared",
      };
    });

  return {
    entries,
    particleCount: PARTICLE_COUNT,
    populations: PARTICLE_POPULATIONS,
    reference,
  };
}

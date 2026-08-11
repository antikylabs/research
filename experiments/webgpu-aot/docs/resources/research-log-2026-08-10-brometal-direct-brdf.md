# BroMetal direct-light BRDF convergence

Date: 2026-08-10

## Question

Why did BroMetal remain much dimmer than Three around the left fire even after particle state, billboard radius, positions, colors, coverage, point-light selection, attenuation, and authored tangents matched?

The accepted authored-tangent capture showed that the divergence began in the raw HDR scene, before temporal accumulation, SSR, bloom, and presentation:

| Stage | Region | BroMetal | Three |
| --- | --- | ---: | ---: |
| Raw HDR | Full | 0.060190 | 0.064698 |
| Raw HDR | Floor | 0.060595 | 0.064168 |
| Raw HDR | Left fire | 0.773929 | 1.666264 |
| Raw HDR | Right fire | 0.129172 | 0.138163 |
| Raw HDR | Upper gallery | 0.089424 | 0.100728 |
| Temporal | Left fire | 0.762407 | 0.985492 |

Particle parity was already exact. The alpha channel accumulated identically in the left-fire region (`1.022917` in both renderers), proving matching billboard coverage and fragment count. The large RGB difference therefore came from surface lighting, not particle geometry or blend energy.

## Root cause

BroMetal's point and directional lights used a basic direct BRDF:

- Schlick-GGX's inexpensive geometry approximation;
- single-scattering GGX only;
- Lambert diffuse reduced again by the Fresnel term.

Three's native MeshStandard path instead used:

- height-correlated Smith GGX visibility;
- the material DFG at both view and light angles;
- a compensated multiple-scattering lobe;
- Lambert diffuse without BroMetal's extra per-light Fresnel reduction.

The difference was most visible under the intense red point lights, where small BRDF transfer differences become large HDR energy differences. This also explains why a globally reasonable frame could still be severely wrong around one emitter.

## Native BroMetal correction

BroMetal now independently owns the matching direct-light structure in its AOT lighting artifact:

1. `visibilityGGXCorrelated` implements correlated Smith visibility.
2. `directDfgApproximation` evaluates BroMetal's existing analytic split-sum approximation at the view and light angles.
3. `directMultiScattering` restores energy using the same average-Fresnel `/21` compensation structure used by Three.
4. Direct diffuse is the material's nonmetal Lambert term; Fresnel is handled by the specular model instead of reducing diffuse a second time.

No Three source, runtime renderer, shared shader, new GPU resource, light intensity, AO, SSR, temporal, bloom, or presentation constant is used. The result remains a BroMetal-owned static AOT shader.

## Result

Two synchronized heavy captures were metric-identical:

| Capture | Score | Color | Histogram | Luminance | Structure | Tone |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Accepted authored tangents | 0.978899 | 0.990444 | 0.949606 | 0.982735 | 0.987912 | 0.978471 |
| Direct BRDF 1 | 0.980002 | 0.990443 | 0.956344 | 0.984993 | 0.985721 | 0.972580 |
| Direct BRDF 2 | 0.980002 | 0.990443 | 0.956344 | 0.984993 | 0.985721 | 0.972580 |

Raw and temporal regional means moved toward Three:

| Stage | Region | Before | Candidate | Three |
| --- | --- | ---: | ---: | ---: |
| Raw HDR | Full | 0.060190 | 0.063611 | 0.064693 |
| Raw HDR | Floor | 0.060595 | 0.063156 | 0.064683 |
| Raw HDR | Left fire | 0.773929 | 0.885860 | 1.666285 |
| Raw HDR | Right fire | 0.129172 | 0.133055 | 0.138249 |
| Raw HDR | Upper gallery | 0.089424 | 0.102348 | 0.101090 |
| Temporal | Left fire | 0.762407 | 0.884391 | 0.985979 |
| Temporal | Upper gallery | 0.080372 | 0.092140 | 0.091542 |

The full, floor, right-fire, and upper-gallery HDR means are now close to the reference. The left raw peak remains lower (`36.10` versus `204.26`), but Three's temporal resolve suppresses its spike to `60.15`; BroMetal reaches `53.01` after temporal accumulation. That makes the temporally consumed signal much closer than the raw maximum alone suggests.

Captures:

- `/tmp/brometal-direct-brdf-1`
- `/tmp/brometal-direct-brdf-2`

Both captures had all five demos ready at synchronized frame 12, no issues, and no shared renderer pairs.

## Interpretation

This experiment clarifies the preceding geometric-roughness rejection. Roughness was not the first wrong variable in the chain. Applying a reference-correct roughness distribution to a different direct-light transfer redistributed an already-wrong signal and reduced final similarity. Correcting the BRDF consumer first improved the raw signal without altering the material producer.

The remaining tradeoff is visible in the score components: histogram and luminance improved strongly, while structure and tone decreased modestly. The hotspot map moved rather than uniformly shrinking. Future work should inspect the newly exposed temporal/bloom distribution and the remaining left-fire peak shape, not weaken the accepted direct BRDF or retune light intensity.

## Harness lesson

The decisive evidence was the combination of:

- exact particle buffer parity;
- identical particle alpha accumulation;
- raw HDR regional channels;
- temporal-stage regional means and peaks;
- repeated final-image metrics.

Any one of those alone would have left particle brightness, point-light intensity, or postprocessing as plausible but incorrect tuning targets. Producer/consumer lineage is now the preferred workflow for remaining localized lighting gaps.

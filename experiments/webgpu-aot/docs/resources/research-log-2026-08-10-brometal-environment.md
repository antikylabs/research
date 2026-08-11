# BroMetal Environment-Lighting Experiment

## Question

The temporal experiment separated particle smoothing from a remaining regional lighting error: BroMetal's floor/control energy was high while the upper gallery was low. Source inspection found that BroMetal had no environment resource at all. It substituted a two-color hemisphere term, multiplied it by `3.5`, and applied the same AO scalar to that approximation.

Three.js instead loads the six pinned Radiance HDR faces and evaluates roughness-dependent image-based diffuse and specular lighting with multiscattering energy compensation.

## Independent implementation

BroMetal now owns a local Radiance RGBE decoder, validates the six `256x256` square faces, builds and uploads a nine-level `rgba16float` cube, and samples it through a trilinear cube sampler. No runtime code is imported from Three.js or another demo.

The lighting artifact replaces the fake hemisphere term with:

* the same cube orientation correction used by the reference (`-x, y, z`);
* roughness-dependent specular LOD;
* a roughness-to-normal reflection bend;
* an analytic split-sum DFG approximation;
* dielectric and metallic single scattering;
* multiscattering energy compensation;
* diffuse-energy conservation;
* diffuse AO plus roughness/view-dependent specular occlusion.

Direct sun and point lights remain outside AO. Accepted particles, cascades, temporal resolve, SSR, bloom, and output transform remain structurally unchanged.

## Red-first evidence

The initial regression failed because `src/environment.ts` did not exist, the generated lighting shader had no cube binding or multiscattering path, and it still contained the fake hemisphere term. Tests now decode all six real fixtures, check dimensions/finite HDR values/nine mips, exercise the complete cube upload and idempotent destruction contract, and freeze the generated IBL consumer.

The complete BroMetal suite passes 38 tests, package typecheck, deterministic shader regeneration, and the production build.

## Raw-HDR breakthrough

The heavy capture `/tmp/brometal-ibl-1` proved the producer/consumer correction at the intended stage:

| Region | BroMetal raw HDR | Three.js raw HDR | Difference |
| --- | ---: | ---: | ---: |
| Full | 0.063151 | 0.064734 | -2.4% |
| Floor | 0.063424 | 0.064287 | -1.3% |
| Upper gallery | 0.089058 | 0.100701 | -11.6% |
| Right fire | 0.137211 | 0.138117 | -0.7% |

This is the strongest causal result of the experiment. The broad raw scene and floor are now within roughly 2.5% of Three.js without a global ambient multiplier. The right-fire region is within 1%. Upper-gallery indirect light improves but remains low.

The first presentation retained exposure `0.8` and scored `0.940977`, because removing fake ambient made the final image globally darker even though raw HDR was more correct. Exposure was therefore tested as an isolated output-boundary variable rather than weakening IBL.

## Accepted presentation

Exposure `0.9` produced the synchronized capture `/tmp/brometal-ibl-exp09`:

| Metric | Temporal checkpoint | Environment + exposure 0.9 | Change |
| --- | ---: | ---: | ---: |
| Final similarity | 0.948121 | 0.953298 | +0.005177 |
| Color similarity | 0.981279 | 0.984447 | +0.003168 |
| Luminance similarity | 0.970321 | 0.976108 | +0.005787 |
| Histogram similarity | 0.859584 | 0.870929 | +0.011345 |
| Tone similarity | 0.930682 | 0.936295 | +0.005613 |
| Upper-spill contrast | 0.212563 | 0.234368 | +0.021805 |
| Floor-pool contrast | 0.109209 | 0.106201 | -0.003008 |
| Floor coherent rows | 0.949367 | 0.949367 | unchanged |

Upper-spill contrast reaches `1.033838x` Three.js. Floor contrast remains `0.780723x` the reference while its ratio is `0.893531x`; the architectural square remains coherent.

## Remaining gaps

The uploaded mip chain is a CPU box filter, not Three.js PMREM's GGX prefilter and separate DFG texture. The analytic DFG and roughness LOD are credible and substantially better than fake ambient, but rough material highlights will not have identical spatial distributions.

BroMetal also retains its simpler AO estimator. Three.js injects temporally filtered GTAO into indirect material lighting. BroMetal applies its local four-direction estimator only inside IBL, which is graph-correct but not filter-equivalent.

The left-fire raw mean remains lower than Three.js while temporal history is close, confirming that frame-local additive-particle timing and temporal persistence still differ. This should not be corrected with environment gain.

## Decision

Retain the environment cube, energy-conserving IBL consumer, and exposure `0.9`. This is a clear human-eye improvement, raises the synchronized score, and replaces a presentation cheat with authentic BroMetal-owned renderer work. The next BroMetal investigation should isolate PMREM-quality filtering or GTAO, not retune global light or exposure.

## Canonical artifact checkpoint

The canonical heavy-profile artifacts were refreshed at `artifacts/visual-comparison`. All five demos were ready at synchronized frame 12 with no issues, and the report status was `PASS`. The canonical repeat reproduced BroMetal similarity `0.953298`, color `0.984447`, luminance `0.976108`, histogram `0.870929`, tone `0.936295`, upper-spill contrast `0.234368`, floor contrast `0.106201`, floor ratio `1.405960`, and coherent-row fraction `0.949367`.

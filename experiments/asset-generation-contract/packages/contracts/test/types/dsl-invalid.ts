import {
  between,
  frames,
  meters,
  population,
  region,
  scene,
  thing,
  voxelDiorama,
} from "../../src/dsl/index.js";

const pine = thing({ name: "Pine" });
const clearing = region({ name: "Clearing", width: meters(12, 18) });
const grove = population({ name: "Grove", of: pine, amount: between(8, 12) });

thing({
  name: "A thing cannot own a scene loop",
  gameplay: {
    role: "a reusable prop role",
    // @ts-expect-error -- `loop` is scene direction, not gameplay attached to a reusable thing.
    loop: ["enter", "inspect"],
  },
});

thing({
  name: "A thing cannot set scene pace",
  gameplay: {
    role: "a reusable prop role",
    // @ts-expect-error -- `pace` governs a scene's local play, not one thing's affordance.
    pace: "unhurried",
  },
});

thing({
  name: "A thing cannot choose the controlled population",
  gameplay: {
    role: "a reusable prop role",
    // @ts-expect-error -- `playAs` is a scene-only reference to a placed population.
    playAs: grove,
  },
});

thing({
  name: "Invalid specialization",
  // @ts-expect-error -- specialization can target only another reusable thing definition.
  basedOn: grove,
});

thing({
  name: "Invalid whole-part graph",
  // @ts-expect-error -- named parts are direct thing dependencies; a region is not a reusable part.
  parts: { clearing },
});

region({
  name: "Invalid feature graph",
  // @ts-expect-error -- region features refer to reusable things, not placed populations.
  features: { grove },
});

scene({
  key: "wrong-playable",
  name: "Wrong playable endpoint",
  gameplay: {
    purpose: "prove the endpoint type",
    // @ts-expect-error -- scene `playAs` must identify a placed population, not its thing prototype.
    playAs: pine,
  },
});

population({
  name: "Invalid population prototype",
  // @ts-expect-error -- `population.of` must refer directly to a thing definition.
  of: clearing,
  amount: between(1, 2),
});

// @ts-expect-error -- Goal 1 framing is directional: population source, then region target.
frames(clearing, grove);

scene({
  key: "unsupported-density",
  name: "Unsupported density",
  visual: {
    language: "voxel diorama",
    // @ts-expect-error -- density is a stable finite vocabulary; subjective prose belongs elsewhere.
    density: "cinematic",
  },
});

region({
  name: "Missing unit wrapper",
  // @ts-expect-error -- region width is a unit-bearing measurement, not a unitless numeric range.
  width: between(10, 20),
});

population({
  name: "Wrong amount wrapper",
  of: pine,
  // @ts-expect-error -- population amount is a count range, not a distance in meters.
  amount: meters(2, 4),
});

population({
  name: "Unconstructed range",
  of: pine,
  // @ts-expect-error -- range records come from between(), which validates and brands their shape.
  amount: { kind: "range", min: 1, max: 2 },
});

region({
  name: "Unconstructed unit",
  // @ts-expect-error -- distance records come from meters(), which validates and brands their shape.
  width: { kind: "meters", value: 12 },
});

thing({
  name: "Raw backend field",
  // @ts-expect-error -- backend components are allowed only inside the explicit validated `technical` escape hatch.
  components: { "geometry.treeGrammar": {} },
});

const aliasedRawThing = {
  name: "Aliased raw backend field",
  components: { "geometry.treeGrammar": {} },
};
// @ts-expect-error -- aliases do not bypass the exact ordinary authoring shape.
thing(aliasedRawThing);

const aliasedSceneGameplayOnThing = {
  name: "Aliased scene gameplay",
  gameplay: { role: "invalid mixed gameplay", loop: ["move"], pace: "fast" },
};
// @ts-expect-error -- nested aliased gameplay is exact for the thing archetype.
thing(aliasedSceneGameplayOnThing);

type PublicProfileShape = {
  readonly [Key in keyof typeof voxelDiorama as Key extends string ? Key : never]:
    (typeof voxelDiorama)[Key];
};
const structurallyCopiedProfile: PublicProfileShape = { ...voxelDiorama };
scene({
  key: "custom-profile",
  name: "Custom profile",
  profiles: [
    // @ts-expect-error -- ordinary authors select an installed profile capability, not raw phase/schema policy.
    structurallyCopiedProfile,
  ],
});

const renamedInstalledProfile = { ...voxelDiorama, id: "custom-profile" };
scene({
  key: "renamed-profile",
  name: "Renamed profile",
  profiles: [
    // @ts-expect-error -- the installed Goal 1 capability has an exact identity and version.
    renamedInstalledProfile,
  ],
});

const readonlyThing = thing({ name: "Immutable" });
// @ts-expect-error -- constructor results expose deeply readonly authoring data.
readonlyThing.name = "Mutated";

const readonlyComposite = thing({ name: "Composite", parts: { crown: pine } });
if (readonlyComposite.parts !== undefined) {
  // @ts-expect-error -- nested definition records are readonly as well as runtime-frozen.
  readonlyComposite.parts.crown = thing({ name: "Replacement" });
}

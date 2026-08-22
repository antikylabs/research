import { describe, expect, it } from "vitest";

import {
  between,
  frames,
  meters,
  population,
  referenceImage,
  region,
  scene,
  thing,
  voxelDiorama,
  type ThingDefinition,
} from "../src/dsl/index.js";

function expectDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return;
  }

  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectDeeplyFrozen(child, seen);
  }
}

describe("declarative DSL", () => {
  it("constructs the active scene field shapes with typed direct references", () => {
    const groveImage = referenceImage("./winter-grove.png");
    const pine = thing({
      name: "Mature snow pine",
      references: [{ image: groveImage, use: "shared miniature scale and snow treatment" }],
      identity: ["tall and old", "visible branch structure"],
      shape: { height: meters(11.5, 17.5), form: "irregular and layered" },
      visual: { language: "soft voxel miniature", detail: "readable branch forks" },
      gameplay: { role: "reward close observation", playerCan: ["inspect bark"] },
      variation: {
        vary: ["height", "lean", "snow load"],
        preserve: ["mature proportions"],
      },
      rules: { must: ["retain a visible trunk"], avoid: ["perfect symmetry"] },
      avoid: ["single-cone crowns"],
    });
    const crown = thing({ name: "Rounded crown", basedOn: pine });
    const tree = thing({ name: "Rounded winter tree", basedOn: pine, parts: { crown } });
    const clearing = region({
      name: "Sheltered clearing",
      references: [{ image: groveImage, use: "open breathing room" }],
      purpose: ["visual breathing room", "player movement"],
      shape: "irregular oval",
      width: meters(18, 22),
      features: { landmark: tree },
      keep: ["the middle open"],
      avoid: ["a closed perimeter"],
    });
    const oldGrowth = population({
      name: "Old-growth pines",
      of: tree,
      amount: between(22, 34),
      placement: {
        around: clearing,
        pattern: "loose clusters",
        spacing: meters(3.2, 5.8),
        leave: ["several perimeter gaps"],
      },
      role: ["frame the clearing"],
      variation: { vary: ["cluster size"], avoid: ["grid spacing"] },
    });
    const framing = frames(oldGrowth, clearing, {
      coverage: "most, but not all, of the clearing edge",
      opening: "toward deep forest",
      avoid: "a continuous tree wall",
    });
    const contract = scene({
      key: "blue-winter-grove",
      name: "Blue Winter Grove",
      profiles: [voxelDiorama],
      references: [{ image: groveImage, use: "scene mood and clearing composition" }],
      experience: {
        fantasy: "Enter a sheltered winter grove.",
        feel: ["quiet", "cold"],
        firstRead: ["an open clearing"],
        closerLook: ["snow shelves"],
      },
      visual: {
        language: "rich, dense voxel diorama",
        lighting: "painterly blue hour",
        density: "medium-high",
        silhouettes: "layered and irregular",
        detail: "simple at first read, rich nearby",
        avoid: ["uniform scatter"],
      },
      gameplay: {
        playAs: oldGrowth,
        purpose: "quiet exploration",
        loop: ["notice", "approach", "inspect"],
        playerCan: ["inspect the focal pine"],
        pace: "unhurried",
        spaceMust: ["keep the clearing traversable"],
      },
      definitions: { pine, crown, tree },
      cast: { clearing, oldGrowth },
      composition: [framing],
      rules: { must: ["keep the clearing open"], avoid: ["obvious grids"] },
      acceptance: {
        checks: [
          {
            key: "old-growth-count",
            subject: oldGrowth,
            measure: "population count",
            expected: between(22, 34),
          },
        ],
        review: ["Does the clearing read immediately?"],
      },
    });

    expect(contract.kind).toBe("scene");
    expect(contract.definitions?.tree).toBe(tree);
    expect(contract.cast?.clearing).toBe(clearing);
    expect(contract.gameplay?.playAs).toBe(oldGrowth);
    expect(contract.references?.[0]?.image).toBe(groveImage);
    expect(tree.basedOn).toBe(pine);
    expect(tree.parts?.crown).toBe(crown);
    expect(oldGrowth.of).toBe(tree);
    expect(oldGrowth.placement?.around).toBe(clearing);
    expect(framing.source).toBe(oldGrowth);
    expect(framing.target).toBe(clearing);
    expectDeeplyFrozen(contract);
  });

  it("clones author-owned containers without mutating them", () => {
    const identity = ["old", "asymmetrical"];
    const input = { name: "Pine", identity };
    const pine = thing(input);

    input.name = "Changed outside the declaration";
    identity.push("changed later");

    expect(pine).toEqual({ kind: "thing", name: "Pine", identity: ["old", "asymmetrical"] });
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(identity)).toBe(false);
    expect(() => Object.assign(pine, { name: "Mutation attempt" })).toThrow(TypeError);
    expect(() => Object.assign(pine.identity ?? [], { 0: "Mutation attempt" })).toThrow(TypeError);
    expect(pine.name).toBe("Pine");
    expect(pine.identity?.[0]).toBe("old");
  });

  it("does not trust a forged frozen declaration shell with mutable children", () => {
    const identity = ["before"];
    // Safety: this runtime regression deliberately bypasses the constructor-only static contract.
    const forged = Object.freeze({ kind: "thing", name: "Forged", identity }) as ThingDefinition;
    const contract = scene({
      key: "forged-shell",
      name: "Forged shell",
      definitions: { forged },
    });

    identity[0] = "after";

    expect(contract.definitions?.forged).not.toBe(forged);
    expect(contract.definitions?.forged?.identity).toEqual(["before"]);
    expectDeeplyFrozen(contract);
  });

  it("preserves already-built declaration and image identity while cloning owner records", () => {
    const image = referenceImage("./tree.png");
    const base = thing({ name: "Base", references: [{ image, use: "silhouette" }] });
    const parts = { trunk: base };
    const composite = thing({ name: "Composite", basedOn: base, parts });

    parts.trunk = thing({ name: "Replacement" });

    expect(composite.basedOn).toBe(base);
    expect(composite.parts?.trunk).toBe(base);
    expect(base.references?.[0]?.image).toBe(image);
  });

  it("creates independent declarations without registration state", () => {
    const first = thing({ name: "Pine" });
    const second = thing({ name: "Pine" });

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(Object.keys(first)).toEqual(["kind", "name"]);
  });

  it("validates numeric semantic values at construction", () => {
    expect(() => between(3, 2)).toThrow(/must not exceed/);
    expect(() => between(Number.NaN, 2)).toThrow(/finite/);
    expect(() => meters(1, Number.POSITIVE_INFINITY)).toThrow(/finite/);
    expect(() => referenceImage("")).toThrow(/must not be empty/);
  });

  it("rejects executable and cyclic data even when static types are bypassed", () => {
    const executablePayload = { callback: "serializable text" };
    Object.defineProperty(executablePayload, "callback", {
      enumerable: true,
      value: () => undefined,
    });
    expect(() =>
      thing({
        name: "Executable",
        technical: {
          components: {
            "example.callback": executablePayload,
          },
        },
      }),
    ).toThrow(/unsupported function/);

    const cyclic: { name: string; shape?: unknown } = { name: "Cyclic" };
    cyclic.shape = cyclic;
    expect(() => thing(cyclic as Parameters<typeof thing>[0])).toThrow(/object cycle/);
  });

  it("exposes the complete profile policy as deeply frozen data", () => {
    expect(voxelDiorama.id).toBe("voxel-diorama");
    expect(voxelDiorama.version).toBe("0.1.0");
    expect(voxelDiorama.schema.contract.version).toBe("0.2.0");
    expect(voxelDiorama.schema.catalog.version).toBe("0.1.0");
    expect(voxelDiorama.systems.at(-1)?.dependsOn).toEqual([
      "system.validate.contract-and-structure",
    ]);
    expect(voxelDiorama.outputs.files).toEqual([
      "resolved-contract.json",
      "diagnostics.json",
      "contract-index.json",
      "contract.refs.ts",
      "build-manifest.json",
    ]);
    expectDeeplyFrozen(voxelDiorama);
  });
});

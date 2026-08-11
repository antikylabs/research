import { describe, expect, it } from "vitest";

import {
  createBroMetalFallbackTangents,
  requiredAttributeAccessors,
} from "../src/scene.js";

describe("BroMetal glTF geometry contract", () => {
  it("preserves authored tangent accessors and marks the one fallback", () => {
    expect(
      requiredAttributeAccessors({
        POSITION: 4,
        NORMAL: 5,
        TEXCOORD_0: 6,
        TANGENT: 7,
      }),
    ).toEqual({ positions: 4, normals: 5, tangents: 7, texcoords: 6 });
    expect(
      requiredAttributeAccessors({ POSITION: 4, NORMAL: 5, TEXCOORD_0: 6 }),
    ).toEqual({ positions: 4, normals: 5, tangents: null, texcoords: 6 });
    expect(Array.from(createBroMetalFallbackTangents(2))).toEqual([
      1, 0, 0, 1,
      1, 0, 0, 1,
    ]);
  });

  it("still rejects attributes required to rasterize the pinned scene", () => {
    expect(() =>
      requiredAttributeAccessors({ POSITION: 4, TEXCOORD_0: 6 }),
    ).toThrow("NORMAL");
  });
});

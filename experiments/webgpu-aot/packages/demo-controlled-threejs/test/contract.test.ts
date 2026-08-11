import { describe, expect, it } from "vitest";

import {
  CONTROLLED_THREE_TASK,
  resolveControlledThreeProfile,
} from "../src/contract.js";

describe("controlled Three.js architecture arm", () => {
  it("pins the same task while treating framework topology as an outcome", () => {
    expect(CONTROLLED_THREE_TASK).toEqual({
      analyticLights: 32,
      comparisonRole: "framework-architecture",
      logicalDraws: 2,
      logicalRenderStages: 2,
      sampleCount: 1,
      taskId: "full-screen-static-32-light-ggx-aces-v1",
    });
  });

  it("uses the same controlled render dimensions", () => {
    expect(resolveControlledThreeProfile("smoke")).toEqual({
      height: 720,
      name: "smoke",
      width: 1280,
    });
    expect(resolveControlledThreeProfile("extreme")).toEqual({
      height: 2160,
      name: "extreme",
      width: 3840,
    });
    expect(resolveControlledThreeProfile("unknown")).toEqual({
      height: 1440,
      name: "heavy",
      width: 2560,
    });
  });
});

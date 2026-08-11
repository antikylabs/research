import { describe, expect, it, vi } from "vitest";

import { createTypeGpuRendererLifetime } from "../src/renderer-lifetime.js";

describe("TypeGPU renderer startup lifetime", () => {
  it("releases owned shadows and the root exactly once after startup fails", () => {
    const root = { destroy: vi.fn() };
    const shadows = { destroy: vi.fn() };
    const lifetime = createTypeGpuRendererLifetime(root);
    const failure = new Error("injected post-shadow startup failure");

    expect(lifetime.ownShadows(shadows)).toBe(shadows);
    let thrown: unknown;
    try {
      lifetime.fail(failure);
    } catch (error) {
      thrown = error;
    }
    lifetime.destroy();

    expect(thrown).toBe(failure);
    expect(shadows.destroy).toHaveBeenCalledOnce();
    expect(root.destroy).toHaveBeenCalledOnce();
  });
});

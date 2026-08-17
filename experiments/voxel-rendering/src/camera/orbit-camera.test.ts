import { describe, expect, it } from 'vitest';

import { OrbitCamera } from './orbit-camera.ts';

describe('OrbitCamera', () => {
  it('produces finite orthonormal camera data and revisions sample-defining changes', () => {
    const camera = new OrbitCamera({ distance: 48, pitch: 0.45, yaw: 0.7 });
    const initial = camera.snapshot(16 / 9);

    camera.orbit(0.2, -0.1);
    camera.zoom(-4);
    const changed = camera.snapshot(16 / 9);

    expect(changed.revision).toBe(initial.revision + 2);
    expect([...changed.viewProjection].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...changed.forward)).toBeCloseTo(1);
    expect(Math.hypot(...changed.right)).toBeCloseTo(1);
    expect(Math.abs(changed.forward[0] * changed.right[0]
      + changed.forward[1] * changed.right[1]
      + changed.forward[2] * changed.right[2])).toBeLessThan(1e-6);
  });

  it('does not revise when clamping leaves the camera unchanged', () => {
    const camera = new OrbitCamera({ distance: 8, minDistance: 8 });
    const before = camera.revision;

    camera.zoom(-100);

    expect(camera.revision).toBe(before);
  });
});


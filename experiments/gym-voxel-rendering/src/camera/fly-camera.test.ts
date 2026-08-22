import { describe, expect, it } from 'vitest';

import { FlyCamera } from './fly-camera.ts';

describe('FlyCamera', () => {
  it('moves in view-relative axes with frame-rate-independent distance', () => {
    const oneStep = new FlyCamera({ position: [0, 10, 0], yaw: 0, pitch: 0, movementSpeed: 12 });
    const twoSteps = new FlyCamera({ position: [0, 10, 0], yaw: 0, pitch: 0, movementSpeed: 12 });

    oneStep.move({ forward: 1, right: 1, up: 0 }, 1);
    twoSteps.move({ forward: 1, right: 1, up: 0 }, 0.5);
    twoSteps.move({ forward: 1, right: 1, up: 0 }, 0.5);

    expect(oneStep.snapshot(1).position).toEqual(twoSteps.snapshot(1).position);
    expect(Math.hypot(...oneStep.snapshot(1).position)).toBeCloseTo(Math.hypot(12, 10));
  });

  it('mouse-look changes yaw and clamps pitch without invalid camera vectors', () => {
    const camera = new FlyCamera({ position: [0, 0, 0], yaw: 0, pitch: 0 });
    const initial = camera.snapshot(16 / 9);

    camera.look(Math.PI / 2, 0);
    const turned = camera.snapshot(16 / 9);
    camera.look(0, 100);
    const changed = camera.snapshot(16 / 9);

    expect(turned.forward[0]).toBeCloseTo(1, 5);
    expect(changed.revision).toBe(initial.revision + 2);
    expect(changed.forward[1]).toBeLessThan(1);
    expect([...changed.viewProjection].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...changed.forward)).toBeCloseTo(1);
    expect(Math.hypot(...changed.right)).toBeCloseTo(1);
    expect(Math.hypot(...changed.up)).toBeCloseTo(1);
  });

  it('reset restores the documented initial pose and no-op updates do not revise', () => {
    const camera = new FlyCamera({ position: [4, 8, 12], yaw: 0.4, pitch: -0.2 });
    const initial = camera.snapshot(1);

    camera.move({ forward: 0, right: 0, up: 0 }, 1);
    camera.look(0, 0);
    expect(camera.revision).toBe(initial.revision);

    camera.move({ forward: 1, right: 0, up: 0 }, 0.5);
    camera.look(0.2, 0.1);
    camera.reset();

    const reset = camera.snapshot(1);
    expect(reset.position).toEqual(initial.position);
    expect(reset.forward).toEqual(initial.forward);
    expect(reset.revision).toBe(initial.revision + 3);
  });
});

import { describe, expect, it } from 'vitest';

import { FlyInput, shouldCaptureFlyKey } from './fly-input.ts';

describe('FlyInput', () => {
  it('maps WASD and vertical keys to a normalized movement intent', () => {
    const input = new FlyInput();
    expect(input.keyDown('KeyW')).toBe(true);
    expect(input.keyDown('KeyD')).toBe(true);
    expect(input.movement()).toEqual({ forward: 1, right: 1, up: 0 });

    input.keyUp('KeyW');
    input.keyDown('Space');
    expect(input.movement()).toEqual({ forward: 0, right: 1, up: 1 });

    input.clear();
    expect(input.movement()).toEqual({ forward: 0, right: 0, up: 0 });
  });

  it('ignores unrelated keys and releases both shift codes', () => {
    const input = new FlyInput();
    expect(input.keyDown('Enter')).toBe(false);
    input.keyDown('ShiftLeft');
    input.keyDown('ShiftRight');
    expect(input.movement().up).toBe(-1);
    input.keyUp('ShiftLeft');
    expect(input.movement().up).toBe(-1);
    input.keyUp('ShiftRight');
    expect(input.movement().up).toBe(0);
  });
});

describe('shouldCaptureFlyKey', () => {
  it('captures movement only outside editable controls', () => {
    expect(shouldCaptureFlyKey('KeyW', null)).toBe(true);
    expect(shouldCaptureFlyKey('Enter', null)).toBe(false);
    expect(shouldCaptureFlyKey('KeyW', { tagName: 'INPUT' })).toBe(false);
    expect(shouldCaptureFlyKey('KeyW', { tagName: 'select' })).toBe(false);
    expect(shouldCaptureFlyKey('KeyW', { isContentEditable: true })).toBe(false);
  });
});

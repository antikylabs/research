import { describe, expect, it, vi } from 'vitest';

import { FlyInput } from '../camera/fly-input.ts';
import { installFlyKeyboardListeners, startStudioPublisher } from './runtime.ts';

function keyboardHost(): Readonly<{
  target: Window;
  fire(type: 'keydown' | 'keyup' | 'blur', event?: Partial<KeyboardEvent>): void;
  listenerCount(): number;
}> {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const target = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      let group = listeners.get(type);
      if (group === undefined) {
        group = new Set();
        listeners.set(type, group);
      }
      group.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      listeners.get(type)?.delete(listener);
    },
  };
  const fire = (type: 'keydown' | 'keyup' | 'blur', event: Partial<KeyboardEvent> = {}): void => {
    for (const listener of listeners.get(type) ?? []) {
      const value = { code: '', target: null, preventDefault: vi.fn(), ...event };
      if (typeof listener === 'function') listener(value as KeyboardEvent);
      else listener.handleEvent(value as KeyboardEvent);
    }
  };
  return {
    // Safety: the test double implements the only Window listener methods used by the installer.
    target: target as Window,
    fire,
    listenerCount: () => [...listeners.values()].reduce((total, group) => total + group.size, 0),
  };
}

describe('studio runtime ownership', () => {
  it('installs one keyboard listener set, gates it by stage activity, and removes it idempotently', () => {
    const host = keyboardHost();
    const input = new FlyInput();
    let active = false;
    const dispose = installFlyKeyboardListeners(host.target, input, () => active);
    expect(host.listenerCount()).toBe(3);

    host.fire('keydown', { code: 'KeyW' });
    expect(input.movement().forward).toBe(0);
    active = true;
    host.fire('keydown', { code: 'KeyW' });
    expect(input.movement().forward).toBe(1);
    host.fire('blur');
    expect(input.movement().forward).toBe(0);

    dispose();
    dispose();
    expect(host.listenerCount()).toBe(0);
    host.fire('keydown', { code: 'KeyW' });
    expect(input.movement().forward).toBe(0);
  });

  it('owns one immediate and periodic publisher and clears its interval once', () => {
    const callbacks: Array<() => void> = [];
    const host = {
      setInterval: vi.fn((handler: () => void, milliseconds: number) => {
        callbacks.push(handler);
        expect(milliseconds).toBe(32);
        return 17;
      }),
      clearInterval: vi.fn(),
    };
    const publish = vi.fn();
    const stop = startStudioPublisher(host, publish);
    expect(publish).toHaveBeenCalledOnce();
    expect(host.setInterval).toHaveBeenCalledOnce();

    const callback = callbacks[0];
    if (callback === undefined) throw new Error('Studio publisher interval was not installed.');
    callback();
    expect(publish).toHaveBeenCalledTimes(2);
    stop();
    stop();
    expect(host.clearInterval).toHaveBeenCalledOnce();
    expect(host.clearInterval).toHaveBeenCalledWith(17);
  });
});

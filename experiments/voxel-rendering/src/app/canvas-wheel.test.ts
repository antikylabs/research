import { describe, expect, it, vi } from 'vitest';

import { attachCanvasWheelZoom } from './canvas-wheel.ts';

describe('attachCanvasWheelZoom', () => {
  it('registers a non-passive wheel listener that zooms and prevents page scrolling', () => {
    let listener: ((event: WheelEvent) => void) | undefined;
    let prevented = false;
    const zoom = vi.fn();
    const canvas = {
      addEventListener: vi.fn((type: string, next: EventListenerOrEventListenerObject) => {
        if (type === 'wheel') listener = next as (event: WheelEvent) => void;
      }),
      removeEventListener: vi.fn(),
    };
    const detach = attachCanvasWheelZoom(canvas as unknown as HTMLCanvasElement, zoom);
    const wheel = {
      deltaY: -120,
      preventDefault: () => { prevented = true; },
    } as WheelEvent;

    listener?.(wheel);

    expect(canvas.addEventListener).toHaveBeenCalledWith(
      'wheel',
      expect.any(Function),
      { passive: false },
    );
    expect(prevented).toBe(true);
    expect(zoom).toHaveBeenCalledWith(-120);

    detach();
    expect(canvas.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
  });
});

import type { FlyMovement } from './fly-camera.ts';

const FLY_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
]);

type EditableTarget = Readonly<{
  tagName?: unknown;
  isContentEditable?: unknown;
}>;

export function shouldCaptureFlyKey(code: string, target: unknown): boolean {
  if (!FLY_KEYS.has(code)) return false;
  if (typeof target !== 'object' || target === null) return true;
  const candidate = target as EditableTarget;
  const tagName = typeof candidate.tagName === 'string' ? candidate.tagName.toLowerCase() : '';
  return candidate.isContentEditable !== true
    && tagName !== 'input'
    && tagName !== 'select'
    && tagName !== 'textarea'
    && tagName !== 'button';
}

/** Pressed-key state kept outside React so held movement does not trigger component renders. */
export class FlyInput {
  readonly #pressed = new Set<string>();

  keyDown(code: string): boolean {
    if (!FLY_KEYS.has(code)) return false;
    this.#pressed.add(code);
    return true;
  }

  keyUp(code: string): boolean {
    if (!FLY_KEYS.has(code)) return false;
    this.#pressed.delete(code);
    return true;
  }

  clear(): void {
    this.#pressed.clear();
  }

  movement(): FlyMovement {
    return Object.freeze({
      forward: Number(this.#pressed.has('KeyW')) - Number(this.#pressed.has('KeyS')),
      right: Number(this.#pressed.has('KeyD')) - Number(this.#pressed.has('KeyA')),
      up: Number(this.#pressed.has('Space'))
        - Number(this.#pressed.has('ShiftLeft') || this.#pressed.has('ShiftRight')),
    });
  }
}

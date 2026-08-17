import { FlyInput, shouldCaptureFlyKey } from '../camera/fly-input.ts';

export function installFlyKeyboardListeners(
  target: Window,
  input: FlyInput,
  isActive: () => boolean,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isActive() || !shouldCaptureFlyKey(event.code, event.target)) return;
    if (input.keyDown(event.code)) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (input.keyUp(event.code)) event.preventDefault();
  };
  const onBlur = (): void => input.clear();
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
    input.clear();
  };
}

type IntervalHost = Readonly<{
  setInterval(handler: () => void, milliseconds: number): number;
  clearInterval(id: number): void;
}>;

/** Publish immediately, then own exactly one periodic host-state update until stopped. */
export function startStudioPublisher(
  host: IntervalHost,
  publish: () => void,
  milliseconds = 32,
): () => void {
  publish();
  const interval = host.setInterval(publish, milliseconds);
  let running = true;
  return () => {
    if (!running) return;
    running = false;
    host.clearInterval(interval);
  };
}

export interface LoadingDisplay {
  fail(message: string): void;
  ready(message: string): void;
  update(completed: number, total: number, message: string): void;
}

export function createLoadingDisplay(root: ParentNode): LoadingDisplay {
  const status = root.querySelector<HTMLElement>("#status");
  const progress = root.querySelector<HTMLProgressElement>("#load-progress");
  const percent = root.querySelector<HTMLElement>("#load-percent");
  const bits = [...root.querySelectorAll<HTMLElement>("[data-load-bit]")];
  const set = (message: string, ratio: number): void => {
    const value = Math.max(0, Math.min(1, ratio));
    if (status !== null) status.textContent = message;
    if (progress !== null) progress.value = value;
    if (percent !== null) percent.textContent = `${Math.round(value * 100)}%`;
    const active = Math.ceil(value * bits.length);
    bits.forEach((bit, index) => bit.classList.toggle("active", index < active));
  };
  return {
    update(completed, total, message): void {
      set(message, total === 0 ? 0 : completed / total);
    },
    ready(message): void {
      set(message, 1);
      root.querySelector<HTMLElement>(".loading-card")?.classList.add("ready");
    },
    fail(message): void {
      set(message, 1);
      root.querySelector<HTMLElement>(".loading-card")?.classList.add("failed");
    },
  };
}

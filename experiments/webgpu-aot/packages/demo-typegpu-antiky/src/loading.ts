export interface LoadingProgress {
  readonly completed: number;
  readonly label: string;
  readonly total: number;
}

export interface LoadingDisplay {
  fail(message: string): void;
  ready(message: string): void;
  update(progress: LoadingProgress): void;
}

export function createLoadingDisplay(root: ParentNode): LoadingDisplay {
  const status = root.querySelector<HTMLElement>("#status");
  const progress = root.querySelector<HTMLProgressElement>("#load-progress");
  const percent = root.querySelector<HTMLElement>("#load-percent");
  const bits = [...root.querySelectorAll<HTMLElement>("[data-load-bit]")];

  const set = (message: string, value: number): void => {
    const bounded = Math.max(0, Math.min(1, value));
    if (status !== null) status.textContent = message;
    if (progress !== null) progress.value = bounded;
    if (percent !== null) percent.textContent = `${Math.round(bounded * 100)}%`;
    const active = Math.ceil(bounded * bits.length);
    bits.forEach((bit, index) => bit.classList.toggle("active", index < active));
  };

  return {
    update({ completed, label, total }): void {
      set(label, total === 0 ? 0 : completed / total);
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

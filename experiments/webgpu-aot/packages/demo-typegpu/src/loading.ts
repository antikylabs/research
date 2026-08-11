export interface ProgressUpdate {
  readonly done: number;
  readonly message: string;
  readonly total: number;
}

export interface LoadingDisplay {
  fail(message: string): void;
  ready(message: string): void;
  update(update: ProgressUpdate): void;
}

export function createLoadingDisplay(root: ParentNode): LoadingDisplay {
  const panel = root.querySelector<HTMLElement>(".loading-card");
  const status = root.querySelector<HTMLElement>("#status");
  const bar = root.querySelector<HTMLProgressElement>("#load-progress");
  const percent = root.querySelector<HTMLElement>("#load-percent");
  const bits = [...root.querySelectorAll<HTMLElement>("[data-load-bit]")];

  const render = (message: string, value: number): void => {
    const progress = Math.max(0, Math.min(1, value));
    if (status !== null) status.textContent = message;
    if (bar !== null) bar.value = progress;
    if (percent !== null) percent.textContent = `${Math.round(progress * 100)}%`;
    bits.forEach((bit, index) =>
      bit.classList.toggle("active", index < Math.ceil(progress * bits.length)),
    );
  };
  return {
    update({ done, message, total }): void {
      render(message, total === 0 ? 0 : done / total);
    },
    ready(message): void {
      render(message, 1);
      panel?.classList.add("ready");
    },
    fail(message): void {
      render(message, 1);
      panel?.classList.add("failed");
    },
  };
}

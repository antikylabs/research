interface Destroyable {
  destroy(): void;
}

export interface TypeGpuRendererLifetime {
  destroy(): void;
  fail(error: unknown): never;
  ownShadows<T extends Destroyable>(shadows: T): T;
}

export function createTypeGpuRendererLifetime(
  root: Destroyable,
): TypeGpuRendererLifetime {
  let shadows: Destroyable | undefined;
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    shadows?.destroy();
    root.destroy();
  };
  return {
    destroy,
    fail(error: unknown): never {
      destroy();
      throw error;
    },
    ownShadows<T extends Destroyable>(resources: T): T {
      if (destroyed) resources.destroy();
      else shadows = resources;
      return resources;
    },
  };
}

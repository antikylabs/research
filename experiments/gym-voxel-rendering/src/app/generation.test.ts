import { describe, expect, it } from 'vitest';

import { GenerationFence } from './generation.ts';

describe('GenerationFence', () => {
  it('prevents stale async work from replacing the newest generation', () => {
    const fence = new GenerationFence();
    const first = fence.begin();
    const second = fence.begin();

    expect(fence.isCurrent(first)).toBe(false);
    expect(fence.isCurrent(second)).toBe(true);
    fence.cancel();
    expect(fence.isCurrent(second)).toBe(false);
  });
});

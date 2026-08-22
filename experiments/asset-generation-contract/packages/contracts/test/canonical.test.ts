import { describe, expect, it } from 'vitest';

import { canonicalStringify, hashCanonical } from '../src/compiler/canonical.js';

describe('canonical JSON', () => {
  it('sorts object keys, preserves array order, normalizes negative zero, and writes one LF newline', () => {
    expect(canonicalStringify({ z: -0, a: [{ y: 2, x: 1 }, 'second'] })).toBe(
      '{\n  "a": [\n    {\n      "x": 1,\n      "y": 2\n    },\n    "second"\n  ],\n  "z": 0\n}\n',
    );
  });

  it('hashes canonical bytes rather than insertion order', () => {
    expect(hashCanonical({ beta: 2, alpha: 1 })).toBe(hashCanonical({ alpha: 1, beta: 2 }));
  });

  it('rejects undefined and non-finite output values with their paths', () => {
    expect(() => canonicalStringify({ value: undefined })).toThrow('$.value');
    expect(() => canonicalStringify({ values: [Number.POSITIVE_INFINITY] })).toThrow('$.values[0]');
  });
});

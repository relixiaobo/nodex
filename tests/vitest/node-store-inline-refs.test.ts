import { describe, expect, it } from 'vitest';
import { remapInlineRefsByPlaceholderOrder } from '../../src/stores/node-store.js';

const INLINE_REF_CHAR = '\uFFFC';

describe('node-store inline ref remap', () => {
  it('remaps refs by placeholder order in next text', () => {
    const prev = [
      { offset: 1, targetNodeId: 'ref_a', displayName: 'A' },
      { offset: 6, targetNodeId: 'ref_b', displayName: 'B' },
    ];

    const next = `X${INLINE_REF_CHAR}abc${INLINE_REF_CHAR}YZ`;
    expect(remapInlineRefsByPlaceholderOrder(next, prev)).toEqual([
      { offset: 1, targetNodeId: 'ref_a', displayName: 'A' },
      { offset: 5, targetNodeId: 'ref_b', displayName: 'B' },
    ]);
  });

  it('truncates when placeholders are deleted', () => {
    const prev = [
      { offset: 0, targetNodeId: 'ref_a' },
      { offset: 2, targetNodeId: 'ref_b' },
    ];
    const next = `ab${INLINE_REF_CHAR}cd`;

    expect(remapInlineRefsByPlaceholderOrder(next, prev)).toEqual([
      { offset: 2, targetNodeId: 'ref_a' },
    ]);
  });

  it('keeps existing refs when placeholders are added', () => {
    const prev = [{ offset: 0, targetNodeId: 'ref_a' }];
    const next = `${INLINE_REF_CHAR}a${INLINE_REF_CHAR}b`;

    expect(remapInlineRefsByPlaceholderOrder(next, prev)).toEqual([
      { offset: 0, targetNodeId: 'ref_a' },
    ]);
  });

  it('sorts previous refs by old offset before remapping', () => {
    const prev = [
      { offset: 10, targetNodeId: 'ref_late' },
      { offset: 2, targetNodeId: 'ref_early' },
    ];
    const next = `a${INLINE_REF_CHAR}b${INLINE_REF_CHAR}c`;

    expect(remapInlineRefsByPlaceholderOrder(next, prev)).toEqual([
      { offset: 1, targetNodeId: 'ref_early' },
      { offset: 3, targetNodeId: 'ref_late' },
    ]);
  });
});

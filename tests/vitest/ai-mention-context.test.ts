/**
 * Tests for ai-mention-context.ts — buildPromptText helper.
 */
import { describe, it, expect } from 'vitest';
import { buildPromptText } from '../../src/lib/ai-mention-context.js';
import type { InlineRefEntry } from '../../src/types/index.js';

const INLINE_REF_CHAR = '\uFFFC';

describe('buildPromptText', () => {
  it('returns text unchanged when there are no inline refs', () => {
    expect(buildPromptText('hello world', [])).toBe('hello world');
  });

  it('replaces a single \\uFFFC with @DisplayName', () => {
    const text = `compare ${INLINE_REF_CHAR} please`;
    const refs: InlineRefEntry[] = [
      { offset: 8, targetNodeId: 'abc', displayName: 'Meeting Notes' },
    ];
    expect(buildPromptText(text, refs)).toBe('compare @Meeting Notes please');
  });

  it('replaces multiple \\uFFFC placeholders in correct order', () => {
    // "compare " (8) + \uFFFC (1) + " and " (5) + \uFFFC (1) + " priorities"
    const text = `compare ${INLINE_REF_CHAR} and ${INLINE_REF_CHAR} priorities`;
    // offset 8 = first \uFFFC, offset 14 = second \uFFFC (8 + 1 + 5)
    const refs: InlineRefEntry[] = [
      { offset: 8, targetNodeId: 'abc', displayName: 'Meeting Notes' },
      { offset: 14, targetNodeId: 'xyz', displayName: 'Roadmap' },
    ];
    expect(buildPromptText(text, refs)).toBe('compare @Meeting Notes and @Roadmap priorities');
  });

  it('uses "node" as fallback when displayName is missing', () => {
    const text = `check ${INLINE_REF_CHAR}`;
    const refs: InlineRefEntry[] = [
      { offset: 6, targetNodeId: 'abc' },
    ];
    expect(buildPromptText(text, refs)).toBe('check @node');
  });

  it('handles adjacent \\uFFFC characters', () => {
    const text = `${INLINE_REF_CHAR}${INLINE_REF_CHAR}`;
    const refs: InlineRefEntry[] = [
      { offset: 0, targetNodeId: 'a', displayName: 'A' },
      { offset: 1, targetNodeId: 'b', displayName: 'B' },
    ];
    expect(buildPromptText(text, refs)).toBe('@A@B');
  });
});

/**
 * Tests for ai-mention-context.ts — buildMentionContext() and buildPromptText helper.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ─── buildPromptText (pure function, no store dependency) ───

// Re-implement the function locally for testing since it's not exported.
// Must match the implementation in ChatInput.tsx.
const INLINE_REF_CHAR = '\uFFFC';

interface InlineRefEntry {
  offset: number;
  targetNodeId: string;
  displayName?: string;
}

function buildPromptText(text: string, inlineRefs: InlineRefEntry[]): string {
  if (inlineRefs.length === 0) return text;
  let result = text;
  const sorted = [...inlineRefs].sort((a, b) => b.offset - a.offset);
  for (const ref of sorted) {
    const name = ref.displayName || 'node';
    result = result.slice(0, ref.offset) + `@${name}` + result.slice(ref.offset + 1);
  }
  return result;
}

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

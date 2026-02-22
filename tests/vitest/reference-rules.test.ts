import { describe, expect, it } from 'vitest';
import { getTreeReferenceBlockReason, isReferenceDisplayCycle } from '../../src/lib/reference-rules.js';

type MockNode = {
  id: string;
  type?: 'reference' | 'fieldEntry';
  targetId?: string;
  children?: string[];
};

function buildGraph(nodes: Record<string, MockNode>) {
  return {
    hasNode: (id: string) => !!nodes[id],
    getNode: (id: string) => nodes[id] ?? null,
    getChildren: (id: string) => nodes[id]?.children ?? [],
  };
}

describe('reference-rules', () => {
  it('blocks self tree reference', () => {
    const g = buildGraph({
      A: { id: 'A', children: [] },
    });
    expect(getTreeReferenceBlockReason('A', 'A', g)).toBe('self_parent');
  });

  it('blocks ancestor/cycle via display graph traversal', () => {
    const g = buildGraph({
      A: { id: 'A', children: ['B'] },
      B: { id: 'B', children: [] },
    });
    expect(getTreeReferenceBlockReason('B', 'A', g)).toBe('would_create_display_cycle');
  });

  it('blocks mutual cross-branch cycle after first tree reference exists', () => {
    const g = buildGraph({
      A: { id: 'A', children: ['rAB'] },
      B: { id: 'B', children: [] },
      rAB: { id: 'rAB', type: 'reference', targetId: 'B' },
    });
    expect(getTreeReferenceBlockReason('B', 'A', g)).toBe('would_create_display_cycle');
  });

  it('detects repeated effective node in render path as display cycle', () => {
    expect(isReferenceDisplayCycle('A', ['root', 'A'])).toBe(true);
    expect(isReferenceDisplayCycle('B', ['root', 'A'])).toBe(false);
  });
});

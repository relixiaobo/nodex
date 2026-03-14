import { beforeEach, describe, expect, it } from 'vitest';
import {
  commitDoc,
  createNode,
  initLoroDocForTest,
  resetLoroDoc,
  setNodeDataBatch,
} from '../../src/lib/loro-doc.js';
import {
  collectRecentReferenceNodes,
  getReferenceCandidateDisabledReason,
  matchDateShortcuts,
} from '../../src/components/references/ReferenceSelector.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import type { Panel, NavigationEvent } from '../../src/types/index.js';

function createNamedNode(id: string, name: string, updatedAt: number, type?: string) {
  createNode(id, null);
  setNodeDataBatch(id, { name, updatedAt, type });
}

describe('collectRecentReferenceNodes', () => {
  beforeEach(() => {
    resetLoroDoc();
    initLoroDocForTest('ws_test');
  });

  it('fills empty-query recent list with globally recently edited nodes', () => {
    createNamedNode(SYSTEM_NODE_IDS.LIBRARY, 'Library', 1000);
    createNamedNode('current', 'Current', 900);
    createNamedNode('n_old', 'Older Note', 1100);
    createNamedNode('n_new', 'New Note', 1800);
    createNamedNode('fd_1', 'Status', 2000, 'fieldDef');
    commitDoc('__seed__');

    const recent = collectRecentReferenceNodes({
      currentNodeId: 'current',
      navHistory: [],
      navIndex: -1,
      panels: [{ id: 'main', nodeId: SYSTEM_NODE_IDS.LIBRARY }] as Panel[],
      limit: 5,
    });

    expect(recent.map((n) => n.id)).toEqual(['n_new', 'n_old']);
  });

  it('prefers panels + navigation history order before fallback candidates', () => {
    createNamedNode(SYSTEM_NODE_IDS.LIBRARY, 'Library', 1000);
    createNamedNode('current', 'Current', 900);
    createNamedNode('h_1', 'History One', 1200);
    createNamedNode('h_2', 'History Two', 1150);
    createNamedNode('n_1', 'Newest', 2000);
    commitDoc('__seed__');

    // Simulate: panels show h_2 (current panel) and navHistory has navigate events
    const navHistory: NavigationEvent[] = [
      { action: 'navigate', panelId: 'main', fromNodeId: SYSTEM_NODE_IDS.LIBRARY, toNodeId: 'h_1' },
      { action: 'navigate', panelId: 'main', fromNodeId: 'h_1', toNodeId: 'h_2' },
    ];

    const recent = collectRecentReferenceNodes({
      currentNodeId: 'current',
      navHistory,
      navIndex: 1,
      panels: [{ id: 'main', nodeId: 'h_2' }] as Panel[],
      limit: 3,
    });

    // h_2 from panels first, then h_1 from navHistory, then n_1 from fallback
    expect(recent.map((n) => n.id)).toEqual(['h_2', 'h_1', 'n_1']);
  });

  it('deduplicates panels and fallback nodes', () => {
    createNamedNode(SYSTEM_NODE_IDS.LIBRARY, 'Library', 1000);
    createNamedNode('current', 'Current', 900);
    createNamedNode('dup_1', 'Duplicated', 2200);
    createNamedNode('n_1', 'Another', 2100);
    commitDoc('__seed__');

    const recent = collectRecentReferenceNodes({
      currentNodeId: 'current',
      navHistory: [],
      navIndex: -1,
      panels: [{ id: 'main', nodeId: 'dup_1' }] as Panel[],
      limit: 3,
    });

    expect(recent.map((n) => n.id)).toEqual(['dup_1', 'n_1']);
  });
});

describe('matchDateShortcuts', () => {
  it('matches date shortcuts by prefix', () => {
    const matches = matchDateShortcuts('to');
    expect(matches.map((m) => m.keyword)).toEqual(['today', 'tomorrow']);
    expect(matches.every((m) => typeof m.dateName === 'string' && m.dateName.length > 0)).toBe(true);
  });

  it('returns empty on blank query', () => {
    expect(matchDateShortcuts('')).toEqual([]);
  });
});

describe('getReferenceCandidateDisabledReason', () => {
  beforeEach(() => {
    resetLoroDoc();
    initLoroDocForTest('ws_test');
  });

  it('returns null when not in tree-reference context', () => {
    createNamedNode('a', 'A', 100);
    expect(getReferenceCandidateDisabledReason({
      treeReferenceParentId: null,
      targetNodeId: 'a',
    })).toBeNull();
  });

  it('disables self target in tree-reference context', () => {
    createNamedNode('a', 'A', 100);
    commitDoc('__seed__');
    expect(getReferenceCandidateDisabledReason({
      treeReferenceParentId: 'a',
      targetNodeId: 'a',
    })).toContain('own child');
  });

  it('disables ancestor target in tree-reference context', () => {
    createNamedNode('a', 'A', 100);
    createNode('b', 'a');
    setNodeDataBatch('b', { name: 'B', updatedAt: 101 });
    commitDoc('__seed__');

    expect(getReferenceCandidateDisabledReason({
      treeReferenceParentId: 'b',
      targetNodeId: 'a',
    })).toContain('circular');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  commitDoc,
  createNode,
  initLoroDocForTest,
  resetLoroDoc,
  setNodeDataBatch,
} from '../../src/lib/loro-doc.js';
import { collectRecentReferenceNodes } from '../../src/components/references/ReferenceSelector.js';
import { CONTAINER_IDS } from '../../src/types/index.js';

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
    createNamedNode(CONTAINER_IDS.LIBRARY, 'Library', 1000);
    createNamedNode('current', 'Current', 900);
    createNamedNode('n_old', 'Older Note', 1100);
    createNamedNode('n_new', 'New Note', 1800);
    createNamedNode('fd_1', 'Status', 2000, 'fieldDef');
    commitDoc('__seed__');

    const recent = collectRecentReferenceNodes({
      currentNodeId: 'current',
      panelHistory: [CONTAINER_IDS.LIBRARY],
      panelIndex: 0,
      limit: 5,
    });

    expect(recent.map((n) => n.id)).toEqual(['n_new', 'n_old']);
  });

  it('prefers navigation history order before fallback candidates', () => {
    createNamedNode(CONTAINER_IDS.LIBRARY, 'Library', 1000);
    createNamedNode('current', 'Current', 900);
    createNamedNode('h_1', 'History One', 1200);
    createNamedNode('h_2', 'History Two', 1150);
    createNamedNode('n_1', 'Newest', 2000);
    commitDoc('__seed__');

    const recent = collectRecentReferenceNodes({
      currentNodeId: 'current',
      panelHistory: [CONTAINER_IDS.LIBRARY, 'h_1', 'h_2'],
      panelIndex: 2,
      limit: 3,
    });

    expect(recent.map((n) => n.id)).toEqual(['h_2', 'h_1', 'n_1']);
  });

  it('deduplicates history and fallback nodes', () => {
    createNamedNode(CONTAINER_IDS.LIBRARY, 'Library', 1000);
    createNamedNode('current', 'Current', 900);
    createNamedNode('dup_1', 'Duplicated', 2200);
    createNamedNode('n_1', 'Another', 2100);
    commitDoc('__seed__');

    const recent = collectRecentReferenceNodes({
      currentNodeId: 'current',
      panelHistory: [CONTAINER_IDS.LIBRARY, 'dup_1'],
      panelIndex: 1,
      limit: 3,
    });

    expect(recent.map((n) => n.id)).toEqual(['dup_1', 'n_1']);
  });
});

/**
 * Regression tests for node search filtering (SKIP_DOC_TYPES).
 *
 * Exercises the same filter logic as use-node-search.ts but via LoroDoc
 * directly (no React renderer needed). Tests that structural/system node
 * types are excluded from inline-ref search results.
 *
 * Bug history: old code used 'tagDefinition'/'attributeDefinition' instead
 * of the actual type values 'tagDef'/'fieldDef', causing leakage.
 */
import {
  resetLoroDoc,
  initLoroDocForTest,
  createNode,
  setNodeDataBatch,
  commitDoc,
  getAllNodeIds,
  toNodexNode,
} from '../../src/lib/loro-doc.js';
import { isLockedNode, isWorkspaceHomeNode } from '../../src/lib/node-capabilities.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { buildPaletteSearchCandidates, buildReferenceSearchCandidates } from '../../src/hooks/use-node-search';

/** Structural NodeTypes excluded from search (mirrors use-node-search.ts). */
const SKIP_DOC_TYPES = new Set<string>([
  'fieldEntry', 'fieldDef', 'tagDef', 'reference',
]);

/** Replicate the actual search logic from use-node-search.ts */
function searchNodes(query: string, excludeId?: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: { id: string; name: string; updatedAt: number }[] = [];
  for (const id of getAllNodeIds()) {
    if (id === excludeId) continue;
    const node = toNodexNode(id);
    if (!node) continue;
    if (isWorkspaceHomeNode(id) || isLockedNode(id)) continue;
    if (node.type && SKIP_DOC_TYPES.has(node.type)) continue;
    const plainText = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
    if (!plainText) continue;
    if (!plainText.toLowerCase().includes(q)) continue;
    matches.push({ id, name: plainText, updatedAt: node.updatedAt ?? 0 });
  }

  matches.sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    const byName = a.name.localeCompare(b.name, 'en');
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id, 'en');
  });

  return matches.slice(0, 15);
}

beforeEach(() => {
  resetLoroDoc();
  initLoroDocForTest('ws_test');

  // Content nodes — should appear in search
  createNode('n1', null); setNodeDataBatch('n1', { name: 'My Person Note', updatedAt: 1000 });
  createNode('n2', null); setNodeDataBatch('n2', { name: 'Another Note', updatedAt: 3000 });
  createNode('n3', null); setNodeDataBatch('n3', { name: 'Third Note', updatedAt: 2000 });

  // Structural nodes — must be filtered out by type
  createNode('td1', null); setNodeDataBatch('td1', { name: 'Person',      type: 'tagDef' });
  createNode('fd1', null); setNodeDataBatch('fd1', { name: 'Email',        type: 'fieldDef' });
  createNode('fe1', null); setNodeDataBatch('fe1', { name: 'field entry',  type: 'fieldEntry' });
  createNode('ref1', null); setNodeDataBatch('ref1', { name: 'ref data',   type: 'reference' });

  createNode(SYSTEM_NODE_IDS.SETTINGS, null);
  setNodeDataBatch(SYSTEM_NODE_IDS.SETTINGS, { name: 'Settings', locked: true });

  commitDoc('__seed__');
});

describe('node search SKIP_DOC_TYPES filter', () => {
  it('finds content nodes by name', () => {
    const ids = searchNodes('Note').map(r => r.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('n2');
    expect(ids).toContain('n3');
  });

  it('sorts matches by updatedAt desc (most recently edited first)', () => {
    const ids = searchNodes('Note').map(r => r.id);
    expect(ids.slice(0, 3)).toEqual(['n2', 'n3', 'n1']);
  });

  it('filters out tagDef nodes', () => {
    const ids = searchNodes('Person').map(r => r.id);
    expect(ids).toContain('n1');      // "My Person Note" — content node
    expect(ids).not.toContain('td1'); // tagDef "Person" — filtered
  });

  it('filters out fieldDef nodes', () => {
    expect(searchNodes('Email').map(r => r.id)).not.toContain('fd1');
  });

  it('filters out fieldEntry nodes', () => {
    expect(searchNodes('field').map(r => r.id)).not.toContain('fe1');
  });

  it('filters out reference nodes', () => {
    expect(searchNodes('ref').map(r => r.id)).not.toContain('ref1');
  });

  it('filters out locked system nodes', () => {
    expect(searchNodes('Settings').map(r => r.id)).not.toContain(SYSTEM_NODE_IDS.SETTINGS);
  });

  it('returns empty for blank query', () => {
    expect(searchNodes('')).toHaveLength(0);
  });

  it('respects excludeId', () => {
    const ids = searchNodes('Note', 'n1').map(r => r.id);
    expect(ids).not.toContain('n1');
    expect(ids).toContain('n2');
  });
});

describe('buildPaletteSearchCandidates', () => {
  it('includes content nodes and palette-searchable system nodes', () => {
    const candidates = buildPaletteSearchCandidates(new Set());
    const ids = candidates.map(c => c.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('n2');
    // SETTINGS is locked but paletteSearchable — should be included
    expect(ids).toContain(SYSTEM_NODE_IDS.SETTINGS);
  });

  it('excludes quickNavIdSet entries', () => {
    const quickNavIds = new Set(['n1']);
    const candidates = buildPaletteSearchCandidates(quickNavIds);
    const ids = candidates.map(c => c.id);
    expect(ids).not.toContain('n1');
    expect(ids).toContain('n2');
  });
});

describe('buildReferenceSearchCandidates', () => {
  it('includes content nodes but skips structural types', () => {
    const candidates = buildReferenceSearchCandidates();
    const ids = candidates.map(c => c.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('n2');
    expect(ids).not.toContain('td1'); // tagDef
    expect(ids).not.toContain('fd1'); // fieldDef
    expect(ids).not.toContain('fe1'); // fieldEntry
    expect(ids).not.toContain('ref1'); // reference
  });
});

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
import { isWorkspaceContainer } from '../../src/lib/tree-utils.js';
import { CONTAINER_IDS } from '../../src/types/index.js';

/** Structural NodeTypes excluded from search (mirrors use-node-search.ts). */
const SKIP_DOC_TYPES = new Set<string>([
  'fieldEntry', 'fieldDef', 'tagDef', 'reference',
]);

/** Replicate the actual search logic from use-node-search.ts */
function searchNodes(query: string, excludeId?: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: { id: string; name: string }[] = [];
  for (const id of getAllNodeIds()) {
    if (id === excludeId) continue;
    const node = toNodexNode(id);
    if (!node) continue;
    // Workspace containers are excluded by ID, not by type
    if (isWorkspaceContainer(id)) continue;
    if (node.type && SKIP_DOC_TYPES.has(node.type)) continue;
    const plainText = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
    if (!plainText) continue;
    if (!plainText.toLowerCase().includes(q)) continue;
    matches.push({ id, name: plainText });
  }
  return matches;
}

beforeEach(() => {
  resetLoroDoc();
  initLoroDocForTest('ws_test');

  // Content nodes — should appear in search
  createNode('n1', null); setNodeDataBatch('n1', { name: 'My Person Note' });
  createNode('n2', null); setNodeDataBatch('n2', { name: 'Another Note' });

  // Structural nodes — must be filtered out by type
  createNode('td1', null); setNodeDataBatch('td1', { name: 'Person',      type: 'tagDef' });
  createNode('fd1', null); setNodeDataBatch('fd1', { name: 'Email',        type: 'fieldDef' });
  createNode('fe1', null); setNodeDataBatch('fe1', { name: 'field entry',  type: 'fieldEntry' });
  createNode('ref1', null); setNodeDataBatch('ref1', { name: 'ref data',   type: 'reference' });

  // Workspace container — must be filtered out by isWorkspaceContainer()
  // Container nodes are identified by their fixed IDs, not by a 'type' field.
  createNode(CONTAINER_IDS.LIBRARY, null);
  setNodeDataBatch(CONTAINER_IDS.LIBRARY, { name: 'Library' });

  commitDoc('__seed__');
});

describe('node search SKIP_DOC_TYPES filter', () => {
  it('finds content nodes by name', () => {
    const ids = searchNodes('Note').map(r => r.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('n2');
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

  it('filters out workspace container nodes (by ID, not by type)', () => {
    // CONTAINER_IDS.LIBRARY is excluded via isWorkspaceContainer(), not by node.type
    expect(searchNodes('Library').map(r => r.id)).not.toContain(CONTAINER_IDS.LIBRARY);
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

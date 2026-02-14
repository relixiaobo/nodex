/**
 * Regression tests for node search filtering (SKIP_DOC_TYPES).
 *
 * Bug: use-node-search.ts used 'tagDefinition' and 'attributeDefinition'
 * instead of the actual _docType values 'tagDef' and 'attrDef', causing
 * tagDefs/attrDefs to leak into @ search results.
 */
import { useNodeStore } from '../../src/stores/node-store.js';

/** Replicates the SKIP_DOC_TYPES filter logic from use-node-search.ts */
function searchNodes(query: string, excludeId?: string) {
  const SKIP_DOC_TYPES = new Set([
    'tuple', 'metanode', 'associatedData', 'tagDef',
    'attrDef', 'workspace', 'user',
  ]);

  const q = query.trim().toLowerCase();
  if (!q) return [];

  const entities = useNodeStore.getState().entities;
  const matches: { id: string; name: string }[] = [];

  for (const [id, node] of Object.entries(entities)) {
    if (id === excludeId) continue;
    const dt = node.props._docType;
    if (dt && SKIP_DOC_TYPES.has(dt)) continue;
    const rawName = node.props.name ?? '';
    const plainText = rawName.replace(/<[^>]+>/g, '').trim();
    if (!plainText) continue;
    if (!plainText.toLowerCase().includes(q)) continue;
    matches.push({ id, name: plainText });
  }
  return matches;
}

describe('node search SKIP_DOC_TYPES filter', () => {
  beforeEach(() => {
    useNodeStore.setState({
      entities: {
        'ws_LIBRARY': {
          id: 'ws_LIBRARY', workspaceId: 'ws', children: ['n1', 'n2', 'td1', 'ad1'],
          props: { name: 'Library' }, associationMap: {},
        },
        n1: {
          id: 'n1', workspaceId: 'ws', children: [],
          props: { name: 'My Person Note', _ownerId: 'ws_LIBRARY' }, associationMap: {},
        },
        n2: {
          id: 'n2', workspaceId: 'ws', children: [],
          props: { name: 'Another Note', _ownerId: 'ws_LIBRARY' }, associationMap: {},
        },
        td1: {
          id: 'td1', workspaceId: 'ws', children: [],
          props: { name: 'Person', _docType: 'tagDef', _ownerId: 'ws_LIBRARY' }, associationMap: {},
        },
        ad1: {
          id: 'ad1', workspaceId: 'ws', children: [],
          props: { name: 'Email', _docType: 'attrDef', _ownerId: 'ws_LIBRARY' }, associationMap: {},
        },
        tup1: {
          id: 'tup1', workspaceId: 'ws', children: [],
          props: { name: 'tuple data', _docType: 'tuple', _ownerId: 'n1' }, associationMap: {},
        },
        meta1: {
          id: 'meta1', workspaceId: 'ws', children: [],
          props: { name: 'meta data', _docType: 'metanode', _ownerId: 'n1' }, associationMap: {},
        },
      },
    });
  });

  it('filters out tagDef nodes from search results', () => {
    const results = searchNodes('Person');
    // Should find the content node but NOT the tagDef
    expect(results.some(r => r.id === 'n1')).toBe(true); // "My Person Note"
    expect(results.some(r => r.id === 'td1')).toBe(false); // tagDef "Person" — filtered
  });

  it('filters out attrDef nodes from search results', () => {
    const results = searchNodes('Email');
    expect(results.some(r => r.id === 'ad1')).toBe(false); // attrDef "Email" — filtered
  });

  it('filters out tuple and metanode nodes', () => {
    const results = searchNodes('data');
    expect(results.some(r => r.id === 'tup1')).toBe(false);
    expect(results.some(r => r.id === 'meta1')).toBe(false);
  });

  it('returns normal content nodes', () => {
    const results = searchNodes('Note');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.id).sort()).toEqual(['n1', 'n2']);
  });
});

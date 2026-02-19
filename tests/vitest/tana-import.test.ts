import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { NodexNode } from '../../src/types/index.js';

// Mock createNodes to capture the nodes that would be inserted
let capturedNodes: NodexNode[] = [];
vi.mock('../../src/services/node-service.js', () => ({
  createNodes: async (nodes: NodexNode[]) => {
    capturedNodes = nodes;
  },
}));

import { importTanaExport, validateTanaExport } from '../../src/services/tana-import.js';
import type { TanaExportData } from '../../src/services/tana-import.js';

beforeEach(() => {
  capturedNodes = [];
});

describe('Tana Import — meta[] population (Critical Fix)', () => {
  const makeTanaExport = (docs: TanaExportData['docs']): TanaExportData => ({
    editors: [['test@example.com', 0]],
    lastTxid: 'tx_1',
    currentWorkspaceId: 'ws_test',
    docs,
    workspaces: {},
  });

  it('populates node.meta from _metaNodeId → metanode.children', async () => {
    const data = makeTanaExport([
      // Workspace root
      { id: 'ws_test', props: { created: 1000 }, children: ['content_1'] },
      // Content node with _metaNodeId
      {
        id: 'content_1',
        props: { created: 1000, _ownerId: 'ws_test', _metaNodeId: 'meta_1' },
        children: [],
      },
      // Metanode with tuple IDs as children
      {
        id: 'meta_1',
        props: { created: 1000, _docType: 'metanode', _ownerId: 'content_1' },
        children: ['tag_tuple_1', 'cb_tuple_1'],
      },
      // Tag tuple
      {
        id: 'tag_tuple_1',
        props: { created: 1000, _docType: 'tuple', _ownerId: 'content_1' },
        children: ['SYS_A13', 'tagDef_task'],
      },
      // Checkbox tuple
      {
        id: 'cb_tuple_1',
        props: { created: 1000, _docType: 'tuple', _ownerId: 'content_1' },
        children: ['SYS_A55', 'SYS_V03'],
      },
    ]);

    await importTanaExport(data, 'user_1');

    const contentNode = capturedNodes.find((n) => n.id === 'content_1');
    expect(contentNode).toBeTruthy();
    // meta should be populated from metanode.children
    expect(contentNode!.meta).toEqual(['tag_tuple_1', 'cb_tuple_1']);
  });

  it('leaves meta undefined when node has no _metaNodeId', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 }, children: ['plain_1'] },
      {
        id: 'plain_1',
        props: { created: 1000, _ownerId: 'ws_test' },
        children: [],
      },
    ]);

    await importTanaExport(data, 'user_1');

    const plainNode = capturedNodes.find((n) => n.id === 'plain_1');
    expect(plainNode).toBeTruthy();
    expect(plainNode!.meta).toBeUndefined();
  });

  it('handles missing metanode gracefully', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 }, children: ['content_1'] },
      {
        id: 'content_1',
        props: { created: 1000, _ownerId: 'ws_test', _metaNodeId: 'missing_meta' },
        children: [],
      },
    ]);

    await importTanaExport(data, 'user_1');

    const contentNode = capturedNodes.find((n) => n.id === 'content_1');
    expect(contentNode).toBeTruthy();
    // Should not crash, meta stays undefined
    expect(contentNode!.meta).toBeUndefined();
  });
});

describe('Tana Import — DocType sanitization (Critical Fix)', () => {
  const makeTanaExport = (docs: TanaExportData['docs']): TanaExportData => ({
    editors: [],
    lastTxid: 'tx_1',
    currentWorkspaceId: 'ws_test',
    docs,
    workspaces: {},
  });

  it('filters out deprecated metanode docType', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 } },
      {
        id: 'meta_1',
        props: { created: 1000, _docType: 'metanode', _ownerId: 'ws_test' },
      },
    ]);

    await importTanaExport(data, 'user_1');

    const metaNode = capturedNodes.find((n) => n.id === 'meta_1');
    expect(metaNode).toBeTruthy();
    // Deprecated docType should be filtered to undefined
    expect(metaNode!.props._docType).toBeUndefined();
  });

  it('filters out deprecated associatedData docType', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 } },
      {
        id: 'assoc_1',
        props: { created: 1000, _docType: 'associatedData', _ownerId: 'ws_test' },
      },
    ]);

    await importTanaExport(data, 'user_1');

    const assocNode = capturedNodes.find((n) => n.id === 'assoc_1');
    expect(assocNode).toBeTruthy();
    expect(assocNode!.props._docType).toBeUndefined();
  });

  it('preserves valid docTypes like tuple and tagDef', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 } },
      {
        id: 'tuple_1',
        props: { created: 1000, _docType: 'tuple', _ownerId: 'ws_test' },
        children: ['key', 'val'],
      },
      {
        id: 'tagDef_1',
        props: { created: 1000, _docType: 'tagDef', _ownerId: 'ws_test' },
      },
    ]);

    await importTanaExport(data, 'user_1');

    expect(capturedNodes.find((n) => n.id === 'tuple_1')!.props._docType).toBe('tuple');
    expect(capturedNodes.find((n) => n.id === 'tagDef_1')!.props._docType).toBe('tagDef');
  });
});

describe('Tana Import — validateTanaExport', () => {
  it('reports missing refs in Tana export data', () => {
    const data: TanaExportData = {
      editors: [],
      lastTxid: 'tx_1',
      currentWorkspaceId: 'ws_test',
      docs: [
        {
          id: 'node_1',
          props: { created: 1000, _ownerId: 'missing_parent', _metaNodeId: 'missing_meta' },
          children: ['missing_child'],
          associationMap: { missing_key: 'missing_val' },
        },
      ],
      workspaces: {},
    };

    const result = validateTanaExport(data);
    expect(result.missingChildRefs.length).toBe(1);
    expect(result.missingOwnerRefs.length).toBe(1);
    expect(result.missingMetaNodeRefs.length).toBe(1);
    expect(result.missingAssociationRefs.length).toBe(2); // key + value
  });
});

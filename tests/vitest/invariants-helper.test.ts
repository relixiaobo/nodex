import type { NodexNode } from '../../src/types/index.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';

function makeNode(
  id: string,
  opts?: {
    ownerId?: string;
    docType?: string;
    children?: string[];
    associationMap?: Record<string, string>;
  },
): NodexNode {
  return {
    id,
    workspaceId: 'ws_default',
    props: {
      name: id,
      _ownerId: opts?.ownerId,
      _docType: opts?.docType,
    },
    children: opts?.children ?? [],
    associationMap: opts?.associationMap,
    version: 1,
    updatedAt: 0,
    createdBy: 'user_default',
    updatedBy: 'user_default',
  };
}

describe('graph invariant helper', () => {
  it('returns empty list for a valid small graph', () => {
    const entities: Record<string, NodexNode> = {
      root: makeNode('root', { children: ['child'] }),
      child: makeNode('child', { ownerId: 'root' }),
    };
    expect(collectNodeGraphErrors(entities)).toEqual([]);
  });

  it('reports owner/child structure errors', () => {
    const entities: Record<string, NodexNode> = {
      root: makeNode('root'),
      orphan: makeNode('orphan', { ownerId: 'missing_owner' }),
      mismatch: makeNode('mismatch', { ownerId: 'root' }),
      dup_parent: makeNode('dup_parent', { children: ['x', 'x'] }),
    };
    expect(collectNodeGraphErrors(entities)).toEqual(
      expect.arrayContaining([
        'owner missing: node=orphan owner=missing_owner',
        'owner-child mismatch: node=mismatch owner=root',
        'duplicate child id: parent=dup_parent child=x',
      ]),
    );
  });

  it('skips owner-child mismatch for tuple value refs', () => {
    const entities: Record<string, NodexNode> = {
      parent: makeNode('parent', { children: ['tuple_1'] }),
      tuple_1: makeNode('tuple_1', { ownerId: 'parent', docType: 'tuple', children: ['key', 'value_1'] }),
      value_1: makeNode('value_1', { ownerId: 'parent' }),
    };
    const errors = collectNodeGraphErrors(entities);
    expect(errors).not.toContain('owner-child mismatch: node=value_1 owner=parent');
  });

  it('reports association map key/value missing errors', () => {
    const entities: Record<string, NodexNode> = {
      node_1: makeNode('node_1', {
        associationMap: {
          missing_tuple: 'assoc_ok',
          tuple_ok: 'missing_assoc',
        },
      }),
      tuple_ok: makeNode('tuple_ok', { ownerId: 'node_1', docType: 'tuple' }),
      assoc_ok: makeNode('assoc_ok', { ownerId: 'node_1', docType: 'associatedData' }),
    };
    expect(collectNodeGraphErrors(entities)).toEqual(
      expect.arrayContaining([
        'association key missing: node=node_1 tuple=missing_tuple',
        'association value missing: node=node_1 assoc=missing_assoc',
      ]),
    );
  });
});

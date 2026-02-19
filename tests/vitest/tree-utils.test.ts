import type { NodexNode } from '../../src/types/index.js';
import {
  getAncestorChain,
  getFlattenedVisibleNodes,
  getLastVisibleNode,
  getNavigableParentId,
  getNextVisibleNode,
  getNodeIndex,
  getParentId,
  getPreviousSiblingId,
  getPreviousVisibleNode,
  isOnlyInlineRef,
  isWorkspaceContainer,
  isWorkspaceRoot,
} from '../../src/lib/tree-utils.js';

function node(
  id: string,
  workspaceId: string,
  ownerId?: string,
  children?: string[],
  docType?: NodexNode['props']['_docType'],
  name?: string,
): NodexNode {
  return {
    id,
    workspaceId,
    props: {
      created: Date.now(),
      ...(ownerId ? { _ownerId: ownerId } : {}),
      ...(docType ? { _docType: docType } : {}),
      ...(name ? { name } : {}),
    },
    ...(children ? { children } : {}),
    version: 1,
    updatedAt: Date.now(),
    createdBy: 'u',
    updatedBy: 'u',
  };
}

describe('tree-utils', () => {
  it('detects workspace containers and roots', () => {
    const entities: Record<string, NodexNode> = {
      ws_default: node('ws_default', 'ws_default'),
      ws_default_LIBRARY: node('ws_default_LIBRARY', 'ws_default', 'ws_default'),
    };

    expect(isWorkspaceContainer('ws_default_LIBRARY')).toBe(true);
    expect(isWorkspaceContainer('note_1')).toBe(false);
    expect(isWorkspaceRoot('ws_default', entities)).toBe(true);
    expect(isWorkspaceRoot('ws_default_LIBRARY', entities)).toBe(false);
  });

  it('builds ancestor chain while skipping structural nodes', () => {
    const entities: Record<string, NodexNode> = {
      ws: node('ws', 'ws', undefined, ['ws_LIBRARY'], undefined, 'Workspace'),
      ws_LIBRARY: node('ws_LIBRARY', 'ws', 'ws', ['parent'], undefined, 'Library'),
      parent: node('parent', 'ws', 'ws_LIBRARY', ['tuple1'], undefined, '<b>Parent</b>'),
      tuple1: node('tuple1', 'ws', 'parent', ['tuple2'], 'tuple'),
      tuple2: node('tuple2', 'ws', 'tuple1', ['target'], 'tuple'),
      target: node('target', 'ws', 'tuple2'),
    };

    const { ancestors, workspaceRootId } = getAncestorChain('target', entities);
    expect(workspaceRootId).toBe('ws');
    expect(ancestors).toEqual([
      { id: 'ws_LIBRARY', name: 'Library' },
      { id: 'parent', name: 'Parent' },
    ]);

    expect(getNavigableParentId('target', entities)).toBe('parent');
  });

  it('flattens visible nodes and navigates with parent disambiguation', () => {
    const entities: Record<string, NodexNode> = {
      root: node('root', 'ws', undefined, ['a', 'r']),
      a: node('a', 'ws', 'root', ['a1', 'a2']),
      a1: node('a1', 'ws', 'a', ['a1c']),
      a1c: node('a1c', 'ws', 'a1'),
      a2: node('a2', 'ws', 'a'),
      r: node('r', 'ws', 'root', ['a1']), // reference-like duplicate appearance
    };
    const expanded = new Set<string>(['root:a', 'a:a1', 'root:r']);

    const flat = getFlattenedVisibleNodes(['a', 'r'], entities, expanded, 'root');
    expect(flat.map((x) => `${x.parentId}/${x.nodeId}`)).toEqual([
      'root/a',
      'a/a1',
      'a1/a1c',
      'a/a2',
      'root/r',
      'r/a1',
    ]);

    expect(getPreviousVisibleNode('a1', 'r', flat)).toEqual({ nodeId: 'r', parentId: 'root' });
    expect(getNextVisibleNode('a1', 'a', flat)).toEqual({ nodeId: 'a1c', parentId: 'a1' });
  });

  it('finds last visible node and sibling/index helpers', () => {
    const entities: Record<string, NodexNode> = {
      p: node('p', 'ws', undefined, ['c1', 'tupleX', 'c2']),
      c1: node('c1', 'ws', 'p'),
      tupleX: node('tupleX', 'ws', 'p', ['SYS_A13', 'tagDef'], 'tuple'),
      c2: node('c2', 'ws', 'p', ['c2a']),
      c2a: node('c2a', 'ws', 'c2'),
    };

    expect(getLastVisibleNode('p', entities, new Set(['p:c2']))).toEqual({ nodeId: 'c2a', parentId: 'c2' });
    expect(getLastVisibleNode('p', entities, new Set())).toEqual({ nodeId: 'c2', parentId: 'p' });

    expect(getParentId('c2a', entities)).toBe('c2');
    expect(getPreviousSiblingId('c2', entities)).toBe('tupleX');
    expect(getNodeIndex('c2', entities)).toBe(2);
  });

  it('validates inline-ref-only HTML correctly', () => {
    expect(isOnlyInlineRef('')).toBe(true);
    expect(isOnlyInlineRef('\uFFFC', [{ offset: 0 }])).toBe(true);
    expect(isOnlyInlineRef('x\uFFFC', [{ offset: 1 }])).toBe(false);
    expect(isOnlyInlineRef('<span data-inlineref-node="x">X</span>')).toBe(true);
    expect(isOnlyInlineRef('<p><span data-inlineref-node="x">X</span></p>')).toBe(true);
    expect(isOnlyInlineRef('<span data-inlineref-node="x">X</span> tail')).toBe(false);
    expect(
      isOnlyInlineRef('<span data-inlineref-node="x">X</span><span data-inlineref-node="y">Y</span>'),
    ).toBe(false);
  });
});

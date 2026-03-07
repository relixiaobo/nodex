/**
 * sort-utils — tests for node sorting by name, createdAt, and field value.
 */
import { describe, it, expect } from 'vitest';
import { compareNodes, sortNodeIds, type SortConfig } from '../../src/lib/sort-utils.js';
import type { NodexNode } from '../../src/types/node.js';

function makeNode(overrides: Partial<NodexNode>): NodexNode {
  return {
    id: 'n1',
    children: [],
    tags: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('compareNodes', () => {
  const getNode = () => null;

  it('sorts by name ascending', () => {
    const a = makeNode({ name: 'apple' });
    const b = makeNode({ name: 'banana' });
    const config: SortConfig = { field: 'name', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode)).toBeLessThan(0);
  });

  it('sorts by name descending', () => {
    const a = makeNode({ name: 'apple' });
    const b = makeNode({ name: 'banana' });
    const config: SortConfig = { field: 'name', direction: 'desc' };
    expect(compareNodes(a, b, config, getNode)).toBeGreaterThan(0);
  });

  it('sorts by createdAt ascending', () => {
    const a = makeNode({ createdAt: 100 });
    const b = makeNode({ createdAt: 200 });
    const config: SortConfig = { field: 'createdAt', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode)).toBeLessThan(0);
  });

  it('sorts by createdAt descending', () => {
    const a = makeNode({ createdAt: 100 });
    const b = makeNode({ createdAt: 200 });
    const config: SortConfig = { field: 'createdAt', direction: 'desc' };
    expect(compareNodes(a, b, config, getNode)).toBeGreaterThan(0);
  });

  it('returns 0 for equal names', () => {
    const a = makeNode({ name: 'same' });
    const b = makeNode({ name: 'same' });
    const config: SortConfig = { field: 'name', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode)).toBe(0);
  });

  it('handles undefined names as empty strings', () => {
    const a = makeNode({ name: undefined });
    const b = makeNode({ name: 'hello' });
    const config: SortConfig = { field: 'name', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode)).toBeLessThan(0);
  });

  it('sorts by fieldDef value using getNode lookup', () => {
    const fieldDefId = 'fd1';
    const a = makeNode({
      id: 'a',
      children: ['fe_a'],
    });
    const b = makeNode({
      id: 'b',
      children: ['fe_b'],
    });

    const nodes: Record<string, NodexNode> = {
      a, b,
      fe_a: makeNode({ id: 'fe_a', type: 'fieldEntry', fieldDefId, children: ['va'] }),
      fe_b: makeNode({ id: 'fe_b', type: 'fieldEntry', fieldDefId, children: ['vb'] }),
      va: makeNode({ id: 'va', name: 'Zebra' }),
      vb: makeNode({ id: 'vb', name: 'Alpha' }),
    };

    const getNodeFn = (id: string) => nodes[id] ?? null;
    const config: SortConfig = { field: fieldDefId, direction: 'asc' };
    expect(compareNodes(a, b, config, getNodeFn)).toBeGreaterThan(0); // Zebra > Alpha
  });

  it('sorts by updatedAt ascending', () => {
    const a = makeNode({ updatedAt: 500 });
    const b = makeNode({ updatedAt: 900 });
    const config: SortConfig = { field: 'updatedAt', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode)).toBeLessThan(0);
  });

  it('sorts by updatedAt descending', () => {
    const a = makeNode({ updatedAt: 500 });
    const b = makeNode({ updatedAt: 900 });
    const config: SortConfig = { field: 'updatedAt', direction: 'desc' };
    expect(compareNodes(a, b, config, getNode)).toBeGreaterThan(0);
  });

  it('sorts by done: not-done before done in asc', () => {
    const a = makeNode({ completedAt: 1234 });
    const b = makeNode({});
    const config: SortConfig = { field: 'done', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode)).toBeGreaterThan(0); // done after not-done
  });

  it('sorts by done: done before not-done in desc', () => {
    const a = makeNode({ completedAt: 1234 });
    const b = makeNode({});
    const config: SortConfig = { field: 'done', direction: 'desc' };
    expect(compareNodes(a, b, config, getNode)).toBeLessThan(0); // done first
  });

  it('sorts by doneTime ascending (no completedAt sorts last)', () => {
    const a = makeNode({ completedAt: 100 });
    const b = makeNode({}); // no completedAt → Infinity
    const config: SortConfig = { field: 'doneTime', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode)).toBeLessThan(0); // 100 < Infinity
  });

  it('sorts by doneTime descending', () => {
    const a = makeNode({ completedAt: 100 });
    const b = makeNode({ completedAt: 300 });
    const config: SortConfig = { field: 'doneTime', direction: 'desc' };
    expect(compareNodes(a, b, config, getNode)).toBeGreaterThan(0); // 300 > 100, desc reverses
  });

  it('sorts by refCount ascending', () => {
    const a = makeNode({ id: 'a' });
    const b = makeNode({ id: 'b' });
    const backlinkCounts = new Map([['a', 2], ['b', 5]]);
    const config: SortConfig = { field: 'refCount', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode, backlinkCounts)).toBeLessThan(0); // 2 < 5
  });

  it('sorts by refCount descending', () => {
    const a = makeNode({ id: 'a' });
    const b = makeNode({ id: 'b' });
    const backlinkCounts = new Map([['a', 2], ['b', 5]]);
    const config: SortConfig = { field: 'refCount', direction: 'desc' };
    expect(compareNodes(a, b, config, getNode, backlinkCounts)).toBeGreaterThan(0); // 5 > 2, desc reverses
  });

  it('sorts by refCount treats missing counts as 0', () => {
    const a = makeNode({ id: 'a' });
    const b = makeNode({ id: 'b' });
    const backlinkCounts = new Map([['b', 3]]);
    const config: SortConfig = { field: 'refCount', direction: 'asc' };
    expect(compareNodes(a, b, config, getNode, backlinkCounts)).toBeLessThan(0); // 0 < 3
  });

  it('sorts nodes without the field value to the end', () => {
    const fieldDefId = 'fd1';
    const a = makeNode({ id: 'a', children: [] }); // no fieldEntry
    const b = makeNode({
      id: 'b',
      children: ['fe_b'],
    });

    const nodes: Record<string, NodexNode> = {
      a, b,
      fe_b: makeNode({ id: 'fe_b', type: 'fieldEntry', fieldDefId, children: ['vb'] }),
      vb: makeNode({ id: 'vb', name: 'Anything' }),
    };

    const getNodeFn = (id: string) => nodes[id] ?? null;
    const config: SortConfig = { field: fieldDefId, direction: 'asc' };
    // '' < 'Anything'
    expect(compareNodes(a, b, config, getNodeFn)).toBeLessThan(0);
  });
});

describe('sortNodeIds', () => {
  it('sorts an array of node IDs', () => {
    const nodes: Record<string, NodexNode> = {
      n1: makeNode({ id: 'n1', name: 'Cherry' }),
      n2: makeNode({ id: 'n2', name: 'Apple' }),
      n3: makeNode({ id: 'n3', name: 'Banana' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const config: SortConfig = { field: 'name', direction: 'asc' };

    const result = sortNodeIds(['n1', 'n2', 'n3'], config, getNode);
    expect(result).toEqual(['n2', 'n3', 'n1']);
  });

  it('does not mutate the input array', () => {
    const nodes: Record<string, NodexNode> = {
      n1: makeNode({ id: 'n1', name: 'B' }),
      n2: makeNode({ id: 'n2', name: 'A' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const ids = ['n1', 'n2'];
    const config: SortConfig = { field: 'name', direction: 'asc' };

    sortNodeIds(ids, config, getNode);
    expect(ids).toEqual(['n1', 'n2']); // unchanged
  });

  it('handles missing nodes gracefully', () => {
    const getNode = () => null;
    const config: SortConfig = { field: 'name', direction: 'asc' };
    const result = sortNodeIds(['x', 'y'], config, getNode);
    expect(result).toEqual(['x', 'y']); // unchanged order
  });
});

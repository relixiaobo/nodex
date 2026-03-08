/**
 * group-utils — tests for node grouping by tags, done, date, and field values.
 */
import { describe, it, expect } from 'vitest';
import { groupNodes } from '../../src/lib/group-utils.js';
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

describe('groupNodes', () => {
  describe('group by tags', () => {
    it('groups nodes by their tags', () => {
      const nodes: Record<string, NodexNode> = {
        a: makeNode({ id: 'a', tags: ['t1'] }),
        b: makeNode({ id: 'b', tags: ['t2'] }),
        c: makeNode({ id: 'c', tags: ['t1'] }),
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const result = groupNodes(['a', 'b', 'c'], 'tags', getNode);

      expect(result.length).toBe(2);
      expect(result[0].key).toBe('t1');
      expect(result[0].ids).toEqual(['a', 'c']);
      expect(result[1].key).toBe('t2');
      expect(result[1].ids).toEqual(['b']);
    });

    it('node with multiple tags uses combination key (not duplicated)', () => {
      const tagNodes: Record<string, NodexNode> = {
        t1: makeNode({ id: 't1', name: 'Alpha' }),
        t2: makeNode({ id: 't2', name: 'Beta' }),
      };
      const nodes: Record<string, NodexNode> = {
        a: makeNode({ id: 'a', tags: ['t2', 't1'] }),
        b: makeNode({ id: 'b', tags: ['t1'] }),
      };
      const getNode = (id: string) => nodes[id] ?? tagNodes[id] ?? null;
      const result = groupNodes(['a', 'b'], 'tags', getNode);

      // 'a' has both tags → combination group "Alpha, Beta"
      // 'b' has only t1 → group "Alpha"
      expect(result.length).toBe(2);
      const comboGroup = result.find((g) => g.label === 'Alpha, Beta');
      const singleGroup = result.find((g) => g.label === 'Alpha');
      expect(comboGroup).toBeDefined();
      expect(comboGroup!.ids).toEqual(['a']);
      expect(singleGroup).toBeDefined();
      expect(singleGroup!.ids).toEqual(['b']);
    });

    it('nodes without tags go to (Empty) group', () => {
      const nodes: Record<string, NodexNode> = {
        a: makeNode({ id: 'a', tags: ['t1'] }),
        b: makeNode({ id: 'b', tags: [] }),
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const result = groupNodes(['a', 'b'], 'tags', getNode);

      expect(result.length).toBe(2);
      expect(result[1].key).toBe('__empty__');
      expect(result[1].label).toBe('(Empty)');
      expect(result[1].ids).toEqual(['b']);
    });
  });

  describe('group by done', () => {
    it('groups into Done and Not done', () => {
      const nodes: Record<string, NodexNode> = {
        a: makeNode({ id: 'a', completedAt: 123 }),
        b: makeNode({ id: 'b' }),
        c: makeNode({ id: 'c', completedAt: 456 }),
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const result = groupNodes(['a', 'b', 'c'], 'done', getNode);

      expect(result.length).toBe(2);
      const doneGroup = result.find((g) => g.key === 'done');
      const notDoneGroup = result.find((g) => g.key === 'not-done');
      expect(doneGroup?.ids).toEqual(['a', 'c']);
      expect(notDoneGroup?.ids).toEqual(['b']);
    });
  });

  describe('group by field value', () => {
    it('groups by field entry value names', () => {
      const nodes: Record<string, NodexNode> = {
        a: makeNode({ id: 'a', children: ['fe_a'] }),
        b: makeNode({ id: 'b', children: ['fe_b'] }),
        c: makeNode({ id: 'c', children: [] }),
        fe_a: makeNode({ id: 'fe_a', type: 'fieldEntry', fieldDefId: 'fd1', children: ['v1'] }),
        fe_b: makeNode({ id: 'fe_b', type: 'fieldEntry', fieldDefId: 'fd1', children: ['v2'] }),
        v1: makeNode({ id: 'v1', name: 'Alpha' }),
        v2: makeNode({ id: 'v2', name: 'Beta' }),
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const result = groupNodes(['a', 'b', 'c'], 'fd1', getNode);

      expect(result.length).toBe(3); // Alpha, Beta, (Empty)
      expect(result[0].label).toBe('Alpha');
      expect(result[0].ids).toEqual(['a']);
      expect(result[1].label).toBe('Beta');
      expect(result[1].ids).toEqual(['b']);
      expect(result[2].key).toBe('__empty__');
      expect(result[2].ids).toEqual(['c']);
    });
  });

  describe('group by date', () => {
    it('groups by createdAt date', () => {
      // 2026-01-15 and 2026-01-16
      const d1 = new Date(2026, 0, 15).getTime();
      const d2 = new Date(2026, 0, 16).getTime();
      const nodes: Record<string, NodexNode> = {
        a: makeNode({ id: 'a', createdAt: d1 }),
        b: makeNode({ id: 'b', createdAt: d2 }),
        c: makeNode({ id: 'c', createdAt: d1 + 1000 }), // same day as 'a'
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const result = groupNodes(['a', 'b', 'c'], 'createdAt', getNode);

      expect(result.length).toBe(2);
      expect(result[0].ids).toEqual(['a', 'c']); // same day
      expect(result[1].ids).toEqual(['b']);
    });
  });

  it('sorts groups alphabetically by label', () => {
    const nodes: Record<string, NodexNode> = {
      a: makeNode({ id: 'a', tags: ['t_zebra'] }),
      b: makeNode({ id: 'b', tags: ['t_alpha'] }),
    };
    const tagNodes: Record<string, NodexNode> = {
      t_zebra: makeNode({ id: 't_zebra', name: 'Zebra' }),
      t_alpha: makeNode({ id: 't_alpha', name: 'Alpha' }),
    };
    const getNode = (id: string) => nodes[id] ?? tagNodes[id] ?? null;
    const result = groupNodes(['a', 'b'], 'tags', getNode);

    expect(result[0].label).toBe('Alpha');
    expect(result[1].label).toBe('Zebra');
  });

  it('handles missing nodes gracefully', () => {
    const getNode = () => null;
    const result = groupNodes(['x', 'y'], 'tags', getNode);
    expect(result).toEqual([]);
  });
});

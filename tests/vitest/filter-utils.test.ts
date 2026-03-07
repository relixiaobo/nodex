/**
 * filter-utils — tests for node filtering by tags, done, and field values.
 */
import { describe, it, expect } from 'vitest';
import { matchesFilter, matchesAllFilters, type FilterCondition } from '../../src/lib/filter-utils.js';
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

const noopGetNode = () => null;

describe('matchesFilter', () => {
  describe('tags filter', () => {
    it('matches when node has all required tags (op: all)', () => {
      const node = makeNode({ tags: ['t1', 't2', 't3'] });
      const filter: FilterCondition = { field: 'tags', op: 'all', values: ['t1', 't2'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(true);
    });

    it('does not match when node is missing a required tag (op: all)', () => {
      const node = makeNode({ tags: ['t1'] });
      const filter: FilterCondition = { field: 'tags', op: 'all', values: ['t1', 't2'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(false);
    });

    it('matches when node has any of the tags (op: any)', () => {
      const node = makeNode({ tags: ['t2'] });
      const filter: FilterCondition = { field: 'tags', op: 'any', values: ['t1', 't2'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(true);
    });

    it('does not match when node has none of the tags (op: any)', () => {
      const node = makeNode({ tags: ['t3'] });
      const filter: FilterCondition = { field: 'tags', op: 'any', values: ['t1', 't2'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(false);
    });

    it('matches everything when values is empty', () => {
      const node = makeNode({ tags: [] });
      const filter: FilterCondition = { field: 'tags', op: 'all', values: [] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(true);
    });
  });

  describe('done filter', () => {
    it('matches done node when filtering for done', () => {
      const node = makeNode({ completedAt: 12345 });
      const filter: FilterCondition = { field: 'done', op: 'any', values: ['true'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(true);
    });

    it('does not match undone node when filtering for done', () => {
      const node = makeNode({});
      const filter: FilterCondition = { field: 'done', op: 'any', values: ['true'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(false);
    });

    it('matches undone node when filtering for not-done', () => {
      const node = makeNode({});
      const filter: FilterCondition = { field: 'done', op: 'any', values: ['false'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(true);
    });

    it('matches any node when both true and false selected', () => {
      const node = makeNode({});
      const filter: FilterCondition = { field: 'done', op: 'any', values: ['true', 'false'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(true);
    });
  });

  describe('field value filter', () => {
    it('matches when field has a matching value', () => {
      const nodes: Record<string, NodexNode> = {
        n1: makeNode({ id: 'n1', children: ['fe1'] }),
        fe1: makeNode({ id: 'fe1', type: 'fieldEntry', fieldDefId: 'fd1', children: ['v1'] }),
        v1: makeNode({ id: 'v1', name: 'Alpha' }),
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const filter: FilterCondition = { field: 'fd1', op: 'any', values: ['Alpha'] };
      expect(matchesFilter(nodes.n1, filter, getNode)).toBe(true);
    });

    it('does not match when field has no matching value', () => {
      const nodes: Record<string, NodexNode> = {
        n1: makeNode({ id: 'n1', children: ['fe1'] }),
        fe1: makeNode({ id: 'fe1', type: 'fieldEntry', fieldDefId: 'fd1', children: ['v1'] }),
        v1: makeNode({ id: 'v1', name: 'Alpha' }),
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const filter: FilterCondition = { field: 'fd1', op: 'any', values: ['Beta'] };
      expect(matchesFilter(nodes.n1, filter, getNode)).toBe(false);
    });

    it('does not match when node has no fieldEntry for the field', () => {
      const node = makeNode({ children: [] });
      const filter: FilterCondition = { field: 'fd1', op: 'any', values: ['Alpha'] };
      expect(matchesFilter(node, filter, noopGetNode)).toBe(false);
    });

    it('matches by targetId for options fields', () => {
      const nodes: Record<string, NodexNode> = {
        n1: makeNode({ id: 'n1', children: ['fe1'] }),
        fe1: makeNode({ id: 'fe1', type: 'fieldEntry', fieldDefId: 'fd1', children: ['v1'] }),
        v1: makeNode({ id: 'v1', targetId: 'opt1' }),
      };
      const getNode = (id: string) => nodes[id] ?? null;
      const filter: FilterCondition = { field: 'fd1', op: 'any', values: ['opt1'] };
      expect(matchesFilter(nodes.n1, filter, getNode)).toBe(true);
    });
  });
});

describe('matchesAllFilters', () => {
  it('returns true when all conditions match (AND)', () => {
    const node = makeNode({ tags: ['t1'], completedAt: 123 });
    const filters: FilterCondition[] = [
      { field: 'tags', op: 'all', values: ['t1'] },
      { field: 'done', op: 'any', values: ['true'] },
    ];
    expect(matchesAllFilters(node, filters, noopGetNode)).toBe(true);
  });

  it('returns false when any condition fails (AND)', () => {
    const node = makeNode({ tags: ['t1'] }); // not done
    const filters: FilterCondition[] = [
      { field: 'tags', op: 'all', values: ['t1'] },
      { field: 'done', op: 'any', values: ['true'] },
    ];
    expect(matchesAllFilters(node, filters, noopGetNode)).toBe(false);
  });

  it('returns true with empty filter list', () => {
    const node = makeNode({});
    expect(matchesAllFilters(node, [], noopGetNode)).toBe(true);
  });
});

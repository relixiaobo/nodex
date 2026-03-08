/**
 * view-pipeline — tests for the shared filter → group → sort pipeline.
 */
import { describe, it, expect } from 'vitest';
import { applyViewPipeline, readViewConfig, type ViewConfig } from '../../src/lib/view-pipeline.js';
import type { OutlinerRowItem } from '../../src/components/outliner/row-model.js';
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

function contentRow(id: string): OutlinerRowItem {
  return { id, type: 'content' };
}

function fieldRow(id: string): OutlinerRowItem {
  return { id, type: 'field' };
}

describe('applyViewPipeline', () => {
  it('passes through rows when no config is active', () => {
    const rows: OutlinerRowItem[] = [fieldRow('f1'), contentRow('a'), contentRow('b')];
    const config: ViewConfig = { sortRules: [], filters: [], groupField: null };
    const result = applyViewPipeline(rows, config, () => null, 0);
    expect(result).toEqual(rows);
  });

  it('filters content rows and preserves field rows', () => {
    const nodes: Record<string, NodexNode> = {
      a: makeNode({ id: 'a', tags: ['t1'] }),
      b: makeNode({ id: 'b', tags: [] }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [fieldRow('f1'), contentRow('a'), contentRow('b')];
    const config: ViewConfig = {
      sortRules: [],
      filters: [{ field: 'tags', op: 'any', values: ['t1'] }],
      groupField: null,
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    expect(result).toEqual([fieldRow('f1'), contentRow('a')]);
  });

  it('sorts content rows by name', () => {
    const nodes: Record<string, NodexNode> = {
      a: makeNode({ id: 'a', name: 'Banana' }),
      b: makeNode({ id: 'b', name: 'Apple' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [contentRow('a'), contentRow('b')];
    const config: ViewConfig = {
      sortRules: [{ field: 'name', direction: 'asc' }],
      filters: [],
      groupField: null,
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('groups content rows with headers', () => {
    const nodes: Record<string, NodexNode> = {
      a: makeNode({ id: 'a', tags: ['t1'] }),
      b: makeNode({ id: 'b', tags: ['t2'] }),
      t1: makeNode({ id: 't1', name: 'Alpha' }),
      t2: makeNode({ id: 't2', name: 'Beta' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [contentRow('a'), contentRow('b')];
    const config: ViewConfig = {
      sortRules: [],
      filters: [],
      groupField: 'tags',
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    expect(result.length).toBe(4); // 2 headers + 2 content
    expect(result[0].type).toBe('groupHeader');
    expect(result[1].id).toBe('a');
    expect(result[2].type).toBe('groupHeader');
    expect(result[3].id).toBe('b');
  });

  it('sorts within groups', () => {
    const nodes: Record<string, NodexNode> = {
      a: makeNode({ id: 'a', name: 'Zebra', tags: ['t1'] }),
      b: makeNode({ id: 'b', name: 'Apple', tags: ['t1'] }),
      t1: makeNode({ id: 't1', name: 'Group' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [contentRow('a'), contentRow('b')];
    const config: ViewConfig = {
      sortRules: [{ field: 'name', direction: 'asc' }],
      filters: [],
      groupField: 'tags',
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    const contentIds = result.filter((r) => r.type === 'content').map((r) => r.id);
    expect(contentIds).toEqual(['b', 'a']); // Apple before Zebra
  });

  it('sorts reference nodes by their target name', () => {
    const nodes: Record<string, NodexNode> = {
      ref1: makeNode({ id: 'ref1', type: 'reference', targetId: 'target1' }),
      ref2: makeNode({ id: 'ref2', type: 'reference', targetId: 'target2' }),
      target1: makeNode({ id: 'target1', name: 'Banana' }),
      target2: makeNode({ id: 'target2', name: 'Apple' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [contentRow('ref1'), contentRow('ref2')];
    const config: ViewConfig = {
      sortRules: [{ field: 'name', direction: 'asc' }],
      filters: [],
      groupField: null,
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    // ref2 → Apple should come before ref1 → Banana
    expect(result.map((r) => r.id)).toEqual(['ref2', 'ref1']);
  });

  it('sorts reference nodes by name descending', () => {
    const nodes: Record<string, NodexNode> = {
      ref1: makeNode({ id: 'ref1', type: 'reference', targetId: 'target1' }),
      ref2: makeNode({ id: 'ref2', type: 'reference', targetId: 'target2' }),
      target1: makeNode({ id: 'target1', name: 'Banana' }),
      target2: makeNode({ id: 'target2', name: 'Apple' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [contentRow('ref1'), contentRow('ref2')];
    const config: ViewConfig = {
      sortRules: [{ field: 'name', direction: 'desc' }],
      filters: [],
      groupField: null,
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    // Banana before Apple in desc
    expect(result.map((r) => r.id)).toEqual(['ref1', 'ref2']);
  });

  it('filter + group + sort combined', () => {
    const nodes: Record<string, NodexNode> = {
      a: makeNode({ id: 'a', name: 'Zebra', tags: ['t1'], completedAt: 123 }),
      b: makeNode({ id: 'b', name: 'Apple', tags: ['t1'] }),
      c: makeNode({ id: 'c', name: 'Mango', tags: ['t1'] }),
      t1: makeNode({ id: 't1', name: 'Group' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [contentRow('a'), contentRow('b'), contentRow('c')];
    const config: ViewConfig = {
      sortRules: [{ field: 'name', direction: 'asc' }],
      filters: [{ field: 'done', op: 'any', values: ['false'] }],
      groupField: 'tags',
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    // 'a' is filtered out (done), remaining: b (Apple) and c (Mango), sorted
    const contentIds = result.filter((r) => r.type === 'content').map((r) => r.id);
    expect(contentIds).toEqual(['b', 'c']);
  });

  it('multi-sort: primary by done, secondary by name', () => {
    const nodes: Record<string, NodexNode> = {
      a: makeNode({ id: 'a', name: 'Banana' }),
      b: makeNode({ id: 'b', name: 'Apple', completedAt: 100 }),
      c: makeNode({ id: 'c', name: 'Cherry', completedAt: 200 }),
      d: makeNode({ id: 'd', name: 'Date' }),
    };
    const getNode = (id: string) => nodes[id] ?? null;
    const rows: OutlinerRowItem[] = [contentRow('a'), contentRow('b'), contentRow('c'), contentRow('d')];
    const config: ViewConfig = {
      sortRules: [
        { field: 'done', direction: 'asc' },   // not-done first
        { field: 'name', direction: 'asc' },   // then by name
      ],
      filters: [],
      groupField: null,
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    // Not-done (a=Banana, d=Date) sorted by name → Banana, Date
    // Done (b=Apple, c=Cherry) sorted by name → Apple, Cherry
    expect(result.map((r) => r.id)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('readViewConfig', () => {
  it('returns empty config when no viewDef exists', () => {
    const config = readViewConfig(
      'parent',
      () => null,
      () => null,
      () => [],
    );
    expect(config).toEqual({ sortRules: [], filters: [], groupField: null });
  });

  it('reads legacy sortField/sortDirection from viewDef as fallback', () => {
    const viewDef = makeNode({
      id: 'vd1',
      children: [],
      sortField: 'name',
      sortDirection: 'desc',
      groupField: 'tags',
    });
    const config = readViewConfig(
      'parent',
      () => 'vd1',
      (id) => (id === 'vd1' ? viewDef : null),
      () => [{ field: 'done', op: 'any' as const, values: ['true'] }],
    );
    expect(config.sortRules).toEqual([{ field: 'name', direction: 'desc' }]);
    expect(config.filters).toEqual([{ field: 'done', op: 'any', values: ['true'] }]);
    expect(config.groupField).toBe('tags');
  });

  it('reads sortRule child nodes from viewDef', () => {
    const rule1 = makeNode({ id: 'sr1', type: 'sortRule', sortField: 'name', sortDirection: 'asc' });
    const rule2 = makeNode({ id: 'sr2', type: 'sortRule', sortField: 'createdAt', sortDirection: 'desc' });
    const viewDef = makeNode({
      id: 'vd1',
      children: ['sr1', 'sr2'],
      groupField: null,
    });
    const nodes: Record<string, NodexNode> = { vd1: viewDef, sr1: rule1, sr2: rule2 };
    const config = readViewConfig(
      'parent',
      () => 'vd1',
      (id) => nodes[id] ?? null,
      () => [],
    );
    expect(config.sortRules).toEqual([
      { field: 'name', direction: 'asc' },
      { field: 'createdAt', direction: 'desc' },
    ]);
  });

  it('prefers sortRule children over legacy sortField', () => {
    const rule1 = makeNode({ id: 'sr1', type: 'sortRule', sortField: 'updatedAt', sortDirection: 'desc' });
    const viewDef = makeNode({
      id: 'vd1',
      children: ['sr1'],
      sortField: 'name',
      sortDirection: 'asc',
    });
    const nodes: Record<string, NodexNode> = { vd1: viewDef, sr1: rule1 };
    const config = readViewConfig(
      'parent',
      () => 'vd1',
      (id) => nodes[id] ?? null,
      () => [],
    );
    // Should use sortRule child, not legacy props
    expect(config.sortRules).toEqual([{ field: 'updatedAt', direction: 'desc' }]);
  });
});

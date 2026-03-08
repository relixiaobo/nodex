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
    const config: ViewConfig = { sort: null, filters: [], groupField: null };
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
      sort: null,
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
      sort: { field: 'name', direction: 'asc' },
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
      sort: null,
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
      sort: { field: 'name', direction: 'asc' },
      filters: [],
      groupField: 'tags',
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    const contentIds = result.filter((r) => r.type === 'content').map((r) => r.id);
    expect(contentIds).toEqual(['b', 'a']); // Apple before Zebra
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
      sort: { field: 'name', direction: 'asc' },
      filters: [{ field: 'done', op: 'any', values: ['false'] }],
      groupField: 'tags',
    };
    const result = applyViewPipeline(rows, config, getNode, 0);
    // 'a' is filtered out (done), remaining: b (Apple) and c (Mango), sorted
    const contentIds = result.filter((r) => r.type === 'content').map((r) => r.id);
    expect(contentIds).toEqual(['b', 'c']);
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
    expect(config).toEqual({ sort: null, filters: [], groupField: null });
  });

  it('reads sort, filters, and groupField from viewDef', () => {
    const viewDef = makeNode({
      id: 'vd1',
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
    expect(config.sort).toEqual({ field: 'name', direction: 'desc' });
    expect(config.filters).toEqual([{ field: 'done', op: 'any', values: ['true'] }]);
    expect(config.groupField).toBe('tags');
  });
});

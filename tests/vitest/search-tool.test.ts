import { beforeEach, describe, expect, it } from 'vitest';
import { searchTool } from '../../src/lib/ai-tools/search-tool.js';
import { createTool } from '../../src/lib/ai-tools/create-tool.js';
import { editTool } from '../../src/lib/ai-tools/edit-tool.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

async function executeSearch(params: Record<string, unknown>) {
  const result = await searchTool.execute('tool_search', params as never);
  return JSON.parse(result.content[0].text as string);
}

describe('node_search tool', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  // ── Field value filtering ──

  it('filters by field value (options field)', async () => {
    // First set a Status field value on task_1
    await editTool.execute('tool_edit', {
      nodeId: 'task_1',
      fields: { 'Status': 'In Progress' },
    } as never);

    const result = await executeSearch({
      searchTags: ['task'],
      fields: { 'Status': 'In Progress' },
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.map((i: { id: string }) => i.id)).toContain('task_1');
  });

  it('returns empty when field value does not match', async () => {
    const result = await executeSearch({
      searchTags: ['task'],
      fields: { 'Status': 'NonExistentValue' },
    });

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  // ── linkedTo (backlinks) ──

  it('finds nodes that reference a target via linkedTo', async () => {
    // Create a reference to note_1
    await createTool.execute('tool_create', {
      parentId: 'proj_1',
      targetId: 'note_1',
    } as never);

    const result = await executeSearch({
      linkedTo: 'note_1',
    });

    // proj_1 should appear as it now contains a reference to note_1
    expect(result.total).toBeGreaterThan(0);
    const ids = result.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('proj_1');
  });

  // ── count mode ──

  it('returns only total count when count=true', async () => {
    const result = await executeSearch({
      searchTags: ['task'],
      count: true,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items).toBeUndefined();
  });

  it('count mode with text query still filters', async () => {
    const result = await executeSearch({
      query: 'Design the data model',
      count: true,
    });

    expect(result.total).toBeGreaterThan(0);
  });

  // ── sort ──

  it('sorts results by name ascending', async () => {
    const result = await executeSearch({
      searchTags: ['meeting'],
      sort: { field: 'name', order: 'asc' },
    });

    expect(result.total).toBeGreaterThan(0);
    const names: string[] = result.items.map((i: { name: string }) => i.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sorts results by created date descending', async () => {
    const result = await executeSearch({
      query: 'note',
      sort: { field: 'created', order: 'desc' },
    });

    if (result.items.length >= 2) {
      const dates: string[] = result.items.map((i: { createdAt: string }) => i.createdAt);
      for (let i = 0; i < dates.length - 1; i++) {
        expect(new Date(dates[i]).getTime()).toBeGreaterThanOrEqual(new Date(dates[i + 1]).getTime());
      }
    }
  });

  // ── subtree scoping ──

  it('limits search to a subtree via parentId', async () => {
    const result = await executeSearch({
      parentId: 'proj_1',
      query: 'Design',
    });

    expect(result.total).toBeGreaterThan(0);
    // All results should be within proj_1 subtree
    for (const item of result.items) {
      // Verify ancestor chain includes proj_1
      let cursor: string | null = item.id;
      let foundProj = false;
      while (cursor) {
        if (cursor === 'proj_1') { foundProj = true; break; }
        cursor = loroDoc.getParentId(cursor);
      }
      expect(foundProj).toBe(true);
    }
  });

  // ── search results include fields ──

  it('includes fields in search result items', async () => {
    // Set a field value first
    await editTool.execute('tool_edit', {
      nodeId: 'task_1',
      fields: { 'Status': 'Done' },
    } as never);

    const result = await executeSearch({
      searchTags: ['task'],
    });

    const task1Item = result.items.find((i: { id: string }) => i.id === 'task_1');
    expect(task1Item).toBeTruthy();
    expect(task1Item.fields).toBeDefined();
    // The Status field value should be present
    expect(task1Item.fields['Status']).toBe('Done');
  });

  // ── date range ──

  it('filters by date range', async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const createdToday = useNodeStore.getState().createChild('proj_1', undefined, {
      name: 'Created today for date range filter',
    });

    const result = await executeSearch({
      dateRange: { from: todayStr, to: todayStr },
    });

    expect(result.items.map((i: { id: string }) => i.id)).toContain(createdToday.id);
    expect(result.total).toBeGreaterThan(0);
  });
});

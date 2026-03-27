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

  it('filters by field value', async () => {
    await editTool.execute('tool_edit', {
      nodeId: 'task_1',
      text: 'Status:: In Progress',
    } as never);

    const result = await executeSearch({
      rules: { searchTags: ['task'], fields: { Status: 'In Progress' } },
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.map((item: { id: string }) => item.id)).toContain('task_1');
  });

  it('finds backlinks via linkedTo', async () => {
    await createTool.execute('tool_create', {
      parentId: 'proj_1',
      text: '[[Meeting notes - Team standup^note_1]]',
    } as never);

    const result = await executeSearch({
      rules: { linkedTo: 'note_1' },
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.map((item: { id: string }) => item.id)).toContain('proj_1');
  });

  it('supports count-only mode', async () => {
    const result = await executeSearch({
      rules: { searchTags: ['task'] },
      count: true,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items).toBeUndefined();
  });

  it('keeps count-only mode compact when tag names do not resolve', async () => {
    const result = await executeSearch({
      rules: { searchTags: ['does-not-exist'] },
      count: true,
    });

    expect(result.total).toBe(0);
    expect(result.items).toBeUndefined();
    expect(result.unresolvedTags).toEqual(['does-not-exist']);
    expect(result.boundary).toBeTruthy();
    expect(result.nextStep).toBeTruthy();
    expect(result.fallback).toBeTruthy();
  });

  it('sorts by sortBy string with explicit order', async () => {
    const result = await executeSearch({
      rules: { searchTags: ['meeting'], sortBy: 'name:asc' },
    });

    const names: string[] = result.items.map((item: { name: string }) => item.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('defaults sortBy order to desc', async () => {
    const result = await executeSearch({
      rules: { query: 'note', sortBy: 'created' },
    });

    if (result.items.length >= 2) {
      const dates: string[] = result.items.map((item: { createdAt: string }) => item.createdAt);
      for (let i = 0; i < dates.length - 1; i++) {
        expect(new Date(dates[i]).getTime()).toBeGreaterThanOrEqual(new Date(dates[i + 1]).getTime());
      }
    }
  });

  it('limits search to a subtree via parentId', async () => {
    const result = await executeSearch({
      rules: { scopeId: 'proj_1', query: 'Design' },
    });

    expect(result.total).toBeGreaterThan(0);
    for (const item of result.items) {
      let cursor: string | null = item.id;
      let foundProj = false;
      while (cursor) {
        if (cursor === 'proj_1') {
          foundProj = true;
          break;
        }
        cursor = loroDoc.getParentId(cursor);
      }
      expect(foundProj).toBe(true);
    }
  });

  it('includes field values in search result items', async () => {
    await editTool.execute('tool_edit', {
      nodeId: 'task_1',
      text: 'Status:: Done',
    } as never);

    const result = await executeSearch({
      rules: { searchTags: ['task'] },
    });

    const taskItem = result.items.find((item: { id: string }) => item.id === 'task_1');
    expect(taskItem?.fields['Status']).toBe('Done');
  });

  it('filters by after/before date strings', async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    const createdToday = useNodeStore.getState().createChild('proj_1', undefined, {
      name: 'Created today for date filter',
    });

    const result = await executeSearch({
      rules: { after: todayStr, before: todayStr },
    });

    expect(result.items.map((item: { id: string }) => item.id)).toContain(createdToday.id);
  });

  it('falls back to token-level recall when a long mixed query has no exact matches', async () => {
    const store = useNodeStore.getState();
    const contextNode = store.createChild('proj_1', undefined, {
      name: '上下文缓存策略',
      description: '讨论压缩前的上下文窗口管理',
    });
    const tokenNode = store.createChild('proj_1', undefined, {
      name: 'token cache internals',
      description: 'cache reuse and compression tradeoffs',
    });
    store.createChild('proj_1', undefined, {
      name: '无关节点',
      description: '完全不相关的内容',
    });

    const result = await executeSearch({
      rules: { query: '上下文 缓存 压缩 token cache' },
      limit: 10,
    });

    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.items.map((item: { id: string }) => item.id)).toContain(contextNode.id);
    expect(result.items.map((item: { id: string }) => item.id)).toContain(tokenNode.id);
  });
});

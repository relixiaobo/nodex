import { beforeEach, describe, expect, it } from 'vitest';
import { createTool } from '../../src/lib/ai-tools/create-tool.js';
import { readTool } from '../../src/lib/ai-tools/read-tool.js';
import { editTool } from '../../src/lib/ai-tools/edit-tool.js';
import { deleteTool } from '../../src/lib/ai-tools/delete-tool.js';
import { searchTool } from '../../src/lib/ai-tools/search-tool.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

async function executeCreate(params: Record<string, unknown>) {
  const result = await createTool.execute('tool_create', params as never);
  return result.details;
}

async function executeRead(params: Record<string, unknown>) {
  const result = await readTool.execute('tool_read', params as never);
  return result.details;
}

async function executeEdit(params: Record<string, unknown>) {
  const result = await editTool.execute('tool_edit', params as never);
  return result.details;
}

async function executeDelete(params: Record<string, unknown>) {
  const result = await deleteTool.execute('tool_delete', params as never);
  return result.details;
}

async function executeSearch(params: Record<string, unknown>) {
  const result = await searchTool.execute('tool_search', params as never);
  return result.details;
}

describe('node tools (Phase 1.5)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates a node under today by default and resolves tag display names', async () => {
    const todayId = ensureTodayNode();

    const details = await executeCreate({
      name: 'AI generated note',
      tags: ['meeting'],
    }) as {
      id: string;
      parentId: string;
      tags: string[];
    };

    expect(details.parentId).toBe(todayId);
    expect(loroDoc.getChildren(todayId)).toContain(details.id);
    expect(loroDoc.toNodexNode(details.id)?.name).toBe('AI generated note');
    expect(details.tags).toContain('Meeting');
  });

  it('reads a node with paginated child summaries and breadcrumb metadata', async () => {
    const details = await executeRead({
      nodeId: 'note_1',
      depth: 2,
      childLimit: 2,
    }) as {
      id: string;
      breadcrumb: string[];
      children: {
        total: number;
        limit: number;
        items: Array<{ id: string; name: string }>;
      };
    };

    expect(details.id).toBe('note_1');
    expect(details.breadcrumb).not.toContain('Workspace');
    expect(details.children.total).toBe(3);
    expect(details.children.limit).toBe(2);
    expect(details.children.items).toHaveLength(2);
    expect(details.children.items[0].id).toBe('note_1a');
  });

  it('updates node name and tags using display names', async () => {
    const details = await executeEdit({
      nodeId: 'task_1',
      name: 'Design the graph model',
      addTags: ['meeting'],
      removeTags: ['task'],
    }) as {
      id: string;
      updated: string[];
    };

    const updatedNode = loroDoc.toNodexNode('task_1');
    const updatedTagNames = (updatedNode?.tags ?? []).map((tagId) => loroDoc.toNodexNode(tagId)?.name);

    expect(details.id).toBe('task_1');
    expect(details.updated).toContain('name');
    expect(details.updated).toContain('tags');
    expect(updatedNode?.name).toBe('Design the graph model');
    expect(updatedTagNames).toContain('Meeting');
    expect(updatedTagNames).not.toContain('Task');
  });

  it('searches by query and tag display name', async () => {
    const details = await executeSearch({
      query: 'weekly sync',
      searchTags: ['meeting'],
    }) as {
      total: number;
      items: Array<{ id: string; name: string }>;
    };

    expect(details.total).toBeGreaterThan(0);
    expect(details.items.map((item) => item.id)).toContain('meeting_1');
    expect(details.items.map((item) => item.name)).toContain('Weekly sync');
  });

  it('moves deleted nodes to Trash instead of hard-deleting them', async () => {
    const details = await executeDelete({
      nodeId: 'note_1c',
    }) as {
      id: string;
      name: string;
      movedToTrash: boolean;
    };

    expect(details.id).toBe('note_1c');
    expect(details.name).toBe('Next meeting on Friday');
    expect(details.movedToTrash).toBe(true);
    expect(loroDoc.getParentId('note_1c')).toBe(SYSTEM_NODE_IDS.TRASH);
  });
});

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
    };

    expect(details.parentId).toBe(todayId);
    expect(loroDoc.getChildren(todayId)).toContain(details.id);
    const created = loroDoc.toNodexNode(details.id);
    expect(created?.name).toBe('AI generated note');
    expect(created?.tags).toContain('tagDef_meeting');
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

  it('returns raw type, epoch timestamps, and nodeData for schema nodes', async () => {
    const details = await executeRead({
      nodeId: 'attrDef_status',
    }) as {
      type: string | null;
      createdAt: number;
      updatedAt: number;
      nodeData: Record<string, unknown>;
    };

    expect(details.type).toBe('fieldDef');
    expect(typeof details.createdAt).toBe('number');
    expect(typeof details.updatedAt).toBe('number');
    expect(details.nodeData).toMatchObject({
      fieldType: 'options',
    });
    expect(details.nodeData).not.toHaveProperty('type');
    expect(details.nodeData).not.toHaveProperty('name');
    expect(details.nodeData).not.toHaveProperty('createdAt');
    expect(details.nodeData).not.toHaveProperty('updatedAt');
  });

  it('returns null type for regular content nodes and exposes tag config in nodeData', async () => {
    const contentDetails = await executeRead({
      nodeId: 'note_1',
    }) as {
      type: string | null;
      nodeData: Record<string, unknown>;
    };
    const tagDetails = await executeRead({
      nodeId: 'tagDef_task',
    }) as {
      type: string | null;
      nodeData: Record<string, unknown>;
    };

    expect(contentDetails.type).toBeNull();
    expect(contentDetails.nodeData).not.toHaveProperty('type');
    expect(tagDetails.type).toBe('tagDef');
    expect(tagDetails.nodeData).toMatchObject({
      color: 'green',
      showCheckbox: true,
    });
    expect(tagDetails.nodeData).not.toHaveProperty('tags');
  });

  it('updates node name and tags using display names', async () => {
    const details = await executeEdit({
      nodeId: 'task_1',
      name: 'Design the graph model',
      addTags: ['meeting'],
      removeTags: ['task'],
    }) as {
      updated: string[];
    };

    const updatedNode = loroDoc.toNodexNode('task_1');
    const updatedTagNames = (updatedNode?.tags ?? []).map((tagId) => loroDoc.toNodexNode(tagId)?.name);

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
      name: string;
      action: string;
    };

    expect(details.name).toBe('Next meeting on Friday');
    expect(details.action).toBe('trashed');
    expect(loroDoc.getParentId('note_1c')).toBe(SYSTEM_NODE_IDS.TRASH);
  });
});

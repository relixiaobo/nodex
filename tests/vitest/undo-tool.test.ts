import { beforeEach, describe, expect, it } from 'vitest';
import { nodeTool } from '../../src/lib/ai-tools/node-tool.js';
import { undoTool } from '../../src/lib/ai-tools/undo-tool.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('undo tool', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('undoes only AI-origin operations and leaves user edits intact', async () => {
    const store = useNodeStore.getState();
    const userNode = store.createChild('proj_1', undefined, { name: 'User note' });

    const aiNode = await nodeTool.execute('tool_node', {
      action: 'create',
      parentId: 'proj_1',
      name: 'AI note',
      tags: ['meeting'],
    } as never);

    expect(loroDoc.getChildren('proj_1')).toContain(userNode.id);
    expect(loroDoc.getChildren('proj_1')).toContain((aiNode.details as { id: string }).id);

    const result = await undoTool.execute('tool_undo', { steps: 1 } as never);
    const details = result.details as { undone: number; remaining: number };

    expect(details.undone).toBe(1);
    expect(loroDoc.getChildren('proj_1')).toContain(userNode.id);
    expect(loroDoc.getChildren('proj_1')).not.toContain((aiNode.details as { id: string }).id);
  });

  it('undoes a combined node update in a single step', async () => {
    const before = loroDoc.toNodexNode('task_1');
    const beforeParentId = loroDoc.getParentId('task_1');

    expect(before?.name).toBe('Design the data model');
    expect(before?.tags).toContain('tagDef_task');
    expect(beforeParentId).toBe('proj_1');

    await nodeTool.execute('tool_node_update', {
      action: 'update',
      nodeId: 'task_1',
      name: 'Design the graph model',
      addTags: ['meeting'],
      removeTags: ['task'],
      parentId: 'note_2',
    } as never);

    const updated = loroDoc.toNodexNode('task_1');
    expect(updated?.name).toBe('Design the graph model');
    expect(updated?.tags).toContain('tagDef_meeting');
    expect(updated?.tags).not.toContain('tagDef_task');
    expect(loroDoc.getParentId('task_1')).toBe('note_2');

    const result = await undoTool.execute('tool_undo', { steps: 1 } as never);
    const details = result.details as { undone: number; remaining: number };

    expect(details.undone).toBe(1);
    expect(loroDoc.getParentId('task_1')).toBe(beforeParentId);
    expect(loroDoc.toNodexNode('task_1')?.name).toBe(before?.name);
    expect(loroDoc.toNodexNode('task_1')?.tags).toEqual(before?.tags);
  });

  it('can undo multiple AI steps in sequence', async () => {
    const first = await nodeTool.execute('tool_node_1', {
      action: 'create',
      parentId: 'proj_1',
      name: 'AI task 1',
    } as never);
    const second = await nodeTool.execute('tool_node_2', {
      action: 'create',
      parentId: 'proj_1',
      name: 'AI task 2',
    } as never);

    const result = await undoTool.execute('tool_undo', { steps: 2 } as never);
    const details = result.details as { undone: number; remaining: number };

    expect(details).toEqual({
      undone: 2,
      remaining: 0,
    });
    expect(loroDoc.hasNode((first.details as { id: string }).id)).toBe(false);
    expect(loroDoc.hasNode((second.details as { id: string }).id)).toBe(false);
  });
});

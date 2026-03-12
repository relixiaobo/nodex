import { beforeEach, describe, expect, it } from 'vitest';
import { createTool } from '../../src/lib/ai-tools/create-tool.js';
import { editTool } from '../../src/lib/ai-tools/edit-tool.js';
import { undoTool } from '../../src/lib/ai-tools/undo-tool.js';
import { resetAiOpLog } from '../../src/lib/ai-tools/shared.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('undo tool', () => {
  beforeEach(() => {
    resetAndSeed();
    resetAiOpLog();
  });

  it('undoes only AI-origin operations and leaves user edits intact', async () => {
    const store = useNodeStore.getState();
    const userNode = store.createChild('proj_1', undefined, { name: 'User note' });

    const aiNode = await createTool.execute('tool_create', {
      parentId: 'proj_1',
      name: 'AI note',
      tags: ['meeting'],
    } as never);

    expect(loroDoc.getChildren('proj_1')).toContain(userNode.id);
    expect(loroDoc.getChildren('proj_1')).toContain((aiNode.details as { id: string }).id);

    const result = await undoTool.execute('tool_undo', { steps: 1 } as never);
    const details = result.details as { undone: number; hasMore: boolean; reverted: string[] };

    expect(details.undone).toBe(1);
    expect(details.reverted).toHaveLength(1);
    expect(details.reverted[0]).toContain('node_create');
    expect(loroDoc.getChildren('proj_1')).toContain(userNode.id);
    expect(loroDoc.getChildren('proj_1')).not.toContain((aiNode.details as { id: string }).id);
  });

  it('undoes a combined node update in a single step', async () => {
    const before = loroDoc.toNodexNode('task_1');
    const beforeParentId = loroDoc.getParentId('task_1');

    expect(before?.name).toBe('Design the data model');
    expect(before?.tags).toContain('tagDef_task');
    expect(beforeParentId).toBe('proj_1');

    await editTool.execute('tool_edit', {
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
    const details = result.details as { undone: number; hasMore: boolean; reverted: string[] };

    expect(details.undone).toBe(1);
    expect(details.reverted).toHaveLength(1);
    expect(details.reverted[0]).toContain('node_edit');
    expect(loroDoc.getParentId('task_1')).toBe(beforeParentId);
    expect(loroDoc.toNodexNode('task_1')?.name).toBe(before?.name);
    expect(loroDoc.toNodexNode('task_1')?.tags).toEqual(before?.tags);
  });

  it('can undo multiple AI steps in sequence and reports reverted ops', async () => {
    const first = await createTool.execute('tool_create_1', {
      parentId: 'proj_1',
      name: 'AI task 1',
    } as never);
    const second = await createTool.execute('tool_create_2', {
      parentId: 'proj_1',
      name: 'AI task 2',
    } as never);

    const result = await undoTool.execute('tool_undo', { steps: 2 } as never);
    const details = result.details as { undone: number; hasMore: boolean; reverted: string[] };

    expect(details.undone).toBe(2);
    expect(details.hasMore).toBe(false);
    expect(details.reverted).toHaveLength(2);
    // Stack order: most recent first
    expect(details.reverted[0]).toContain('AI task 2');
    expect(details.reverted[1]).toContain('AI task 1');
    expect(loroDoc.hasNode((first.details as { id: string }).id)).toBe(false);
    expect(loroDoc.hasNode((second.details as { id: string }).id)).toBe(false);
  });
});

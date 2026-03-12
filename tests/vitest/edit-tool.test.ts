import { beforeEach, describe, expect, it } from 'vitest';
import { editTool } from '../../src/lib/ai-tools/edit-tool.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

async function executeEdit(params: Record<string, unknown>) {
  const result = await editTool.execute('tool_edit', params as never);
  return JSON.parse(result.content[0].text as string);
}

describe('node_edit tool — fields convenience', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('sets an options field value on a tagged node', async () => {
    // task_1 is already tagged with #task and has template fields (Status, Priority, etc.)
    const result = await executeEdit({
      nodeId: 'task_1',
      fields: { 'Status': 'In Progress' },
    });

    expect(result.updated).toContain('fields');

    // Verify the field was set by checking field entries
    const children = loroDoc.getChildren('task_1');
    const statusEntry = children
      .map((cid) => loroDoc.toNodexNode(cid))
      .find((c) => c?.type === 'fieldEntry' && c.fieldDefId === 'attrDef_status');
    expect(statusEntry).toBeTruthy();

    // The value node should reference the "In Progress" option
    if (statusEntry) {
      const valueChildren = loroDoc.getChildren(statusEntry.id);
      expect(valueChildren.length).toBeGreaterThan(0);
      const valueNode = loroDoc.toNodexNode(valueChildren[0]);
      expect(valueNode?.targetId).toBe('opt_in_progress');
    }
  });

  it('auto-collects a new option when the value does not exist', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      fields: { 'Status': 'Blocked' },
    });

    expect(result.updated).toContain('fields');

    // "Blocked" should have been created as a new option under attrDef_status
    const statusOptions = loroDoc.getChildren('attrDef_status');
    const optionNames = statusOptions
      .map((cid) => loroDoc.toNodexNode(cid)?.name)
      .filter(Boolean);
    expect(optionNames).toContain('Blocked');
  });

  it('sets multiple fields in one call', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      fields: { 'Status': 'Done', 'Priority': 'Low' },
    });

    expect(result.updated).toContain('fields');
  });

  it('combines name change with fields and tags', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      name: 'Redesign the model',
      addTags: ['meeting'],
      fields: { 'Status': 'To Do' },
    });

    expect(result.updated).toContain('name');
    expect(result.updated).toContain('tags');
    expect(result.updated).toContain('fields');
    expect(loroDoc.toNodexNode('task_1')?.name).toBe('Redesign the model');
  });

  it('reports unresolved fields when node has no tags at all', async () => {
    // note_1 is a plain content node without any tags — can't create fields
    const result = await executeEdit({
      nodeId: 'note_1',
      fields: { 'Status': 'Todo' },
    });

    expect(result.updated).not.toContain('fields');
    expect(result.unresolvedFields).toEqual(['Status']);
    expect(result.hint).toBeTruthy();
  });

  it('auto-creates field definition when tagged node has no such field', async () => {
    // task_1 has #task tag — "NewField" doesn't exist but will be auto-created
    const result = await executeEdit({
      nodeId: 'task_1',
      fields: { 'NewField': 'some value' },
    });

    expect(result.updated).toContain('fields');
    expect(result.createdFields).toEqual(['NewField']);
    expect(result.unresolvedFields).toBeUndefined();
  });

  it('auto-creates field with addTags in the same call', async () => {
    // note_1 has no tags, but we add one and set a field in the same call
    const result = await executeEdit({
      nodeId: 'note_1',
      addTags: ['meeting'],
      fields: { 'Location': 'Room A' },
    });

    expect(result.updated).toContain('tags');
    expect(result.updated).toContain('fields');
    expect(result.createdFields).toEqual(['Location']);
  });
});

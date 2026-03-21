import { beforeEach, describe, expect, it } from 'vitest';
import { editTool } from '../../src/lib/ai-tools/edit-tool.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

async function executeEdit(params: Record<string, unknown>) {
  const result = await editTool.execute('tool_edit', params as never);
  return JSON.parse(result.content[0].text as string);
}

describe('node_edit tool', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('renames a node from the first text line', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      text: 'Redesign the graph model',
    });

    expect(result.updated).toContain('name');
    expect(loroDoc.toNodexNode('task_1')?.name).toBe('Redesign the graph model');
  });

  it('adds tags, sets fields, and checks the node from Tana Paste text', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      text: '#meeting\nStatus:: In Progress\n[X]',
    });

    expect(result.updated).toEqual(expect.arrayContaining(['tags', 'fields', 'checked']));
    expect(loroDoc.toNodexNode('task_1')?.tags).toContain('tagDef_meeting');

    const statusEntry = loroDoc.getChildren('task_1')
      .map((cid) => loroDoc.toNodexNode(cid))
      .find((child) => child?.type === 'fieldEntry' && child.fieldDefId === 'attrDef_status');
    expect(statusEntry).toBeTruthy();
    expect(loroDoc.toNodexNode('task_1')?.completedAt).toBeGreaterThan(0);
  });

  it('clears a field with an empty field line', async () => {
    await executeEdit({
      nodeId: 'task_1',
      text: 'Status:: Done',
    });

    const result = await executeEdit({
      nodeId: 'task_1',
      text: 'Status::',
    });

    expect(result.updated).toContain('fields');
    const statusEntryId = loroDoc.getChildren('task_1')
      .find((cid) => loroDoc.toNodexNode(cid)?.type === 'fieldEntry' && loroDoc.toNodexNode(cid)?.fieldDefId === 'attrDef_status');
    expect(statusEntryId).toBeTruthy();
    expect(loroDoc.getChildren(statusEntryId!)).toEqual([]);
  });

  it('adds child nodes from indented lines', async () => {
    const beforeChildren = loroDoc.getChildren('note_1').length;

    await executeEdit({
      nodeId: 'note_1',
      text: 'Meeting notes - Team standup\n  Follow up with design\n  Share notes',
    });

    const afterChildren = loroDoc.getChildren('note_1');
    expect(afterChildren.length).toBe(beforeChildren + 2);
    const appendedNames = afterChildren.slice(-2).map((id) => loroDoc.toNodexNode(id)?.name);
    expect(appendedNames).toEqual(['Follow up with design', 'Share notes']);
  });

  it('removes tags by display name', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      removeTags: ['task'],
    });

    expect(result.updated).toContain('tags');
    expect(loroDoc.toNodexNode('task_1')?.tags).not.toContain('tagDef_task');
  });

  it('moves the node after a sibling', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      afterId: 'task_2',
    });

    expect(result.updated).toContain('position');
    const siblings = loroDoc.getChildren('proj_1');
    expect(siblings.indexOf('task_1')).toBe(siblings.indexOf('task_2') + 1);
  });

  it('applies optional data properties and reports data as updated', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      data: {
        description: 'updated description',
        color: 'red',
      },
    });

    expect(result.updated).toContain('data');
    expect(loroDoc.toNodexNode('task_1')?.description).toBe('updated description');
    expect(loroDoc.toNodexNode('task_1')?.color).toBe('red');
  });

  it('combines rename, tag, field, and move in one call', async () => {
    const result = await executeEdit({
      nodeId: 'task_1',
      text: 'Updated task #meeting\nStatus:: Done',
      parentId: 'note_2',
    });

    expect(result.updated).toEqual(expect.arrayContaining(['name', 'tags', 'fields', 'position']));
    expect(loroDoc.toNodexNode('task_1')?.name).toBe('Updated task');
    expect(loroDoc.toNodexNode('task_1')?.tags).toContain('tagDef_meeting');
    expect(loroDoc.getParentId('task_1')).toBe('note_2');
  });

  it('reports unresolved fields when the node has no tags', async () => {
    const result = await executeEdit({
      nodeId: 'note_1',
      text: 'Status:: Todo',
    });

    expect(result.unresolvedFields).toEqual(['Status']);
    expect(result.hint).toBeTruthy();
    expect(result.boundary).toBeTruthy();
    expect(result.nextStep).toBeTruthy();
    expect(result.fallback).toBeTruthy();
  });

  it('reports unchanged when the requested patch matches current state', async () => {
    const result = await executeEdit({
      nodeId: 'note_1',
      text: 'Meeting notes - Team standup',
    });

    expect(result.status).toBe('unchanged');
    expect(result.updated).toEqual([]);
    expect(result.hint).toBeTruthy();
  });

  it('rejects text-based search node edits and asks the caller to recreate the node', async () => {
    await expect(editTool.execute('tool_edit', {
      nodeId: 'search_task',
      text: 'New search text',
    } as never)).rejects.toThrow('Editing search node rules via node_edit is not supported yet');
  });

  // ─── mergeFrom tests ───

  it('merges source children into target and trashes source', async () => {
    // note_2 has children: idea_1, idea_2
    // note_1 has children: note_1a, note_1b, note_1c
    const targetChildrenBefore = loroDoc.getChildren('note_1').length;

    const result = await executeEdit({
      nodeId: 'note_1',
      mergeFrom: 'note_2',
    });

    expect(result.status).toBe('updated');
    expect(result.merged).toBeTruthy();
    expect(result.merged.from).toBe('note_2');
    expect(result.merged.childrenMoved).toBe(2); // idea_1, idea_2

    // Children moved to target
    const targetChildren = loroDoc.getChildren('note_1');
    expect(targetChildren.length).toBe(targetChildrenBefore + 2);
    expect(targetChildren).toContain('idea_1');
    expect(targetChildren).toContain('idea_2');

    // Source trashed
    expect(loroDoc.getParentId('note_2')).toBe(SYSTEM_NODE_IDS.TRASH);
  });

  it('merges tags from source to target (deduplicated)', async () => {
    // task_1 has tag: tagDef_task
    // meeting_1 has tag: tagDef_meeting
    const result = await executeEdit({
      nodeId: 'task_1',
      mergeFrom: 'meeting_1',
    });

    expect(result.merged.tagsMerged).toBe(1);
    const targetTags = loroDoc.toNodexNode('task_1')?.tags ?? [];
    expect(targetTags).toContain('tagDef_task');
    expect(targetTags).toContain('tagDef_meeting');
  });

  it('merges field entries with same fieldDefId by combining values', async () => {
    // Both task_1 and task_2 need the same tag so they have matching field entries.
    // First, set a field value on task_1 and task_2 for Status field.
    await executeEdit({ nodeId: 'task_1', text: 'Status:: Done' });

    // Apply task tag to task_2 so it has fieldEntries, then set Status
    await executeEdit({ nodeId: 'task_2', text: '#task\nStatus:: In Progress' });

    // Find the Status fieldEntry values before merge
    const task1StatusFeBefore = loroDoc.getChildren('task_1')
      .find((cid) => {
        const c = loroDoc.toNodexNode(cid);
        return c?.type === 'fieldEntry' && c.fieldDefId === 'attrDef_status';
      });
    expect(task1StatusFeBefore).toBeTruthy();
    const valuesBefore = loroDoc.getChildren(task1StatusFeBefore!).length;

    const result = await executeEdit({
      nodeId: 'task_1',
      mergeFrom: 'task_2',
    });

    expect(result.merged.fieldsMerged).toBeGreaterThan(0);

    // Check that the Status fieldEntry on task_1 now has combined values
    const task1StatusFeAfter = loroDoc.getChildren('task_1')
      .find((cid) => {
        const c = loroDoc.toNodexNode(cid);
        return c?.type === 'fieldEntry' && c.fieldDefId === 'attrDef_status';
      });
    expect(task1StatusFeAfter).toBeTruthy();
    const valuesAfter = loroDoc.getChildren(task1StatusFeAfter!).length;
    expect(valuesAfter).toBeGreaterThan(valuesBefore);
  });

  it('redirects reference nodes pointing to source', async () => {
    // Create a reference node pointing to note_2
    loroDoc.createNode('ref_to_note2', 'note_1');
    loroDoc.setNodeDataBatch('ref_to_note2', { type: 'reference', targetId: 'note_2' });
    loroDoc.commitDoc();

    const result = await executeEdit({
      nodeId: 'note_1',
      mergeFrom: 'note_2',
    });

    expect(result.merged.referencesRedirected).toBeGreaterThanOrEqual(1);
    // Reference now points to target
    const refNode = loroDoc.toNodexNode('ref_to_note2');
    expect(refNode?.targetId).toBe('note_1');
  });

  it('redirects inline references pointing to source', async () => {
    // si_mm_dte_1 has an inline ref pointing to si_mm_sot
    // Merge si_mm_sot into note_1 — the inline ref should redirect
    const before = loroDoc.toNodexNode('si_mm_dte_1');
    expect(before?.inlineRefs?.some((r) => r.targetNodeId === 'si_mm_sot')).toBe(true);

    const result = await executeEdit({
      nodeId: 'note_1',
      mergeFrom: 'si_mm_sot',
    });

    expect(result.merged.referencesRedirected).toBeGreaterThanOrEqual(1);
    const after = loroDoc.toNodexNode('si_mm_dte_1');
    expect(after?.inlineRefs?.some((r) => r.targetNodeId === 'note_1')).toBe(true);
    expect(after?.inlineRefs?.some((r) => r.targetNodeId === 'si_mm_sot')).toBe(false);
  });

  it('rejects mergeFrom + text used simultaneously', async () => {
    await expect(editTool.execute('tool_edit', {
      nodeId: 'note_1',
      mergeFrom: 'note_2',
      text: 'New name',
    } as never)).rejects.toThrow('mergeFrom and text cannot be used together');
  });

  it('rejects mergeFrom with non-existent source', async () => {
    await expect(editTool.execute('tool_edit', {
      nodeId: 'note_1',
      mergeFrom: 'nonexistent_node',
    } as never)).rejects.toThrow('Source node not found');
  });

  it('rejects merging locked/system nodes', async () => {
    await expect(editTool.execute('tool_edit', {
      nodeId: 'note_1',
      mergeFrom: SYSTEM_NODE_IDS.TRASH,
    } as never)).rejects.toThrow('Cannot merge from locked/system node');
  });
});

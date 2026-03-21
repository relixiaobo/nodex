import { beforeEach, describe, expect, it } from 'vitest';
import { editTool } from '../../src/lib/ai-tools/edit-tool.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
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
});

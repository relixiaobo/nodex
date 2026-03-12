import { beforeEach, describe, expect, it } from 'vitest';
import { createTool } from '../../src/lib/ai-tools/create-tool.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';

async function executeCreate(params: Record<string, unknown>) {
  const result = await createTool.execute('tool_create', params as never);
  return JSON.parse(result.content[0].text as string);
}

describe('node_create tool', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  // ── children batch ──

  it('creates a tree of children recursively (max depth 3)', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      name: 'Spark',
      children: [
        { name: 'Framework', children: [
          { name: 'Detail 1' },
          { name: 'Detail 2' },
        ] },
        { name: 'Summary' },
      ],
    });

    expect(result.childrenCreated).toBe(4);
    expect(result.name).toBe('Spark');

    // Verify tree structure
    const sparkChildren = loroDoc.getChildren(result.id);
    expect(sparkChildren).toHaveLength(2);
    const framework = loroDoc.toNodexNode(sparkChildren[0]);
    expect(framework?.name).toBe('Framework');

    const frameworkChildren = loroDoc.getChildren(sparkChildren[0]);
    expect(frameworkChildren).toHaveLength(2);
    expect(loroDoc.toNodexNode(frameworkChildren[0])?.name).toBe('Detail 1');
    expect(loroDoc.toNodexNode(frameworkChildren[1])?.name).toBe('Detail 2');

    expect(loroDoc.toNodexNode(sparkChildren[1])?.name).toBe('Summary');
  });

  it('creates children with references via targetId', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      name: 'Collision',
      children: [
        { targetId: 'note_1' },
        { targetId: 'note_2' },
      ],
    });

    expect(result.childrenCreated).toBe(2);
    const children = loroDoc.getChildren(result.id);
    expect(children).toHaveLength(2);

    const ref1 = loroDoc.toNodexNode(children[0]);
    expect(ref1?.type).toBe('reference');
    expect(ref1?.targetId).toBe('note_1');

    const ref2 = loroDoc.toNodexNode(children[1]);
    expect(ref2?.type).toBe('reference');
    expect(ref2?.targetId).toBe('note_2');
  });

  // ── fields convenience ──

  it('creates a node with tags and sets field values', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      name: 'Buy groceries',
      tags: ['task'],
      fields: { 'Status': 'To Do', 'Priority': 'High' },
    });

    expect(result.tags).toContain('Task');

    // Verify Status field was set
    const node = loroDoc.toNodexNode(result.id);
    expect(node).toBeTruthy();

    // Find the Status field entry
    const children = loroDoc.getChildren(result.id);
    const statusEntry = children
      .map((cid) => loroDoc.toNodexNode(cid))
      .find((c) => c?.type === 'fieldEntry' && c.fieldDefId === 'attrDef_status');
    expect(statusEntry).toBeTruthy();
  });

  it('auto-collects a new option value when it does not exist', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      name: 'Review PR',
      tags: ['task'],
      fields: { 'Status': 'Reviewing' },
    });

    // "Reviewing" should have been auto-collected under attrDef_status
    const statusOptions = loroDoc.getChildren('attrDef_status');
    const optionNames = statusOptions
      .map((cid) => loroDoc.toNodexNode(cid)?.name)
      .filter(Boolean);
    expect(optionNames).toContain('Reviewing');
  });

  // ── reference ──

  it('creates a reference node via targetId', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      targetId: 'note_1',
    });

    expect(result.isReference).toBe(true);
    expect(result.targetId).toBe('note_1');

    const refNode = loroDoc.toNodexNode(result.id);
    expect(refNode?.type).toBe('reference');
    expect(refNode?.targetId).toBe('note_1');
  });

  // ── sibling ──

  it('creates a sibling node after a specified node', async () => {
    const beforeChildren = loroDoc.getChildren('proj_1');
    const task1Index = beforeChildren.indexOf('task_1');

    const result = await executeCreate({
      afterId: 'task_1',
      name: 'New sibling task',
    });

    const afterChildren = loroDoc.getChildren('proj_1');
    const newIndex = afterChildren.indexOf(result.id);
    expect(newIndex).toBe(task1Index + 1);
    expect(loroDoc.toNodexNode(result.id)?.name).toBe('New sibling task');
  });

  // ── duplicate ──

  it('duplicates a node via duplicateId', async () => {
    const result = await executeCreate({
      duplicateId: 'note_1',
    });

    expect(result.duplicatedFrom).toBe('note_1');
    expect(result.id).not.toBe('note_1');

    const duplicated = loroDoc.toNodexNode(result.id);
    expect(duplicated?.name).toBe('Meeting notes - Team standup');
  });

  // ── children with fields ──

  it('creates children with tags and fields in a single call', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      name: 'Sprint',
      children: [
        { name: 'Task A', tags: ['task'], fields: { 'Status': 'To Do' } },
        { name: 'Task B', tags: ['task'], fields: { 'Status': 'Done' } },
      ],
    });

    expect(result.childrenCreated).toBe(2);

    const sprintChildren = loroDoc.getChildren(result.id);
    expect(sprintChildren).toHaveLength(2);

    const taskA = loroDoc.toNodexNode(sprintChildren[0]);
    expect(taskA?.name).toBe('Task A');
    expect(taskA?.tags).toContain('tagDef_task');

    const taskB = loroDoc.toNodexNode(sprintChildren[1]);
    expect(taskB?.name).toBe('Task B');
    expect(taskB?.tags).toContain('tagDef_task');
  });

  // ── unresolved fields ──

  it('reports unresolved fields when node has no matching tag', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      name: 'Plain node',
      fields: { 'Status': 'Todo' },
    });

    expect(result.name).toBe('Plain node');
    expect(result.unresolvedFields).toEqual(['Status']);
    expect(result.hint).toBeTruthy();
  });

  it('resolves fields when tags are provided in the same call', async () => {
    const result = await executeCreate({
      parentId: 'proj_1',
      name: 'Tagged node',
      tags: ['task'],
      fields: { 'Status': 'To Do' },
    });

    expect(result.unresolvedFields).toBeUndefined();
    expect(result.tags).toContain('Task');
  });
});

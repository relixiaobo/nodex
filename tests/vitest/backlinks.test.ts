/**
 * Backlinks utility tests.
 *
 * Creates specific reference structures on top of seed data,
 * then verifies computeBacklinks() and buildBacklinkCountMap().
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import { resetAndSeed } from './helpers/test-state.js';
import { computeBacklinks, buildBacklinkCountMap } from '../../src/lib/backlinks.js';

describe('computeBacklinks', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns totalCount === 0 when no references exist', () => {
    // note_2 ("Quick ideas") has no references pointing at it in seed data
    const result = computeBacklinks('note_2');
    expect(result.totalCount).toBe(0);
    expect(result.mentionedIn).toEqual([]);
    expect(result.fieldValueRefs).toEqual({});
  });

  it('detects tree reference', () => {
    // Add a tree reference from proj_1 → task_3
    const refId = useNodeStore.getState().addReference('proj_1', 'task_3');
    loroDoc.commitDoc();

    const result = computeBacklinks('task_3');
    expect(result.totalCount).toBe(1);
    expect(result.mentionedIn).toHaveLength(1);
    expect(result.mentionedIn[0].refType).toBe('tree');
    expect(result.mentionedIn[0].referencingNodeId).toBe('proj_1');
    expect(result.mentionedIn[0].refNodeId).toBe(refId);
  });

  it('detects inline reference', () => {
    // Seed data: rich_inline_ref has an inline reference to task_1
    const result = computeBacklinks('task_1');
    const inlineRefs = result.mentionedIn.filter(r => r.refType === 'inline');
    expect(inlineRefs.length).toBeGreaterThanOrEqual(1);
    const match = inlineRefs.find(r => r.refNodeId === 'rich_inline_ref');
    expect(match).toBeTruthy();
    expect(match!.referencingNodeId).toBe('rich_inline_ref');
  });

  it('detects field value reference (options field pointing to target)', () => {
    // Set task_1's Status field to opt_todo
    useNodeStore.getState().setOptionsFieldValue('task_1', 'attrDef_status', 'opt_todo');
    loroDoc.commitDoc();

    // opt_todo is referenced as a field value in task_1
    const result = computeBacklinks('opt_todo');
    expect(result.totalCount).toBeGreaterThanOrEqual(1);

    // Check fieldValueRefs grouped by field name
    const statusRefs = result.fieldValueRefs['Status'];
    expect(statusRefs).toBeTruthy();
    expect(statusRefs.some(r => r.ownerNodeId === 'task_1')).toBe(true);
  });

  it('excludes references inside TRASH', () => {
    // Create a node in LIBRARY with a reference to task_3, then trash it
    const store = useNodeStore.getState();
    const containerNode = store.createChild(ensureTodayNode(), undefined, { name: 'Temp node' });
    store.addReference(containerNode.id, 'task_3');
    loroDoc.commitDoc();

    // Before trash: should find it
    const before = computeBacklinks('task_3');
    expect(before.totalCount).toBeGreaterThanOrEqual(1);

    // Trash the container
    store.trashNode(containerNode.id);
    loroDoc.commitDoc();

    // After trash: should NOT find the reference from trashed node
    const after = computeBacklinks('task_3');
    const refsFromTrashed = after.mentionedIn.filter(r => r.referencingNodeId === containerNode.id);
    expect(refsFromTrashed).toHaveLength(0);
  });

  it('counts multiple reference types correctly', () => {
    // task_1 already has an inline ref from rich_inline_ref
    // Add a tree reference to task_1
    useNodeStore.getState().addReference('note_2', 'task_1');
    loroDoc.commitDoc();

    const result = computeBacklinks('task_1');
    // At least 1 inline + 1 tree
    expect(result.totalCount).toBeGreaterThanOrEqual(2);

    const treeRefs = result.mentionedIn.filter(r => r.refType === 'tree');
    const inlineRefs = result.mentionedIn.filter(r => r.refType === 'inline');
    expect(treeRefs.length).toBeGreaterThanOrEqual(1);
    expect(inlineRefs.length).toBeGreaterThanOrEqual(1);

    // totalCount = mentionedIn.length + sum of all fieldValueRefs entries
    const fieldCount = Object.values(result.fieldValueRefs).reduce((sum, arr) => sum + arr.length, 0);
    expect(result.totalCount).toBe(result.mentionedIn.length + fieldCount);
  });

  it('breadcrumb path is correct for tree reference', () => {
    // Add tree ref from subtask_1a → note_2
    useNodeStore.getState().addReference('subtask_1a', 'note_2');
    loroDoc.commitDoc();

    const result = computeBacklinks('note_2');
    const treeRef = result.mentionedIn.find(r => r.refType === 'tree' && r.referencingNodeId === 'subtask_1a');
    expect(treeRef).toBeTruthy();

    // subtask_1a is under task_1 → proj_1 → Today day node → Journal
    // Breadcrumb should include Journal, proj_1 (My Project), task_1 (Design the data model)
    const names = treeRef!.breadcrumb.map(a => a.name);
    expect(names).toContain('Daily notes');
    expect(names).toContain('My Project');
    expect(names).toContain('Design the data model');
  });

  it('excludes references from supertag search nodes', () => {
    // Seed data has search_task (single-tag search for tagDef_task) in SEARCHES.
    // Refresh it to materialize reference children pointing at task_1.
    useNodeStore.getState().refreshSearchResults('search_task');
    loroDoc.commitDoc();

    // The search node should have created a reference to task_1
    const searchNode = loroDoc.toNodexNode('search_task');
    expect(searchNode?.type).toBe('search');
    const hasRefToTask1 = searchNode!.children.some((childId) => {
      const child = loroDoc.toNodexNode(childId);
      return child?.type === 'reference' && child.targetId === 'task_1';
    });
    expect(hasRefToTask1).toBe(true);

    // But task_1's backlinks should NOT include the search node reference
    const result = computeBacklinks('task_1');
    const fromSearch = result.mentionedIn.filter(
      (r) => r.referencingNodeId === 'search_task',
    );
    expect(fromSearch).toHaveLength(0);
  });

  it('includes references from multi-condition search nodes', () => {
    // Create a search node with multiple conditions (not a supertag search)
    const store = useNodeStore.getState();
    const searchId = 'search_complex';
    loroDoc.createNode(searchId, SYSTEM_NODE_IDS.SEARCHES);
    loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Complex search' });
    const andId = 'search_complex_and';
    loroDoc.createNode(andId, searchId);
    loroDoc.setNodeDataBatch(andId, { type: 'queryCondition', queryLogic: 'AND' });
    // Two leaf conditions → not a supertag search
    const cond1Id = 'search_complex_c1';
    loroDoc.createNode(cond1Id, andId);
    loroDoc.setNodeDataBatch(cond1Id, { type: 'queryCondition', queryOp: 'HAS_TAG', queryTagDefId: 'tagDef_task' });
    const cond2Id = 'search_complex_c2';
    loroDoc.createNode(cond2Id, andId);
    loroDoc.setNodeDataBatch(cond2Id, { type: 'queryCondition', queryOp: 'HAS_TAG', queryTagDefId: 'tagDef_meeting' });
    // Add a reference child manually
    const refId = store.addReference(searchId, 'task_1');
    loroDoc.commitDoc();

    const result = computeBacklinks('task_1');
    const fromSearch = result.mentionedIn.filter(
      (r) => r.referencingNodeId === searchId,
    );
    expect(fromSearch).toHaveLength(1);
  });

  it('field value refs grouped by fieldDefName', () => {
    // Set status for two different nodes
    useNodeStore.getState().setOptionsFieldValue('task_1', 'attrDef_status', 'opt_todo');
    // Create another tagged node
    const newTask = useNodeStore.getState().createChild(ensureTodayNode(), undefined, { name: 'Another task' });
    useNodeStore.getState().applyTag(newTask.id, 'tagDef_task');
    useNodeStore.getState().setOptionsFieldValue(newTask.id, 'attrDef_status', 'opt_todo');
    loroDoc.commitDoc();

    const result = computeBacklinks('opt_todo');
    const statusRefs = result.fieldValueRefs['Status'];
    expect(statusRefs).toBeTruthy();
    expect(statusRefs.length).toBeGreaterThanOrEqual(2);
    expect(statusRefs.some(r => r.ownerNodeId === 'task_1')).toBe(true);
    expect(statusRefs.some(r => r.ownerNodeId === newTask.id)).toBe(true);
  });
});

describe('buildBacklinkCountMap', () => {
  let ver: number;

  beforeEach(() => {
    resetAndSeed();
    ver = 0;
  });

  it('returns counts for referenced nodes', () => {
    // Seed has rich_inline_ref → task_1 inline reference
    const map = buildBacklinkCountMap(ver++);
    expect(map.get('task_1')).toBeGreaterThanOrEqual(1);
  });

  it('tree reference increments count', () => {
    const before = buildBacklinkCountMap(ver++);
    const countBefore = before.get('task_3') ?? 0;

    useNodeStore.getState().addReference('proj_1', 'task_3');
    loroDoc.commitDoc();

    const after = buildBacklinkCountMap(ver++);
    expect(after.get('task_3')).toBe(countBefore + 1);
  });

  it('trashed references are excluded from counts', () => {
    const store = useNodeStore.getState();
    const node = store.createChild(ensureTodayNode(), undefined, { name: 'Temp' });
    store.addReference(node.id, 'task_3');
    loroDoc.commitDoc();

    const before = buildBacklinkCountMap(ver++);
    const countBefore = before.get('task_3') ?? 0;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    store.trashNode(node.id);
    loroDoc.commitDoc();

    const after = buildBacklinkCountMap(ver++);
    expect(after.get('task_3') ?? 0).toBe(countBefore - 1);
  });
});

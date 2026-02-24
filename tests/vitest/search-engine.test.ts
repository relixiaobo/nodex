/**
 * Search engine tests — condition tree evaluation, tag hierarchy, search node creation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { executeSearch, collectTagHierarchy, getAllSearchableNodes } from '../../src/lib/search-engine.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('collectTagHierarchy', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns set containing the tag itself', () => {
    const hierarchy = collectTagHierarchy('tagDef_task');
    expect(hierarchy.has('tagDef_task')).toBe(true);
  });

  it('includes child tagDef that extends the parent', () => {
    // tagDef_dev_task extends tagDef_task
    const hierarchy = collectTagHierarchy('tagDef_task');
    expect(hierarchy.has('tagDef_dev_task')).toBe(true);
  });

  it('child tagDef hierarchy does not include parent', () => {
    const hierarchy = collectTagHierarchy('tagDef_dev_task');
    expect(hierarchy.has('tagDef_task')).toBe(false);
    expect(hierarchy.has('tagDef_dev_task')).toBe(true);
  });
});

describe('getAllSearchableNodes', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('excludes structural node types', () => {
    const results = getAllSearchableNodes();
    for (const id of results) {
      const node = loroDoc.toNodexNode(id);
      if (node?.type) {
        expect(['fieldEntry', 'fieldDef', 'tagDef', 'reference', 'queryCondition', 'search', 'viewDef'])
          .not.toContain(node.type);
      }
    }
  });

  it('excludes nodes in trash', () => {
    // Move a node to trash and verify it is excluded
    useNodeStore.getState().trashNode('note_2');
    loroDoc.commitDoc('test');
    const results = getAllSearchableNodes();
    expect(results).not.toContain('note_2');
    // Children of trashed nodes should also be excluded
    expect(results).not.toContain('idea_1');
    expect(results).not.toContain('idea_2');
  });

  it('includes regular content nodes', () => {
    const results = getAllSearchableNodes();
    expect(results).toContain('task_1');
    expect(results).toContain('note_1');
  });
});

describe('executeSearch', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('finds nodes matching a HAS_TAG condition', () => {
    // search_tasks searches for #Task — should find task_1, task_2, task_3
    const results = executeSearch('search_tasks');
    expect(results).toContain('task_1');
    expect(results).toContain('task_2');
    expect(results).toContain('task_3');
  });

  it('polymorphic search includes child tag instances', () => {
    // Apply DevTask (extends Task) to a node
    useNodeStore.getState().applyTag('note_1', 'tagDef_dev_task');
    loroDoc.commitDoc('test');
    // Search for #Task should also find note_1 (tagged with DevTask which extends Task)
    const results = executeSearch('search_tasks');
    expect(results).toContain('note_1');
  });

  it('returns empty array when search node has no conditions', () => {
    // Create an empty search node with no condition children
    loroDoc.createNode('search_empty', 'SEARCHES');
    loroDoc.setNodeDataBatch('search_empty', { type: 'search', name: 'Empty' });
    loroDoc.commitDoc('test');
    const results = executeSearch('search_empty');
    expect(results).toEqual([]);
  });

  it('does not include the search node itself in results', () => {
    const results = executeSearch('search_tasks');
    expect(results).not.toContain('search_tasks');
  });

  it('does not include queryCondition nodes in results', () => {
    const results = executeSearch('search_tasks');
    expect(results).not.toContain('search_tasks_group');
    expect(results).not.toContain('search_tasks_cond');
  });
});

describe('createSearchNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates 3-node structure: search + AND group + HAS_TAG condition', () => {
    const store = useNodeStore.getState();
    const searchId = store.createSearchNode('LIBRARY', null, 'tagDef_person');

    expect(searchId).toBeTruthy();
    const searchNode = loroDoc.toNodexNode(searchId);
    expect(searchNode?.type).toBe('search');
    expect(searchNode?.name).toBe('Person');

    // First child should be the AND group
    const children = loroDoc.getChildren(searchId);
    expect(children.length).toBe(1);
    const groupNode = loroDoc.toNodexNode(children[0]);
    expect(groupNode?.type).toBe('queryCondition');
    expect(groupNode?.queryLogic).toBe('AND');

    // Group should have one HAS_TAG condition child
    const groupChildren = loroDoc.getChildren(children[0]);
    expect(groupChildren.length).toBe(1);
    const condNode = loroDoc.toNodexNode(groupChildren[0]);
    expect(condNode?.type).toBe('queryCondition');
    expect(condNode?.queryOp).toBe('HAS_TAG');
    expect(condNode?.queryTargetTag).toBe('tagDef_person');
  });

  it('created search node returns matching results', () => {
    const store = useNodeStore.getState();
    const searchId = store.createSearchNode('LIBRARY', null, 'tagDef_person');

    const results = executeSearch(searchId);
    // person_1 is tagged with tagDef_person
    expect(results).toContain('person_1');
  });
});

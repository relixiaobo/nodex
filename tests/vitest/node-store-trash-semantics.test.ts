/**
 * node-store trash semantics — Loro model.
 * trashNode(nodeId): sync, moves to CONTAINER_IDS.TRASH.
 * restoreNode(nodeId): sync, moves back to original parent.
 * Tags on other nodes are NOT affected by trashing the tagDef.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('trashNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('moves node to CONTAINER_IDS.TRASH', () => {
    useNodeStore.getState().trashNode('idea_1');
    expect(loroDoc.getParentId('idea_1')).toBe(CONTAINER_IDS.TRASH);
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH)).toContain('idea_1');
  });

  it('removes node from original parent children', () => {
    useNodeStore.getState().trashNode('idea_1');
    expect(loroDoc.getChildren('note_2')).not.toContain('idea_1');
  });

  it('trashing tagDef moves it to TRASH', () => {
    useNodeStore.getState().trashNode('tagDef_task');
    expect(loroDoc.getParentId('tagDef_task')).toBe(CONTAINER_IDS.TRASH);
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH)).toContain('tagDef_task');
  });

  it('trashing tagDef does not remove tag from nodes that had it applied', () => {
    // task_1 has tagDef_task in its tags
    const taskBefore = loroDoc.toNodexNode('task_1')!;
    expect(taskBefore.tags).toContain('tagDef_task');

    useNodeStore.getState().trashNode('tagDef_task');

    // task_1 still has the tag (tags array not cleaned up on trash)
    const taskAfter = loroDoc.toNodexNode('task_1')!;
    expect(taskAfter.tags).toContain('tagDef_task');
  });

  it('graph is valid after trashNode', () => {
    useNodeStore.getState().trashNode('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('multiple nodes can be trashed', () => {
    useNodeStore.getState().trashNode('idea_1');
    useNodeStore.getState().trashNode('idea_2');
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH)).toContain('idea_1');
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH)).toContain('idea_2');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('restoreNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('restores node to its original parent', () => {
    const originalParent = loroDoc.getParentId('idea_1'); // note_2
    useNodeStore.getState().trashNode('idea_1');
    useNodeStore.getState().restoreNode('idea_1');

    expect(loroDoc.getParentId('idea_1')).toBe(originalParent);
    expect(loroDoc.getChildren(originalParent!)).toContain('idea_1');
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH)).not.toContain('idea_1');
  });

  it('restores to original position', () => {
    // note_2 children: [idea_1, idea_2]
    useNodeStore.getState().trashNode('idea_1'); // trashes first child
    useNodeStore.getState().restoreNode('idea_1');

    const children = loroDoc.getChildren('note_2');
    expect(children[0]).toBe('idea_1');
  });

  it('graph is valid after restore', () => {
    useNodeStore.getState().trashNode('idea_1');
    useNodeStore.getState().restoreNode('idea_1');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('restores to LIBRARY when original parent is gone', () => {
    // Trash the parent first, then the node
    useNodeStore.getState().trashNode('note_2');
    // note_2 is now in TRASH, idea_1 is a child of note_2 (still in note_2)
    // Now trash idea_1 separately (it's moved with note_2 to trash already)
    // Test with a fresh node whose parent will be missing
    const newNode = useNodeStore.getState().createChild('note_2', undefined, { name: 'Orphan test' });
    const newId = newNode.id;
    loroDoc.setNodeData(newId, '_trashedFrom', 'nonexistent_parent');
    loroDoc.setNodeData(newId, '_trashedIndex', 0);
    loroDoc.moveNode(newId, CONTAINER_IDS.TRASH);

    useNodeStore.getState().restoreNode(newId);
    expect(loroDoc.getParentId(newId)).toBe(CONTAINER_IDS.LIBRARY);
  });
});

describe('removeTag after trashNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('removeTag still cleans fieldEntries even after tagDef is trashed', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');

    const statusFe = loroDoc.getChildren('note_2').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(statusFe).toBeTruthy();

    useNodeStore.getState().trashNode('tagDef_task');
    useNodeStore.getState().removeTag('note_2', 'tagDef_task');

    // fieldEntry for attrDef_status should be removed
    const remaining = loroDoc.getChildren('note_2').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(remaining).toBeUndefined();

    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

/**
 * node-store tag + reference flows — Loro model.
 * applyTag: adds to node.tags, creates fieldEntry nodes.
 * removeTag: removes from node.tags, removes fieldEntry nodes.
 * addReference: creates reference node (NOT idempotent).
 * removeReference(refNodeId): deletes ref node.
 * startRefConversion: returns tempNodeId.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

/** Find fieldEntry for a fieldDefId in node children. */
function findFieldEntry(nodeId: string, fieldDefId: string): string | undefined {
  return loroDoc.getChildren(nodeId).find(cid => {
    const n = loroDoc.toNodexNode(cid);
    return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
  });
}

describe('applyTag / removeTag', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('applyTag adds tagDefId to node.tags', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    const node = loroDoc.toNodexNode('note_2')!;
    expect(node.tags).toContain('tagDef_task');
  });

  it('applyTag creates fieldEntry nodes for tagDef template fields', () => {
    const originalChildren = loroDoc.getChildren('note_2').slice();

    useNodeStore.getState().applyTag('note_2', 'tagDef_task');

    // tagDef_task has 4 fieldDefs: status, priority, due, done_chk
    expect(findFieldEntry('note_2', 'attrDef_status')).toBeTruthy();
    expect(findFieldEntry('note_2', 'attrDef_priority')).toBeTruthy();
    expect(findFieldEntry('note_2', 'attrDef_due')).toBeTruthy();
    expect(findFieldEntry('note_2', 'attrDef_done_chk')).toBeTruthy();

    // Original children (idea_1, idea_2) still present
    for (const id of originalChildren) {
      expect(loroDoc.getChildren('note_2')).toContain(id);
    }
  });

  it('applyTag is idempotent — double apply does not duplicate tag or fieldEntries', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');

    const node = loroDoc.toNodexNode('note_2')!;
    const tagCount = node.tags.filter(t => t === 'tagDef_task').length;
    expect(tagCount).toBe(1);

    const statusEntries = loroDoc.getChildren('note_2').filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(statusEntries.length).toBe(1);

    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('removeTag removes tagDefId from node.tags', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    useNodeStore.getState().removeTag('note_2', 'tagDef_task');

    const node = loroDoc.toNodexNode('note_2')!;
    expect(node.tags).not.toContain('tagDef_task');
  });

  it('removeTag removes template-created fieldEntry nodes', () => {
    const originalChildren = loroDoc.getChildren('note_2').slice();

    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    useNodeStore.getState().removeTag('note_2', 'tagDef_task');

    expect(findFieldEntry('note_2', 'attrDef_status')).toBeUndefined();
    expect(findFieldEntry('note_2', 'attrDef_priority')).toBeUndefined();
    expect(findFieldEntry('note_2', 'attrDef_due')).toBeUndefined();

    // Original children should remain
    for (const id of originalChildren) {
      expect(loroDoc.getChildren('note_2')).toContain(id);
    }

    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('manually added fieldEntry is kept when tag is removed', () => {
    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_company');
    const manualFe = findFieldEntry('note_2', 'attrDef_company')!;

    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    useNodeStore.getState().removeTag('note_2', 'tagDef_task');

    // attrDef_company is not part of tagDef_task's template, should remain
    expect(findFieldEntry('note_2', 'attrDef_company')).toBe(manualFe);

    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('addReference / removeReference', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('addReference creates a reference node and returns its ID', () => {
    const refId = useNodeStore.getState().addReference('note_2', 'task_1');
    expect(refId).toBeTruthy();
    expect(loroDoc.hasNode(refId)).toBe(true);

    const ref = loroDoc.toNodexNode(refId)!;
    expect(ref.type).toBe('reference');
    expect(ref.targetId).toBe('task_1');
    expect(loroDoc.getParentId(refId)).toBe('note_2');
  });

  it('addReference is NOT idempotent — each call creates a new ref node', () => {
    const refId1 = useNodeStore.getState().addReference('note_2', 'task_1');
    const refId2 = useNodeStore.getState().addReference('note_2', 'task_1');

    expect(refId1).not.toBe(refId2);
    expect(loroDoc.hasNode(refId1)).toBe(true);
    expect(loroDoc.hasNode(refId2)).toBe(true);

    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('removeReference(refNodeId) deletes the reference node', () => {
    const refId = useNodeStore.getState().addReference('note_2', 'task_1');
    expect(loroDoc.hasNode(refId)).toBe(true);

    useNodeStore.getState().removeReference(refId);
    expect(loroDoc.hasNode(refId)).toBe(false);

    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('addReference at specified position', () => {
    const refId = useNodeStore.getState().addReference('note_2', 'task_1', 0);
    const children = loroDoc.getChildren('note_2');
    expect(children[0]).toBe(refId);

    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('startRefConversion', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns a tempId (new content node)', () => {
    const refId = useNodeStore.getState().addReference('note_2', 'task_1');
    const tempId = useNodeStore.getState().startRefConversion(refId, 'note_2', 0);
    expect(tempId).toBeTruthy();
    expect(loroDoc.hasNode(tempId)).toBe(true);

    // Original ref node should be deleted
    expect(loroDoc.hasNode(refId)).toBe(false);

    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('tempNode has inlineRefs pointing to original target', () => {
    const refId = useNodeStore.getState().addReference('note_2', 'task_1');
    const tempId = useNodeStore.getState().startRefConversion(refId, 'note_2', 0);

    const tempNode = loroDoc.toNodexNode(tempId)!;
    expect(tempNode.inlineRefs).toBeDefined();
    expect(tempNode.inlineRefs![0].targetNodeId).toBe('task_1');
    expect(loroDoc.getNodeText(tempId)?.toString()).toBe('\uFFFC');
  });

  it('keeps target node when called with targetId directly (defensive path)', () => {
    const tempId = useNodeStore.getState().startRefConversion('task_1', 'note_2', 0);
    expect(tempId).toBeTruthy();
    expect(loroDoc.hasNode('task_1')).toBe(true);
    const tempNode = loroDoc.toNodexNode(tempId)!;
    expect(tempNode.inlineRefs?.[0]?.targetNodeId).toBe('task_1');
  });
});

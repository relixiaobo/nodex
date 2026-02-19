/**
 * Supertag Extend (Inheritance) — Loro model.
 * getExtendsChain reads from LoroDoc (first arg ignored).
 * applyTag creates fieldEntry nodes for tagDef's fieldDefs (and extends chain).
 * removeTag removes those fieldEntry nodes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { getExtendsChain } from '../../src/lib/field-utils.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

/** Find a fieldEntry for a given fieldDefId in a node's children. */
function findFieldEntry(nodeId: string, fieldDefId: string): string | undefined {
  return loroDoc.getChildren(nodeId).find(cid => {
    const n = loroDoc.toNodexNode(cid);
    return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
  });
}

describe('getExtendsChain (field-utils public API)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns empty array for tagDef with no extends', () => {
    expect(getExtendsChain({}, 'tagDef_task')).toEqual([]);
  });

  it('returns parent tagDef for single-level extends', () => {
    // tagDef_dev_task extends tagDef_task
    expect(getExtendsChain({}, 'tagDef_dev_task')).toEqual(['tagDef_task']);
  });

  it('returns ancestors in ancestor-first order for multi-level extends', () => {
    const grandId = 'tagDef_grand_extend_test';
    loroDoc.createNode(grandId, 'SCHEMA');
    loroDoc.setNodeDataBatch(grandId, { type: 'tagDef', name: 'Grand', extends: 'tagDef_dev_task' });

    const chain = getExtendsChain({}, grandId);
    expect(chain).toEqual(['tagDef_task', 'tagDef_dev_task']);
  });

  it('handles circular references without infinite loop', () => {
    loroDoc.setNodeData('tagDef_task', 'extends', 'tagDef_dev_task');
    const chain = getExtendsChain({}, 'tagDef_dev_task');
    expect(Array.isArray(chain)).toBe(true);
  });
});

describe('applyTag — creates fieldEntry nodes', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('applyTag adds tagDefId to node.tags', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    const node = loroDoc.toNodexNode('note_2')!;
    expect(node.tags).toContain('tagDef_task');
  });

  it('applyTag creates fieldEntry nodes for tagDef_task fieldDefs', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');

    // tagDef_task has: attrDef_status, attrDef_priority, attrDef_due, attrDef_done_chk
    expect(findFieldEntry('note_2', 'attrDef_status')).toBeTruthy();
    expect(findFieldEntry('note_2', 'attrDef_priority')).toBeTruthy();
    expect(findFieldEntry('note_2', 'attrDef_due')).toBeTruthy();
    expect(findFieldEntry('note_2', 'attrDef_done_chk')).toBeTruthy();
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
  });

  it('applyTag with extends chain creates fieldEntries for inherited fieldDefs', () => {
    // tagDef_dev_task extends tagDef_task
    useNodeStore.getState().applyTag('note_2', 'tagDef_dev_task');

    // Should have attrDef_branch (from dev_task) AND inherited fields from tagDef_task
    expect(findFieldEntry('note_2', 'attrDef_branch')).toBeTruthy();
    expect(findFieldEntry('note_2', 'attrDef_status')).toBeTruthy();

    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('removeTag — removes fieldEntry nodes', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('removeTag removes tagDefId from node.tags', () => {
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    useNodeStore.getState().removeTag('note_2', 'tagDef_task');

    const node = loroDoc.toNodexNode('note_2')!;
    expect(node.tags).not.toContain('tagDef_task');
  });

  it('removeTag removes fieldEntry nodes created by applyTag', () => {
    const originalChildren = loroDoc.getChildren('note_2').slice();
    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    useNodeStore.getState().removeTag('note_2', 'tagDef_task');

    // No fieldEntry for tagDef_task fields should remain
    expect(findFieldEntry('note_2', 'attrDef_status')).toBeUndefined();
    expect(findFieldEntry('note_2', 'attrDef_priority')).toBeUndefined();

    // Original children should still be there
    for (const id of originalChildren) {
      expect(loroDoc.getChildren('note_2')).toContain(id);
    }

    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('manually added fieldEntry is NOT removed when tag is removed', () => {
    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_company');
    const manualFe = findFieldEntry('note_2', 'attrDef_company');
    expect(manualFe).toBeTruthy();

    useNodeStore.getState().applyTag('note_2', 'tagDef_task');
    useNodeStore.getState().removeTag('note_2', 'tagDef_task');

    // Manual field entry for attrDef_company (from tagDef_person, not tagDef_task) should remain
    expect(findFieldEntry('note_2', 'attrDef_company')).toBe(manualFe);
  });
});

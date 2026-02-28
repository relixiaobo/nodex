/**
 * Tests for batch tag operations (batchApplyTag / batchRemoveTag).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('batchApplyTag', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('applies tag to multiple nodes in a single commit', () => {
    const store = useNodeStore.getState();
    const node1 = store.createChild('proj_1', undefined, { name: 'Node 1' });
    const node2 = store.createChild('proj_1', undefined, { name: 'Node 2' });
    const node3 = store.createChild('proj_1', undefined, { name: 'Node 3' });

    store.batchApplyTag([node1.id, node2.id, node3.id], 'tagDef_task');

    // All three should have the tag
    expect(loroDoc.toNodexNode(node1.id)?.tags).toContain('tagDef_task');
    expect(loroDoc.toNodexNode(node2.id)?.tags).toContain('tagDef_task');
    expect(loroDoc.toNodexNode(node3.id)?.tags).toContain('tagDef_task');

    // All three should have fieldEntries from tagDef_task
    for (const id of [node1.id, node2.id, node3.id]) {
      const children = loroDoc.getChildren(id);
      const fieldEntries = children.filter(cid => {
        const n = loroDoc.toNodexNode(cid);
        return n?.type === 'fieldEntry';
      });
      expect(fieldEntries.length).toBeGreaterThanOrEqual(4); // status, priority, due, done_chk
    }
  });

  it('skips nodes that already have the tag', () => {
    const store = useNodeStore.getState();
    const node1 = store.createChild('proj_1', undefined, { name: 'Node 1' });
    store.applyTag(node1.id, 'tagDef_task');

    const childrenBefore = loroDoc.getChildren(node1.id).length;

    // Batch apply same tag — should be no-op for node1
    store.batchApplyTag([node1.id], 'tagDef_task');

    const childrenAfter = loroDoc.getChildren(node1.id).length;
    expect(childrenAfter).toBe(childrenBefore);
  });

  it('handles empty nodeIds array gracefully', () => {
    const store = useNodeStore.getState();
    expect(() => store.batchApplyTag([], 'tagDef_task')).not.toThrow();
  });
});

describe('batchRemoveTag', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('removes tag from multiple nodes', () => {
    const store = useNodeStore.getState();
    const node1 = store.createChild('proj_1', undefined, { name: 'Node 1' });
    const node2 = store.createChild('proj_1', undefined, { name: 'Node 2' });

    // Apply tag first
    store.batchApplyTag([node1.id, node2.id], 'tagDef_task');
    expect(loroDoc.toNodexNode(node1.id)?.tags).toContain('tagDef_task');
    expect(loroDoc.toNodexNode(node2.id)?.tags).toContain('tagDef_task');

    // Remove tag
    store.batchRemoveTag([node1.id, node2.id], 'tagDef_task');
    expect(loroDoc.toNodexNode(node1.id)?.tags).not.toContain('tagDef_task');
    expect(loroDoc.toNodexNode(node2.id)?.tags).not.toContain('tagDef_task');
  });

  it('removes orphaned fieldEntries when tag is removed', () => {
    const store = useNodeStore.getState();
    const node1 = store.createChild('proj_1', undefined, { name: 'Node 1' });
    store.batchApplyTag([node1.id], 'tagDef_task');

    // Should have fieldEntries
    const childrenBefore = loroDoc.getChildren(node1.id);
    const fesBefore = childrenBefore.filter(cid => loroDoc.toNodexNode(cid)?.type === 'fieldEntry');
    expect(fesBefore.length).toBeGreaterThanOrEqual(4);

    // Remove tag
    store.batchRemoveTag([node1.id], 'tagDef_task');

    // FieldEntries should be removed (no other tag needs them)
    const childrenAfter = loroDoc.getChildren(node1.id);
    const fesAfter = childrenAfter.filter(cid => loroDoc.toNodexNode(cid)?.type === 'fieldEntry');
    expect(fesAfter.length).toBe(0);
  });

  it('handles nodes that do not have the tag gracefully', () => {
    const store = useNodeStore.getState();
    const node1 = store.createChild('proj_1', undefined, { name: 'Node 1' });
    // node1 does not have tagDef_task
    expect(() => store.batchRemoveTag([node1.id], 'tagDef_task')).not.toThrow();
  });
});

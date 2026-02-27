/**
 * Loro model: LoroDoc is the single source of truth.
 * This file tests that LoroDoc operations are atomic and consistent.
 */
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('LoroDoc provides atomic tree consistency (replaces Realtime echo protection)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('createChild immediately visible in LoroDoc children', () => {
    const store = useNodeStore.getState();
    const before = loroDoc.getChildren('proj_1').length;

    const newNode = store.createChild('proj_1', undefined, { name: 'New task' });

    const after = loroDoc.getChildren('proj_1');
    expect(after.length).toBe(before + 1);
    expect(after).toContain(newNode.id);
  });

  it('trashNode removes node from parent children atomically', () => {
    const store = useNodeStore.getState();
    const parentChildren = loroDoc.getChildren('proj_1');
    expect(parentChildren.length).toBeGreaterThan(0);
    const nodeId = parentChildren[0]; // task_1

    store.trashNode(nodeId);

    const updatedParent = loroDoc.getChildren('proj_1');
    expect(updatedParent).not.toContain(nodeId);

    // Node is now in TRASH
    expect(loroDoc.getParentId(nodeId)).toBe(CONTAINER_IDS.TRASH);
  });

  it('LoroDoc state is consistent after multiple operations', () => {
    // _version is incremented asynchronously by Loro subscription —
    // verify structural consistency instead.
    const store = useNodeStore.getState();
    const child1 = store.createChild('proj_1', undefined, { name: 'op1' });
    const child2 = store.createChild('proj_1', undefined, { name: 'op2' });

    const proj1Children = loroDoc.getChildren('proj_1');
    expect(proj1Children).toContain(child1.id);
    expect(proj1Children).toContain(child2.id);
  });
});

import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store edge cases', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('indent first child is a no-op', () => {
    // task_1's first child in LoroDoc
    const task1Children = loroDoc.getChildren('task_1');
    const firstChild = task1Children[0];
    expect(firstChild).toBeTruthy();
    if (!firstChild) return;

    const beforeParent = loroDoc.getParentId(firstChild);
    useNodeStore.getState().indentNode(firstChild);
    const afterParent = loroDoc.getParentId(firstChild);

    expect(afterParent).toBe(beforeParent);
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('outdent top-level node is a no-op', () => {
    const beforeParent = loroDoc.getParentId('proj_1');
    useNodeStore.getState().outdentNode('proj_1');
    const afterParent = loroDoc.getParentId('proj_1');

    expect(afterParent).toBe(beforeParent);
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

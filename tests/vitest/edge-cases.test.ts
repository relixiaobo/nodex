import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store edge cases', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('indent first child is a no-op', async () => {
    const firstChild = useNodeStore.getState().entities.task_1.children?.[0];
    expect(firstChild).toBeTruthy();
    if (!firstChild) return;

    const beforeParent = useNodeStore.getState().entities[firstChild]?.props._ownerId;
    await useNodeStore.getState().indentNode(firstChild, 'user_default');
    const afterParent = useNodeStore.getState().entities[firstChild]?.props._ownerId;

    expect(afterParent).toBe(beforeParent);
    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('outdent top-level node is a no-op', async () => {
    const beforeParent = useNodeStore.getState().entities.proj_1.props._ownerId;
    await useNodeStore.getState().outdentNode('proj_1', 'user_default');
    const afterParent = useNodeStore.getState().entities.proj_1.props._ownerId;

    expect(afterParent).toBe(beforeParent);
    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });
});


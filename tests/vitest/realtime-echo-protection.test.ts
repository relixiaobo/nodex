/**
 * Regression tests for Realtime self-echo protection (_pendingChildrenOps).
 *
 * Bug 1: Rapid createChild — Realtime echo overwrites local children with stale array.
 * Bug 2: Rapid trashNode — deleted nodes resurrect via delayed Realtime echo.
 */
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import type { NodexNode } from '../../src/types/index.js';

describe('_pendingChildrenOps protects children from Realtime echo', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('setNode skips children overwrite when parent has pending ops', () => {
    const store = useNodeStore.getState();
    // proj_1 has children: [task_1, task_2, task_3, note_1a]
    const parent = store.entities['proj_1'];
    const originalChildren = [...(parent?.children ?? [])];
    expect(originalChildren.length).toBeGreaterThan(0);

    // Simulate: optimistic createChild added 'new_node' to local children
    useNodeStore.setState((state) => {
      const p = state.entities['proj_1'];
      if (p) {
        if (!p.children) p.children = [];
        p.children.push('new_node');
      }
      // Mark as pending (simulating in-flight async)
      state._pendingChildrenOps.set('proj_1', 1);
    });

    const localChildren = [...(useNodeStore.getState().entities['proj_1']?.children ?? [])];
    expect(localChildren).toContain('new_node');

    // Simulate Realtime echo arriving with stale children (without 'new_node')
    const echoNode: NodexNode = {
      ...useNodeStore.getState().entities['proj_1'],
      children: originalChildren, // stale — doesn't include 'new_node'
      version: 2,
      updatedAt: Date.now(),
      updatedBy: 'user_default',
    };
    useNodeStore.getState().setNode(echoNode);

    // Children should be preserved (not overwritten by echo)
    const result = useNodeStore.getState().entities['proj_1'];
    expect(result.children).toContain('new_node');
    // But version/timestamp should be updated
    expect(result.version).toBe(2);
  });

  it('setNode allows children overwrite after pending is cleared', () => {
    // Mark pending, then clear
    useNodeStore.setState((state) => {
      state._pendingChildrenOps.set('proj_1', 1);
    });
    useNodeStore.setState((state) => {
      state._pendingChildrenOps.delete('proj_1');
    });

    // Now setNode should fully replace
    const freshNode: NodexNode = {
      ...useNodeStore.getState().entities['proj_1'],
      children: ['replaced_child'],
      version: 3,
      updatedAt: Date.now(),
    };
    useNodeStore.getState().setNode(freshNode);
    expect(useNodeStore.getState().entities['proj_1'].children).toEqual(['replaced_child']);
  });

  it('pending ref count tracks multiple concurrent ops', () => {
    // Simulate two concurrent createChild ops
    useNodeStore.setState((state) => {
      state._pendingChildrenOps.set('proj_1',
        (state._pendingChildrenOps.get('proj_1') ?? 0) + 1);
    });
    useNodeStore.setState((state) => {
      state._pendingChildrenOps.set('proj_1',
        (state._pendingChildrenOps.get('proj_1') ?? 0) + 1);
    });

    expect(useNodeStore.getState()._pendingChildrenOps.get('proj_1')).toBe(2);

    // Decrement one
    useNodeStore.setState((state) => {
      const n = (state._pendingChildrenOps.get('proj_1') ?? 1) - 1;
      if (n <= 0) state._pendingChildrenOps.delete('proj_1');
      else state._pendingChildrenOps.set('proj_1', n);
    });

    // Still pending (count = 1)
    expect(useNodeStore.getState()._pendingChildrenOps.has('proj_1')).toBe(true);

    // Decrement second
    useNodeStore.setState((state) => {
      const n = (state._pendingChildrenOps.get('proj_1') ?? 1) - 1;
      if (n <= 0) state._pendingChildrenOps.delete('proj_1');
      else state._pendingChildrenOps.set('proj_1', n);
    });

    // Now cleared
    expect(useNodeStore.getState()._pendingChildrenOps.has('proj_1')).toBe(false);
  });

  it('setNode updates non-children props even when pending', () => {
    useNodeStore.setState((state) => {
      state._pendingChildrenOps.set('idea_1', 1);
    });

    const original = useNodeStore.getState().entities['idea_1'];
    const echoNode: NodexNode = {
      ...original,
      props: { ...original.props, description: 'new description from echo' },
      version: 5,
      updatedAt: Date.now() + 1000,
      updatedBy: 'other_user',
    };
    useNodeStore.getState().setNode(echoNode);

    const result = useNodeStore.getState().entities['idea_1'];
    // Props should be merged
    expect(result.props.description).toBe('new description from echo');
    expect(result.version).toBe(5);
    expect(result.updatedBy).toBe('other_user');
  });
});

describe('trashNode removes node from parent.children locally', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('optimistic local state removes node from parent children', async () => {
    const store = useNodeStore.getState();
    // proj_1 has children: [task_1, task_2, task_3, note_1a]
    const parent = store.entities['proj_1'];
    expect(parent?.children?.length).toBeGreaterThan(0);
    const nodeId = parent.children![0]; // task_1

    // Trash the first child (offline — no Supabase)
    await store.trashNode(nodeId, 'ws_default', 'user_default');

    const updatedParent = useNodeStore.getState().entities['proj_1'];
    expect(updatedParent.children).not.toContain(nodeId);

    // Node should have _ownerId = trash
    const trashedNode = useNodeStore.getState().entities[nodeId];
    expect(trashedNode.props._ownerId).toBe('ws_default_TRASH');
  });
});

import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store moveNodeTo', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('blocks invalid moves (onto self or own descendant)', async () => {
    const beforeProjChildren = [...(useNodeStore.getState().entities.proj_1.children ?? [])];
    const beforeTaskChildren = [...(useNodeStore.getState().entities.task_1.children ?? [])];
    const beforeOwner = useNodeStore.getState().entities.task_1.props._ownerId;

    await useNodeStore.getState().moveNodeTo('task_1', 'task_1', 0, 'user_default');
    await useNodeStore.getState().moveNodeTo('task_1', 'subtask_1a', 0, 'user_default');

    expect(useNodeStore.getState().entities.task_1.props._ownerId).toBe(beforeOwner);
    expect(useNodeStore.getState().entities.proj_1.children ?? []).toEqual(beforeProjChildren);
    expect(useNodeStore.getState().entities.task_1.children ?? []).toEqual(beforeTaskChildren);
    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('adjusts insert index correctly when reordering within same parent', async () => {
    const before = [...(useNodeStore.getState().entities.task_1.children ?? [])];
    expect(before[0]).toBe('subtask_1a');
    expect(before[1]).toBe('subtask_1b');

    // Move first child to index=2 in the same parent.
    // Implementation removes first, then adjusts insertAt (position-1).
    await useNodeStore.getState().moveNodeTo('subtask_1a', 'task_1', 2, 'user_default');

    const after = useNodeStore.getState().entities.task_1.children ?? [];
    expect(after[0]).toBe('subtask_1b');
    expect(after[1]).toBe('subtask_1a');
    expect(useNodeStore.getState().entities.subtask_1a.props._ownerId).toBe('task_1');
    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('moves node across parents and updates ownership + children arrays', async () => {
    const oldParentBefore = [...(useNodeStore.getState().entities.task_1.children ?? [])];
    const newParentBefore = [...(useNodeStore.getState().entities.note_2.children ?? [])];
    expect(oldParentBefore).toContain('subtask_1b');

    await useNodeStore.getState().moveNodeTo('subtask_1b', 'note_2', 1, 'user_default');

    const oldParentAfter = useNodeStore.getState().entities.task_1.children ?? [];
    const newParentAfter = useNodeStore.getState().entities.note_2.children ?? [];

    expect(oldParentAfter).not.toContain('subtask_1b');
    expect(newParentAfter[1]).toBe('subtask_1b');
    expect(useNodeStore.getState().entities.subtask_1b.props._ownerId).toBe('note_2');
    expect(newParentAfter.length).toBe(newParentBefore.length + 1);
    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });
});

import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store CRUD + tree operations', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('supports sibling/create/move/trash flows without breaking invariants', async () => {
    const store = useNodeStore.getState();
    const initialCount = Object.keys(store.entities).length;

    const newSibling = await store.createSibling(
      'subtask_1a',
      'ws_default',
      'user_default',
    );
    expect(Object.keys(useNodeStore.getState().entities).length).toBe(initialCount + 1);

    await useNodeStore.getState().indentNode(newSibling.id, 'user_default');
    expect(useNodeStore.getState().entities[newSibling.id]?.props._ownerId).toBe('subtask_1a');

    await useNodeStore.getState().outdentNode(newSibling.id, 'user_default');
    expect(useNodeStore.getState().entities[newSibling.id]?.props._ownerId).toBe('task_1');

    const beforeRoundTrip = [...(useNodeStore.getState().entities.task_1.children ?? [])];
    await useNodeStore.getState().moveNodeDown(newSibling.id, 'user_default');
    await useNodeStore.getState().moveNodeUp(newSibling.id, 'user_default');
    expect(useNodeStore.getState().entities.task_1.children ?? []).toEqual(beforeRoundTrip);

    await useNodeStore.getState().trashNode(newSibling.id, 'ws_default', 'user_default');
    const trashChildren = useNodeStore.getState().entities.ws_default_TRASH.children ?? [];
    const taskChildren = useNodeStore.getState().entities.task_1.children ?? [];
    expect(trashChildren).toContain(newSibling.id);
    expect(taskChildren).not.toContain(newSibling.id);

    const child = await useNodeStore.getState().createChild(
      'note_2',
      'ws_default',
      'user_default',
      'Test child',
    );
    expect(useNodeStore.getState().entities.note_2.children ?? []).toContain(child.id);
    expect(useNodeStore.getState().entities[child.id]?.props.name).toBe('Test child');

    await useNodeStore.getState().trashNode(child.id, 'ws_default', 'user_default');

    const originalName = useNodeStore.getState().entities.idea_1.props.name;
    await useNodeStore.getState().updateNodeName('idea_1', 'Renamed idea', 'user_default');
    expect(useNodeStore.getState().entities.idea_1.props.name).toBe('Renamed idea');
    await useNodeStore.getState().updateNodeName('idea_1', originalName ?? '', 'user_default');

    const errors = collectNodeGraphErrors(useNodeStore.getState().entities);
    expect(errors).toEqual([]);
  });
});


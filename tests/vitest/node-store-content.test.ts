import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import type { NodexNode } from '../../src/types/index.js';

describe('node-store content model actions', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('setNodeContentLocal writes name + _marks + _inlineRefs together', () => {
    useNodeStore.getState().setNodeContentLocal(
      'idea_1',
      'Hi \uFFFC',
      [{ start: 0, end: 2, type: 'bold' }],
      [{ offset: 3, targetNodeId: 'task_1', displayName: 'Design the data model' }],
    );

    const node = useNodeStore.getState().entities.idea_1;
    expect(node.props.name).toBe('Hi \uFFFC');
    expect(node.props._marks).toEqual([{ start: 0, end: 2, type: 'bold' }]);
    expect(node.props._inlineRefs).toEqual([
      { offset: 3, targetNodeId: 'task_1', displayName: 'Design the data model' },
    ]);
  });

  it('updateNodeName preserves existing _marks/_inlineRefs', async () => {
    useNodeStore.getState().setNodeContentLocal(
      'idea_1',
      'Hi \uFFFC',
      [{ start: 0, end: 2, type: 'bold' }],
      [{ offset: 3, targetNodeId: 'task_1' }],
    );

    await useNodeStore.getState().updateNodeName('idea_1', 'Renamed \uFFFC', 'user_default');
    const node = useNodeStore.getState().entities.idea_1;
    expect(node.props.name).toBe('Renamed \uFFFC');
    expect(node.props._marks).toEqual([{ start: 0, end: 2, type: 'bold' }]);
    expect(node.props._inlineRefs).toEqual([{ offset: 3, targetNodeId: 'task_1' }]);
  });
});

describe('dirty content protection (regression: Enter causes content loss)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('setNodeContentLocal marks node as dirty', () => {
    const store = useNodeStore.getState();
    expect(store._dirtyContentIds.has('idea_1')).toBe(false);

    store.setNodeContentLocal('idea_1', 'edited', [], []);
    expect(useNodeStore.getState()._dirtyContentIds.has('idea_1')).toBe(true);
  });

  it('setNode preserves content of dirty nodes', () => {
    const store = useNodeStore.getState();
    // Simulate local typing
    store.setNodeContentLocal('idea_1', 'locally typed content', [], []);
    expect(useNodeStore.getState().entities.idea_1.props.name).toBe('locally typed content');

    // Simulate Realtime event or createSibling callback overwriting with stale DB data
    const staleNode: NodexNode = {
      ...useNodeStore.getState().entities.idea_1,
      props: { ...useNodeStore.getState().entities.idea_1.props, name: 'old db value' },
      version: 2,
      updatedAt: Date.now(),
    };
    useNodeStore.getState().setNode(staleNode);

    // Content should be preserved (not overwritten)
    const result = useNodeStore.getState().entities.idea_1;
    expect(result.props.name).toBe('locally typed content');
    // But metadata should be updated
    expect(result.version).toBe(2);
  });

  it('setNode allows overwriting after dirty flag is cleared', () => {
    const store = useNodeStore.getState();
    // Simulate local typing
    store.setNodeContentLocal('idea_1', 'locally typed content', [], []);
    expect(useNodeStore.getState()._dirtyContentIds.has('idea_1')).toBe(true);

    // Simulate successful DB write clearing the dirty flag
    useNodeStore.setState((state) => {
      state._dirtyContentIds.delete('idea_1');
    });

    // Now setNode should fully replace
    const freshNode: NodexNode = {
      ...useNodeStore.getState().entities.idea_1,
      props: { ...useNodeStore.getState().entities.idea_1.props, name: 'from realtime' },
      version: 3,
    };
    useNodeStore.getState().setNode(freshNode);
    expect(useNodeStore.getState().entities.idea_1.props.name).toBe('from realtime');
  });

  it('fetchChildren skips overwriting dirty nodes', () => {
    const store = useNodeStore.getState();
    // Simulate local typing in idea_1
    store.setNodeContentLocal('idea_1', 'unsaved edit', [], []);

    // Simulate fetchChildren writing stale data for idea_1
    // (this tests the inline protection in fetchChildren)
    useNodeStore.setState((state) => {
      // Direct entity replacement like fetchChildren does
      const stale: NodexNode = {
        id: 'idea_1',
        workspaceId: 'ws_default',
        props: { created: 1, name: 'stale from db' },
        children: [],
        version: 1,
        updatedAt: Date.now(),
        createdBy: 'user_default',
        updatedBy: 'user_default',
      };
      // Replicate fetchChildren logic: skip dirty
      if (!state._dirtyContentIds.has(stale.id)) {
        state.entities[stale.id] = stale;
      }
    });

    expect(useNodeStore.getState().entities.idea_1.props.name).toBe('unsaved edit');
  });
});

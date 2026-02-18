import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

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


import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store CRUD + tree operations', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('supports sibling/create/move/trash flows without breaking invariants', () => {
    const store = useNodeStore.getState();
    const initialCount = loroDoc.getAllNodeIds().length;

    // createSibling is now sync
    const newSibling = store.createSibling('subtask_1a', { name: 'New sibling' });
    expect(loroDoc.getAllNodeIds().length).toBe(initialCount + 1);

    store.indentNode(newSibling.id);
    expect(loroDoc.getParentId(newSibling.id)).toBe('subtask_1a');

    store.outdentNode(newSibling.id);
    expect(loroDoc.getParentId(newSibling.id)).toBe('task_1');

    const beforeRoundTrip = loroDoc.getChildren('task_1').slice();
    store.moveNodeDown(newSibling.id);
    store.moveNodeUp(newSibling.id);
    expect(loroDoc.getChildren('task_1')).toEqual(beforeRoundTrip);

    store.trashNode(newSibling.id);
    const trashChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH);
    const taskChildren = loroDoc.getChildren('task_1');
    expect(trashChildren).toContain(newSibling.id);
    expect(taskChildren).not.toContain(newSibling.id);

    const child = store.createChild('note_2', undefined, { name: 'Test child' });
    expect(loroDoc.getChildren('note_2')).toContain(child.id);
    expect(loroDoc.toNodexNode(child.id)?.name).toBe('Test child');

    store.trashNode(child.id);

    const originalName = loroDoc.toNodexNode('idea_1')?.name ?? '';
    store.setNodeName('idea_1', 'Renamed idea');
    expect(loroDoc.toNodexNode('idea_1')?.name).toBe('Renamed idea');
    store.setNodeName('idea_1', originalName);

    const errors = collectNodeGraphErrors();
    expect(errors).toEqual([]);
  });
});

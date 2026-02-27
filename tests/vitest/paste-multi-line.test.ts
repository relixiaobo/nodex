import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';

describe('createSiblingNodesFromPaste — multi-line paste', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates sibling nodes for each non-empty line after the current node', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;
    const childrenBefore = loroDoc.getChildren(parentId);

    const lastId = store.createSiblingNodesFromPaste('subtask_1a', [
      'Line two',
      'Line three',
    ]);

    expect(lastId).not.toBeNull();
    const childrenAfter = loroDoc.getChildren(parentId);
    // Two new nodes created
    expect(childrenAfter.length).toBe(childrenBefore.length + 2);

    // New nodes are inserted right after subtask_1a
    const idx = childrenAfter.indexOf('subtask_1a');
    const node1 = loroDoc.toNodexNode(childrenAfter[idx + 1]);
    const node2 = loroDoc.toNodexNode(childrenAfter[idx + 2]);
    expect(node1?.name).toBe('Line two');
    expect(node2?.name).toBe('Line three');

    // lastId is the last created node
    expect(lastId).toBe(childrenAfter[idx + 2]);
  });

  it('skips empty and whitespace-only lines', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;
    const childrenBefore = loroDoc.getChildren(parentId);

    const lastId = store.createSiblingNodesFromPaste('subtask_1a', [
      '',
      '  ',
      'Only real line',
      '',
      '\t',
    ]);

    expect(lastId).not.toBeNull();
    const childrenAfter = loroDoc.getChildren(parentId);
    // Only one non-empty line → one new node
    expect(childrenAfter.length).toBe(childrenBefore.length + 1);

    const idx = childrenAfter.indexOf('subtask_1a');
    const newNode = loroDoc.toNodexNode(childrenAfter[idx + 1]);
    expect(newNode?.name).toBe('Only real line');
  });

  it('returns null when all lines are empty', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;
    const childrenBefore = loroDoc.getChildren(parentId);

    const lastId = store.createSiblingNodesFromPaste('subtask_1a', [
      '',
      '  ',
      '\t',
    ]);

    expect(lastId).toBeNull();
    const childrenAfter = loroDoc.getChildren(parentId);
    expect(childrenAfter.length).toBe(childrenBefore.length);
  });

  it('returns null for empty lines array', () => {
    const store = useNodeStore.getState();
    const lastId = store.createSiblingNodesFromPaste('subtask_1a', []);
    expect(lastId).toBeNull();
  });

  it('preserves tree invariants after multi-line paste', () => {
    const store = useNodeStore.getState();
    store.createSiblingNodesFromPaste('subtask_1a', [
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
    ]);

    const errors = collectNodeGraphErrors();
    expect(errors).toEqual([]);
  });

  it('inserts nodes in correct order with many lines', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;

    store.createSiblingNodesFromPaste('subtask_1a', [
      'First',
      'Second',
      'Third',
    ]);

    const children = loroDoc.getChildren(parentId);
    const idx = children.indexOf('subtask_1a');
    expect(loroDoc.toNodexNode(children[idx + 1])?.name).toBe('First');
    expect(loroDoc.toNodexNode(children[idx + 2])?.name).toBe('Second');
    expect(loroDoc.toNodexNode(children[idx + 3])?.name).toBe('Third');
  });
});

/**
 * Content model actions for the new Loro-based node store.
 * setNodeName, updateNodeContent are now sync and backed by LoroDoc.
 * No _dirtyContentIds / _pendingChildrenOps (removed in Loro migration).
 */
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store content model actions', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('updateNodeContent writes name + marks + inlineRefs together', () => {
    useNodeStore.getState().updateNodeContent('idea_1', {
      name: 'Hi \uFFFC',
      marks: [{ start: 0, end: 2, type: 'bold' }],
      inlineRefs: [{ offset: 3, targetNodeId: 'task_1', displayName: 'Design the data model' }],
    });

    const node = loroDoc.toNodexNode('idea_1');
    expect(node?.name).toBe('Hi \uFFFC');
    expect(node?.marks).toEqual([{ start: 0, end: 2, type: 'bold' }]);
    expect(node?.inlineRefs).toEqual([
      { offset: 3, targetNodeId: 'task_1', displayName: 'Design the data model' },
    ]);

    const richText = loroDoc.getNodeText('idea_1');
    expect(richText?.toString()).toBe('Hi \uFFFC');
  });

  it('setNodeName updates name, preserves marks and inlineRefs', () => {
    // Set initial content with marks
    useNodeStore.getState().updateNodeContent('idea_1', {
      name: 'Hi \uFFFC',
      marks: [{ start: 0, end: 2, type: 'bold' }],
      inlineRefs: [{ offset: 3, targetNodeId: 'task_1' }],
    });

    // setNodeName only updates name
    useNodeStore.getState().setNodeName('idea_1', 'Renamed \uFFFC');
    const node = loroDoc.toNodexNode('idea_1');
    expect(node?.name).toBe('Renamed \uFFFC');
    expect(node?.marks).toEqual([{ start: 0, end: 2, type: 'bold' }]);
    expect(node?.inlineRefs).toEqual([{ offset: 8, targetNodeId: 'task_1' }]);
  });

  it('updateNodeContent with empty marks clears marks', () => {
    useNodeStore.getState().updateNodeContent('idea_1', {
      name: 'Plain text',
      marks: [],
      inlineRefs: [],
    });

    const node = loroDoc.toNodexNode('idea_1');
    expect(node?.name).toBe('Plain text');
    expect(node?.marks ?? []).toEqual([]);
    expect(node?.inlineRefs ?? []).toEqual([]);
  });

  it('LoroDoc is single source of truth — changes immediately visible', () => {
    const before = loroDoc.toNodexNode('idea_1')?.name;
    useNodeStore.getState().setNodeName('idea_1', 'Changed');
    const after = loroDoc.toNodexNode('idea_1')?.name;
    expect(after).not.toBe(before);
    expect(after).toBe('Changed');
  });

  it('createChild with content payload initializes richText immediately', () => {
    const child = useNodeStore.getState().createChild('note_2', undefined, {
      name: 'Hi \uFFFC',
      marks: [{ start: 0, end: 2, type: 'bold' }],
      inlineRefs: [{ offset: 3, targetNodeId: 'task_1' }],
    });

    const richText = loroDoc.getNodeText(child.id);
    expect(richText?.toString()).toBe('Hi \uFFFC');
    const node = loroDoc.toNodexNode(child.id);
    expect(node?.marks).toEqual([{ start: 0, end: 2, type: 'bold' }]);
    expect(node?.inlineRefs).toEqual([{ offset: 3, targetNodeId: 'task_1' }]);
  });
});

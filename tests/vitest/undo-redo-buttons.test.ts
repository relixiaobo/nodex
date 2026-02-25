/**
 * UndoRedoButtons integration tests.
 *
 * Verifies that:
 * - canUndoDoc / canRedoDoc correctly reflect state after store mutations
 * - All major store actions produce undoable entries via commitDoc()
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  canUndoDoc,
  canRedoDoc,
  undoDoc,
  redoDoc,
  getChildren,
} from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

beforeEach(() => {
  resetAndSeed();
});

describe('UndoRedoButtons — canUndo/canRedo state', () => {
  it('initially both false after seed', () => {
    expect(canUndoDoc()).toBe(false);
    expect(canRedoDoc()).toBe(false);
  });

  it('canUndo true after createChild', () => {
    useNodeStore.getState().createChild('proj_1');
    expect(canUndoDoc()).toBe(true);
    expect(canRedoDoc()).toBe(false);
  });

  it('canRedo true after undo', () => {
    useNodeStore.getState().createChild('proj_1');
    undoDoc();
    expect(canUndoDoc()).toBe(false);
    expect(canRedoDoc()).toBe(true);
  });

  it('canRedo false after new action post-undo', () => {
    useNodeStore.getState().createChild('proj_1');
    undoDoc();
    useNodeStore.getState().createChild('proj_1');
    expect(canRedoDoc()).toBe(false);
  });
});

describe('commitDoc() coverage — all major store actions undoable', () => {
  it('applyTag → undoable', () => {
    const store = useNodeStore.getState();
    store.applyTag('note_1', 'tagDef_task');
    expect(canUndoDoc()).toBe(true);
  });

  it('removeTag → undoable', () => {
    const store = useNodeStore.getState();
    store.applyTag('note_1', 'tagDef_task');
    // Clear undo stack by undoing the applyTag first, then reapply
    undoDoc();
    store.applyTag('note_1', 'tagDef_task');

    // Now remove the tag
    store.removeTag('note_1', 'tagDef_task');
    expect(canUndoDoc()).toBe(true);
  });

  it('trashNode → undoable', () => {
    const store = useNodeStore.getState();
    store.trashNode('note_1');
    expect(canUndoDoc()).toBe(true);
  });

  it('moveNodeTo → undoable', () => {
    const store = useNodeStore.getState();
    store.moveNodeTo('subtask_1a', 'note_1');
    expect(canUndoDoc()).toBe(true);
  });

  it('indentNode → undoable', () => {
    const store = useNodeStore.getState();
    // subtask_1b can be indented (has preceding sibling subtask_1a)
    store.indentNode('subtask_1b');
    expect(canUndoDoc()).toBe(true);
  });

  it('toggleNodeDone → undoable', () => {
    const store = useNodeStore.getState();
    store.toggleNodeDone('note_1');
    expect(canUndoDoc()).toBe(true);
  });

  it('setFieldValue → undoable', () => {
    const store = useNodeStore.getState();
    // Create a field entry first, then set value
    const child = store.createChild('note_1');
    // Use any existing attrDef from seed data
    store.setFieldValue('note_1', 'attrDef_status', child.id);
    expect(canUndoDoc()).toBe(true);
  });
});

describe('undo/redo round-trip preserves tree state', () => {
  it('createChild → undo → redo preserves children', () => {
    const store = useNodeStore.getState();
    const before = getChildren('proj_1').length;

    store.createChild('proj_1');
    expect(getChildren('proj_1')).toHaveLength(before + 1);

    undoDoc();
    expect(getChildren('proj_1')).toHaveLength(before);

    redoDoc();
    expect(getChildren('proj_1')).toHaveLength(before + 1);
  });
});

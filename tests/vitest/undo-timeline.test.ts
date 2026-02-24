/**
 * 1.51 undo-timeline — unified timeline undo/redo
 *
 * Verifies:
 * 1. Pure data structure push/pop/reset
 * 2. Interleaved ordering (S→N→S→N)
 * 3. Loro mergeInterval skip behavior
 * 4. New operation clears redo
 * 5. Redo roundtrip stability
 * 6. Integration: navigateTo/goBack/goForward + commitDoc timeline push
 * 7. Expand/collapse integration
 * 8. Pending Loro writes flush before undo/redo
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getRedoDepth,
  getUndoDepth,
  hasRedoEntries,
  hasUndoEntries,
  popRedoEntry,
  popUndoEntry,
  pushRedoEntry,
  pushUndoEntry,
  resetTimeline,
} from '../../src/lib/undo-timeline.js';
import {
  canUndoDoc,
  getChildren,
  setNodeRichTextContent,
} from '../../src/lib/loro-doc.js';
import { performTimelineRedo, performTimelineUndo } from '../../src/hooks/use-nav-undo-keyboard.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

beforeEach(() => {
  resetAndSeed();
});

describe('undo-timeline data structure', () => {
  it('push/pop basic operations', () => {
    expect(hasUndoEntries()).toBe(false);
    expect(hasRedoEntries()).toBe(false);

    pushUndoEntry('structural');
    pushUndoEntry('nav');
    expect(hasUndoEntries()).toBe(true);
    expect(getUndoDepth()).toBe(2);

    expect(popUndoEntry()).toBe('nav');
    expect(popUndoEntry()).toBe('structural');
    expect(popUndoEntry()).toBeUndefined();
    expect(hasUndoEntries()).toBe(false);
  });

  it('redo push/pop basic operations', () => {
    pushRedoEntry('nav');
    pushRedoEntry('structural');
    expect(hasRedoEntries()).toBe(true);
    expect(getRedoDepth()).toBe(2);

    expect(popRedoEntry()).toBe('structural');
    expect(popRedoEntry()).toBe('nav');
    expect(popRedoEntry()).toBeUndefined();
  });

  it('pushUndoEntry clears redo by default', () => {
    pushRedoEntry('nav');
    pushRedoEntry('structural');
    expect(hasRedoEntries()).toBe(true);

    pushUndoEntry('structural');
    expect(hasRedoEntries()).toBe(false);
  });

  it('pushUndoEntry(type, false) preserves redo', () => {
    pushRedoEntry('nav');
    pushUndoEntry('structural', false);
    expect(hasRedoEntries()).toBe(true);
    expect(getRedoDepth()).toBe(1);
  });

  it('resetTimeline clears both stacks', () => {
    pushUndoEntry('structural');
    pushUndoEntry('nav');
    pushRedoEntry('structural');
    resetTimeline();
    expect(hasUndoEntries()).toBe(false);
    expect(hasRedoEntries()).toBe(false);
  });
});

describe('integration: navigation pushes timeline entries', () => {
  it('navigateTo pushes nav', () => {
    expect(getUndoDepth()).toBe(0);
    useUIStore.getState().navigateTo('note_2');
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('nav');
  });

  it('goBack pushes nav', () => {
    useUIStore.getState().navigateTo('note_2');
    resetTimeline();
    useUIStore.getState().goBack();
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('nav');
  });

  it('goForward pushes nav', () => {
    useUIStore.getState().navigateTo('note_2');
    useUIStore.getState().goBack();
    resetTimeline();
    useUIStore.getState().goForward();
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('nav');
  });

  it('navigateTo current page is no-op (no timeline entry)', () => {
    const ui = useUIStore.getState();
    const current = ui.panelHistory[ui.panelIndex];
    resetTimeline();
    ui.navigateTo(current);
    expect(getUndoDepth()).toBe(0);
  });
});

describe('integration: commitDoc pushes structural entries', () => {
  it('createChild -> commitDoc pushes structural', () => {
    resetTimeline();
    useNodeStore.getState().createChild('proj_1');
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('structural');
  });
});

describe('interleaved ordering', () => {
  it('S→N→S→N undoes as N→S→N→S', () => {
    const store = useNodeStore.getState();
    const ui = useUIStore.getState();

    store.createChild('proj_1');
    ui.navigateTo('note_2');
    store.createChild('proj_1');
    ui.navigateTo('task_1');

    expect(getUndoDepth()).toBe(4);

    expect(performTimelineUndo()).toBe(true);
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('note_2');

    expect(performTimelineUndo()).toBe(true);
    expect(performTimelineUndo()).toBe(true);
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('LIBRARY');

    expect(performTimelineUndo()).toBe(true);
    expect(performTimelineUndo()).toBe(false);
  });

  it('undo then redo restores state', () => {
    const store = useNodeStore.getState();
    const ui = useUIStore.getState();
    const childrenBefore = getChildren('proj_1').length;

    store.createChild('proj_1');
    ui.navigateTo('note_2');

    performTimelineUndo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('LIBRARY');

    performTimelineRedo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('note_2');

    performTimelineUndo();
    performTimelineUndo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);

    performTimelineRedo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);
  });
});

describe('expand/collapse integration', () => {
  it('toggleExpanded pushes expand timeline entry', () => {
    resetTimeline();
    useUIStore.getState().toggleExpanded('root:child1');
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('expand');
  });

  it('setExpanded pushes expand entry only when state changes', () => {
    resetTimeline();
    useUIStore.getState().setExpanded('root:child2', true);
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('expand');

    resetTimeline();
    useUIStore.getState().setExpanded('root:child2', true);
    expect(getUndoDepth()).toBe(0);
  });

  it('setExpanded(skipUndo=true) updates state without timeline entry', () => {
    resetTimeline();
    useUIStore.getState().setExpanded('root:skipped', true, true);
    expect(useUIStore.getState().expandedNodes.has('root:skipped')).toBe(true);
    expect(getUndoDepth()).toBe(0);
    expect(useUIStore.getState().expandUndoStack).toHaveLength(0);
  });

  it('expand undo/redo works via timeline', () => {
    resetTimeline();
    useUIStore.getState().toggleExpanded('root:nodeC');
    expect(useUIStore.getState().expandedNodes.has('root:nodeC')).toBe(true);

    expect(performTimelineUndo()).toBe(true);
    expect(useUIStore.getState().expandedNodes.has('root:nodeC')).toBe(false);

    expect(performTimelineRedo()).toBe(true);
    expect(useUIStore.getState().expandedNodes.has('root:nodeC')).toBe(true);
  });

  it('mixed S→E→N undoes as N→E→S', () => {
    const store = useNodeStore.getState();
    resetTimeline();

    store.createChild('proj_1');
    useUIStore.getState().toggleExpanded('root:nodeD');
    useUIStore.getState().navigateTo('note_2');

    expect(getUndoDepth()).toBe(3);

    performTimelineUndo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('LIBRARY');

    performTimelineUndo();
    expect(useUIStore.getState().expandedNodes.has('root:nodeD')).toBe(false);

    performTimelineUndo();
    expect(performTimelineUndo()).toBe(false);
  });
});

describe('Loro mergeInterval skip behavior', () => {
  it('skips extra structural timeline entries when Loro has fewer undo steps', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');

    pushUndoEntry('structural');
    pushUndoEntry('structural');

    expect(performTimelineUndo()).toBe(true);
    expect(canUndoDoc()).toBe(false);
    expect(performTimelineUndo()).toBe(false);
  });
});

describe('redo clearing semantics', () => {
  it('new structural operation clears redo timeline', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');
    store.createChild('proj_1');

    performTimelineUndo();
    expect(hasRedoEntries()).toBe(true);

    store.createChild('proj_1');
    expect(hasRedoEntries()).toBe(false);
  });

  it('new nav operation clears redo timeline', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');

    performTimelineUndo();
    expect(hasRedoEntries()).toBe(true);

    useUIStore.getState().navigateTo('note_2');
    expect(hasRedoEntries()).toBe(false);
  });
});

describe('Loro pending writes + timeline interaction', () => {
  it('undo still undoes structural change when a pending text write exists', () => {
    const store = useNodeStore.getState();
    const childrenBefore = getChildren('proj_1').length;

    store.createChild('proj_1');
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);

    setNodeRichTextContent('proj_1', 'typing side effect', [], []);

    expect(performTimelineUndo()).toBe(true);
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);
  });

  it('multiple undo/redo remains stable with pending text writes', () => {
    const store = useNodeStore.getState();
    const childrenBefore = getChildren('proj_1').length;

    store.createChild('proj_1');
    useUIStore.getState().toggleExpanded('root:autoCommitA');
    setNodeRichTextContent('proj_1', 'uncommitted text', [], []);

    expect(performTimelineUndo()).toBe(true);
    expect(useUIStore.getState().expandedNodes.has('root:autoCommitA')).toBe(false);

    expect(performTimelineUndo()).toBe(true);
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);

    expect(performTimelineRedo()).toBe(true);
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);

    expect(performTimelineRedo()).toBe(true);
    expect(useUIStore.getState().expandedNodes.has('root:autoCommitA')).toBe(true);
  });
});

describe('redo/undo roundtrip stability', () => {
  it('undo→redo→undo loop stays consistent', () => {
    const store = useNodeStore.getState();
    const childrenBefore = getChildren('proj_1').length;

    store.createChild('proj_1');
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);

    performTimelineUndo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);

    performTimelineRedo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);

    performTimelineUndo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);
  });
});

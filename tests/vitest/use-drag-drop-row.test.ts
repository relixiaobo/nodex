import React, { createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useDragDropRow } from '../../src/hooks/use-drag-drop-row.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import * as loroDoc from '../../src/lib/loro-doc.js';

type HookState = ReturnType<typeof useDragDropRow>;

function HookHarness({
  latest,
  ...options
}: { latest: { current: HookState | null } } & Parameters<typeof useDragDropRow>[0]) {
  latest.current = useDragDropRow(options);
  return null;
}

function createRowRef(): React.RefObject<HTMLDivElement | null> {
  const ref = createRef<HTMLDivElement>();
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({
    x: 10,
    y: 10,
    top: 10,
    left: 10,
    right: 210,
    bottom: 40,
    width: 200,
    height: 30,
    toJSON: () => ({}),
  });
  ref.current = element;
  return ref;
}

function createDragEvent(overrides: Partial<DragEvent> = {}) {
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn(),
    setDragImage: vi.fn(),
  };

  return {
    clientX: 25,
    clientY: 25,
    dataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    relatedTarget: null,
    ...overrides,
  } as unknown as React.DragEvent<HTMLElement>;
}

describe('useDragDropRow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetAndSeed();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
  });

  it('sets drag state and delegates drag-image customization on drag start', () => {
    const latest = { current: null as HookState | null };
    const rowRef = createRowRef();
    const customizeDragStart = vi.fn();

    flushSync(() => {
      root.render(React.createElement(HookHarness, {
        latest,
        nodeId: 'task_2',
        parentId: 'proj_1',
        rowRef,
        onDragStart: customizeDragStart,
      }));
    });

    const event = createDragEvent();
    latest.current!.dragHandlers.onDragStart(event);

    expect(event.dataTransfer.effectAllowed).toBe('move');
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'task_2');
    expect(useUIStore.getState().dragNodeId).toBe('task_2');
    expect(customizeDragStart).toHaveBeenCalledTimes(1);
    expect(customizeDragStart).toHaveBeenCalledWith(event, rowRef.current);
  });

  it('computes inside drops, moves the dragged node, and requests expansion', () => {
    const latest = { current: null as HookState | null };
    const rowRef = createRowRef();
    const expandInsideDrop = vi.fn();

    flushSync(() => {
      root.render(React.createElement(HookHarness, {
        latest,
        nodeId: 'task_1',
        parentId: 'proj_1',
        rowRef,
        targetHasChildren: true,
        targetIsExpanded: false,
        onInsideDropExpand: expandInsideDrop,
      }));
    });

    useUIStore.getState().setDrag('task_2');

    const dragOverEvent = createDragEvent({ clientY: 25 });
    latest.current!.dragHandlers.onDragOver(dragOverEvent);
    expect(dragOverEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().dropTargetId).toBe('task_1');
    expect(useUIStore.getState().dropPosition).toBe('inside');

    const dropEvent = createDragEvent({ clientY: 25 });
    latest.current!.dragHandlers.onDrop(dropEvent);

    expect(dropEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dropEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(loroDoc.getParentId('task_2')).toBe('task_1');
    expect(expandInsideDrop).toHaveBeenCalledWith('main:proj_1:task_1');
    expect(useUIStore.getState().dragNodeId).toBeNull();
  });

  it('clears the active drop target when drag leaves the row', () => {
    const latest = { current: null as HookState | null };
    const rowRef = createRowRef();

    flushSync(() => {
      root.render(React.createElement(HookHarness, {
        latest,
        nodeId: 'task_1',
        parentId: 'proj_1',
        rowRef,
      }));
    });

    useUIStore.getState().setDropTarget('task_1', 'after');
    latest.current!.dragHandlers.onDragLeave(createDragEvent());

    expect(useUIStore.getState().dropTargetId).toBeNull();
    expect(useUIStore.getState().dropPosition).toBeNull();
  });

  it('uses the live parent when the target moved after the hook rendered', () => {
    const latest = { current: null as HookState | null };
    const rowRef = createRowRef();

    flushSync(() => {
      root.render(React.createElement(HookHarness, {
        latest,
        nodeId: 'task_1',
        parentId: 'proj_1',
        rowRef,
      }));
    });

    useNodeStore.getState().moveNodeTo('task_1', 'note_1', 0);
    useUIStore.getState().setDrag('task_2');
    useUIStore.getState().setDropTarget('task_1', 'before');

    const dropEvent = createDragEvent();
    latest.current!.dragHandlers.onDrop(dropEvent);

    expect(dropEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dropEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(loroDoc.getParentId('task_2')).toBe('note_1');
    expect(loroDoc.getChildren('note_1').slice(0, 2)).toEqual(['task_2', 'task_1']);
  });
});

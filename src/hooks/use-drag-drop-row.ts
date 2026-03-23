import { useCallback, type DragEvent, type RefObject } from 'react';
import * as loroDoc from '../lib/loro-doc.js';
import { useNodeStore } from '../stores/node-store.js';
import { useUIStore } from '../stores/ui-store.js';
import { resolveDropHoverPosition } from '../lib/drag-drop-position.js';
import { resolveDropMove, type DropPosition } from '../lib/drag-drop.js';
import { buildExpandedNodeKey } from '../lib/expanded-node-key.js';

interface UseDragDropRowOptions {
  nodeId: string;
  parentId: string;
  panelId?: string;
  rowRef: RefObject<HTMLElement | null>;
  targetHasChildren?: boolean;
  targetIsExpanded?: boolean;
  onInsideDropExpand?: (expandKey: string) => void;
  onDragStart?: (event: DragEvent<Element>, rowElement: HTMLElement) => void;
}

interface DragHandlers {
  onDragStart: (event: DragEvent<Element>) => void;
  onDragOver: (event: DragEvent<Element>) => void;
  onDragLeave: (event: DragEvent<Element>) => void;
  onDrop: (event: DragEvent<Element>) => void;
  onDragEnd: () => void;
}

interface UseDragDropRowResult {
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: DropPosition;
  dragHandlers: DragHandlers;
}

export function useDragDropRow({
  nodeId,
  parentId,
  panelId = 'node-main',
  rowRef,
  targetHasChildren = false,
  targetIsExpanded = false,
  onInsideDropExpand,
  onDragStart,
}: UseDragDropRowOptions): UseDragDropRowResult {
  const isDragging = useUIStore((s) => s.dragNodeId === nodeId);
  const dropPosition = useUIStore((s) => (s.dropTargetId === nodeId ? s.dropPosition : null));
  const setDrag = useUIStore((s) => s.setDrag);
  const setDropTarget = useUIStore((s) => s.setDropTarget);
  const moveNodeTo = useNodeStore((s) => s.moveNodeTo);

  const handleDragStart = useCallback((event: DragEvent<Element>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    const rowElement = rowRef.current;
    if (rowElement) {
      onDragStart?.(event, rowElement);
    }
    setDrag(nodeId);
  }, [nodeId, onDragStart, rowRef, setDrag]);

  const handleDragOver = useCallback((event: DragEvent<Element>) => {
    const activeDragId = useUIStore.getState().dragNodeId;
    if (!activeDragId || activeDragId === nodeId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDropTarget(nodeId, resolveDropHoverPosition({
      offsetY: event.clientY - rect.top,
      rowHeight: rect.height,
    }));
  }, [nodeId, rowRef, setDropTarget]);

  const handleDragLeave = useCallback((event: DragEvent<Element>) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && rowRef.current?.contains(relatedTarget)) return;
    if (useUIStore.getState().dropTargetId === nodeId) {
      setDropTarget(null, null);
    }
  }, [nodeId, rowRef, setDropTarget]);

  const handleDrop = useCallback((event: DragEvent<Element>) => {
    event.preventDefault();
    event.stopPropagation();

    const { dragNodeId: activeDragId, dropPosition: currentDropPosition } = useUIStore.getState();
    if (!activeDragId || activeDragId === nodeId) {
      setDrag(null);
      return;
    }

    const liveParentId = loroDoc.getParentId(nodeId) ?? parentId;
    const dropParent = liveParentId ? useNodeStore.getState().getNode(liveParentId) : null;
    const siblingIndex = dropParent?.children?.indexOf(nodeId) ?? 0;
    const decision = resolveDropMove({
      dragNodeId: activeDragId,
      targetNodeId: nodeId,
      targetParentId: liveParentId,
      targetParentKey: buildExpandedNodeKey(panelId, liveParentId, nodeId),
      siblingIndex,
      dropPosition: currentDropPosition,
      targetHasChildren,
      targetIsExpanded,
    });

    if (decision) {
      moveNodeTo(activeDragId, decision.newParentId, decision.position);
      if (decision.expandKey) {
        onInsideDropExpand?.(decision.expandKey);
      }
    }

    setDrag(null);
  }, [
    moveNodeTo,
    nodeId,
    onInsideDropExpand,
    parentId,
    setDrag,
    targetHasChildren,
    targetIsExpanded,
  ]);

  const handleDragEnd = useCallback(() => {
    setDrag(null);
  }, [setDrag]);

  return {
    isDragging,
    isDropTarget: dropPosition !== null,
    dropPosition,
    dragHandlers: {
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      onDragEnd: handleDragEnd,
    },
  };
}

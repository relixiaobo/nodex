/**
 * Document-level drag select hook for multi-node selection.
 *
 * Architecture (matches reference implementation):
 *   mousedown (document capture) → record start + register document listeners
 *   mousemove (document, dynamic) → threshold + text-area logic → activate
 *   mouseup   (document, dynamic) → cleanup + justDragged flag
 *
 * Text area start special handling:
 *   - Still on same node, still on text → let browser text selection work
 *   - Still on same node, moved to non-text (padding) → enter drag-select
 *   - Moved to different node → enter drag-select
 *
 * After drag: dragState.justDragged = true (reset via setTimeout(0))
 *   → OutlinerItem checks this to suppress the click that follows mouseup.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../stores/ui-store.js';
import { useNodeStore } from '../stores/node-store.js';
import { getFlattenedVisibleNodes } from '../lib/tree-utils.js';
import { computeRangeSelection } from '../lib/selection-utils.js';

const DRAG_THRESHOLD_PX = 5;

/**
 * Shared drag state — OutlinerItem checks justDragged to suppress click
 * after drag-select completes (mouseup fires click in the same event loop).
 */
export const dragState = { justDragged: false };

interface UseDragSelectOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  rootChildIds: string[];
  rootNodeId: string;
}

/** Find the closest ancestor with data-node-id and return nodeId + parentId. */
function getNodeFromPoint(x: number, y: number): { nodeId: string; parentId: string } | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const row = (el as HTMLElement).closest('[data-node-id]') as HTMLElement | null;
  if (!row) return null;
  const nodeId = row.getAttribute('data-node-id');
  const parentId = row.getAttribute('data-parent-id');
  if (!nodeId || !parentId) return null;
  return { nodeId, parentId };
}

/** Check if an element is inside a text-editable area (editor, content span, or input). */
function isTextArea(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.closest('.editor-inline')) return true;
  if (el.closest('.node-content')) return true;
  if (el.closest('[contenteditable]')) return true;
  // Field name <input> elements are also text areas for drag-select purposes
  if (el instanceof HTMLInputElement || el.closest('input')) return true;
  return false;
}

export function useDragSelect({ containerRef, rootChildIds, rootNodeId }: UseDragSelectOptions) {
  const contextRef = useRef({ rootChildIds, rootNodeId });
  contextRef.current = { rootChildIds, rootNodeId };

  const stateRef = useRef({
    isDragging: false,
    startY: 0,
    startNodeId: null as string | null,
    startedOnText: false,
  });

  // Track dynamic listeners for cleanup
  const listenersRef = useRef<{
    move: ((e: MouseEvent) => void) | null;
    up: (() => void) | null;
  }>({ move: null, up: null });

  const cleanup = useCallback(() => {
    stateRef.current.isDragging = false;
    stateRef.current.startNodeId = null;
    containerRef.current?.classList.remove('select-none');
    if (listenersRef.current.move) {
      document.removeEventListener('mousemove', listenersRef.current.move);
      listenersRef.current.move = null;
    }
    if (listenersRef.current.up) {
      document.removeEventListener('mouseup', listenersRef.current.up);
      listenersRef.current.up = null;
    }
  }, [containerRef]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Only left button, no modifiers (Cmd/Shift have their own handlers)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Must be inside the container
    const container = containerRef.current;
    if (!container || !container.contains(e.target as Node)) return;

    // Don't start drag select on buttons or interactive elements.
    // Note: <input> is NOT excluded — field name inputs participate in drag-select
    // via the text-area start logic (same as contenteditable editors).
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"]')) return;

    const nodeInfo = getNodeFromPoint(e.clientX, e.clientY);
    if (!nodeInfo) return;

    // Record start state
    const state = stateRef.current;
    state.startY = e.clientY;
    state.startNodeId = nodeInfo.nodeId;
    state.startedOnText = isTextArea(e.target);
    state.isDragging = false;

    // Register dynamic document listeners for this drag session
    const onDocMouseMove = (me: MouseEvent) => {
      // Safety: if left button released (missed mouseup), cleanup
      if (me.buttons !== 1) { cleanup(); return; }

      const s = stateRef.current;
      if (!s.startNodeId) return;

      const dy = Math.abs(me.clientY - s.startY);

      if (!s.isDragging) {
        if (dy < DRAG_THRESHOLD_PX) return;

        // Started on text + still on same node?
        if (s.startedOnText) {
          const hoverNode = getNodeFromPoint(me.clientX, me.clientY);
          if (hoverNode && hoverNode.nodeId === s.startNodeId) {
            // Still on same node: check if cursor is still on text area
            const hoverEl = document.elementFromPoint(me.clientX, me.clientY);
            if (isTextArea(hoverEl)) return; // Let browser handle text selection
            // Moved to non-text area (padding etc.) → fall through to activate
          }
          // Different node or non-text area → activate drag-select
        }

        // Activate drag-select
        s.isDragging = true;
        window.getSelection()?.removeAllRanges();
        containerRef.current?.classList.add('select-none');

        // Select start node as anchor + clear focus (unmount any editor).
        // setSelectedNodes clears focusedNodeId/focusedParentId.
        const setSelectedNodes = useUIStore.getState().setSelectedNodes;
        setSelectedNodes(new Set([s.startNodeId]), s.startNodeId);
      }

      // During active drag: prevent text selection + update range
      me.preventDefault();

      const hoverNode = getNodeFromPoint(me.clientX, me.clientY);
      if (!hoverNode) return;

      const uiState = useUIStore.getState();
      const { rootChildIds: rcIds, rootNodeId: rnId } = contextRef.current;
      const flatList = getFlattenedVisibleNodes(rcIds, uiState.expandedNodes, rnId);

      // Validate hover node belongs to this outliner context
      if (!flatList.some((item) => item.nodeId === hoverNode.nodeId)) return;

      const range = computeRangeSelection(
        s.startNodeId!,
        hoverNode.nodeId,
        flatList,
      );
      useUIStore.getState().setSelectedNodes(range, s.startNodeId);
    };

    const onDocMouseUp = () => {
      if (stateRef.current.isDragging) {
        // Flag to suppress the click event that follows mouseup.
        // setTimeout(0) resets after the click handler runs (same event loop).
        dragState.justDragged = true;
        setTimeout(() => { dragState.justDragged = false; }, 0);
      }
      cleanup();
    };

    // Store refs for cleanup and register
    listenersRef.current.move = onDocMouseMove;
    listenersRef.current.up = onDocMouseUp;
    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup', onDocMouseUp);
  }, [containerRef, cleanup]);

  // Register mousedown on document (capture phase) and cleanup on unmount
  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      cleanup();
    };
  }, [handleMouseDown, cleanup]);
}

/**
 * Document-level drag select hook for multi-node selection.
 *
 * Handles mousedown → mousemove → mouseup on the outliner container.
 * Uses document-level listeners because contenteditable captures mouse events.
 *
 * Behavior:
 * - Left click with no modifiers starts tracking
 * - 5px vertical threshold before activating drag select
 * - Text area start: only activates when mouse crosses to a DIFFERENT node
 * - Non-text area start: activates after 5px threshold
 * - During drag: computes range selection from anchor to hover node
 * - After drag: suppresses the next click event
 */
import { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../stores/ui-store.js';
import { useNodeStore } from '../stores/node-store.js';
import { getFlattenedVisibleNodes } from '../lib/tree-utils.js';
import { computeRangeSelection } from '../lib/selection-utils.js';

const DRAG_THRESHOLD_PX = 5;

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

/** Check if an element is inside a text-editable area (editor or content span). */
function isTextArea(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  // Inside an active editor
  if (target.closest('.editor-inline')) return true;
  // Inside node content (static rendered text)
  if (target.closest('.node-content')) return true;
  // Contenteditable
  if (target.closest('[contenteditable]')) return true;
  return false;
}

export function useDragSelect({ containerRef, rootChildIds, rootNodeId }: UseDragSelectOptions) {
  const stateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startNodeId: string | null;
    startParentId: string | null;
    startedInTextArea: boolean;
    suppressNextClick: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startNodeId: null,
    startParentId: null,
    startedInTextArea: false,
    suppressNextClick: false,
  });

  // Keep rootChildIds and rootNodeId fresh for the document-level handlers
  const contextRef = useRef({ rootChildIds, rootNodeId });
  contextRef.current = { rootChildIds, rootNodeId };

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Only left button, no modifiers (Cmd/Shift have their own handlers)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Must be inside the container
    const container = containerRef.current;
    if (!container || !container.contains(e.target as Node)) return;

    // Don't start drag select on buttons, inputs, or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, input, [role="button"], .editor-inline')) return;

    const nodeInfo = getNodeFromPoint(e.clientX, e.clientY);
    if (!nodeInfo) return;

    stateRef.current = {
      active: false,
      startX: e.clientX,
      startY: e.clientY,
      startNodeId: nodeInfo.nodeId,
      startParentId: nodeInfo.parentId,
      startedInTextArea: isTextArea(e.target),
      suppressNextClick: false,
    };
  }, [containerRef]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = stateRef.current;
    if (!state.startNodeId) return;

    const dy = Math.abs(e.clientY - state.startY);

    if (!state.active) {
      // Check threshold
      if (dy < DRAG_THRESHOLD_PX) return;

      // Text area: also require crossing to a different node
      if (state.startedInTextArea) {
        const hoverNode = getNodeFromPoint(e.clientX, e.clientY);
        if (!hoverNode || hoverNode.nodeId === state.startNodeId) return;
      }

      // Activate drag select
      state.active = true;

      // Clear browser text selection
      window.getSelection()?.removeAllRanges();

      // Set starting node as anchor and selected
      const setSelectedNodes = useUIStore.getState().setSelectedNodes;
      setSelectedNodes(new Set([state.startNodeId]), state.startNodeId);

      // Add select-none to prevent text selection artifacts
      containerRef.current?.classList.add('select-none');
    }

    // During active drag: update selection based on hover node
    const hoverNode = getNodeFromPoint(e.clientX, e.clientY);
    if (!hoverNode) return;

    const uiState = useUIStore.getState();
    const storeEntities = useNodeStore.getState().entities;
    const { rootChildIds: rcIds, rootNodeId: rnId } = contextRef.current;
    const flatList = getFlattenedVisibleNodes(rcIds, storeEntities, uiState.expandedNodes, rnId);

    const range = computeRangeSelection(
      state.startNodeId!,
      hoverNode.nodeId,
      flatList,
      storeEntities,
    );
    useUIStore.getState().setSelectedNodes(range, state.startNodeId);
  }, [containerRef]);

  const handleMouseUp = useCallback(() => {
    const state = stateRef.current;
    if (state.active) {
      state.suppressNextClick = true;
      containerRef.current?.classList.remove('select-none');
    }

    // Reset start tracking (keep suppressNextClick for the click handler)
    state.active = false;
    state.startNodeId = null;
    state.startParentId = null;
  }, [containerRef]);

  const handleClick = useCallback((e: MouseEvent) => {
    if (stateRef.current.suppressNextClick) {
      stateRef.current.suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClick, true);
      containerRef.current?.classList.remove('select-none');
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleClick, containerRef]);
}

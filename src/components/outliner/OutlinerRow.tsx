/**
 * OutlinerRow — unified row interaction wrapper.
 *
 * Encapsulates selection state, pointer-based selection (Cmd+Click / Shift+Click),
 * and selection-mode keyboard handling (navigate, extend, batch ops, type-to-edit).
 *
 * Used by both OutlinerItem (content rows) and FieldRow (field rows) to guarantee
 * identical interaction behavior regardless of row type or container context.
 */
import { useCallback, useEffect, type ReactNode } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useNodeStore } from '../../stores/node-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import {
  getFlattenedVisibleNodes,
  getPreviousVisibleNode,
  getNextVisibleNode,
  getNodeTextLengthById,
} from '../../lib/tree-utils.js';
import { buildExpandedNodeKey } from '../../lib/expanded-node-key.js';
import {
  toggleNodeInSelection,
  computeRangeSelection,
  filterToRootLevel,
  getFirstSelectedInOrder,
  getSelectionBounds,
  getEffectiveSelectionBounds,
  getSelectedIdsInOrder,
} from '../../lib/selection-utils.js';
import { resolveSelectionKeyboardAction } from '../../lib/selection-keyboard.js';
import { copyNodesToClipboard, cutNodesToClipboard } from '../../lib/node-clipboard.js';
import { isNodeInTrash } from '../../lib/node-capabilities.js';

// ── Public types ──

export interface RowInteractionConfig {
  /** Unique ID for this row: nodeId for content, fieldEntryId for field */
  rowId: string;
  /** Parent node ID */
  parentId: string;
  /** Top-level selectable row IDs within the root scope */
  rootChildIds: string[];
  /** Root node ID for selection flat-list computation */
  rootNodeId: string;
  /** Panel ID for multi-panel expanded-node scoping */
  panelId: string;
  /** Whether this row is currently in edit mode */
  isEditing: boolean;
  /** Enter edit mode for this row */
  enterEdit: () => void;
  /** Exit edit mode for this row */
  exitEdit: () => void;
  /** Row kind: content or field */
  rowKind: 'content' | 'field';

  // ── Row-type-specific delegates ──

  /** Pre-process keyboard events before generic selection handling.
   *  Return true if the event was consumed (e.g. reference shortcuts). */
  onSelectionKeydown?: (e: KeyboardEvent) => boolean;
  /** Batch delete for a single row ID */
  onBatchDelete?: (rowId: string) => void;
  /** Batch indent for a single row ID */
  onBatchIndent?: (rowId: string) => void;
  /** Batch outdent for a single row ID */
  onBatchOutdent?: (rowId: string) => void;
}

interface OutlinerRowProps {
  config: RowInteractionConfig;
  children: ReactNode;
  /** data-node-id attribute value for DOM queries */
  dataNodeId?: string;
  /** data-parent-id attribute value for DOM queries */
  dataParentId?: string;
}

// ── Selection state derivation ──

export function useRowSelectionState(rowId: string, parentId: string) {
  const isInSelectedSet = useUIStore((s) => s.selectedNodeIds.has(rowId));
  const isMultiSelected = useUIStore((s) => s.selectedNodeIds.size > 1);
  const isSelectionAnchor = useUIStore((s) => s.selectionAnchorId === rowId);
  const focusedNodeId = useUIStore((s) => s.focusedNodeId);
  const selectedParentId = useUIStore((s) => s.selectedParentId);

  const isFocused = focusedNodeId === rowId;

  const isSelected = isInSelectedSet && (
    isMultiSelected ||
    selectedParentId === null ||
    selectedParentId === parentId
  );

  return {
    isSelected,
    isMultiSelected,
    isSelectionAnchor,
    isFocused,
  };
}

// ── Component ──

export function OutlinerRow({ config, children }: OutlinerRowProps) {
  const {
    rowId,
    parentId,
    rootChildIds,
    rootNodeId,
    panelId,
    isEditing,
    enterEdit,
    rowKind,
    onSelectionKeydown,
    onBatchDelete,
    onBatchIndent,
    onBatchOutdent,
  } = config;

  const setSelectedNodes = useUIStore((s) => s.setSelectedNodes);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const expandedNodes = useUIStore((s) => s.expandedNodes);
  const setPendingInputChar = useUIStore((s) => s.setPendingInputChar);

  const trashNode = useNodeStore((s) => s.trashNode);
  const batchHardDelete = useNodeStore((s) => s.batchHardDelete);
  const indentNode = useNodeStore((s) => s.indentNode);
  const outdentNode = useNodeStore((s) => s.outdentNode);
  const duplicateNodes = useNodeStore((s) => s.duplicateNodes);
  const cycleNodeCheckbox = useNodeStore((s) => s.cycleNodeCheckbox);

  const { isSelected, isMultiSelected, isSelectionAnchor, isFocused } =
    useRowSelectionState(rowId, parentId);

  // ── Selection-mode keyboard handler ──

  useEffect(() => {
    // Only active when selected but not focused/editing
    if (!isSelected || isFocused || isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      // Skip if an active input/editor has focus
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      const uiState = useUIStore.getState();
      if (uiState.focusedNodeId) return;

      // For multi-select, only the anchor processes keyboard events
      if (uiState.selectedNodeIds.size > 1 && !isSelectionAnchor) {
        return;
      }

      // 1. Row-type-specific keyboard pre-processing
      if (onSelectionKeydown) {
        const consumed = onSelectionKeydown(e);
        if (consumed) return;
      }

      // 2. Generic selection actions
      const selAction = resolveSelectionKeyboardAction(e);
      if (!selAction) return;

      if (selAction === 'clear_selection') {
        e.preventDefault();
        clearSelection();
        enterEdit();
        return;
      }

      if (selAction === 'select_all') {
        e.preventDefault();
        const getNode = useNodeStore.getState().getNode;
        const rootNode = getNode(rootNodeId);
        const topLevelIds = (rootNode?.children ?? []).filter(
          (cid) => !getNode(cid)?.type,
        );
        if (topLevelIds.length > 0) {
          setSelectedNodes(new Set(topLevelIds), topLevelIds[0]);
        }
        return;
      }

      // ── Batch operations ──

      if (selAction === 'batch_delete') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);
        const bounds = getSelectionBounds(latestUi.selectedNodeIds, flatList);
        const prev = bounds ? getPreviousVisibleNode(bounds.first.nodeId, bounds.first.parentId, flatList) : null;
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);

        // Bottom-up: avoid index shift when deleting upper nodes first
        // Collect trash node IDs for batch permanent delete
        const trashIds: string[] = [];
        for (let i = orderedIds.length - 1; i >= 0; i--) {
          const id = orderedIds[i];
          if (onBatchDelete) {
            onBatchDelete(id);
          } else if (isNodeInTrash(id)) {
            trashIds.push(id);
          } else {
            trashNode(id);
          }
        }
        if (trashIds.length > 0) {
          batchHardDelete(trashIds);
        }
        clearSelection();
        if (prev) {
          setFocusedNode(prev.nodeId, prev.parentId);
        }
        return;
      }

      if (selAction === 'batch_indent') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);

        for (const id of orderedIds) {
          if (onBatchIndent) {
            onBatchIndent(id);
          } else {
            const getNode = useNodeStore.getState().getNode;
            const ownerId = loroDoc.getParentId(id);
            if (!ownerId) continue;
            const parent = getNode(ownerId);
            if (!parent?.children) continue;
            const index = parent.children.indexOf(id);
            if (index <= 0) continue;
            const newParentId = parent.children[index - 1];
            setExpanded(buildExpandedNodeKey(ownerId, newParentId), true, true);
            indentNode(id);
          }
        }
        clearSelection();
        return;
      }

      if (selAction === 'batch_outdent') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);

        for (let i = orderedIds.length - 1; i >= 0; i--) {
          if (onBatchOutdent) {
            onBatchOutdent(orderedIds[i]);
          } else {
            outdentNode(orderedIds[i]);
          }
        }
        clearSelection();
        return;
      }

      if (selAction === 'batch_duplicate') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);
        duplicateNodes(orderedIds);
        clearSelection();
        return;
      }

      if (selAction === 'batch_apply_tag') {
        e.preventDefault();
        useUIStore.getState().openBatchTagSelector();
        return;
      }

      if (selAction === 'batch_copy') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);
        copyNodesToClipboard(orderedIds);
        return;
      }

      if (selAction === 'batch_cut') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);
        const bounds = getSelectionBounds(latestUi.selectedNodeIds, flatList);
        const prev = bounds ? getPreviousVisibleNode(bounds.first.nodeId, bounds.first.parentId, flatList) : null;
        const orderedIds = getSelectedIdsInOrder(latestUi.selectedNodeIds, flatList);
        cutNodesToClipboard(orderedIds);
        clearSelection();
        if (prev) {
          setFocusedNode(prev.nodeId, prev.parentId);
        }
        return;
      }

      if (selAction === 'batch_checkbox') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const ids = [...latestUi.selectedNodeIds];
        for (const id of ids) {
          cycleNodeCheckbox(id);
        }
        return;
      }

      if (selAction === 'extend_up' || selAction === 'extend_down') {
        e.preventDefault();
        const latestUi = useUIStore.getState();
        const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);

        const anchor = latestUi.selectionAnchorId;
        if (!anchor) return;

        const anchorIdx = flatList.findIndex((n) => n.nodeId === anchor);
        if (anchorIdx < 0) return;

        const effectiveBounds = getEffectiveSelectionBounds(latestUi.selectedNodeIds, flatList);
        if (!effectiveBounds) return;

        const { firstIdx, lastIdx } = effectiveBounds;

        let extentIdx: number;
        if (anchorIdx <= firstIdx) {
          extentIdx = lastIdx;
        } else if (anchorIdx >= lastIdx) {
          extentIdx = firstIdx;
        } else {
          extentIdx = selAction === 'extend_down' ? lastIdx : firstIdx;
        }

        const newExtentIdx = selAction === 'extend_up'
          ? Math.max(0, extentIdx - 1)
          : Math.min(flatList.length - 1, extentIdx + 1);

        const start = Math.min(anchorIdx, newExtentIdx);
        const end = Math.max(anchorIdx, newExtentIdx);
        const rangeIds = new Set<string>();
        for (let i = start; i <= end; i++) {
          rangeIds.add(flatList[i].nodeId);
        }
        const filtered = filterToRootLevel(rangeIds, undefined, flatList);
        setSelectedNodes(filtered, anchor);
        return;
      }

      // Navigate / enter edit / type-char: use fresh state for multi-select bounds
      const latestUi = useUIStore.getState();
      const flatList = getFlattenedVisibleNodes(rootChildIds, latestUi.expandedNodes, rootNodeId, panelId);

      if (selAction === 'navigate_up') {
        e.preventDefault();
        const bounds = getSelectionBounds(latestUi.selectedNodeIds, flatList);
        if (!bounds) return;
        const prev = getPreviousVisibleNode(bounds.first.nodeId, bounds.first.parentId, flatList);
        if (prev) {
          clearSelection();
          useUIStore.getState().setFocusClickCoords({
            nodeId: prev.nodeId,
            parentId: prev.parentId,
            textOffset: getNodeTextLengthById(prev.nodeId),
          });
          setFocusedNode(prev.nodeId, prev.parentId);
        }
        return;
      }

      if (selAction === 'navigate_down') {
        e.preventDefault();
        const bounds = getSelectionBounds(latestUi.selectedNodeIds, flatList);
        if (!bounds) return;
        const next = getNextVisibleNode(bounds.last.nodeId, bounds.last.parentId, flatList);
        if (next) {
          clearSelection();
          useUIStore.getState().setFocusClickCoords({
            nodeId: next.nodeId,
            parentId: next.parentId,
            textOffset: 0,
          });
          setFocusedNode(next.nodeId, next.parentId);
        }
        return;
      }

      if (selAction === 'enter_edit' || selAction === 'type_char') {
        const first = getFirstSelectedInOrder(latestUi.selectedNodeIds, flatList);
        if (!first) return;
        const editAtEnd = getNodeTextLengthById(first.nodeId);
        if (selAction === 'enter_edit') {
          e.preventDefault();
        }
        if (selAction === 'type_char') {
          const isAsciiLetter = /^[a-zA-Z]$/.test(e.key);
          if (!isAsciiLetter) {
            e.preventDefault();
            setPendingInputChar({ char: e.key, nodeId: first.nodeId, parentId: first.parentId });
          }
        }
        clearSelection();
        useUIStore.getState().setFocusClickCoords({
          nodeId: first.nodeId,
          parentId: first.parentId,
          textOffset: editAtEnd,
        });
        setFocusedNode(first.nodeId, first.parentId);
        return;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isSelected, isFocused, isEditing, isSelectionAnchor, rowKind,
    parentId, rowId, rootNodeId, panelId, rootChildIds, expandedNodes,
    onSelectionKeydown, onBatchDelete, onBatchIndent, onBatchOutdent,
    setSelectedNodes, clearSelection, setFocusedNode, clearFocus,
    setPendingInputChar, enterEdit,
    trashNode, batchHardDelete, indentNode, outdentNode, duplicateNodes, cycleNodeCheckbox,
    setExpanded,
  ]);

  return <>{children}</>;
}

// ── Pointer selection handlers hook ──

/**
 * Reusable hook for Cmd+Click / Shift+Click selection handlers.
 * Used by OutlinerItem and FieldRow in their mousedown/click handlers.
 */
export function useRowPointerHandlers(
  rowId: string,
  parentId: string,
  rootChildIds: string[],
  rootNodeId: string,
  panelId: string,
) {
  const setSelectedNode = useUIStore((s) => s.setSelectedNode);
  const setSelectedNodes = useUIStore((s) => s.setSelectedNodes);

  const handleCmdClick = useCallback(() => {
    const state = useUIStore.getState();
    const newSelection = toggleNodeInSelection(rowId, state.selectedNodeIds);
    let newAnchor = state.selectionAnchorId;
    if (newAnchor && !newSelection.has(newAnchor)) {
      newAnchor = newSelection.size > 0 ? [...newSelection][0] : null;
    }
    if (!newAnchor && newSelection.has(rowId)) {
      newAnchor = rowId;
    }
    setSelectedNodes(newSelection, newAnchor);
  }, [rowId, setSelectedNodes]);

  const handleShiftClick = useCallback(() => {
    const state = useUIStore.getState();
    const anchor = state.selectionAnchorId;
    if (!anchor) {
      setSelectedNode(rowId, parentId);
      return;
    }
    const flatList = getFlattenedVisibleNodes(rootChildIds, state.expandedNodes, rootNodeId, panelId);
    const range = computeRangeSelection(anchor, rowId, flatList);
    setSelectedNodes(range, anchor);
  }, [rowId, parentId, rootChildIds, rootNodeId, panelId, setSelectedNode, setSelectedNodes]);

  return { handleCmdClick, handleShiftClick };
}

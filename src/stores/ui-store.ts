/**
 * UI state store: navigation history, sidebar, expanded nodes, focus.
 *
 * Persisted to chrome.storage.local (history, expandedNodes, sidebar prefs).
 *
 * Navigation uses a browser-like history model:
 * - panelHistory: linear list of visited node IDs
 * - panelIndex: current position pointer
 * - navigateTo: truncate forward history + push
 * - goBack/goForward: move pointer
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../lib/chrome-storage';
import { useNodeStore } from './node-store';

interface UIStore {
  // Browser-like navigation history
  panelHistory: string[];
  panelIndex: number;
  navigateTo(nodeId: string): void;
  goBack(): void;
  goForward(): void;
  replacePanel(nodeId: string): void;

  // Expand/collapse (keys are compound: "parentId:nodeId" for per-instance state)
  expandedNodes: Set<string>;
  toggleExpanded(expandKey: string): void;
  setExpanded(expandKey: string, expanded: boolean): void;

  // Focus (parentId disambiguates reference nodes that appear in multiple places)
  // setFocusedNode also sets selection to the focused node (click-time selection pattern)
  // so that Escape only needs to clearFocus() and selection survives.
  focusedNodeId: string | null;
  focusedParentId: string | null;
  setFocusedNode(nodeId: string | null, parentId?: string | null): void;
  /** Clear focus only, preserving selection. Used by Escape to transition edit→selected. */
  clearFocus(): void;

  // Selection (reference nodes: single click = select, double click = edit/focus)
  selectedNodeId: string | null;
  selectedParentId: string | null;
  selectionSource: 'global' | 'ref-click' | null;
  setSelectedNode(nodeId: string | null, parentId?: string | null, source?: 'global' | 'ref-click'): void;

  // Multi-selection (root-level node IDs only; ancestors cover descendants)
  selectedNodeIds: Set<string>;
  selectionAnchorId: string | null;
  setSelectedNodes(nodeIds: Set<string>, anchorId?: string | null): void;
  clearSelection(): void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar(): void;

  // Search
  searchOpen: boolean;
  searchQuery: string;
  openSearch(): void;
  closeSearch(): void;
  setSearchQuery(query: string): void;

  // Drag and drop
  dragNodeId: string | null;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
  setDrag(nodeId: string | null): void;
  setDropTarget(nodeId: string | null, position: 'before' | 'after' | 'inside' | null): void;

  // View mode
  viewMode: 'list' | 'table' | 'tiles' | 'cards';
  setViewMode(mode: 'list' | 'table' | 'tiles' | 'cards'): void;

  // Field name editing (transient, not persisted)
  editingFieldNameId: string | null;
  setEditingFieldName(tupleId: string | null): void;

  // Trigger hint: set by TrailingInput when creating a node with trigger char (#/@/)
  // OutlinerItem reads & clears this to open the appropriate dropdown on mount
  triggerHint: '#' | '@' | '/' | null;
  setTriggerHint(hint: '#' | '@' | '/' | null): void;

  // Text offset for cursor positioning (consumed by matching RichTextEditor on mount)
  focusClickCoords: { nodeId: string; parentId: string | null; textOffset: number } | null;
  setFocusClickCoords(coords: { nodeId: string; parentId: string | null; textOffset: number } | null): void;

  // Pending input character: set by selection mode keydown, consumed by target RichTextEditor on mount
  pendingInputChar: { char: string; nodeId: string; parentId: string | null } | null;
  setPendingInputChar(payload: { char: string; nodeId: string; parentId: string | null } | null): void;

  // Pending reference ↔ inline reference conversion (session-only)
  pendingRefConversion: {
    tempNodeId: string;
    refNodeId: string;
    parentId: string;
  } | null;
  setPendingRefConversion(info: { tempNodeId: string; refNodeId: string; parentId: string } | null): void;

  // Hidden field temporary reveal (session-only, not persisted)
  // Key format: "panelNodeId:fieldEntryId"
  expandedHiddenFields: Set<string>;
  toggleHiddenField(panelNodeId: string, fieldEntryId: string): void;
  clearExpandedHiddenFields(): void;

  // Navigation undo/redo (session-only, not persisted)
  navUndoStack: Array<{ panelHistory: string[]; panelIndex: number }>;
  navRedoStack: Array<{ panelHistory: string[]; panelIndex: number }>;
  navUndo(): void;
  navRedo(): void;
}

export interface PersistedUIStoreState {
  panelHistory: string[];
  panelIndex: number;
  expandedNodes: Set<string>;
  sidebarOpen: boolean;
  viewMode: 'list' | 'table' | 'tiles' | 'cards';
}

/** Stable selector for the current (top) node ID. */
export const selectCurrentNodeId = (s: UIStore): string | null =>
  s.panelHistory[s.panelIndex] ?? null;

export function partializeUIStore(state: UIStore): PersistedUIStoreState {
  return {
    panelHistory: state.panelHistory,
    panelIndex: state.panelIndex,
    expandedNodes: state.expandedNodes,
    sidebarOpen: state.sidebarOpen,
    viewMode: state.viewMode,
  };
}

function hasBackingNode(nodeId: string): boolean {
  try {
    return useNodeStore.getState().getNode(nodeId) !== null;
  } catch {
    // Some low-level UI store tests reset ui-store without initializing LoroDoc.
    // Fail-open here so history semantics remain testable in isolation.
    return true;
  }
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Navigation history
      panelHistory: [],
      panelIndex: -1,
      navigateTo: (nodeId) =>
        set((s) => {
          if (!hasBackingNode(nodeId)) return {};
          // Truncate forward history, skip duplicate of current page
          const newHistory = s.panelHistory.slice(0, s.panelIndex + 1);
          if (newHistory[newHistory.length - 1] === nodeId) return {};
          // Push undo snapshot before modifying
          const snapshot = { panelHistory: [...s.panelHistory], panelIndex: s.panelIndex };
          newHistory.push(nodeId);
          return {
            panelHistory: newHistory,
            panelIndex: newHistory.length - 1,
            navUndoStack: [...s.navUndoStack, snapshot],
            navRedoStack: [],
            focusedNodeId: null,
            focusedParentId: null,
            selectedNodeId: null,
            selectedParentId: null,
            selectionSource: null,
            selectedNodeIds: new Set(),
            selectionAnchorId: null,
          };
        }),
      goBack: () =>
        set((s) => {
          if (s.panelIndex <= 0) return {};
          const snapshot = { panelHistory: [...s.panelHistory], panelIndex: s.panelIndex };
          return {
            panelIndex: s.panelIndex - 1,
            navUndoStack: [...s.navUndoStack, snapshot],
            navRedoStack: [],
            focusedNodeId: null,
            focusedParentId: null,
            selectedNodeId: null,
            selectedParentId: null,
            selectionSource: null,
            selectedNodeIds: new Set(),
            selectionAnchorId: null,
          };
        }),
      goForward: () =>
        set((s) => {
          if (s.panelIndex >= s.panelHistory.length - 1) return {};
          const snapshot = { panelHistory: [...s.panelHistory], panelIndex: s.panelIndex };
          return {
            panelIndex: s.panelIndex + 1,
            navUndoStack: [...s.navUndoStack, snapshot],
            navRedoStack: [],
            focusedNodeId: null,
            focusedParentId: null,
            selectedNodeId: null,
            selectedParentId: null,
            selectionSource: null,
            selectedNodeIds: new Set(),
            selectionAnchorId: null,
          };
        }),
      replacePanel: (nodeId) =>
        set((s) => {
          if (!hasBackingNode(nodeId)) return {};
          if (s.panelHistory.length === 0) {
            return {
              panelHistory: [nodeId],
              panelIndex: 0,
              focusedNodeId: null,
              focusedParentId: null,
              selectedNodeId: null,
              selectedParentId: null,
              selectionSource: null,
              selectedNodeIds: new Set(),
              selectionAnchorId: null,
            };
          }
          const next = [...s.panelHistory];
          next[s.panelIndex] = nodeId;
          return {
            panelHistory: next,
            focusedNodeId: null,
            focusedParentId: null,
            selectedNodeId: null,
            selectedParentId: null,
            selectionSource: null,
            selectedNodeIds: new Set(),
            selectionAnchorId: null,
          };
        }),

      // Expand/collapse
      expandedNodes: new Set<string>(),
      toggleExpanded: (expandKey) =>
        set((s) => {
          const next = new Set(s.expandedNodes);
          if (next.has(expandKey)) next.delete(expandKey);
          else next.add(expandKey);
          return { expandedNodes: next };
        }),
      setExpanded: (expandKey, expanded) =>
        set((s) => {
          const next = new Set(s.expandedNodes);
          if (expanded) next.add(expandKey);
          else next.delete(expandKey);
          return { expandedNodes: next };
        }),

      // Focus
      focusedNodeId: null,
      focusedParentId: null,
      setFocusedNode: (nodeId, parentId) => {
        if (nodeId) {
          // Entering edit mode: set focus AND collapse multi-select to this single node.
          // This is intentional — clicking a node (or pressing Enter from selection) means
          // the user is now editing ONE node, so multi-select is discarded. Callers that
          // need to preserve multi-select state should use clearFocus() instead.
          // Selection is set at click-time so Escape only needs clearFocus()
          // and the node stays in selectedNodeIds → highlight shows.
          set({
            focusedNodeId: nodeId,
            focusedParentId: parentId ?? null,
            selectedNodeId: nodeId,
            selectedParentId: parentId ?? null,
            selectionSource: 'global',
            selectedNodeIds: new Set([nodeId]),
            selectionAnchorId: nodeId,
          });
        } else {
          // Clearing focus (blur/navigation away): also clear all selection
          set({
            focusedNodeId: null,
            focusedParentId: null,
            selectedNodeId: null,
            selectedParentId: null,
            selectionSource: null,
            selectedNodeIds: new Set(),
            selectionAnchorId: null,
          });
        }
      },
      clearFocus: () => set({
        focusedNodeId: null,
        focusedParentId: null,
      }),

      // Selection (single)
      selectedNodeId: null,
      selectedParentId: null,
      selectionSource: null,
      setSelectedNode: (nodeId, parentId, source = 'global') => set({
        selectedNodeId: nodeId,
        selectedParentId: parentId ?? null,
        selectionSource: nodeId ? source : null,
        selectedNodeIds: nodeId ? new Set([nodeId]) : new Set(),
        selectionAnchorId: nodeId,
        // Clear focus when selecting (exit edit mode)
        focusedNodeId: null,
        focusedParentId: null,
      }),

      // Multi-selection
      selectedNodeIds: new Set<string>(),
      selectionAnchorId: null,
      setSelectedNodes: (nodeIds, anchorId) => set({
        selectedNodeIds: nodeIds,
        selectionAnchorId: anchorId ?? null,
        // Sync single-select fields from multi-select state.
        selectedNodeId: nodeIds.size === 1 ? [...nodeIds][0] : null,
        selectedParentId: null,
        selectionSource: nodeIds.size > 0 ? 'global' : null,
        // Clear focus
        focusedNodeId: null,
        focusedParentId: null,
      }),
      clearSelection: () => set({
        selectedNodeId: null,
        selectedParentId: null,
        selectionSource: null,
        selectedNodeIds: new Set(),
        selectionAnchorId: null,
      }),

      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      // Search
      searchOpen: false,
      searchQuery: '',
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false, searchQuery: '' }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Drag and drop
      dragNodeId: null,
      dropTargetId: null,
      dropPosition: null,
      setDrag: (nodeId) => set({ dragNodeId: nodeId, dropTargetId: null, dropPosition: null }),
      setDropTarget: (nodeId, position) => set({ dropTargetId: nodeId, dropPosition: position }),

      // View mode
      viewMode: 'list',
      setViewMode: (mode) => set({ viewMode: mode }),

      // Field name editing
      editingFieldNameId: null,
      setEditingFieldName: (tupleId) => set({ editingFieldNameId: tupleId }),

      // Trigger hint
      triggerHint: null,
      setTriggerHint: (hint) => set({ triggerHint: hint }),

      // Click coordinates for cursor positioning
      focusClickCoords: null,
      setFocusClickCoords: (coords) => set({ focusClickCoords: coords }),

      // Pending input character (session-only, consumed by target RichTextEditor on mount)
      pendingInputChar: null,
      setPendingInputChar: (payload) => set({ pendingInputChar: payload }),

      // Pending reference conversion (session-only)
      pendingRefConversion: null,
      setPendingRefConversion: (info) => set({ pendingRefConversion: info }),

      // Hidden field temporary reveal (session-only)
      expandedHiddenFields: new Set<string>(),
      toggleHiddenField: (panelNodeId, fieldEntryId) =>
        set((s) => {
          const key = `${panelNodeId}:${fieldEntryId}`;
          const next = new Set(s.expandedHiddenFields);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return { expandedHiddenFields: next };
        }),
      clearExpandedHiddenFields: () => set({ expandedHiddenFields: new Set<string>() }),

      // Navigation undo/redo (session-only)
      navUndoStack: [],
      navRedoStack: [],
      navUndo: () =>
        set((s) => {
          if (s.navUndoStack.length === 0) return {};
          const prev = s.navUndoStack[s.navUndoStack.length - 1];
          const currentSnapshot = { panelHistory: [...s.panelHistory], panelIndex: s.panelIndex };
          return {
            panelHistory: prev.panelHistory,
            panelIndex: prev.panelIndex,
            navUndoStack: s.navUndoStack.slice(0, -1),
            navRedoStack: [...s.navRedoStack, currentSnapshot],
          };
        }),
      navRedo: () =>
        set((s) => {
          if (s.navRedoStack.length === 0) return {};
          const next = s.navRedoStack[s.navRedoStack.length - 1];
          const currentSnapshot = { panelHistory: [...s.panelHistory], panelIndex: s.panelIndex };
          return {
            panelHistory: next.panelHistory,
            panelIndex: next.panelIndex,
            navUndoStack: [...s.navUndoStack, currentSnapshot],
            navRedoStack: s.navRedoStack.slice(0, -1),
          };
        }),
    }),
    {
      name: 'nodex-ui',
      version: 2,
      storage: chromeLocalStorage,
      partialize: partializeUIStore,
    },
  ),
);

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
  focusedNodeId: string | null;
  focusedParentId: string | null;
  setFocusedNode(nodeId: string | null, parentId?: string | null): void;

  // Selection (reference nodes: single click = select, double click = edit/focus)
  selectedNodeId: string | null;
  selectedParentId: string | null;
  setSelectedNode(nodeId: string | null, parentId?: string | null): void;

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

  // Text offset for cursor positioning (consumed by matching NodeEditor on mount)
  focusClickCoords: { nodeId: string; parentId: string | null; textOffset: number } | null;
  setFocusClickCoords(coords: { nodeId: string; parentId: string | null; textOffset: number } | null): void;

  // Pending input character: set by selection mode keydown, consumed by NodeEditor on mount
  pendingInputChar: string | null;
  setPendingInputChar(char: string | null): void;

  // Pending reference ↔ inline reference conversion (session-only)
  pendingRefConversion: {
    tempNodeId: string;
    refNodeId: string;
    parentId: string;
  } | null;
  setPendingRefConversion(info: { tempNodeId: string; refNodeId: string; parentId: string } | null): void;

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

export function migrateUIStoreState(persisted: unknown, version: number): unknown {
  if (version === 0) {
    const old = persisted as { panelStack?: string[] };
    if (old.panelStack) {
      return {
        ...old,
        panelHistory: old.panelStack,
        panelIndex: old.panelStack.length - 1,
        panelStack: undefined,
      };
    }
  }
  return persisted;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Navigation history
      panelHistory: [],
      panelIndex: -1,
      navigateTo: (nodeId) =>
        set((s) => {
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
          };
        }),
      replacePanel: (nodeId) =>
        set((s) => {
          if (s.panelHistory.length === 0) {
            return { panelHistory: [nodeId], panelIndex: 0 };
          }
          const next = [...s.panelHistory];
          next[s.panelIndex] = nodeId;
          return { panelHistory: next };
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
      setFocusedNode: (nodeId, parentId) => set({
        focusedNodeId: nodeId,
        focusedParentId: parentId ?? null,
        // Clear selection when entering edit mode
        selectedNodeId: null,
        selectedParentId: null,
      }),

      // Selection
      selectedNodeId: null,
      selectedParentId: null,
      setSelectedNode: (nodeId, parentId) => set({
        selectedNodeId: nodeId,
        selectedParentId: parentId ?? null,
        // Clear focus when selecting (exit edit mode)
        focusedNodeId: null,
        focusedParentId: null,
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

      // Pending input character (session-only, consumed by NodeEditor on mount)
      pendingInputChar: null,
      setPendingInputChar: (char) => set({ pendingInputChar: char }),

      // Pending reference conversion (session-only)
      pendingRefConversion: null,
      setPendingRefConversion: (info) => set({ pendingRefConversion: info }),

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
      version: 1,
      storage: chromeLocalStorage,
      partialize: partializeUIStore,
      // Migrate from old panelStack format to new history model
      migrate: migrateUIStoreState,
    },
  ),
);

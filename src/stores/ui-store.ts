/**
 * UI state store: panel stack, sidebar, expanded nodes, focus.
 *
 * Persisted to chrome.storage.local (expandedNodes, panelStack, sidebar prefs).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../lib/chrome-storage';

interface UIStore {
  // Panel stack (drill-down navigation)
  panelStack: string[];
  pushPanel(nodeId: string): void;
  popPanel(): void;
  replacePanel(nodeId: string): void;

  // Expand/collapse (keys are compound: "parentId:nodeId" for per-instance state)
  expandedNodes: Set<string>;
  toggleExpanded(expandKey: string): void;
  setExpanded(expandKey: string, expanded: boolean): void;

  // Focus (parentId disambiguates reference nodes that appear in multiple places)
  focusedNodeId: string | null;
  focusedParentId: string | null;
  setFocusedNode(nodeId: string | null, parentId?: string | null): void;

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

  // Trigger hint: set by TrailingInput when creating a node with trigger char (#/@)
  // OutlinerItem reads & clears this to open the appropriate dropdown on mount
  triggerHint: '#' | '@' | null;
  setTriggerHint(hint: '#' | '@' | null): void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Panel stack
      panelStack: [],
      pushPanel: (nodeId) =>
        set((s) => ({ panelStack: [...s.panelStack, nodeId] })),
      popPanel: () =>
        set((s) => ({ panelStack: s.panelStack.slice(0, -1) })),
      replacePanel: (nodeId) =>
        set((s) => ({
          panelStack:
            s.panelStack.length > 0
              ? [...s.panelStack.slice(0, -1), nodeId]
              : [nodeId],
        })),

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
    }),
    {
      name: 'nodex-ui',
      storage: chromeLocalStorage,
      partialize: (state) => ({
        panelStack: state.panelStack,
        expandedNodes: state.expandedNodes,
        sidebarOpen: state.sidebarOpen,
        viewMode: state.viewMode,
      }),
    },
  ),
);

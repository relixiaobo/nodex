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

  // Expand/collapse
  expandedNodes: Set<string>;
  toggleExpanded(nodeId: string): void;
  setExpanded(nodeId: string, expanded: boolean): void;

  // Focus
  focusedNodeId: string | null;
  setFocusedNode(nodeId: string | null): void;

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

  // Pending new child (chevron click on leaf — ephemeral until user types)
  pendingNewChildOf: string | null;
  setPendingNewChild(parentId: string | null): void;

  // View mode
  viewMode: 'list' | 'table' | 'tiles' | 'cards';
  setViewMode(mode: 'list' | 'table' | 'tiles' | 'cards'): void;
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
      toggleExpanded: (nodeId) =>
        set((s) => {
          const next = new Set(s.expandedNodes);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return { expandedNodes: next };
        }),
      setExpanded: (nodeId, expanded) =>
        set((s) => {
          const next = new Set(s.expandedNodes);
          if (expanded) next.add(nodeId);
          else next.delete(nodeId);
          return { expandedNodes: next };
        }),

      // Focus
      focusedNodeId: null,
      setFocusedNode: (nodeId) => set({ focusedNodeId: nodeId }),

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

      // Pending new child
      pendingNewChildOf: null,
      setPendingNewChild: (parentId) => set({ pendingNewChildOf: parentId }),

      // View mode
      viewMode: 'list',
      setViewMode: (mode) => set({ viewMode: mode }),
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

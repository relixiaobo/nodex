/**
 * UI state store: outliner surface, chat drawer, expanded nodes, focus.
 *
 * Persisted to chrome.storage.local:
 * - currentNodeId
 * - currentChatSessionId
 * - expandedNodes
 * - viewMode
 * - paletteUsage
 * - lastVisitDate
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../lib/chrome-storage';
import { commitUIMarker, registerUndoUICallbacks } from '../lib/loro-doc.js';
import {
  expandedNodeSetsEqual,
} from '../lib/expanded-node-key.js';
import { chatPanelSessionId, isAppPanel, isChatPanel } from '../types/index.js';
import { useNodeStore } from './node-store.js';

const MAIN_OUTLINER_PANEL_ID = 'node-main';

interface PendingChatPrompt {
  sessionId: string;
  prompt: string;
}

interface UIStore {
  chatDrawerOpen: boolean;
  currentNodeId: string | null;
  currentChatSessionId: string | null;
  nodeHistory: string[];
  nodeHistoryIndex: number;
  openChatDrawer(sessionId?: string): void;
  closeChatDrawer(): void;
  navigateToNode(nodeId: string): void;
  replaceCurrentNode(nodeId: string): void;
  goBackNode(): void;
  goForwardNode(): void;
  setCurrentChatSessionId(sessionId: string | null): void;

  navigateTo(nodeId: string): void;

  // Expand/collapse (keys are compound: "panelId:parentId:nodeId")
  expandedNodes: Set<string>;
  toggleExpanded(expandKey: string): void;
  setExpanded(expandKey: string, expanded: boolean, skipUndo?: boolean): void;

  // Focus
  focusedNodeId: string | null;
  focusedParentId: string | null;
  focusedPanelId: string | null;
  setFocusedNode(nodeId: string | null, parentId?: string | null, panelId?: string | null): void;
  clearFocus(): void;

  // Selection
  selectedNodeId: string | null;
  selectedParentId: string | null;
  selectedPanelId: string | null;
  selectionSource: 'global' | 'ref-click' | null;
  setSelectedNode(nodeId: string | null, parentId?: string | null, source?: 'global' | 'ref-click', panelId?: string | null): void;

  // Multi-selection
  selectedNodeIds: Set<string>;
  selectionAnchorId: string | null;
  setSelectedNodes(nodeIds: Set<string>, anchorId?: string | null, panelId?: string | null): void;
  clearSelection(): void;

  // Search
  searchOpen: boolean;
  searchQuery: string;
  openSearch(): void;
  closeSearch(): void;
  setSearchQuery(query: string): void;

  // Pending chat prompt
  pendingChatPrompt: PendingChatPrompt | null;
  setPendingChatPrompt(prompt: PendingChatPrompt | null): void;

  // Batch tag selector
  batchTagSelectorOpen: boolean;
  openBatchTagSelector(): void;
  closeBatchTagSelector(): void;

  // Drag and drop
  dragNodeId: string | null;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
  setDrag(nodeId: string | null): void;
  setDropTarget(nodeId: string | null, position: 'before' | 'after' | 'inside' | null): void;

  // View mode
  viewMode: 'list' | 'table' | 'tiles' | 'cards';
  setViewMode(mode: 'list' | 'table' | 'tiles' | 'cards'): void;

  // Field name editing
  editingFieldNameId: string | null;
  setEditingFieldName(fieldEntryId: string | null): void;

  // Trigger hint
  triggerHint: { char: '#' | '@' | '/'; nodeId: string } | null;
  setTriggerHint(hint: { char: '#' | '@' | '/'; nodeId: string } | null): void;

  // Click-to-focus cursor positioning
  focusClickCoords: { nodeId: string; parentId: string | null; textOffset: number } | null;
  setFocusClickCoords(coords: { nodeId: string; parentId: string | null; textOffset: number } | null): void;

  // Pending input character
  pendingInputChar: { char: string; nodeId: string; parentId: string | null } | null;
  setPendingInputChar(payload: { char: string; nodeId: string; parentId: string | null } | null): void;

  // Pending reference ↔ inline reference conversion
  pendingRefConversion: {
    tempNodeId: string;
    refNodeId: string;
    parentId: string;
  } | null;
  setPendingRefConversion(info: { tempNodeId: string; refNodeId: string; parentId: string } | null): void;

  // Hidden field temporary reveal
  expandedHiddenFields: Set<string>;
  toggleHiddenField(panelNodeId: string, fieldEntryId: string): void;
  clearExpandedHiddenFields(): void;

  // ⌘K palette usage tracking
  paletteUsage: Record<string, { count: number; lastUsedAt: number }>;
  trackPaletteUsage(itemId: string): void;

  // Last node-view visit date (YYYY-MM-DD)
  lastVisitDate: string | null;
  setLastVisitDate(date: string): void;

  // Description editing trigger
  editingDescriptionNodeId: string | null;
  setEditingDescription(nodeId: string | null): void;

  // Loading nodes
  loadingNodeIds: Set<string>;
  addLoadingNode(nodeId: string): void;
  removeLoadingNode(nodeId: string): void;

  // Auto-open toolbar dropdown
  autoOpenToolbarDropdown: { nodeId: string; section: 'sort' | 'filter' | 'group' } | null;
  setAutoOpenToolbarDropdown(payload: { nodeId: string; section: 'sort' | 'filter' | 'group' } | null): void;
}

export interface PersistedUIStoreState {
  currentNodeId: string | null;
  currentChatSessionId: string | null;
  expandedNodes: Set<string>;
  viewMode: 'list' | 'table' | 'tiles' | 'cards';
  paletteUsage: Record<string, { count: number; lastUsedAt: number }>;
  lastVisitDate: string | null;
}

export const selectCurrentNodeId = (s: UIStore): string | null => s.currentNodeId;

export function partializeUIStore(state: UIStore): PersistedUIStoreState {
  return {
    currentNodeId: state.currentNodeId,
    currentChatSessionId: state.currentChatSessionId,
    expandedNodes: new Set(state.expandedNodes),
    viewMode: state.viewMode,
    paletteUsage: state.paletteUsage,
    lastVisitDate: state.lastVisitDate,
  };
}

function hasBackingNode(nodeId: string): boolean {
  if (isAppPanel(nodeId)) return true;
  try {
    return useNodeStore.getState().getNode(nodeId) !== null;
  } catch {
    return true;
  }
}

function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pushNodeHistory(
  state: Pick<UIStore, 'currentNodeId' | 'nodeHistory' | 'nodeHistoryIndex'>,
  nodeId: string,
): Pick<UIStore, 'currentNodeId' | 'nodeHistory' | 'nodeHistoryIndex'> {
  const currentHistoryNode = state.nodeHistory[state.nodeHistoryIndex] ?? null;
  if (currentHistoryNode === nodeId) {
    if (state.nodeHistory.length === 0) {
      return {
        currentNodeId: nodeId,
        nodeHistory: [nodeId],
        nodeHistoryIndex: 0,
      };
    }
    return {
      currentNodeId: nodeId,
      nodeHistory: state.nodeHistory,
      nodeHistoryIndex: state.nodeHistoryIndex,
    };
  }

  const nextHistory = state.nodeHistory.slice(0, state.nodeHistoryIndex + 1);
  nextHistory.push(nodeId);
  return {
    currentNodeId: nodeId,
    nodeHistory: nextHistory,
    nodeHistoryIndex: nextHistory.length - 1,
  };
}

function replaceNodeHistory(
  state: Pick<UIStore, 'nodeHistory' | 'nodeHistoryIndex'>,
  nodeId: string,
): Pick<UIStore, 'currentNodeId' | 'nodeHistory' | 'nodeHistoryIndex'> {
  const nextHistory = state.nodeHistory.slice(0, Math.max(state.nodeHistoryIndex + 1, 0));
  if (nextHistory.length === 0) {
    nextHistory.push(nodeId);
  } else {
    nextHistory[nextHistory.length - 1] = nodeId;
  }
  return {
    currentNodeId: nodeId,
    nodeHistory: nextHistory,
    nodeHistoryIndex: nextHistory.length - 1,
  };
}

function findHistoryIndex(history: string[], fromIndex: number, step: -1 | 1): number {
  for (let index = fromIndex; index >= 0 && index < history.length; index += step) {
    if (hasBackingNode(history[index]!)) {
      return index;
    }
  }
  return -1;
}

function clearedFocus() {
  return {
    focusedNodeId: null as string | null,
    focusedParentId: null as string | null,
    focusedPanelId: null as string | null,
    selectedNodeId: null as string | null,
    selectedParentId: null as string | null,
    selectedPanelId: null as string | null,
    selectionSource: null as 'global' | 'ref-click' | null,
    selectedNodeIds: new Set<string>(),
    selectionAnchorId: null as string | null,
  };
}

function readExpandedNodeSet(expandedNodes: Set<string> | string[] | undefined): Set<string> {
  if (!expandedNodes) return new Set<string>();
  return expandedNodes instanceof Set ? new Set(expandedNodes) : new Set(expandedNodes);
}

function migrateExpandedNodeSet(expandedNodes: Set<string> | string[] | undefined): Set<string> {
  const next = new Set<string>();
  for (const key of readExpandedNodeSet(expandedNodes)) {
    if (key.split(':').length === 2) {
      next.add(`${MAIN_OUTLINER_PANEL_ID}:${key}`);
      continue;
    }
    next.add(key);
  }
  return next;
}

function coerceExpandedNodeKey(expandKey: string): string {
  return expandKey;
}

function migrateExpandedNodes(state: Record<string, unknown>) {
  const normalized = readExpandedNodeSet(
    state.expandedNodes as Set<string> | string[] | undefined,
  );
  state.expandedNodes = normalized;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set): UIStore => ({
      chatDrawerOpen: false,
      currentNodeId: null,
      currentChatSessionId: null,
      nodeHistory: [],
      nodeHistoryIndex: -1,

      openChatDrawer: (sessionId) =>
        set((s) => ({
          chatDrawerOpen: true,
          currentChatSessionId: sessionId ?? s.currentChatSessionId,
        })),

      closeChatDrawer: () => set({ chatDrawerOpen: false }),

      navigateToNode: (nodeId) =>
        set((s) => {
          if (!hasBackingNode(nodeId)) return {};
          return {
            ...pushNodeHistory(s, nodeId),
            lastVisitDate: getTodayDateKey(),
            ...clearedFocus(),
          };
        }),

      replaceCurrentNode: (nodeId) =>
        set((s) => {
          if (!hasBackingNode(nodeId)) return {};
          return {
            ...replaceNodeHistory(s, nodeId),
            lastVisitDate: getTodayDateKey(),
            ...clearedFocus(),
          };
        }),

      goBackNode: () =>
        set((s) => {
          const nextIndex = findHistoryIndex(s.nodeHistory, s.nodeHistoryIndex - 1, -1);
          if (nextIndex < 0) return {};
          return {
            currentNodeId: s.nodeHistory[nextIndex] ?? null,
            nodeHistoryIndex: nextIndex,
            lastVisitDate: getTodayDateKey(),
            ...clearedFocus(),
          };
        }),

      goForwardNode: () =>
        set((s) => {
          const nextIndex = findHistoryIndex(s.nodeHistory, s.nodeHistoryIndex + 1, 1);
          if (nextIndex < 0) return {};
          return {
            currentNodeId: s.nodeHistory[nextIndex] ?? null,
            nodeHistoryIndex: nextIndex,
            lastVisitDate: getTodayDateKey(),
            ...clearedFocus(),
          };
        }),

      setCurrentChatSessionId: (sessionId) => set({ currentChatSessionId: sessionId }),

      navigateTo: (nodeId) => {
        if (isChatPanel(nodeId)) {
          useUIStore.getState().setCurrentChatSessionId(chatPanelSessionId(nodeId));
          useUIStore.getState().openChatDrawer();
          return;
        }
        useUIStore.getState().navigateToNode(nodeId);
      },

      expandedNodes: new Set<string>(),
      toggleExpanded: (expandKey) =>
        set((s) => {
          commitUIMarker();
          const key = coerceExpandedNodeKey(expandKey);
          const next = new Set(s.expandedNodes);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return { expandedNodes: next };
        }),
      setExpanded: (expandKey, expanded, skipUndo) =>
        set((s) => {
          const key = coerceExpandedNodeKey(expandKey);
          const next = new Set(s.expandedNodes);
          const had = next.has(key);
          if (had === expanded) return {};
          if (!skipUndo) commitUIMarker();
          if (expanded) next.add(key);
          else next.delete(key);
          return { expandedNodes: next };
        }),

      focusedNodeId: null,
      focusedParentId: null,
      focusedPanelId: null,
      setFocusedNode: (nodeId, parentId, panelId) => {
        if (nodeId) {
          const resolvedPanelId = panelId ?? MAIN_OUTLINER_PANEL_ID;
          set({
            focusedNodeId: nodeId,
            focusedParentId: parentId ?? null,
            focusedPanelId: resolvedPanelId,
            selectedNodeId: nodeId,
            selectedParentId: parentId ?? null,
            selectedPanelId: resolvedPanelId,
            selectionSource: 'global',
            selectedNodeIds: new Set([nodeId]),
            selectionAnchorId: nodeId,
          });
          return;
        }
        set({
          focusedNodeId: null,
          focusedParentId: null,
          focusedPanelId: null,
          selectedNodeId: null,
          selectedParentId: null,
          selectedPanelId: null,
          selectionSource: null,
          selectedNodeIds: new Set(),
          selectionAnchorId: null,
        });
      },
      clearFocus: () => set({
        focusedNodeId: null,
        focusedParentId: null,
        focusedPanelId: null,
      }),

      selectedNodeId: null,
      selectedParentId: null,
      selectedPanelId: null,
      selectionSource: null,
      setSelectedNode: (nodeId, parentId, source = 'global', panelId) => set({
        selectedNodeId: nodeId,
        selectedParentId: parentId ?? null,
        selectedPanelId: nodeId ? (panelId ?? MAIN_OUTLINER_PANEL_ID) : null,
        selectionSource: nodeId ? source : null,
        selectedNodeIds: nodeId ? new Set([nodeId]) : new Set(),
        selectionAnchorId: nodeId,
        focusedNodeId: null,
        focusedParentId: null,
        focusedPanelId: null,
      }),

      selectedNodeIds: new Set<string>(),
      selectionAnchorId: null,
      setSelectedNodes: (nodeIds, anchorId, panelId) => set({
        selectedNodeIds: nodeIds,
        selectionAnchorId: anchorId ?? null,
        selectedNodeId: nodeIds.size === 1 ? [...nodeIds][0] : null,
        selectedParentId: null,
        selectedPanelId: nodeIds.size > 0 ? (panelId ?? MAIN_OUTLINER_PANEL_ID) : null,
        selectionSource: nodeIds.size > 0 ? 'global' : null,
        focusedNodeId: null,
        focusedParentId: null,
        focusedPanelId: null,
      }),
      clearSelection: () => set({
        selectedNodeId: null,
        selectedParentId: null,
        selectedPanelId: null,
        selectionSource: null,
        selectedNodeIds: new Set(),
        selectionAnchorId: null,
      }),

      batchTagSelectorOpen: false,
      openBatchTagSelector: () => set({ batchTagSelectorOpen: true }),
      closeBatchTagSelector: () => set({ batchTagSelectorOpen: false }),

      searchOpen: false,
      searchQuery: '',
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      pendingChatPrompt: null,
      setPendingChatPrompt: (prompt) => set({ pendingChatPrompt: prompt }),

      dragNodeId: null,
      dropTargetId: null,
      dropPosition: null,
      setDrag: (nodeId) => set({ dragNodeId: nodeId, dropTargetId: null, dropPosition: null }),
      setDropTarget: (nodeId, position) => set({ dropTargetId: nodeId, dropPosition: position }),

      viewMode: 'list',
      setViewMode: (mode) => set({ viewMode: mode }),

      editingFieldNameId: null,
      setEditingFieldName: (fieldEntryId) => set({ editingFieldNameId: fieldEntryId }),

      triggerHint: null,
      setTriggerHint: (hint) => set({ triggerHint: hint }),

      focusClickCoords: null,
      setFocusClickCoords: (coords) => set({ focusClickCoords: coords }),

      pendingInputChar: null,
      setPendingInputChar: (payload) => set({ pendingInputChar: payload }),

      pendingRefConversion: null,
      setPendingRefConversion: (info) => set({ pendingRefConversion: info }),

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

      paletteUsage: {},
      trackPaletteUsage: (itemId) =>
        set((s) => {
          const prev = s.paletteUsage[itemId];
          return {
            paletteUsage: {
              ...s.paletteUsage,
              [itemId]: {
                count: (prev?.count ?? 0) + 1,
                lastUsedAt: Date.now(),
              },
            },
          };
        }),

      lastVisitDate: null,
      setLastVisitDate: (date) => set({ lastVisitDate: date }),

      editingDescriptionNodeId: null,
      setEditingDescription: (nodeId) => set({ editingDescriptionNodeId: nodeId }),

      loadingNodeIds: new Set<string>(),
      addLoadingNode: (nodeId) => set((s) => {
        const next = new Set(s.loadingNodeIds);
        next.add(nodeId);
        return { loadingNodeIds: next };
      }),
      removeLoadingNode: (nodeId) => set((s) => {
        const next = new Set(s.loadingNodeIds);
        next.delete(nodeId);
        return { loadingNodeIds: next };
      }),

      autoOpenToolbarDropdown: null,
      setAutoOpenToolbarDropdown: (payload) => set({ autoOpenToolbarDropdown: payload }),
    }),
    {
      name: 'nodex-ui',
      version: 7,
      storage: chromeLocalStorage,
      partialize: partializeUIStore,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 6) {
          const panels = Array.isArray(state.panels)
            ? state.panels as Array<{ id?: string; nodeId?: string }>
            : [];
          const activePanelId = typeof state.activePanelId === 'string' ? state.activePanelId : '';
          const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0] ?? null;
          const activeNodeId = typeof activePanel?.nodeId === 'string' ? activePanel.nodeId : null;
          const fallbackNodeId = panels.find((panel) => typeof panel.nodeId === 'string' && !isChatPanel(panel.nodeId))?.nodeId ?? null;
          const fallbackChatNodeId = panels.find((panel) => typeof panel.nodeId === 'string' && isChatPanel(panel.nodeId))?.nodeId ?? null;

          state.currentNodeId = activeNodeId && !isChatPanel(activeNodeId) ? activeNodeId : fallbackNodeId;
          state.currentChatSessionId = activeNodeId && isChatPanel(activeNodeId)
            ? chatPanelSessionId(activeNodeId)
            : fallbackChatNodeId
              ? chatPanelSessionId(fallbackChatNodeId)
              : null;
          state.nodeHistory = [];
          state.nodeHistoryIndex = -1;
          delete state.panels;
          delete state.activePanelId;
          delete state.navHistory;
          delete state.navIndex;
        }
        if (version < 7) {
          delete state.activeView;
        }
        migrateExpandedNodes(state);
        return state;
      },
      onRehydrateStorage: () => (state) => {
        const rawExpandedNodes = state?.expandedNodes;
        const rawSet = rawExpandedNodes instanceof Set
          ? rawExpandedNodes as Set<string>
          : Array.isArray(rawExpandedNodes)
            ? new Set(rawExpandedNodes as string[])
            : new Set<string>();
        const expandedNodes = migrateExpandedNodeSet(rawExpandedNodes);
        if (!(rawExpandedNodes instanceof Set) || !expandedNodeSetsEqual(expandedNodes, rawSet)) {
          useUIStore.setState({ expandedNodes });
        }
      },
    },
  ),
);

interface UndoUISnapshotV3 {
  v: 3;
  expandedNodes: string[];
}

function isUndoUISnapshotV3(value: unknown): value is UndoUISnapshotV3 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<UndoUISnapshotV3>;
  return v.v === 3 && Array.isArray(v.expandedNodes);
}

interface UndoUISnapshotLegacy {
  v?: number;
  expandedNodes?: string[];
}

registerUndoUICallbacks({
  capture: () => {
    const s = useUIStore.getState();
    return {
      v: 3,
      expandedNodes: [...s.expandedNodes],
    } satisfies UndoUISnapshotV3;
  },
  restore: (meta) => {
    if (isUndoUISnapshotV3(meta)) {
      useUIStore.setState({
        expandedNodes: new Set(meta.expandedNodes),
      });
      return;
    }

    if (meta && typeof meta === 'object') {
      const legacy = meta as UndoUISnapshotLegacy;
      if (Array.isArray(legacy.expandedNodes)) {
        useUIStore.setState({
          expandedNodes: new Set(legacy.expandedNodes),
        });
      }
    }
  },
});

/**
 * UI state store: multi-panel navigation, expanded nodes, focus.
 *
 * Persisted to chrome.storage.local (panels, expandedNodes, viewMode).
 *
 * Navigation uses a global event timeline:
 * - panels: list of open panels, each displaying a node
 * - activePanelId: which panel receives keyboard events
 * - navHistory: ordered list of NavigationEvents (navigate / open-panel / close-panel)
 * - navIndex: pointer into navHistory (-1 = no events)
 * - goBack/goForward: undo/redo events from navHistory
 *
 * Back/Forward auto-switch activePanelId to the affected panel.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { chromeLocalStorage } from '../lib/chrome-storage';
import { commitUIMarker, registerUndoUICallbacks } from '../lib/loro-doc.js';
import { useNodeStore } from './node-store';
import { isAppPanel, isChatPanel, type NavigationEvent, type Panel } from '../types/index.js';

interface PendingChatPrompt {
  panelId: string;
  prompt: string;
}

interface UIStore {
  // Multi-panel navigation (global event timeline)
  panels: Panel[];
  activePanelId: string;
  navHistory: NavigationEvent[];
  navIndex: number;
  navigateTo(nodeId: string): void;
  goBack(): void;
  goForward(): void;
  replacePanel(nodeId: string): void;
  openPanel(nodeId: string, insertIndex?: number): void;
  closePanel(panelId: string): void;
  setActivePanel(panelId: string): void;

  // Expand/collapse (keys are compound: "panelId:parentId:nodeId" for per-panel per-instance state)
  expandedNodes: Set<string>;
  toggleExpanded(expandKey: string): void;
  setExpanded(expandKey: string, expanded: boolean, skipUndo?: boolean): void;

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

  // Search
  searchOpen: boolean;
  searchQuery: string;
  openSearch(): void;
  closeSearch(): void;
  setSearchQuery(query: string): void;

  // Pending chat prompt (session-only, targeted to a specific chat panel)
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

  // Field name editing (transient, not persisted)
  editingFieldNameId: string | null;
  setEditingFieldName(fieldEntryId: string | null): void;

  // Trigger hint: set by TrailingInput when creating a node with trigger char (#/@/)
  // OutlinerItem reads & clears this to open the appropriate dropdown on mount
  triggerHint: { char: '#' | '@' | '/'; nodeId: string } | null;
  setTriggerHint(hint: { char: '#' | '@' | '/'; nodeId: string } | null): void;

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

  // Panel title visibility (session-only, not persisted)
  // Keyed by panelId — missing key means title is visible (default true)
  panelTitleVisibleMap: Record<string, boolean>;
  setPanelTitleVisible(panelId: string, visible: boolean): void;

  // ⌘K palette usage tracking (persisted)
  paletteUsage: Record<string, { count: number; lastUsedAt: number }>;
  trackPaletteUsage(itemId: string): void;

  // Last visit date (YYYY-MM-DD string, persisted) — used to determine "first visit of the day"
  lastVisitDate: string | null;
  setLastVisitDate(date: string): void;

  // Description editing trigger (session-only, not persisted)
  editingDescriptionNodeId: string | null;
  setEditingDescription(nodeId: string | null): void;

  // Loading nodes (session-only): nodes whose content is being fetched asynchronously
  loadingNodeIds: Set<string>;
  addLoadingNode(nodeId: string): void;
  removeLoadingNode(nodeId: string): void;

  // Auto-open toolbar dropdown (session-only): set by context menu, consumed by ViewToolbar
  autoOpenToolbarDropdown: { nodeId: string; section: 'sort' | 'filter' | 'group' } | null;
  setAutoOpenToolbarDropdown(payload: { nodeId: string; section: 'sort' | 'filter' | 'group' } | null): void;
}

export interface PersistedUIStoreState {
  panels: Panel[];
  activePanelId: string;
  expandedNodes: Set<string>;
  viewMode: 'list' | 'table' | 'tiles' | 'cards';
  paletteUsage: Record<string, { count: number; lastUsedAt: number }>;
  lastVisitDate: string | null;
}

/** Stable selector for the active panel's current node ID. */
export const selectCurrentNodeId = (s: UIStore): string | null =>
  s.panels.find((p) => p.id === s.activePanelId)?.nodeId ?? null;

export function partializeUIStore(state: UIStore): PersistedUIStoreState {
  return {
    panels: state.panels,
    activePanelId: state.activePanelId,
    expandedNodes: state.expandedNodes,
    viewMode: state.viewMode,
    paletteUsage: state.paletteUsage,
    lastVisitDate: state.lastVisitDate,
  };
}

function hasBackingNode(nodeId: string): boolean {
  if (isAppPanel(nodeId) || isChatPanel(nodeId)) return true;
  try {
    return useNodeStore.getState().getNode(nodeId) !== null;
  } catch {
    // Some low-level UI store tests reset ui-store without initializing LoroDoc.
    // Fail-open here so history semantics remain testable in isolation.
    return true;
  }
}

/** Fresh focus/selection reset fields — must be a function so each call gets its own Set instance. */
function clearedFocus() {
  return {
    focusedNodeId: null as string | null,
    focusedParentId: null as string | null,
    selectedNodeId: null as string | null,
    selectedParentId: null as string | null,
    selectionSource: null as 'global' | 'ref-click' | null,
    selectedNodeIds: new Set<string>(),
    selectionAnchorId: null as string | null,
  };
}

/**
 * Apply a NavigationEvent in the given direction (back = undo, forward = redo).
 * Returns the new panels + activePanelId, or null if the event can't be applied
 * (e.g. target panel no longer exists).
 */
function applyNavEvent(
  panels: Panel[],
  event: NavigationEvent,
  direction: 'back' | 'forward',
): { panels: Panel[]; activePanelId: string } | null {
  const result = [...panels];
  let activePanelId: string;

  switch (event.action) {
    case 'navigate': {
      const idx = result.findIndex((p) => p.id === event.panelId);
      if (idx < 0) return null;
      result[idx] = { ...result[idx], nodeId: direction === 'back' ? event.fromNodeId : event.toNodeId };
      activePanelId = event.panelId;
      break;
    }
    case 'open-panel': {
      if (direction === 'back') {
        // Undo opening = close the panel
        const idx = result.findIndex((p) => p.id === event.panelId);
        if (idx >= 0) result.splice(idx, 1);
        activePanelId = event.prevActivePanelId;
      } else {
        // Redo opening = re-insert the panel
        const insertAt = Math.min(event.insertIndex, result.length);
        result.splice(insertAt, 0, { id: event.panelId, nodeId: event.nodeId });
        activePanelId = event.panelId;
      }
      break;
    }
    case 'close-panel': {
      if (direction === 'back') {
        // Undo closing = reopen from snapshot
        const insertAt = Math.min(event.insertIndex, result.length);
        result.splice(insertAt, 0, { ...event.snapshot });
        activePanelId = event.snapshot.id;
      } else {
        // Redo closing = close the panel again
        const idx = result.findIndex((p) => p.id === event.panelId);
        if (idx >= 0) result.splice(idx, 1);
        activePanelId = event.nextActivePanelId;
      }
      break;
    }
  }

  // Ensure activePanelId points to an existing panel
  if (!result.some((p) => p.id === activePanelId) && result.length > 0) {
    activePanelId = result[0].id;
  }

  return { panels: result, activePanelId };
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Multi-panel navigation
      panels: [],
      activePanelId: '',
      navHistory: [],
      navIndex: -1,

      navigateTo: (nodeId) =>
        set((s) => {
          if (!hasBackingNode(nodeId)) return {};
          const panelIdx = s.panels.findIndex((p) => p.id === s.activePanelId);
          if (panelIdx < 0) return {};
          const panel = s.panels[panelIdx];
          if (panel.nodeId === nodeId) return {};

          commitUIMarker();

          // Truncate forward history
          const newNavHistory = s.navHistory.slice(0, s.navIndex + 1);
          newNavHistory.push({
            action: 'navigate',
            panelId: panel.id,
            fromNodeId: panel.nodeId,
            toNodeId: nodeId,
          });

          const newPanels = [...s.panels];
          newPanels[panelIdx] = { ...panel, nodeId };

          return {
            panels: newPanels,
            navHistory: newNavHistory,
            navIndex: newNavHistory.length - 1,
            ...clearedFocus(),
          };
        }),

      goBack: () =>
        set((s) => {
          if (s.navIndex < 0) return {};
          const event = s.navHistory[s.navIndex];
          if (!event) return {};

          commitUIMarker();
          const applied = applyNavEvent(s.panels, event, 'back');
          if (!applied) return {};

          return {
            ...applied,
            navIndex: s.navIndex - 1,
            ...clearedFocus(),
          };
        }),

      goForward: () =>
        set((s) => {
          if (s.navIndex >= s.navHistory.length - 1) return {};
          const newNavIndex = s.navIndex + 1;
          const event = s.navHistory[newNavIndex];
          if (!event) return {};

          commitUIMarker();
          const applied = applyNavEvent(s.panels, event, 'forward');
          if (!applied) return {};

          return {
            ...applied,
            navIndex: newNavIndex,
            ...clearedFocus(),
          };
        }),

      replacePanel: (nodeId) =>
        set((s) => {
          if (!hasBackingNode(nodeId)) return {};
          if (s.panels.length === 0) {
            return {
              panels: [{ id: 'main', nodeId }],
              activePanelId: 'main',
              ...clearedFocus(),
            };
          }
          const panelIdx = s.panels.findIndex((p) => p.id === s.activePanelId);
          if (panelIdx < 0) return {};
          const newPanels = [...s.panels];
          newPanels[panelIdx] = { ...newPanels[panelIdx], nodeId };
          return {
            panels: newPanels,
            ...clearedFocus(),
          };
        }),

      openPanel: (nodeId, insertIndex) =>
        set((s) => {
          if (!hasBackingNode(nodeId)) return {};
          commitUIMarker();

          const newPanelId = nanoid();
          const newPanel: Panel = { id: newPanelId, nodeId };
          const idx = insertIndex ?? s.panels.length;
          const newPanels = [...s.panels];
          newPanels.splice(idx, 0, newPanel);

          // Truncate forward history
          const newNavHistory = s.navHistory.slice(0, s.navIndex + 1);
          newNavHistory.push({
            action: 'open-panel',
            panelId: newPanelId,
            nodeId,
            insertIndex: idx,
            prevActivePanelId: s.activePanelId,
          });

          return {
            panels: newPanels,
            activePanelId: newPanelId,
            navHistory: newNavHistory,
            navIndex: newNavHistory.length - 1,
            ...clearedFocus(),
          };
        }),

      closePanel: (panelId) =>
        set((s) => {
          // Cannot close the last panel
          if (s.panels.length <= 1) return {};
          const idx = s.panels.findIndex((p) => p.id === panelId);
          if (idx < 0) return {};

          commitUIMarker();

          const snapshot = { ...s.panels[idx] };
          const newPanels = [...s.panels];
          newPanels.splice(idx, 1);

          // Determine new active panel
          let nextActivePanelId = s.activePanelId;
          if (s.activePanelId === panelId) {
            // Prefer the panel to the right (same index), otherwise the one before
            const nextIdx = Math.min(idx, newPanels.length - 1);
            nextActivePanelId = newPanels[nextIdx].id;
          }

          // Truncate forward history
          const newNavHistory = s.navHistory.slice(0, s.navIndex + 1);
          newNavHistory.push({
            action: 'close-panel',
            panelId,
            snapshot,
            insertIndex: idx,
            nextActivePanelId,
          });

          return {
            panels: newPanels,
            activePanelId: nextActivePanelId,
            navHistory: newNavHistory,
            navIndex: newNavHistory.length - 1,
            ...clearedFocus(),
          };
        }),

      setActivePanel: (panelId) =>
        set((s) => {
          if (s.activePanelId === panelId) return {};
          if (!s.panels.some((p) => p.id === panelId)) return {};
          return {
            activePanelId: panelId,
            ...clearedFocus(),
          };
        }),

      // Expand/collapse
      expandedNodes: new Set<string>(),
      toggleExpanded: (expandKey) =>
        set((s) => {
          commitUIMarker();
          const next = new Set(s.expandedNodes);
          if (next.has(expandKey)) next.delete(expandKey);
          else next.add(expandKey);
          return { expandedNodes: next };
        }),
      setExpanded: (expandKey, expanded, skipUndo) =>
        set((s) => {
          const next = new Set(s.expandedNodes);
          const had = next.has(expandKey);
          if (had === expanded) return {};
          if (!skipUndo) commitUIMarker();
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

      // Batch tag selector
      batchTagSelectorOpen: false,
      openBatchTagSelector: () => set({ batchTagSelectorOpen: true }),
      closeBatchTagSelector: () => set({ batchTagSelectorOpen: false }),

      // Search
      searchOpen: false,
      searchQuery: '',
      openSearch: () => set({ searchOpen: true }),
      closeSearch: () => set({ searchOpen: false }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      pendingChatPrompt: null,
      setPendingChatPrompt: (prompt) => set({ pendingChatPrompt: prompt }),

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
      setEditingFieldName: (fieldEntryId) => set({ editingFieldNameId: fieldEntryId }),

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

      // Panel title visibility (per-panel)
      panelTitleVisibleMap: {},
      setPanelTitleVisible: (panelId, visible) =>
        set((s) => ({
          panelTitleVisibleMap: { ...s.panelTitleVisibleMap, [panelId]: visible },
        })),

      // ⌘K palette usage tracking
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

      // Last visit date
      lastVisitDate: null,
      setLastVisitDate: (date) => set({ lastVisitDate: date }),

      // Description editing trigger (session-only)
      editingDescriptionNodeId: null,
      setEditingDescription: (nodeId) => set({ editingDescriptionNodeId: nodeId }),

      // Loading nodes (session-only)
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

      // Auto-open toolbar dropdown (session-only)
      autoOpenToolbarDropdown: null,
      setAutoOpenToolbarDropdown: (payload) => set({ autoOpenToolbarDropdown: payload }),
    }),
    {
      name: 'nodex-ui',
      version: 5,
      storage: chromeLocalStorage,
      partialize: partializeUIStore,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 4) {
          // v3→v4: panelHistory/panelIndex → panels/activePanelId
          const panelHistory = (state.panelHistory as string[] | undefined) ?? [];
          const panelIndex = (state.panelIndex as number | undefined) ?? -1;
          const currentNodeId = panelHistory[panelIndex] ?? '';

          state.panels = currentNodeId ? [{ id: 'main', nodeId: currentNodeId }] : [];
          state.activePanelId = 'main';
          delete state.panelHistory;
          delete state.panelIndex;
        }
        if (version < 5) {
          // v4→v5: expandedNodes key format "parentId:nodeId" → "main:parentId:nodeId"
          const oldNodes = state.expandedNodes as Set<string> | undefined;
          if (oldNodes && oldNodes instanceof Set) {
            const migrated = new Set<string>();
            for (const key of oldNodes) {
              // Only prefix if the key doesn't already have 3+ colon-separated parts
              const parts = key.split(':');
              if (parts.length === 2) {
                migrated.add(`main:${key}`);
              } else {
                migrated.add(key);
              }
            }
            state.expandedNodes = migrated;
          }
        }
        return state;
      },
    },
  ),
);

// ── Loro undo/redo UI state capture ──

interface UndoUISnapshotV2 {
  v: 2;
  panels: Panel[];
  activePanelId: string;
  expandedNodes: string[];
}

function isUndoUISnapshotV2(value: unknown): value is UndoUISnapshotV2 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<UndoUISnapshotV2>;
  return v.v === 2
    && Array.isArray(v.panels)
    && typeof v.activePanelId === 'string'
    && Array.isArray(v.expandedNodes);
}

// Also accept v1 snapshots from before the migration (graceful upgrade)
interface UndoUISnapshotV1 {
  v: 1;
  panelHistory: string[];
  panelIndex: number;
  expandedNodes: string[];
}

function isUndoUISnapshotV1(value: unknown): value is UndoUISnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<UndoUISnapshotV1>;
  return v.v === 1
    && Array.isArray(v.panelHistory)
    && typeof v.panelIndex === 'number'
    && Array.isArray(v.expandedNodes);
}

registerUndoUICallbacks({
  capture: () => {
    const s = useUIStore.getState();
    return {
      v: 2,
      panels: s.panels.map((p) => ({ ...p })),
      activePanelId: s.activePanelId,
      expandedNodes: [...s.expandedNodes],
    } satisfies UndoUISnapshotV2;
  },
  restore: (meta) => {
    if (isUndoUISnapshotV2(meta)) {
      if (meta.panels.length === 0) return;
      useUIStore.setState({
        panels: meta.panels.map((p) => ({ ...p })),
        activePanelId: meta.activePanelId,
        expandedNodes: new Set(meta.expandedNodes),
      });
    } else if (isUndoUISnapshotV1(meta)) {
      // Graceful upgrade: convert v1 snapshot to new panel model
      if (meta.panelHistory.length === 0) return;
      const nodeId = meta.panelHistory[meta.panelIndex] ?? meta.panelHistory[0];
      if (!nodeId) return;
      useUIStore.setState({
        panels: [{ id: 'main', nodeId }],
        activePanelId: 'main',
        expandedNodes: new Set(meta.expandedNodes),
      });
    } else if (import.meta.env.DEV) {
      console.warn('[undo-ui] type guard failed, received:', meta);
    }
  },
});

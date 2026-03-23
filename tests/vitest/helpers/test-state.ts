import { seedTestDataSync } from '../../../src/entrypoints/test/seed-data.js';
import { resetLoroDoc } from '../../../src/lib/loro-doc.js';
import { useNodeStore } from '../../../src/stores/node-store.js';
import { useUIStore } from '../../../src/stores/ui-store.js';
import { useWorkspaceStore } from '../../../src/stores/workspace-store.js';

/**
 * Reset all in-memory stores and LoroDoc to a clean baseline before each test.
 */
export function resetStores(): void {
  resetLoroDoc();
  localStorage.clear();

  useNodeStore.setState({ _version: 0 });

  useWorkspaceStore.setState({
    currentWorkspaceId: null,
    userId: null,
    isAuthenticated: false,
  });

  useUIStore.setState({
    chatDrawerOpen: false,
    currentNodeId: null,
    currentChatSessionId: null,
    nodeHistory: [],
    nodeHistoryIndex: -1,
    expandedNodes: new Set<string>(),
    focusedNodeId: null,
    focusedParentId: null,
    focusedPanelId: null,
    selectedNodeId: null,
    selectedParentId: null,
    selectedPanelId: null,
    selectionSource: null,
    selectedNodeIds: new Set<string>(),
    selectionAnchorId: null,
    searchOpen: false,
    searchQuery: '',
    pendingChatPrompt: null,
    batchTagSelectorOpen: false,
    dragNodeId: null,
    dropTargetId: null,
    dropPosition: null,
    viewMode: 'list',
    editingFieldNameId: null,
    triggerHint: null,
    focusClickCoords: null,
    pendingInputChar: null,
    pendingRefConversion: null,
    expandedHiddenFields: new Set<string>(),
    paletteUsage: {},
    lastVisitDate: null,
    editingDescriptionNodeId: null,
    loadingNodeIds: new Set<string>(),
    autoOpenToolbarDropdown: null,
  });
}

export function resetAndSeed(): void {
  resetStores();
  seedTestDataSync();
}

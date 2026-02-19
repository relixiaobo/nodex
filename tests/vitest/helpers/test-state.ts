import { seedTestDataSync } from '../../../src/entrypoints/test/seed-data.js';
import { resetLoroDoc } from '../../../src/lib/loro-doc.js';
import { useNodeStore } from '../../../src/stores/node-store.js';
import { useUIStore } from '../../../src/stores/ui-store.js';
import { useWorkspaceStore } from '../../../src/stores/workspace-store.js';

/**
 * Reset all in-memory stores and LoroDoc to a clean baseline before each test.
 * Supabase disconnected for deterministic offline tests.
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
    panelHistory: [],
    panelIndex: -1,
    expandedNodes: new Set<string>(),
    focusedNodeId: null,
    focusedParentId: null,
    selectedNodeId: null,
    selectedParentId: null,
    sidebarOpen: true,
    searchOpen: false,
    searchQuery: '',
    dragNodeId: null,
    dropTargetId: null,
    dropPosition: null,
    viewMode: 'list',
    editingFieldNameId: null,
    triggerHint: null,
    focusClickCoords: null,
    pendingRefConversion: null,
    navUndoStack: [],
    navRedoStack: [],
  });
}

export function resetAndSeed(): void {
  resetStores();
  seedTestDataSync();
}

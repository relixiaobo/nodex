import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { Sidebar } from '../../components/sidebar/Sidebar';
import { PanelStack } from '../../components/panel/PanelStack';
import { CommandPalette } from '../../components/search/CommandPalette';
import { CONTAINER_IDS } from '../../types/index.js';
import { initLoroDoc } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { findUnexpectedShortcutConflicts } from '../../lib/shortcut-registry.js';

const CONTAINER_DEFS: Array<{ id: string; name: string }> = [
  { id: CONTAINER_IDS.LIBRARY, name: 'Library' },
  { id: CONTAINER_IDS.INBOX, name: 'Inbox' },
  { id: CONTAINER_IDS.JOURNAL, name: 'Journal' },
  { id: CONTAINER_IDS.SEARCHES, name: 'Searches' },
  { id: CONTAINER_IDS.TRASH, name: 'Trash' },
  { id: CONTAINER_IDS.SCHEMA, name: 'Schema' },
];

/**
 * Bootstrap workspace containers in LoroDoc.
 * Creates fixed container nodes if they don't exist.
 */
async function seedWorkspace(wsId: string): Promise<void> {
  await initLoroDoc(wsId);

  // Create container nodes if they don't already exist
  for (const { id, name } of CONTAINER_DEFS) {
    if (!loroDoc.hasNode(id)) {
      loroDoc.createNode(id, null);
      loroDoc.setNodeDataBatch(id, { name, type: 'workspace' });
    }
  }
}

interface BootstrapResult {
  ready: boolean;
}

function useBootstrap(): BootstrapResult {
  const [ready, setReady] = useState(false);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setUser = useWorkspaceStore((s) => s.setUser);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const navigateTo = useUIStore((s) => s.navigateTo);

  const initCalled = useRef(false);

  useEffect(() => {
    if (initCalled.current) return;
    initCalled.current = true;

    async function init() {
      // Phase 1: local-only Loro mode (no Supabase auth)
      let currentWsId = wsId ?? 'ws_default';
      if (!wsId) {
        setWorkspace(currentWsId);
        setUser('user_default');
      }

      // Bootstrap LoroDoc + seed containers
      await seedWorkspace(currentWsId);

      // Navigate to Library if panel stack is empty
      if (panelHistory.length === 0) {
        navigateTo(CONTAINER_IDS.LIBRARY);
      }

      setReady(true);
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready };
}

export function App() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const { ready } = useBootstrap();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const conflicts = findUnexpectedShortcutConflicts();
    if (conflicts.length > 0) {
      console.warn('[shortcut-registry] unexpected conflicts detected', conflicts);
    }
  }, []);

  // Global Cmd+Z / Cmd+Shift+Z for navigation undo/redo
  useNavUndoKeyboard();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <PanelStack />
      <CommandPalette />
    </div>
  );
}

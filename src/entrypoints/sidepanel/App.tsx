import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { useTodayShortcut } from '../../hooks/use-today-shortcut';
import { Sidebar } from '../../components/sidebar/Sidebar';
import { PanelStack } from '../../components/panel/PanelStack';
import { CommandPalette } from '../../components/search/CommandPalette';
import { CONTAINER_IDS } from '../../types/index.js';
import { initLoroDoc } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { ensureWorkspaceHomeNode } from '../../lib/workspace-root.js';
import { findUnexpectedShortcutConflicts } from '../../lib/shortcut-registry.js';
import { Toaster } from 'sonner';

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
  ensureWorkspaceHomeNode(wsId);

  // Create container nodes if they don't already exist
  for (const { id, name } of CONTAINER_DEFS) {
    if (!loroDoc.hasNode(id)) {
      loroDoc.createNode(id, null);
      loroDoc.setNodeRichTextContent(id, name, [], []);
    }
  }
}

interface BootstrapResult {
  ready: boolean;
}

function useBootstrap(skip: boolean): BootstrapResult {
  const [ready, setReady] = useState(skip);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setUser = useWorkspaceStore((s) => s.setUser);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const navigateTo = useUIStore((s) => s.navigateTo);

  const initCalled = useRef(false);

  useEffect(() => {
    if (skip) {
      setReady(true);
      return;
    }
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

      // Wait for UIStore persist hydration before checking panel validity
      // (persist.getItem is async, so the initial render may have stale default state)
      if (!useUIStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          useUIStore.persist.onFinishHydration(() => resolve());
        });
      }

      // Navigate to Library if panel stack is empty or current panel node is invalid.
      const latestHistory = useUIStore.getState().panelHistory;
      const latestIndex = useUIStore.getState().panelIndex;
      const currentPanelId = latestHistory[latestIndex] ?? latestHistory[latestHistory.length - 1];
      if (latestHistory.length === 0 || (currentPanelId && !loroDoc.hasNode(currentPanelId))) {
        navigateTo(CONTAINER_IDS.LIBRARY);
      }

      setReady(true);
    }

    init();
  }, [skip]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready };
}

interface AppProps {
  skipBootstrap?: boolean;
}

export function App({ skipBootstrap = false }: AppProps) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const { ready } = useBootstrap(skipBootstrap);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const conflicts = findUnexpectedShortcutConflicts();
    if (conflicts.length > 0) {
      console.warn('[shortcut-registry] unexpected conflicts detected', conflicts);
    }
  }, []);

  // Global Cmd+Z / Cmd+Shift+Z for navigation undo/redo
  useNavUndoKeyboard();
  // Global Cmd+Shift+D for go to today
  useTodayShortcut();

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
      <Toaster position="bottom-center" />
    </div>
  );
}

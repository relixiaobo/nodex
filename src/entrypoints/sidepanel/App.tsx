import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useUIStore } from '../../stores/ui-store';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { useTodayShortcut } from '../../hooks/use-today-shortcut';
import { useGlobalSelectionDismiss } from '../../hooks/use-global-selection-dismiss.js';
import { Sidebar } from '../../components/sidebar/Sidebar';
import { PanelStack } from '../../components/panel/PanelStack';
import { CommandPalette } from '../../components/search/CommandPalette';
import { CONTAINER_IDS } from '../../types/index.js';
import { initLoroDoc } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { ensureWorkspaceHomeNode } from '../../lib/workspace-root.js';
import { getOrCreateDefaultWorkspaceId } from '../../lib/workspace-id.js';
import { findUnexpectedShortcutConflicts } from '../../lib/shortcut-registry.js';
import { ensureJournalTagDefs } from '../../lib/journal.js';
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

  ensureJournalTagDefs();
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
      // Wait for WorkspaceStore persist hydration so we read the correct
      // persisted currentWorkspaceId (e.g. the user's ID from a previous session).
      // Without this, chrome.storage.local async hydration may not have completed,
      // causing wsId to be null → wrong local workspace ID → sync push mismatch.
      if (!useWorkspaceStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          useWorkspaceStore.persist.onFinishHydration(() => resolve());
        });
      }

      // Re-read after hydration (the React hook value `wsId` was captured before hydration)
      let currentWsId = useWorkspaceStore.getState().currentWorkspaceId;
      if (!currentWsId) {
        currentWsId = await getOrCreateDefaultWorkspaceId();
        setWorkspace(currentWsId);
        setUser('user_default');
      }

      // Bootstrap LoroDoc + seed containers
      await seedWorkspace(currentWsId);

      // Restore auth session from stored Bearer token (validates against server).
      // Must run after initLoroDoc so getPeerIdStr() is available for sync start.
      // Fire-and-forget: UI renders immediately, auth + sync restore in background.
      const { initAuth } = useWorkspaceStore.getState();
      void initAuth();

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
  const selectionDismissHandlers = useGlobalSelectionDismiss();

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
    <div
      className="flex h-screen w-full overflow-hidden bg-background text-foreground"
      onPointerDownCapture={selectionDismissHandlers.onPointerDownCapture}
      onFocusCapture={selectionDismissHandlers.onFocusCapture}
    >
      {sidebarOpen && <Sidebar />}
      <PanelStack />
      <CommandPalette />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-foreground)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
        }}
      />
    </div>
  );
}

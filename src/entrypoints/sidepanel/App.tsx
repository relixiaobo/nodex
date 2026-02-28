import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { useTodayShortcut } from '../../hooks/use-today-shortcut';
import { useGlobalSelectionDismiss } from '../../hooks/use-global-selection-dismiss.js';
import { TopToolbar } from '../../components/toolbar/TopToolbar';
import { PanelStack } from '../../components/panel/PanelStack';
import { CommandPalette } from '../../components/search/CommandPalette';
import { CONTAINER_IDS } from '../../types/index.js';
import { initLoroDoc, commitDoc } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { ensureWorkspaceHomeNode } from '../../lib/workspace-root.js';
import { getOrCreateDefaultWorkspaceId } from '../../lib/workspace-id.js';
import { findUnexpectedShortcutConflicts } from '../../lib/shortcut-registry.js';
import { ensureJournalTagDefs, ensureTodayNode } from '../../lib/journal.js';
import { ensureHighlightTagDef, ensureCommentTagDef, type HighlightNodeStore } from '../../lib/highlight-service.js';
import { BOOTSTRAP_CONTAINER_DEFS } from '../../lib/system-node-registry.js';
import { Toaster } from 'sonner';
import { TooltipProvider } from '../../components/ui/Tooltip';

/**
 * Bootstrap workspace containers in LoroDoc.
 * Creates fixed container nodes if they don't exist.
 */
async function seedWorkspace(wsId: string): Promise<void> {
 await initLoroDoc(wsId);
 ensureWorkspaceHomeNode(wsId);

 // Create container nodes as children of the workspace home node.
 // Existing containers created before this change may still be root-level —
 // move them under the workspace node for consistency.
 for (const { id, name } of BOOTSTRAP_CONTAINER_DEFS) {
  if (!loroDoc.hasNode(id)) {
   loroDoc.createNode(id, wsId);
   loroDoc.setNodeRichTextContent(id, name, [], []);
  } else if (loroDoc.getParentId(id) === null) {
   // Migrate: container was root-level, move under workspace node
   loroDoc.moveNode(id, wsId);
  }
 }

 ensureJournalTagDefs();

 // Ensure #highlight and #comment system tags exist
 const store = useNodeStore.getState() as HighlightNodeStore;
 ensureHighlightTagDef(store);
 ensureCommentTagDef(store);

 // Flush all bootstrap ops under a system origin so they are excluded from
 // the undo stack. Without this, pending ops from container creation could
 // leak into the first user-initiated commitUIMarker → commitDoc('user:ui').
 commitDoc('system:bootstrap');
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
 const replacePanel = useUIStore((s) => s.replacePanel);

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

   // Navigate to Today on first visit of the day, otherwise restore last panel.
   // Use replacePanel (not navigateTo) to avoid creating a Loro undo entry
   // whose captured UI snapshot is the empty initial state — that would cause
   // repeated Cmd+Z to restore a blank panel stack.
   const latestHistory = useUIStore.getState().panelHistory;
   const latestIndex = useUIStore.getState().panelIndex;
   const currentPanelId = latestHistory[latestIndex] ?? latestHistory[latestHistory.length - 1];
   const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
   const lastVisitDate = useUIStore.getState().lastVisitDate;
   const isFirstVisitOfDay = lastVisitDate !== todayStr;
   useUIStore.getState().setLastVisitDate(todayStr);

   if (latestHistory.length === 0
    || (currentPanelId && !loroDoc.hasNode(currentPanelId))
    || isFirstVisitOfDay) {
    replacePanel(ensureTodayNode());
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
  <TooltipProvider>
   <div
    className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground"
    onPointerDownCapture={selectionDismissHandlers.onPointerDownCapture}
    onFocusCapture={selectionDismissHandlers.onFocusCapture}
   >
    <TopToolbar />
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
       boxShadow: 'none',
      },
     }}
    />
   </div>
  </TooltipProvider>
 );
}

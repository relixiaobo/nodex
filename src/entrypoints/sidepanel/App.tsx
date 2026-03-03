import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { useTodayShortcut } from '../../hooks/use-today-shortcut';
import { useGlobalSelectionDismiss } from '../../hooks/use-global-selection-dismiss.js';
import { TopToolbar } from '../../components/toolbar/TopToolbar';
import { PanelStack } from '../../components/panel/PanelStack';
import { CommandPalette } from '../../components/search/CommandPalette';
import { BatchTagSelector } from '../../components/tags/BatchTagSelector';
import { initLoroDoc } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { getOrCreateDefaultWorkspaceId } from '../../lib/workspace-id.js';
import { findUnexpectedShortcutConflicts } from '../../lib/shortcut-registry.js';
import { ensureTodayNode } from '../../lib/journal.js';
import { ensureHighlightTagDef, ensureNoteTagDef, type HighlightNodeStore } from '../../lib/highlight-service.js';
import {
  createHighlightFromPayload,
  buildHighlightRestorePayload,
  collectAllHighlightNodeIds,
  getRemovedHighlightIds,
  upsertHighlightNote,
} from '../../lib/highlight-sidepanel.js';
import { findClipNodeByUrl } from '../../lib/webclip-service.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_DELETE,
  HIGHLIGHT_CLICK,
  HIGHLIGHT_CHECK_URL,
  HIGHLIGHT_NOTE_UPSERT,
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_UNRESOLVABLE,
  type HighlightCreatePayload,
  type HighlightDeletePayload,
  type HighlightClickPayload,
  type HighlightCheckUrlPayload,
  type HighlightNoteUpsertPayload,
  type HighlightUnresolvablePayload,
} from '../../lib/highlight-messaging.js';
import { ensureContainers } from '../../lib/bootstrap-containers.js';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '../../components/ui/Tooltip';

// ─── Error Boundary ───
// Prevents white screen — catches render errors and shows a recovery UI.

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error('[App] Render error caught by ErrorBoundary:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center text-sm text-foreground">
          <p className="text-muted-foreground">Something went wrong.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="text-primary hover:underline"
          >
            Try again
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-2 max-w-full overflow-auto rounded bg-muted p-2 text-xs text-destructive">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Bootstrap workspace containers in LoroDoc.
 * Creates fixed container nodes if they don't exist.
 */
async function seedWorkspace(wsId: string): Promise<{ hadSnapshot: boolean }> {
 const { hadSnapshot } = await initLoroDoc(wsId);
 ensureContainers(wsId);
 return { hadSnapshot };
}

interface BootstrapResult {
 ready: boolean;
}

function useBootstrap(skip: boolean): BootstrapResult {
 const [ready, setReady] = useState(skip);
 const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
 const setUser = useWorkspaceStore((s) => s.setUser);
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
   const { hadSnapshot } = await seedWorkspace(currentWsId);

   // Restore auth session from stored Bearer token (validates against server).
   // Must run after initLoroDoc so getPeerIdStr() is available for sync start.
   const { initAuth } = useWorkspaceStore.getState();
   // Both paths: start auth + sync in background, never block UI rendering.
   // When sync pulls data, importUpdatesBatch() → notifySubscribers() triggers
   // React re-render via node-store's _version increment.
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

   // If no local snapshot existed, watch for sync completion in background.
   // When pull finishes, re-seed containers in case server data has different structure.
   if (!hadSnapshot && useWorkspaceStore.getState().isAuthenticated) {
    const { syncManager } = await import('../../lib/sync/sync-manager.js');
    const unsub = syncManager.onStateChange((state) => {
     if (state.status === 'synced' && state.lastSyncedAt !== null) {
      unsub();
      // If WASM is poisoned, don't attempt LoroDoc operations
      if (loroDoc.isWasmPoisoned()) return;
      // Read current workspace ID dynamically — may have changed after sign-in
      // (bootstrap captures randomUUID, but sign-in transitions to user.id)
      const wsNow = useWorkspaceStore.getState().currentWorkspaceId;
      if (wsNow) ensureContainers(wsNow);
     } else if (state.status === 'error') {
      unsub();
     }
    });
   }
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
  if (!ready) return;
  if (!chrome?.runtime?.onMessage) return;

  const onHighlightMessage = (
   message: { type?: string; payload?: unknown; _tabId?: number },
   _sender: chrome.runtime.MessageSender,
   sendResponse: (response?: unknown) => void,
  ): boolean | void => {
   if (message?.type === HIGHLIGHT_CREATE) {
    // In Chrome MV3, content script sendMessage reaches both background AND
    // side panel. Background forwards with _tabId added. Skip the direct
    // content-script message to avoid creating duplicate highlights.
    if (!message._tabId) return false;

    const payload = message.payload as HighlightCreatePayload | undefined;
    if (!payload) {
      sendResponse({ ok: false, error: 'Missing highlight payload' });
      return true;
    }

    (async () => {
      try {
        const store = useNodeStore.getState() as HighlightNodeStore;
        ensureHighlightTagDef(store);
        ensureNoteTagDef(store);
        const result = await createHighlightFromPayload(payload, store);
        sendResponse({ ok: true, nodeId: result.highlightNodeId, clipNodeId: result.clipNodeId });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, error });
      }
    })();
    return true;
   }

   if (message?.type === HIGHLIGHT_CHECK_URL) {
    const payload = message.payload as HighlightCheckUrlPayload | undefined;
    if (!payload?.url || !payload.tabId) {
      sendResponse({ ok: false, error: 'Invalid check-url payload' });
      return true;
    }

    const store = useNodeStore.getState() as HighlightNodeStore;
    ensureHighlightTagDef(store);

    const clipNodeId = findClipNodeByUrl(payload.url);
    if (!clipNodeId) {
      sendResponse({ ok: true, restored: 0 });
      return true;
    }

    const restorePayload = buildHighlightRestorePayload(clipNodeId);
    if (restorePayload.highlights.length === 0) {
      sendResponse({ ok: true, restored: 0 });
      return true;
    }

    chrome.runtime.sendMessage({
      type: HIGHLIGHT_RESTORE,
      payload: restorePayload,
      _tabId: payload.tabId,
    }).then(() => {
      sendResponse({ ok: true, restored: restorePayload.highlights.length });
    }).catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error });
    });
    return true;
   }

   if (message?.type === HIGHLIGHT_CLICK) {
    const payload = message.payload as HighlightClickPayload | undefined;
    if (payload?.id) {
      const ui = useUIStore.getState();
      ui.navigateTo(payload.id);
      ui.setSelectedNode(payload.id);
    }
    sendResponse({ ok: true });
    return true;
   }

   if (message?.type === HIGHLIGHT_DELETE) {
    const payload = message.payload as HighlightDeletePayload | undefined;
    if (!payload?.id) {
      sendResponse({ ok: false, error: 'Missing highlight id for delete' });
      return true;
    }

    const store = useNodeStore.getState();
    const target = store.getNode(payload.id);
    if (!target) {
      sendResponse({ ok: true, deleted: false });
      return true;
    }

    store.trashNode(payload.id);
    sendResponse({ ok: true, deleted: true });
    return true;
   }

   if (message?.type === HIGHLIGHT_NOTE_UPSERT) {
    const payload = message.payload as HighlightNoteUpsertPayload | undefined;
    if (!payload?.id || typeof payload.noteText !== 'string') {
      sendResponse({ ok: false, error: 'Invalid highlight note payload' });
      return true;
    }

    const store = useNodeStore.getState() as HighlightNodeStore;
    ensureNoteTagDef(store);
    const result = upsertHighlightNote(store, payload.id, payload.noteText);
    sendResponse({
      ok: true,
      updated: !!result,
      noteNodeId: result?.noteNodeId,
      created: result?.created ?? false,
    });
    return true;
   }

   if (message?.type === HIGHLIGHT_UNRESOLVABLE) {
    const payload = message.payload as HighlightUnresolvablePayload | undefined;
    const count = payload?.ids?.length ?? 0;
    if (count > 0) {
      toast.warning(
        count === 1
          ? '1 个高亮无法在当前页面定位'
          : `${count} 个高亮无法在当前页面定位`,
      );
    }
    sendResponse({ ok: true });
    return true;
   }
  };

  chrome.runtime.onMessage.addListener(onHighlightMessage);
  return () => {
    chrome.runtime.onMessage.removeListener(onHighlightMessage);
  };
 }, [ready]);

 useEffect(() => {
  if (!ready) return;
  if (!chrome?.runtime?.sendMessage) return;

  let previousIds = collectAllHighlightNodeIds();

  return loroDoc.subscribe(() => {
    const nextIds = collectAllHighlightNodeIds();
    const removedIds = getRemovedHighlightIds(previousIds, nextIds);
    previousIds = nextIds;
    if (removedIds.length === 0) return;

    for (const id of removedIds) {
      chrome.runtime.sendMessage({
        type: HIGHLIGHT_REMOVE,
        payload: { id },
      }).catch(() => {});
    }
  });
 }, [ready]);

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
  <ErrorBoundary>
   <TooltipProvider>
    <div
     className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground"
     onPointerDownCapture={selectionDismissHandlers.onPointerDownCapture}
     onFocusCapture={selectionDismissHandlers.onFocusCapture}
    >
     <TopToolbar />
     <PanelStack />
     <CommandPalette />
     <BatchTagSelector />
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
  </ErrorBoundary>
 );
}

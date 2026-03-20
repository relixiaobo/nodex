import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useNavUndoKeyboard } from '../../hooks/use-nav-undo-keyboard';
import { usePanelKeyboard } from '../../hooks/use-panel-keyboard.js';
import { useChatShortcut } from '../../hooks/use-chat-shortcut.js';
import { useTodayShortcut } from '../../hooks/use-today-shortcut';
import { useGlobalSelectionDismiss } from '../../hooks/use-global-selection-dismiss.js';
import { LoginScreen } from '../../components/auth/LoginScreen.js';
import { DeskLayout } from '../../components/layout/DeskLayout.js';
import { CommandPalette } from '../../components/search/CommandPalette';
import { BatchTagSelector } from '../../components/tags/BatchTagSelector';
import { initLoroDoc } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { findUnexpectedShortcutConflicts } from '../../lib/shortcut-registry.js';
import { ensureTodayNode } from '../../lib/journal.js';
import { getStartupPagePreference, STARTUP_PAGE } from '../../lib/startup-page-preference.js';
import { ensureHighlightTagDef, ensureNoteTagDef, getClipNodeIdForHighlight, type HighlightNodeStore } from '../../lib/highlight-service.js';
import {
  createHighlightFromPayload,
  saveNotesForHighlight,
  buildHighlightRestorePayload,
  collectAllHighlightNodeIds,
  getRemovedHighlightIds,
  findNoteEntriesForHighlight,
} from '../../lib/highlight-sidepanel.js';
import { findClipNodeByUrl } from '../../lib/webclip-service.js';
import {
  getAllPendingHighlights,
  removePendingHighlights,
  markPendingHighlightFailed,
} from '../../lib/highlight-pending-queue.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_DELETE,
  HIGHLIGHT_CHECK_URL,
  HIGHLIGHT_NOTES_SAVE,
  HIGHLIGHT_NOTE_GET,
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_UNRESOLVABLE,
  type HighlightCreatePayload,
  type HighlightDeletePayload,
  type HighlightCheckUrlPayload,
  type HighlightNotesSavePayload,
  type HighlightNoteGetPayload,
  type HighlightUnresolvablePayload,
} from '../../lib/highlight-messaging.js';
import { ensureSystemNodes } from '../../lib/bootstrap-system-nodes.js';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '../../components/ui/Tooltip';
import { isAppPanel, isChatPanel } from '../../types/index.js';
import { openChatPanel } from '../../lib/chat-panel-actions.js';

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
 * Bootstrap workspace system nodes in LoroDoc.
 * Creates fixed singleton nodes if they don't exist.
 */
async function seedWorkspace(wsId: string): Promise<{ hadSnapshot: boolean }> {
 const { hadSnapshot } = await initLoroDoc(wsId);
 ensureSystemNodes(wsId);
 return { hadSnapshot };
}

interface BootstrapResult {
 ready: boolean;
 requireLogin: boolean;
}

function useBootstrap(skip: boolean): BootstrapResult {
 const [ready, setReady] = useState(skip);
 const [requireLogin, setRequireLogin] = useState(false);
 const isAuthenticated = useWorkspaceStore((s) => s.isAuthenticated);
 const replacePanel = useUIStore((s) => s.replacePanel);

 const authInitCalled = useRef(false);
 const workspaceBootstrapInFlight = useRef(false);

 async function bootstrapWorkspace() {
  if (workspaceBootstrapInFlight.current) return;
  workspaceBootstrapInFlight.current = true;

  try {
   let currentWsId = useWorkspaceStore.getState().currentWorkspaceId;
   if (!currentWsId) {
    const authUser = useWorkspaceStore.getState().authUser;
    currentWsId = authUser?.id ?? null;
    if (!currentWsId) {
     setRequireLogin(true);
     setReady(false);
     return;
    }
    useWorkspaceStore.setState({ currentWorkspaceId: currentWsId });
   }

   const { hadSnapshot } = await seedWorkspace(currentWsId);

   // Wait for UIStore persist hydration before checking panel validity
   // (persist.getItem is async, so the initial render may have stale default state)
   if (!useUIStore.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
     useUIStore.persist.onFinishHydration(() => resolve());
    });
   }

   // Default panel logic:
   // - Empty panels → open Chat (chat-first experience)
   // - Invalid/stale node panel → reset to Today
   // - First visit of the day on a node panel → reset to Today
   // Preserve restored app/chat panels as-is so special panels survive restart.
   // Use replacePanel (not navigateTo) to avoid creating a Loro undo entry whose
   // captured UI snapshot is the empty initial state — that would cause repeated
   // Cmd+Z to restore a blank panel stack.
   const uiState = useUIStore.getState();
   const activePanel = uiState.panels.find((p) => p.id === uiState.activePanelId);
   const currentPanelNodeId = activePanel?.nodeId ?? null;
   const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
   const lastVisitDate = uiState.lastVisitDate;
   const isFirstVisitOfDay = lastVisitDate !== todayStr;
   useUIStore.getState().setLastVisitDate(todayStr);
   const hasInvalidActiveNode = !!currentPanelNodeId
    && !isAppPanel(currentPanelNodeId)
    && !isChatPanel(currentPanelNodeId)
    && !loroDoc.hasNode(currentPanelNodeId);

   if (uiState.panels.length === 0) {
    if (getStartupPagePreference() === STARTUP_PAGE.TODAY) {
     replacePanel(ensureTodayNode());
    } else {
     void openChatPanel();
    }
   } else if (
    hasInvalidActiveNode
    || (
      isFirstVisitOfDay
      && !!currentPanelNodeId
      && !isAppPanel(currentPanelNodeId)
      && !isChatPanel(currentPanelNodeId)
    )
   ) {
    replacePanel(ensureTodayNode());
   }

   // ── Drain pending highlight queue ──
   let pendingFailCount = 0;
   try {
    const pendingEntries = await getAllPendingHighlights();
    if (pendingEntries.length > 0) {
     const store = useNodeStore.getState() as HighlightNodeStore;
     ensureHighlightTagDef(store);
     ensureNoteTagDef(store);

     const consumed: string[] = [];

     for (const entry of pendingEntries) {
      try {
       await createHighlightFromPayload({
        anchor: entry.anchor,
        selectedText: entry.selectedText,
        pageUrl: entry.pageUrl,
        pageTitle: entry.pageTitle,
        noteEntries: entry.noteEntries ?? [],
        pageMeta: entry.pageMeta,
       }, store);
       consumed.push(entry.tempId);
      } catch (err) {
       pendingFailCount++;
       const error = err instanceof Error ? err.message : String(err);
       void markPendingHighlightFailed(entry.tempId, error);
      }
     }

     if (consumed.length > 0) await removePendingHighlights(consumed);
    }
   } catch {
    // Queue read failed — not critical, skip
   }

   setRequireLogin(false);
   setReady(true);

   if (pendingFailCount > 0) {
    // Toast after ready so Toaster is mounted
    setTimeout(() => {
     toast.warning(
      pendingFailCount === 1
       ? '1 offline highlight failed to save'
       : `${pendingFailCount} offline highlights failed to save`,
     );
    }, 100);
   }

   // If no local snapshot existed, watch for sync completion in background.
   // When pull finishes, re-seed fixed system nodes in case server data differs.
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
      if (wsNow) ensureSystemNodes(wsNow);
     } else if (state.status === 'error') {
      unsub();
     }
    });
   }
  } finally {
   workspaceBootstrapInFlight.current = false;
  }
 }

 useEffect(() => {
  if (skip) {
   setReady(true);
   setRequireLogin(false);
   return;
  }
  if (authInitCalled.current) return;
  authInitCalled.current = true;

  async function init() {
   // Wait for WorkspaceStore persist hydration so we read the correct
   // persisted currentWorkspaceId (e.g. the user's ID from a previous session).
   if (!useWorkspaceStore.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
     useWorkspaceStore.persist.onFinishHydration(() => resolve());
    });
   }

   await useWorkspaceStore.getState().initAuth();

   if (!useWorkspaceStore.getState().isAuthenticated) {
    setRequireLogin(true);
    setReady(false);
    return;
   }

   await bootstrapWorkspace();
  }

  void init();
 }, [skip]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
  if (skip || !requireLogin || !isAuthenticated) return;
  void bootstrapWorkspace();
 }, [isAuthenticated, requireLogin, skip]); // eslint-disable-line react-hooks/exhaustive-deps

 return { ready, requireLogin };
}

interface AppProps {
 skipBootstrap?: boolean;
}

export function App({ skipBootstrap = false }: AppProps) {
 const { ready, requireLogin } = useBootstrap(skipBootstrap);
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
        sendResponse({ ok: true, highlightNodeId: result.highlightNodeId, noteNodeId: result.noteNodeId, clipNodeId: result.clipNodeId });
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

   if (message?.type === HIGHLIGHT_DELETE) {
    if (!message._tabId) return false;

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

   if (message?.type === HIGHLIGHT_NOTES_SAVE) {
    if (!message._tabId) return false;

    const payload = message.payload as HighlightNotesSavePayload | undefined;
    if (!payload?.id || !payload.noteEntries?.length) {
      sendResponse({ ok: true });
      return true;
    }

    const store = useNodeStore.getState() as HighlightNodeStore;
    const target = store.getNode(payload.id);
    if (!target) {
      sendResponse({ ok: false, error: 'Highlight node not found' });
      return true;
    }

    const clipNodeId = getClipNodeIdForHighlight(payload.id);
    if (!clipNodeId) {
      sendResponse({ ok: false, error: 'Highlight has no parent clip' });
      return true;
    }

    // Sync notes: split by depth-0 boundaries, update/create/delete as needed
    ensureNoteTagDef(store);
    const { noteNodeIds } = saveNotesForHighlight(payload.id, clipNodeId, payload.noteEntries, store);
    sendResponse({ ok: true, noteNodeIds });
    return true;
   }

   if (message?.type === HIGHLIGHT_NOTE_GET) {
    if (!message._tabId) return false;

    const payload = message.payload as HighlightNoteGetPayload | undefined;
    const entries = payload?.id ? findNoteEntriesForHighlight(payload.id) : [];
    sendResponse({ ok: true, noteEntries: entries });
    return true;
   }

   if (message?.type === HIGHLIGHT_UNRESOLVABLE) {
    const payload = message.payload as HighlightUnresolvablePayload | undefined;
    const count = payload?.ids?.length ?? 0;
    if (count > 0) {
      toast.warning(
        count === 1
          ? '1 highlight could not be located on this page'
          : `${count} highlights could not be located on this page`,
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
 // Global multi-panel keyboard shortcuts (Cmd+\, Cmd+Shift+W, Cmd+Option+←/→)
 usePanelKeyboard();
 // Global Cmd+L / Cmd+Shift+L for chat drawer
 useChatShortcut();
 // Global Cmd+Shift+D for go to today
 useTodayShortcut();

 if (requireLogin) {
  return <LoginScreen />;
 }

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
     className="flex h-screen w-full flex-col overflow-hidden bg-background-recessed text-foreground"
     onPointerDownCapture={selectionDismissHandlers.onPointerDownCapture}
     onFocusCapture={selectionDismissHandlers.onFocusCapture}
    >
     <DeskLayout />
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

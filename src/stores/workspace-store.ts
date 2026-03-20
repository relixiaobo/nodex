/**
 * Workspace & user authentication store.
 *
 * Persisted to chrome.storage.local.
 * Auth backed by Better Auth (via Worker API).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../lib/chrome-storage';
import type { AuthUser } from '../lib/auth.js';
import { syncManager } from '../lib/sync/sync-manager.js';
import { isWasmPoisoned } from '../lib/loro-doc.js';

interface WorkspaceStore {
  currentWorkspaceId: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  authUser: AuthUser | null;

  // Legacy helpers (used by offline/demo mode bootstrap)
  setWorkspace(workspaceId: string): void;
  setUser(userId: string): void;
  logout(): void;

  // Google Auth actions
  continueInOfflineMode(): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Checks the stored session token against the server and restores auth state.
   * Returns an unsubscribe function (no-op for Better Auth; kept for API compat).
   * Should be called once during app bootstrap.
   */
  initAuth(): Promise<() => void>;
}

/** Start sync if signed in with a workspace. */
async function startSyncIfReady(): Promise<void> {
  const { currentWorkspaceId, isAuthenticated } = useWorkspaceStore.getState();
  if (!isAuthenticated || !currentWorkspaceId) return;

  const { getStoredToken } = await import('../lib/auth.js');
  const { getPeerIdStr, getLoroDoc } = await import('../lib/loro-doc.js');
  const { enqueuePendingUpdate } = await import('../lib/sync/pending-queue.js');
  const token = await getStoredToken();
  if (!token) return;

  try {
    const deviceId = getPeerIdStr();

    // Enqueue a full document state export BEFORE starting the sync loop.
    // Operations committed while sync was inactive (status = 'local-only')
    // — such as tree node creation during bootstrap — are discarded by
    // subscribeLocalUpdates. This full export ensures they reach the server.
    // CRDT import is idempotent, so re-pushing known operations is safe.
    const doc = getLoroDoc();
    const fullUpdate = doc.export({ mode: 'update' });
    if (fullUpdate.length > 0) {
      await enqueuePendingUpdate(currentWorkspaceId, fullUpdate);
    }

    await syncManager.start(currentWorkspaceId, token, deviceId);
  } catch (err) {
    console.error('[sync] startSyncIfReady failed:', err);
  }
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
      authUser: null,

      setWorkspace: (workspaceId) => set({ currentWorkspaceId: workspaceId }),

      setUser: (userId) => set({ userId, isAuthenticated: true }),

      logout: () => {
        syncManager.stop();
        set({
          userId: null,
          isAuthenticated: false,
          currentWorkspaceId: null,
          authUser: null,
        });
      },

      continueInOfflineMode: async () => {
        const { getOrCreateDefaultWorkspaceId } = await import('../lib/workspace-id.js');
        const workspaceId = await getOrCreateDefaultWorkspaceId();
        set({
          currentWorkspaceId: workspaceId,
          userId: 'user_default',
          isAuthenticated: true,
          authUser: {
            id: 'user_default',
            name: 'Offline mode',
          },
        });
      },

      signInWithGoogle: async () => {
        const { signInWithGoogle: authSignIn } = await import('../lib/auth.js');
        const user = await authSignIn();

        const prevWsId = useWorkspaceStore.getState().currentWorkspaceId;

        // Update persistence key so saves go under the correct IndexedDB key.
        // Do NOT call ensureSystemNodes() here — tree move operations before sync
        // cause a Loro WASM panic when server data is imported (conflicting tree
        // operations trigger option.rs:2175 unwrap). Fixed-system-node bootstrap is deferred
        // until after sync completes.
        if (prevWsId !== user.id) {
          const loroDocMod = await import('../lib/loro-doc.js');
          loroDocMod.setCurrentWorkspaceId(user.id);

          // Clean up orphaned snapshot from anonymous session
          if (prevWsId) {
            const { deleteSnapshot } = await import('../lib/loro-persistence.js');
            await deleteSnapshot(prevWsId).catch(() => {});
          }
        }

        // TODO: currentWorkspaceId = user.id assumes single workspace per user.
        // When multi-workspace is needed, derive from a workspace list instead.
        set({
          userId: user.id,
          currentWorkspaceId: user.id,
          isAuthenticated: true,
          authUser: user,
        });

        if (prevWsId !== user.id) {
          // Defer fixed-system-node bootstrap + Today navigation until AFTER first sync.
          // ensureSystemNodes() MUST run after importUpdatesBatch so that local
          // tree move operations don't conflict with server CRDT data during merge.
          const { ensureSystemNodes } = await import('../lib/bootstrap-system-nodes.js');
          const { ensureTodayNode } = await import('../lib/journal.js');
          const { getStartupPagePreference, STARTUP_PAGE } = await import('../lib/startup-page-preference.js');
          const { useUIStore } = await import('./ui-store.js');
          const targetWsId = user.id;
          const unsub = syncManager.onStateChange((state) => {
            // Self-clean if workspace changed (sign-out or re-sign-in)
            if (useWorkspaceStore.getState().currentWorkspaceId !== targetWsId) {
              unsub();
              return;
            }
            if (state.status === 'synced') {
              unsub();
              try {
                ensureSystemNodes(targetWsId);
                if (getStartupPagePreference() === STARTUP_PAGE.TODAY) {
                  const todayId = ensureTodayNode();
                  useUIStore.getState().replacePanel(todayId);
                }
              } catch (e) {
                console.warn('[workspace-store] post-sync setup failed:', e);
              }
            } else if (state.status === 'error') {
              unsub();
              // If WASM is poisoned, don't attempt any LoroDoc operations —
              // they will panic. Recovery requires a page reload.
              if (isWasmPoisoned()) return;
              // Sync failed for non-fatal reason — try ensureSystemNodes for offline functionality
              try {
                ensureSystemNodes(targetWsId);
                if (getStartupPagePreference() === STARTUP_PAGE.TODAY) {
                  const todayId = ensureTodayNode();
                  useUIStore.getState().replacePanel(todayId);
                }
              } catch (e) {
                console.warn('[workspace-store] post-error setup failed:', e);
              }
            }
          });
        }

        // Start sync after sign-in
        void startSyncIfReady();
      },

      signOut: async () => {
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        syncManager.stop();
        // Clear all local user data to avoid leaking stale data
        if (wsId) {
          const { clearPendingUpdates } = await import('../lib/sync/pending-queue.js');
          const { deleteSnapshot, deleteSyncCursor } = await import('../lib/loro-persistence.js');
          await Promise.all([
            clearPendingUpdates(wsId),
            deleteSnapshot(wsId),
            deleteSyncCursor(wsId),
          ]).catch(() => {});
        }
        // P0-2: Clear chat IndexedDB to prevent cross-user data leaks
        const { clearAllChatSessions } = await import('../lib/ai-persistence.js');
        await clearAllChatSessions().catch(() => {});

        // Clear chat pull cursor in IndexedDB
        if (wsId) {
          const { deleteSyncCursor: deleteCursor } = await import('../lib/loro-persistence.js');
          await deleteCursor(`chat:${wsId}`).catch(() => {});
        }

        // Clear chat agent registry to prevent cross-workspace data leaks
        const { resetAIAgentForTests: resetAgentRegistry } = await import('../lib/ai-service.js');
        resetAgentRegistry();

        const { signOut: authSignOut } = await import('../lib/auth.js');
        await authSignOut();
        set({
          userId: null,
          isAuthenticated: false,
          currentWorkspaceId: null,
          authUser: null,
        });
      },

      initAuth: async () => {
        const { getCurrentUser } = await import('../lib/auth.js');

        // Restore session from stored Bearer token (validated against server)
        const user = await getCurrentUser();
        if (user) {
          const currentWsId = useWorkspaceStore.getState().currentWorkspaceId;
          set({
            userId: user.id,
            currentWorkspaceId: currentWsId ?? user.id,
            isAuthenticated: true,
            authUser: user,
          });

          // If the LoroDoc was freshly created (no IndexedDB snapshot), bootstrap
          // created journal nodes that will conflict with server data after CRDT
          // merge. fixDuplicateContainerMappings() handles container-level dedup.
          // Defer Today navigation until sync fully catches up so we navigate to
          // the server's today node (with actual data) rather than the empty bootstrap one.
          const loroDocMod = await import('../lib/loro-doc.js');
          if (!loroDocMod.wasLoadedFromSnapshot()) {
            const { ensureTodayNode } = await import('../lib/journal.js');
            const { getStartupPagePreference, STARTUP_PAGE } = await import('../lib/startup-page-preference.js');
            const { useUIStore } = await import('./ui-store.js');
            const targetWsId = useWorkspaceStore.getState().currentWorkspaceId;
            const unsub = syncManager.onStateChange((state) => {
              // Self-clean if workspace changed (sign-out or re-sign-in)
              if (useWorkspaceStore.getState().currentWorkspaceId !== targetWsId) {
                unsub();
                return;
              }
              if (state.status === 'synced') {
                unsub();
                try {
                  if (getStartupPagePreference() === STARTUP_PAGE.TODAY) {
                    const todayId = ensureTodayNode();
                    useUIStore.getState().replacePanel(todayId);
                  }
                } catch (e) {
                  console.warn('[workspace-store] deferred today navigation failed:', e);
                }
              } else if (state.status === 'error') {
                // Sync failed — don't try to create journal nodes (WASM may be poisoned)
                unsub();
              }
            });
          }

          // Start sync after auth restoration.
          // Awaited so sync is active before initAuth() resolves.
          await startSyncIfReady();
        } else {
          set({ userId: null, isAuthenticated: false, authUser: null });
        }

        // Auth state is validated on startup; 401 responses during API calls
        // will trigger re-auth as needed.
        return () => {};
      },
    }),
    {
      name: 'nodex-workspace',
      storage: chromeLocalStorage,
      // Only persist UI preference. Auth state (userId, isAuthenticated, authUser)
      // is validated via initAuth() on each startup using the stored Bearer token.
      // This avoids desync when the session expires.
      partialize: (s) => ({
        currentWorkspaceId: s.currentWorkspaceId,
      }),
    },
  ),
);

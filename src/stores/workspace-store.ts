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

      signInWithGoogle: async () => {
        const { signInWithGoogle: authSignIn } = await import('../lib/auth.js');
        const user = await authSignIn();

        const prevWsId = useWorkspaceStore.getState().currentWorkspaceId;

        // TODO: currentWorkspaceId = user.id assumes single workspace per user.
        // When multi-workspace is needed, derive from a workspace list instead.
        set({
          userId: user.id,
          currentWorkspaceId: user.id,
          isAuthenticated: true,
          authUser: user,
        });

        // On fresh install, bootstrap initialized LoroDoc with a random UUID.
        // After sign-in the workspace must be user.id — update the persistence
        // key so future saves go to the correct IndexedDB entry.
        // Unlike initLoroDoc(), setCurrentWorkspaceId() does NOT destroy the
        // in-memory doc, so existing nodes remain valid and React won't crash
        // during intermediate re-renders.
        if (prevWsId !== user.id) {
          const loroDocMod = await import('../lib/loro-doc.js');
          loroDocMod.setCurrentWorkspaceId(user.id);

          const { ensureContainers } = await import('../lib/bootstrap-containers.js');
          ensureContainers(user.id);

          // Defer Today navigation until AFTER first sync completes.
          // Bootstrap created journal nodes with random IDs under JOURNAL.
          // After sync, fixDuplicateContainerMappings() resolves which JOURNAL
          // tree node to use (server's, with actual data). We then navigate to
          // the server's today node. The bootstrap journal nodes become orphaned
          // (harmless — under the non-mapped JOURNAL tree node).
          const { ensureTodayNode } = await import('../lib/journal.js');
          const { useUIStore } = await import('./ui-store.js');
          const unsub = syncManager.onStateChange((state) => {
            if (state.lastSyncedAt !== null || state.status === 'error') {
              unsub();
              const todayId = ensureTodayNode();
              useUIStore.getState().replacePanel(todayId);
            }
          });
        }

        // Start sync after sign-in
        void startSyncIfReady();
      },

      signOut: async () => {
        const wsId = useWorkspaceStore.getState().currentWorkspaceId;
        syncManager.stop();
        // Clear pending updates to avoid leaking stale data on re-sign-in
        if (wsId) {
          const { clearPendingUpdates } = await import('../lib/sync/pending-queue.js');
          await clearPendingUpdates(wsId).catch(() => {});
        }
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
          // Defer Today navigation until sync completes so we navigate to the
          // server's today node (with actual data) rather than the empty bootstrap one.
          const loroDocMod = await import('../lib/loro-doc.js');
          if (!loroDocMod.wasLoadedFromSnapshot()) {
            const { ensureTodayNode } = await import('../lib/journal.js');
            const { useUIStore } = await import('./ui-store.js');
            const unsub = syncManager.onStateChange((state) => {
              if (state.lastSyncedAt !== null || state.status === 'error') {
                unsub();
                const todayId = ensureTodayNode();
                useUIStore.getState().replacePanel(todayId);
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

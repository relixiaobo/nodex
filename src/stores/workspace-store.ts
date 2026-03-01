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
import { syncDiagLog } from '../lib/sync/diagnostics.js';

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
  syncDiagLog('workspace.startSyncIfReady.enter', { isAuthenticated, currentWorkspaceId });
  if (!isAuthenticated || !currentWorkspaceId) {
    syncDiagLog('workspace.startSyncIfReady.skip', {
      reason: !isAuthenticated ? 'unauthenticated' : 'missing_workspace',
    });
    return;
  }

  const { getStoredToken } = await import('../lib/auth.js');
  const { getPeerIdStr } = await import('../lib/loro-doc.js');
  const token = await getStoredToken();
  syncDiagLog('workspace.startSyncIfReady.token', { hasToken: !!token });
  if (!token) return;

  try {
    const deviceId = getPeerIdStr();
    syncDiagLog('workspace.startSyncIfReady.start', {
      workspaceId: currentWorkspaceId,
      deviceId,
    });
    await syncManager.start(currentWorkspaceId, token, deviceId);
    syncDiagLog('workspace.startSyncIfReady.started', { workspaceId: currentWorkspaceId });
  } catch {
    syncDiagLog('workspace.startSyncIfReady.error', {
      message: 'syncManager.start failed before Loro init or due to runtime error',
    });
    // loro-doc may not be initialized yet — sync will start after initLoroDoc
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
        syncDiagLog('workspace.signInWithGoogle.start');
        const { signInWithGoogle: authSignIn } = await import('../lib/auth.js');
        try {
          const user = await authSignIn();
          syncDiagLog('workspace.signInWithGoogle.success', { userId: user.id });
          // TODO: currentWorkspaceId = user.id assumes single workspace per user.
          // When multi-workspace is needed, derive from a workspace list instead.
          set({
            userId: user.id,
            currentWorkspaceId: user.id,
            isAuthenticated: true,
            authUser: user,
          });

          // Start sync after sign-in
          void startSyncIfReady();
        } catch (err) {
          syncDiagLog('workspace.signInWithGoogle.error', {
            errorName: err instanceof Error ? err.name : 'UnknownError',
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },

      signOut: async () => {
        syncManager.stop();
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
        syncDiagLog('workspace.initAuth.user', { userId: user?.id ?? null });
        if (user) {
          const currentWsId = useWorkspaceStore.getState().currentWorkspaceId;
          syncDiagLog('workspace.initAuth.setAuthenticated', {
            persistedWorkspaceId: currentWsId ?? null,
            fallbackWorkspaceId: user.id,
          });
          set({
            userId: user.id,
            currentWorkspaceId: currentWsId ?? user.id,
            isAuthenticated: true,
            authUser: user,
          });

          // Start sync after auth restoration.
          // Awaited so callers of initAuth() can rely on sync being started
          // before proceeding (e.g., waitForFirstSync in bootstrap recovery).
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

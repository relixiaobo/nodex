/**
 * Workspace & user authentication store.
 *
 * Persisted to chrome.storage.local.
 * Auth backed by Better Auth (via Worker API) — no Supabase dependency.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../lib/chrome-storage';
import type { AuthUser } from '../lib/auth.js';

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

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,
      authUser: null,

      setWorkspace: (workspaceId) => set({ currentWorkspaceId: workspaceId }),

      setUser: (userId) => set({ userId, isAuthenticated: true }),

      logout: () =>
        set({
          userId: null,
          isAuthenticated: false,
          currentWorkspaceId: null,
          authUser: null,
        }),

      signInWithGoogle: async () => {
        const { signInWithGoogle: authSignIn } = await import('../lib/auth.js');
        const user = await authSignIn();
        // TODO: currentWorkspaceId = user.id assumes single workspace per user.
        // When multi-workspace is needed, derive from a workspace list instead.
        set({
          userId: user.id,
          currentWorkspaceId: user.id,
          isAuthenticated: true,
          authUser: user,
        });
      },

      signOut: async () => {
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
        } else {
          set({ userId: null, isAuthenticated: false, authUser: null });
        }

        // No real-time subscription for Better Auth (unlike Supabase).
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

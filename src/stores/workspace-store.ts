/**
 * Workspace & user authentication store.
 *
 * Persisted to chrome.storage.local.
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
   * Checks the current Supabase session and subscribes to auth state changes.
   * Returns an unsubscribe function.
   * Should be called once during app bootstrap when Supabase is available.
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
        const { getCurrentUser, onAuthStateChange } = await import('../lib/auth.js');

        // Restore session if one exists
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

        // Subscribe to future auth changes
        const unsubscribe = onAuthStateChange((user) => {
          if (user) {
            set({ userId: user.id, isAuthenticated: true, authUser: user });
          } else {
            set({
              userId: null,
              isAuthenticated: false,
              currentWorkspaceId: null,
              authUser: null,
            });
          }
        });

        return unsubscribe;
      },
    }),
    {
      name: 'nodex-workspace',
      storage: chromeLocalStorage,
      // Don't persist authUser — always re-hydrated from Supabase session
      partialize: (s) => ({
        currentWorkspaceId: s.currentWorkspaceId,
        userId: s.userId,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);

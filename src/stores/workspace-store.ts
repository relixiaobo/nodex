/**
 * Workspace & user authentication store.
 *
 * Persisted to chrome.storage.local.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chromeLocalStorage } from '../lib/chrome-storage';

interface WorkspaceStore {
  currentWorkspaceId: string | null;
  userId: string | null;
  isAuthenticated: boolean;

  setWorkspace(workspaceId: string): void;
  setUser(userId: string): void;
  logout(): void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      userId: null,
      isAuthenticated: false,

      setWorkspace: (workspaceId) => set({ currentWorkspaceId: workspaceId }),

      setUser: (userId) => set({ userId, isAuthenticated: true }),

      logout: () =>
        set({
          userId: null,
          isAuthenticated: false,
          currentWorkspaceId: null,
        }),
    }),
    {
      name: 'nodex-workspace',
      storage: chromeLocalStorage,
    },
  ),
);

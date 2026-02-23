/**
 * Zustand store for sync status — drives SyncStatusIndicator UI.
 *
 * Subscribes to SyncManager state changes and exposes reactive state.
 */
import { create } from 'zustand';
import { syncManager, type SyncState, type SyncStatus } from '../lib/sync/sync-manager.js';

interface SyncStore extends SyncState {
  /** Update from SyncManager callback. */
  _update: (state: Partial<SyncState>) => void;
}

export const useSyncStore = create<SyncStore>((set) => {
  // Wire SyncManager → Zustand
  syncManager.onStateChange((state) => set(state));

  // Listen for online/offline
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (syncManager.getState().status === 'offline') {
        syncManager.nudge();
      }
    });
    window.addEventListener('offline', () => {
      set({ status: 'offline' });
    });
  }

  return {
    status: 'local-only' as SyncStatus,
    lastSyncedAt: null,
    pendingCount: 0,
    error: null,
    _update: (partial) => set(partial),
  };
});

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
      // Do not surface sync UI when sync has never started (local-only mode).
      if (syncManager.getState().status === 'local-only') return;
      set({ status: 'offline' });
    });
  }

  return {
    ...syncManager.getState(),
    _update: (partial) => set(partial),
  };
});

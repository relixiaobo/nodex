/**
 * Temporary sync diagnostics logger.
 *
 * Enable in DevTools console:
 *   window.__NODEX_SYNC_DIAG__ = true
 * Or persist across reloads:
 *   localStorage.setItem('__NODEX_SYNC_DIAG__', 'true')
 */

export type SyncDiagPayload = Record<string, unknown>;

const DIAG_FLAG = '__NODEX_SYNC_DIAG__';

type DiagGlobal = typeof globalThis & { [DIAG_FLAG]?: unknown };

export function isSyncDiagEnabled(): boolean {
  if ((globalThis as DiagGlobal)[DIAG_FLAG] === true) return true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(DIAG_FLAG) === 'true') {
      return true;
    }
  } catch {
    // Ignore storage access errors (private mode / blocked storage).
  }
  return false;
}

export function syncDiagLog(event: string, payload?: SyncDiagPayload): void {
  if (!isSyncDiagEnabled()) return;
  if (payload) {
    console.log(`[sync:diag] ${event}`, payload);
    return;
  }
  console.log(`[sync:diag] ${event}`);
}

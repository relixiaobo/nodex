/**
 * Temporary sync diagnostics logger.
 *
 * Enable in DevTools console:
 *   window.__NODEX_SYNC_DIAG__ = true
 */

export type SyncDiagPayload = Record<string, unknown>;

const DIAG_FLAG = '__NODEX_SYNC_DIAG__';

type DiagGlobal = typeof globalThis & { [DIAG_FLAG]?: unknown };

export function isSyncDiagEnabled(): boolean {
  return (globalThis as DiagGlobal)[DIAG_FLAG] === true;
}

export function syncDiagLog(event: string, payload?: SyncDiagPayload): void {
  if (!isSyncDiagEnabled()) return;
  if (payload) {
    console.log(`[sync:diag] ${event}`, payload);
    return;
  }
  console.log(`[sync:diag] ${event}`);
}

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isSyncDiagEnabled, syncDiagLog } from '../../src/lib/sync/diagnostics.js';

describe('sync diagnostics logger', () => {
  const g = globalThis as typeof globalThis & { __NODEX_SYNC_DIAG__?: boolean };

  beforeEach(() => {
    delete g.__NODEX_SYNC_DIAG__;
    localStorage.removeItem('__NODEX_SYNC_DIAG__');
  });

  afterEach(() => {
    delete g.__NODEX_SYNC_DIAG__;
    localStorage.removeItem('__NODEX_SYNC_DIAG__');
  });

  it('is disabled by default', () => {
    expect(isSyncDiagEnabled()).toBe(false);
  });

  it('logs only when enabled', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    syncDiagLog('no-output');
    expect(logSpy).not.toHaveBeenCalled();

    g.__NODEX_SYNC_DIAG__ = true;
    syncDiagLog('event-1', { a: 1 });

    expect(logSpy).toHaveBeenCalledWith('[sync:diag] event-1', { a: 1 });
    logSpy.mockRestore();
  });

  it('supports persistent localStorage flag', () => {
    expect(isSyncDiagEnabled()).toBe(false);
    localStorage.setItem('__NODEX_SYNC_DIAG__', 'true');
    expect(isSyncDiagEnabled()).toBe(true);
  });
});

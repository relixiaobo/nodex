/**
 * Default workspace ID generation and persistence.
 *
 * Generates a persistent unique workspace ID (`ws_{nanoid()}`) for unauthenticated users,
 * replacing the previous hardcoded `ws_default`. This ensures each device/profile
 * has a unique workspace ID, which is required for future multi-device sync.
 *
 * Uses localStorage (standalone/dev) or chrome.storage.local (extension).
 */
import { nanoid } from 'nanoid';

const STORAGE_KEY = 'nodex_default_workspace_id';
const WORKSPACE_ID_LOCK_NAME = 'nodex-default-workspace-id';

// Deduplicate concurrent first-run bootstrap calls in the same JS context.
let pendingDefaultWorkspaceId: Promise<string> | null = null;

const hasChromeStorage =
  typeof chrome !== 'undefined' &&
  chrome.storage &&
  chrome.storage.local;

async function getItem(key: string): Promise<string | null> {
  if (hasChromeStorage) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string) ?? null;
  }
  return localStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (hasChromeStorage) {
    await chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem(key, value);
  }
}

function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.locks?.request;
}

async function withWorkspaceIdLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!hasWebLocks()) return fn();
  return navigator.locks.request(WORKSPACE_ID_LOCK_NAME, { mode: 'exclusive' }, fn);
}

async function getOrCreateDefaultWorkspaceIdUnlocked(): Promise<string> {
  const existing = await getItem(STORAGE_KEY);
  if (existing) return existing;

  const generated = `ws_${nanoid()}`;
  await setItem(STORAGE_KEY, generated);

  // Re-read after write so the caller returns the canonical value if another
  // context won the race and overwrote the key before we resume.
  return (await getItem(STORAGE_KEY)) ?? generated;
}

/**
 * Get or create a persistent default workspace ID.
 * First call generates `ws_{nanoid()}` and persists it.
 * Subsequent calls return the same ID.
 */
export async function getOrCreateDefaultWorkspaceId(): Promise<string> {
  if (pendingDefaultWorkspaceId) return pendingDefaultWorkspaceId;

  const pending = withWorkspaceIdLock(() => getOrCreateDefaultWorkspaceIdUnlocked());
  pendingDefaultWorkspaceId = pending;
  try {
    return await pending;
  } finally {
    if (pendingDefaultWorkspaceId === pending) pendingDefaultWorkspaceId = null;
  }
}

/** Storage key — exposed for tests */
export const DEFAULT_WORKSPACE_STORAGE_KEY = STORAGE_KEY;

/** Reset module-level in-flight state — exposed for tests */
export function _resetWorkspaceIdCacheForTest(): void {
  pendingDefaultWorkspaceId = null;
}

/**
 * HTTP sync protocol client — push/pull requests to the sync server.
 */

const SYNC_API_URL = import.meta.env.VITE_SYNC_API_URL ?? 'http://localhost:8787';

// ---------------------------------------------------------------------------
// Types (mirror server/src/lib/protocol.ts)
// ---------------------------------------------------------------------------

export interface PushRequest {
  workspaceId: string;
  deviceId: string;
  updates: string;      // Base64
  updateHash: string;   // SHA-256 hex
  clientVV: string;     // Base64
}

export interface PushResponse {
  seq: number;
  deduped: boolean;
  serverVV: null;
}

export interface PullRequest {
  workspaceId: string;
  deviceId: string;
  lastSeq: number;
}

export interface PullUpdateEntry {
  seq: number;
  data: string;         // Base64
  deviceId: string;
}

export interface PullResponseIncremental {
  type: 'incremental';
  updates: PullUpdateEntry[];
  latestSeq: number;
  nextCursorSeq: number;
  hasMore: boolean;
}

export interface PullResponseSnapshot {
  type: 'snapshot';
  snapshot: string;
  snapshotSeq: number;
  updates: PullUpdateEntry[];
  latestSeq: number;
  nextCursorSeq: number;
  hasMore: boolean;
}

export type PullResponse = PullResponseIncremental | PullResponseSnapshot;

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// SHA-256 (Web Crypto)
// ---------------------------------------------------------------------------

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// ---------------------------------------------------------------------------
// HTTP requests
// ---------------------------------------------------------------------------

export async function pushUpdate(
  token: string,
  body: PushRequest,
): Promise<PushResponse> {
  const res = await fetch(`${SYNC_API_URL}/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new AuthError('Session expired');
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: string };
    throw new SyncError(`Push failed: ${res.status} — ${errBody.error ?? 'unknown'}`);
  }

  return res.json() as Promise<PushResponse>;
}

export async function pullUpdates(
  token: string,
  body: PullRequest,
): Promise<PullResponse> {
  const res = await fetch(`${SYNC_API_URL}/sync/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new AuthError('Session expired');
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: string };
    throw new SyncError(`Pull failed: ${res.status} — ${errBody.error ?? 'unknown'}`);
  }

  return res.json() as Promise<PullResponse>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

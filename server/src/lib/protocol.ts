/**
 * Sync protocol types and Base64 encoding/decoding helpers.
 */

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export interface PushRequest {
  workspaceId: string;
  deviceId: string;
  updates: string;      // Base64-encoded Uint8Array
  updateHash: string;   // SHA-256 hex
  clientVV: string;     // Base64-encoded VersionVector (observational, v1)
}

export interface PushResponse {
  seq: number;
  deduped: boolean;
  serverVV: null;       // v1: not maintained
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export interface PullRequest {
  workspaceId: string;
  deviceId: string;
  lastSeq: number;
}

export interface PullUpdateEntry {
  seq: number;
  data: string;         // Base64-encoded Uint8Array
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
  snapshot: string;       // Base64-encoded full snapshot
  snapshotSeq: number;
  updates: PullUpdateEntry[];
  latestSeq: number;
  nextCursorSeq: number;
  hasMore: boolean;
}

export type PullResponse = PullResponseIncremental | PullResponseSnapshot;

// ---------------------------------------------------------------------------
// Base64 helpers (Workers runtime has btoa/atob)
// ---------------------------------------------------------------------------

/** Encode Uint8Array → Base64 string. */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode Base64 string → Uint8Array. */
export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

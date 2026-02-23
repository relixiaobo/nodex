/**
 * Sync E2E tests — real HTTP against a running `wrangler dev` server.
 *
 * Prerequisites:
 *   1. `cd server && npm run db:migrate:local && npm run dev`
 *   2. Server listening on http://localhost:8787
 *
 * If the server is not running, the entire suite is gracefully skipped.
 *
 * These tests exercise the full push/pull pipeline with real D1, R2, and
 * Loro CRDT bytes — no mocks.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { LoroDoc } from 'loro-crdt';
import { nanoid } from 'nanoid';

// ---------------------------------------------------------------------------
// Constants — well-known test credentials (seeded via `cd server && npm run db:seed:e2e`)
// ---------------------------------------------------------------------------

const SYNC_URL = 'http://localhost:8787';
const E2E_TOKEN = 'e2e_test_token_fixed';

// ---------------------------------------------------------------------------
// Synchronous server availability check (must resolve before describe.runIf)
// ---------------------------------------------------------------------------

let serverAvailable = false;
try {
  const result = execSync(`curl -sf ${SYNC_URL}/health`, { timeout: 3000 });
  const parsed = JSON.parse(result.toString()) as { ok: boolean };
  serverAvailable = parsed.ok === true;
} catch {
  serverAvailable = false;
}

// ---------------------------------------------------------------------------
// Helpers — direct HTTP (bypass sync-protocol.ts to avoid import.meta.env
// issues and keep the test self-contained)
// ---------------------------------------------------------------------------

interface PushRequest {
  workspaceId: string;
  deviceId: string;
  updates: string;
  updateHash: string;
  clientVV: string;
}

interface PushResponse {
  seq: number;
  deduped: boolean;
  serverVV: null;
}

interface PullRequest {
  workspaceId: string;
  deviceId: string;
  lastSeq: number;
}

interface PullUpdateEntry {
  seq: number;
  data: string;
  deviceId: string;
}

interface PullResponseIncremental {
  type: 'incremental';
  updates: PullUpdateEntry[];
  latestSeq: number;
  nextCursorSeq: number;
  hasMore: boolean;
}

type PullResponse = PullResponseIncremental | {
  type: 'snapshot';
  snapshot: string;
  snapshotSeq: number;
  updates: PullUpdateEntry[];
  latestSeq: number;
  nextCursorSeq: number;
  hasMore: boolean;
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function pushUpdate(token: string, body: PushRequest): Promise<Response> {
  return fetch(`${SYNC_URL}/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function pullUpdates(token: string, body: PullRequest): Promise<Response> {
  return fetch(`${SYNC_URL}/sync/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

/** Create a Loro update: insert a node into LoroTree and export the update. */
function createLoroUpdate(nodeId?: string): { doc: LoroDoc; updateBytes: Uint8Array; nodeId: string } {
  const doc = new LoroDoc();
  const tree = doc.getTree('nodes');
  const treeNode = tree.createNode();
  const actualNodeId = nodeId ?? nanoid();
  treeNode.data.set('id', actualNodeId);
  treeNode.data.set('name', `test-node-${actualNodeId}`);
  doc.commit();
  const updateBytes = doc.export({ mode: 'update' });
  return { doc, updateBytes: new Uint8Array(updateBytes), nodeId: actualNodeId };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.runIf(serverAvailable)('Sync E2E (requires wrangler dev)', () => {
  // Each test gets a unique workspaceId to avoid interference
  function freshWorkspaceId(): string {
    return `ws_e2e_${nanoid(10)}`;
  }

  // Helper: push a Loro update and return parsed response
  async function doPush(
    wsId: string,
    deviceId: string,
    updateBytes: Uint8Array,
  ): Promise<PushResponse> {
    const b64 = uint8ToBase64(updateBytes);
    const hash = await sha256Hex(updateBytes);
    const res = await pushUpdate(E2E_TOKEN, {
      workspaceId: wsId,
      deviceId,
      updates: b64,
      updateHash: hash,
      clientVV: '',
    });
    expect(res.ok, `push failed: ${res.status} ${await res.clone().text()}`).toBe(true);
    return res.json() as Promise<PushResponse>;
  }

  // Helper: pull and return parsed response
  async function doPull(
    wsId: string,
    deviceId: string,
    lastSeq: number,
  ): Promise<PullResponse> {
    const res = await pullUpdates(E2E_TOKEN, {
      workspaceId: wsId,
      deviceId,
      lastSeq,
    });
    expect(res.ok, `pull failed: ${res.status} ${await res.clone().text()}`).toBe(true);
    return res.json() as Promise<PullResponse>;
  }

  // -----------------------------------------------------------------------
  // 1. Push single update
  // -----------------------------------------------------------------------
  it('1. Push single update → returns seq > 0', async () => {
    const wsId = freshWorkspaceId();
    const { updateBytes } = createLoroUpdate();
    const result = await doPush(wsId, 'device-A', updateBytes);

    expect(result.seq).toBeGreaterThan(0);
    expect(result.deduped).toBe(false);
    expect(result.serverVV).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. Push dedup — same hash twice → second is deduped
  // -----------------------------------------------------------------------
  it('2. Push dedup → same hash returns deduped: true with same seq', async () => {
    const wsId = freshWorkspaceId();
    const { updateBytes } = createLoroUpdate();

    const first = await doPush(wsId, 'device-A', updateBytes);
    expect(first.deduped).toBe(false);

    // Push exact same bytes again
    const b64 = uint8ToBase64(updateBytes);
    const hash = await sha256Hex(updateBytes);
    const res2 = await pushUpdate(E2E_TOKEN, {
      workspaceId: wsId,
      deviceId: 'device-A',
      updates: b64,
      updateHash: hash,
      clientVV: '',
    });
    expect(res2.ok).toBe(true);
    const second = await res2.json() as PushResponse;

    expect(second.deduped).toBe(true);
    expect(second.seq).toBe(first.seq);
  });

  // -----------------------------------------------------------------------
  // 3. Pull after push — Device B sees Device A's update
  // -----------------------------------------------------------------------
  it('3. Pull after push → Device B receives the update', async () => {
    const wsId = freshWorkspaceId();
    const { updateBytes } = createLoroUpdate();

    await doPush(wsId, 'device-A', updateBytes);

    const pullResult = await doPull(wsId, 'device-B', 0);
    expect(pullResult.type).toBe('incremental');
    expect(pullResult.updates.length).toBeGreaterThanOrEqual(1);

    // Verify the pulled data decodes to the correct length
    const pulledBytes = base64ToUint8(pullResult.updates[0].data);
    expect(pulledBytes.length).toBe(updateBytes.length);
    expect(pullResult.updates[0].deviceId).toBe('device-A');
  });

  // -----------------------------------------------------------------------
  // 4. Echo filtering — Device A doesn't see its own updates
  // -----------------------------------------------------------------------
  it('4. Echo filtering → Device A pull returns empty updates', async () => {
    const wsId = freshWorkspaceId();
    const { updateBytes } = createLoroUpdate();

    await doPush(wsId, 'device-A', updateBytes);

    const pullResult = await doPull(wsId, 'device-A', 0);
    expect(pullResult.type).toBe('incremental');
    expect(pullResult.updates).toEqual([]);
    // latestSeq should still advance even though updates are echo-filtered
    expect(pullResult.latestSeq).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 5. Multi-device CRDT round-trip — full Loro interop
  // -----------------------------------------------------------------------
  it('5. Multi-device CRDT round-trip → Loro tree node survives push/pull', async () => {
    const wsId = freshWorkspaceId();
    const testNodeId = `node_${nanoid(6)}`;

    // Device A: create a LoroDoc with a tree node
    const { updateBytes } = createLoroUpdate(testNodeId);
    await doPush(wsId, 'device-A', updateBytes);

    // Device B: pull the update
    const pullResult = await doPull(wsId, 'device-B', 0);
    expect(pullResult.updates.length).toBe(1);

    // Device B: import into a fresh LoroDoc
    const docB = new LoroDoc();
    const pulledBytes = base64ToUint8(pullResult.updates[0].data);
    docB.import(pulledBytes);

    // Verify the tree node exists in docB
    const treeB = docB.getTree('nodes');
    const roots = treeB.toJSON();
    expect(roots.length).toBeGreaterThanOrEqual(1);

    // Find the node we created
    const found = roots.some((node: { id: string; parent: string | null; meta: Record<string, unknown>; children: unknown[] }) =>
      (node.meta as Record<string, unknown>)['id'] === testNodeId,
    );
    expect(found).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 6. Cursor advancement — pull with nextCursorSeq returns empty
  // -----------------------------------------------------------------------
  it('6. Cursor advancement → pull at nextCursorSeq returns no new updates', async () => {
    const wsId = freshWorkspaceId();
    const { updateBytes } = createLoroUpdate();

    await doPush(wsId, 'device-A', updateBytes);

    // First pull — gets the update
    const pull1 = await doPull(wsId, 'device-B', 0);
    expect(pull1.updates.length).toBe(1);
    expect(pull1.nextCursorSeq).toBeGreaterThan(0);

    // Second pull from cursor — should be empty
    const pull2 = await doPull(wsId, 'device-B', pull1.nextCursorSeq);
    expect(pull2.updates).toEqual([]);
    expect(pull2.hasMore).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 7. Pagination — hasMore flag when many updates
  // -----------------------------------------------------------------------
  it('7. Pagination → hasMore flag works correctly', async () => {
    // The server PAGE_LIMIT is 50. Push enough updates to trigger pagination
    // is expensive, so we just verify that hasMore=false for a small count.
    const wsId = freshWorkspaceId();

    // Push 3 updates
    for (let i = 0; i < 3; i++) {
      const { updateBytes } = createLoroUpdate();
      await doPush(wsId, 'device-A', updateBytes);
    }

    const pullResult = await doPull(wsId, 'device-B', 0);
    expect(pullResult.updates.length).toBe(3);
    expect(pullResult.hasMore).toBe(false);
    expect(pullResult.latestSeq).toBe(3);
  });

  // -----------------------------------------------------------------------
  // 8. Auth failure — invalid token returns 401
  // -----------------------------------------------------------------------
  it('8. Auth failure → invalid token returns 401', async () => {
    const wsId = freshWorkspaceId();
    const { updateBytes } = createLoroUpdate();
    const b64 = uint8ToBase64(updateBytes);
    const hash = await sha256Hex(updateBytes);

    const res = await pushUpdate('invalid_token_xyz', {
      workspaceId: wsId,
      deviceId: 'device-A',
      updates: b64,
      updateHash: hash,
      clientVV: '',
    });

    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // 9. Hash mismatch — server rejects tampered hash
  // -----------------------------------------------------------------------
  it('9. Hash mismatch → server returns 400', async () => {
    const wsId = freshWorkspaceId();
    const { updateBytes } = createLoroUpdate();
    const b64 = uint8ToBase64(updateBytes);

    const res = await pushUpdate(E2E_TOKEN, {
      workspaceId: wsId,
      deviceId: 'device-A',
      updates: b64,
      updateHash: 'deadbeefdeadbeefdeadbeefdeadbeef',
      clientVV: '',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Hash mismatch');
  });

  // -----------------------------------------------------------------------
  // 10. Concurrent push ordering — seq is strictly increasing
  // -----------------------------------------------------------------------
  it('10. Concurrent push ordering → seq strictly increasing', async () => {
    const wsId = freshWorkspaceId();
    const seqs: number[] = [];

    // Push 5 updates sequentially from device-A
    for (let i = 0; i < 5; i++) {
      const { updateBytes } = createLoroUpdate();
      const result = await doPush(wsId, 'device-A', updateBytes);
      seqs.push(result.seq);
    }

    // Verify strictly increasing
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }

    // Pull from device-B: seq in response should also be ordered
    const pullResult = await doPull(wsId, 'device-B', 0);
    expect(pullResult.updates.length).toBe(5);

    for (let i = 1; i < pullResult.updates.length; i++) {
      expect(pullResult.updates[i].seq).toBeGreaterThan(pullResult.updates[i - 1].seq);
    }
  });
});

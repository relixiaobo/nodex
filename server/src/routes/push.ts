/**
 * POST /sync/push — Accept incremental CRDT updates from clients.
 *
 * Flow:
 *   1. Parse & validate request body
 *   2. Base64-decode updates, verify SHA-256 hash
 *   3. Ensure workspace exists (auto-create on first push)
 *   4. Check ownership
 *   5. Dedup check (idempotent by updateHash)
 *   6. Write blob to R2 (before D1 to avoid seq holes)
 *   7. D1 transaction: allocate seq + insert metadata + upsert device
 *   8. Return { seq, deduped, serverVV }
 */
import type { Context } from 'hono';
import type { Env } from '../types.js';
import type { AuthVariables } from '../middleware/auth.js';
import type { PushRequest, PushResponse } from '../lib/protocol.js';
import { base64ToUint8 } from '../lib/protocol.js';
import { sha256Hex } from '../lib/hash.js';
import { putUpdate } from '../lib/r2.js';
import {
  ensureWorkspace,
  getWorkspace,
  findUpdateByHash,
  allocateSeqAndInsert,
} from '../lib/db.js';
import { shouldCompact, compactWorkspace } from '../lib/compaction.js';

const MAX_UPDATE_SIZE = 50 * 1024 * 1024; // 50 MB

export async function handlePush(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
): Promise<Response> {
  const userId = c.get('userId');

  // 1. Parse request body
  let body: PushRequest;
  try {
    body = await c.req.json<PushRequest>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { workspaceId, deviceId, updates, updateHash, clientVV } = body;

  if (!workspaceId || !deviceId || !updates || !updateHash) {
    return c.json({ error: 'Missing required fields: workspaceId, deviceId, updates, updateHash' }, 400);
  }

  // 2. Base64-decode and verify hash
  let updateBytes: Uint8Array;
  try {
    updateBytes = base64ToUint8(updates);
  } catch {
    return c.json({ error: 'Invalid Base64 in updates field' }, 400);
  }

  if (updateBytes.length === 0) {
    return c.json({ error: 'Empty update bytes' }, 400);
  }

  if (updateBytes.length > MAX_UPDATE_SIZE) {
    return c.json({ error: 'Update too large (max 50MB)' }, 413);
  }

  const computedHash = await sha256Hex(updateBytes);
  if (computedHash !== updateHash) {
    return c.json({ error: 'Hash mismatch — updateHash does not match update content' }, 400);
  }

  const db = c.env.SYNC_DB;
  const bucket = c.env.SYNC_BUCKET;

  // 3. Ensure workspace exists (auto-create on first push)
  await ensureWorkspace(db, workspaceId, userId);

  // 4. Check ownership
  const ws = await getWorkspace(db, workspaceId);
  if (!ws || ws.owner_id !== userId) {
    return c.json({ error: 'Forbidden — not workspace owner' }, 403);
  }

  // 5. Dedup check
  const existingSeq = await findUpdateByHash(db, workspaceId, updateHash);
  if (existingSeq !== null) {
    return c.json({
      seq: existingSeq,
      deduped: true,
      serverVV: null,
    } satisfies PushResponse);
  }

  // 6. Write blob to R2 first (avoid seq holes if R2 fails)
  const r2Key = await putUpdate(bucket, workspaceId, updateHash, updateBytes);

  // 7. D1 transaction: allocate seq + insert + upsert device
  try {
    const seq = await allocateSeqAndInsert(
      db, workspaceId, deviceId, userId, updateHash, r2Key, updateBytes.length,
    );

    // 8. Trigger compaction in the background if needed (non-blocking).
    // Use returned `seq` as latestSeq; `ws.snapshot_seq` from the earlier read
    // is still valid since only compaction updates it (and compaction is serialized).
    if (shouldCompact(seq, ws.snapshot_seq)) {
      c.executionCtx.waitUntil(
        compactWorkspace(db, bucket, workspaceId, seq, ws.snapshot_seq)
          .catch(err => console.error('[compaction] failed:', err))
      );
    }

    // 9. Return success
    return c.json({
      seq,
      deduped: false,
      serverVV: null,
    } satisfies PushResponse);
  } catch (err) {
    console.error('[push] D1 transaction error:', err);
    // R2 blob may be orphaned — acceptable per design (cleanup later)
    return c.json({ error: 'Internal server error during seq allocation' }, 500);
  }
}

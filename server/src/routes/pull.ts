/**
 * POST /sync/pull — Return missing incremental updates (or snapshot + updates).
 *
 * Flow:
 *   1. Parse & validate request body
 *   2. Get workspace metadata (latest_seq, snapshot info)
 *   3. If already up-to-date → empty incremental response
 *   4. If needs snapshot (lastSeq < snapshot_seq or lastSeq == 0 with snapshot) → snapshot + trailing updates
 *   5. Otherwise → incremental updates from D1 + R2
 *   6. Echo-filter: exclude updates from the requesting device
 *   7. Update device pull cursor
 */
import type { Context } from 'hono';
import type { Env } from '../types.js';
import type { AuthVariables } from '../middleware/auth.js';
import type { PullRequest, PullResponse, PullUpdateEntry } from '../lib/protocol.js';
import { uint8ToBase64 } from '../lib/protocol.js';
import { getUpdate, getSnapshot } from '../lib/r2.js';
import { getWorkspace, getUpdatesAfter, updateDevicePullCursor } from '../lib/db.js';

const PAGE_LIMIT = 200;

export async function handlePull(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
): Promise<Response> {
  const userId = c.get('userId');

  // 1. Parse request body
  let body: PullRequest;
  try {
    body = await c.req.json<PullRequest>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { workspaceId, deviceId, lastSeq } = body;

  if (!workspaceId || !deviceId || lastSeq === undefined || lastSeq === null) {
    return c.json({ error: 'Missing required fields: workspaceId, deviceId, lastSeq' }, 400);
  }

  if (typeof lastSeq !== 'number' || lastSeq < 0) {
    return c.json({ error: 'lastSeq must be a non-negative number' }, 400);
  }

  const db = c.env.SYNC_DB;
  const bucket = c.env.SYNC_BUCKET;

  // 2. Get workspace metadata
  const ws = await getWorkspace(db, workspaceId);

  if (!ws) {
    // Workspace doesn't exist yet — nothing to pull
    return c.json({
      type: 'incremental',
      updates: [],
      latestSeq: 0,
      nextCursorSeq: 0,
      hasMore: false,
    } satisfies PullResponse);
  }

  // Check ownership
  if (ws.owner_id !== userId) {
    return c.json({ error: 'Forbidden — not workspace owner' }, 403);
  }

  const { latest_seq: latestSeq, snapshot_seq: snapshotSeq, snapshot_key: snapshotKey } = ws;

  // 3. Already up-to-date
  if (lastSeq >= latestSeq) {
    return c.json({
      type: 'incremental',
      updates: [],
      latestSeq,
      nextCursorSeq: lastSeq,
      hasMore: false,
    } satisfies PullResponse);
  }

  // 4. Needs snapshot? (first sync or client is behind snapshot)
  const needsSnapshot = snapshotSeq > 0 && (lastSeq === 0 || lastSeq < snapshotSeq);

  if (needsSnapshot && !snapshotKey) {
    console.error(
      `[pull] ${workspaceId}: snapshot_seq=${snapshotSeq} but snapshot_key is null`,
    );
    return c.json({ error: 'Snapshot metadata inconsistency — please contact support' }, 500);
  }

  if (needsSnapshot && snapshotKey) {
    const snapshotBytes = await getSnapshot(bucket, snapshotKey);

    if (snapshotBytes) {
      // Get updates after snapshot
      const afterSeq = snapshotSeq;
      const rows = await getUpdatesAfter(db, workspaceId, afterSeq, PAGE_LIMIT);
      const nextCursorSeq = rows.length > 0 ? rows[rows.length - 1].seq : snapshotSeq;

      // Read R2 blobs and echo-filter
      const updates = await readAndFilterUpdates(bucket, rows, deviceId);

      await updateDevicePullCursor(db, workspaceId, deviceId, userId, nextCursorSeq);

      return c.json({
        type: 'snapshot',
        snapshot: uint8ToBase64(snapshotBytes),
        snapshotSeq,
        updates,
        latestSeq,
        nextCursorSeq,
        hasMore: rows.length >= PAGE_LIMIT,
      } satisfies PullResponse);
    }
    // Snapshot key exists but R2 blob missing — data loss detected.
    // Compaction has already deleted update rows <= snapshotSeq from D1,
    // so falling through to incremental would silently return incomplete data.
    console.error(
      `[pull] ${workspaceId}: snapshot blob missing at key=${snapshotKey}, ` +
      `snapshot_seq=${snapshotSeq}. Client will receive incomplete data.`,
    );
    return c.json({ error: 'Snapshot blob missing — please contact support' }, 500);
  }

  // 5. Incremental updates
  const rows = await getUpdatesAfter(db, workspaceId, lastSeq, PAGE_LIMIT);
  const nextCursorSeq = rows.length > 0 ? rows[rows.length - 1].seq : lastSeq;

  // Read R2 blobs and echo-filter
  const updates = await readAndFilterUpdates(bucket, rows, deviceId);

  // 6. Update device pull cursor
  await updateDevicePullCursor(db, workspaceId, deviceId, userId, nextCursorSeq);

  return c.json({
    type: 'incremental',
    updates,
    latestSeq,
    nextCursorSeq,
    hasMore: rows.length >= PAGE_LIMIT,
  } satisfies PullResponse);
}

/**
 * Read update blobs from R2 and filter out echoes (updates from the requesting device).
 * Echo filtering happens at the response level — cursor still advances past echoed entries.
 */
async function readAndFilterUpdates(
  bucket: R2Bucket,
  rows: { seq: number; device_id: string; r2_key: string }[],
  requestingDeviceId: string,
): Promise<PullUpdateEntry[]> {
  const updates: PullUpdateEntry[] = [];

  for (const row of rows) {
    // Echo filter: skip updates from the requesting device
    if (row.device_id === requestingDeviceId) continue;

    const bytes = await getUpdate(bucket, row.r2_key);
    if (!bytes) continue; // R2 blob missing — skip gracefully

    updates.push({
      seq: row.seq,
      data: uint8ToBase64(bytes),
      deviceId: row.device_id,
    });
  }

  return updates;
}

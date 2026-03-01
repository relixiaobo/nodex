/**
 * D1 query helpers for sync metadata tables.
 */

// ---------------------------------------------------------------------------
// Row types (matching D1 column names)
// ---------------------------------------------------------------------------

export interface SyncWorkspaceRow {
  workspace_id: string;
  owner_id: string;
  latest_seq: number;
  snapshot_seq: number;
  snapshot_key: string | null;
  snapshot_vv: string | null;
  snapshot_size: number;
  created_at: string;
  updated_at: string;
}

export interface SyncUpdateRow {
  workspace_id: string;
  seq: number;
  device_id: string;
  user_id: string;
  update_hash: string;
  r2_key: string;
  size_bytes: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Workspace queries
// ---------------------------------------------------------------------------

/** Get workspace sync metadata. Returns null if not found. */
export async function getWorkspace(
  db: D1Database,
  workspaceId: string,
): Promise<SyncWorkspaceRow | null> {
  return db.prepare(
    'SELECT * FROM sync_workspaces WHERE workspace_id = ?'
  ).bind(workspaceId).first<SyncWorkspaceRow>();
}

/** Create workspace if it doesn't exist (first push). */
export async function ensureWorkspace(
  db: D1Database,
  workspaceId: string,
  ownerId: string,
): Promise<void> {
  await db.prepare(
    'INSERT OR IGNORE INTO sync_workspaces (workspace_id, owner_id) VALUES (?, ?)'
  ).bind(workspaceId, ownerId).run();
}

// ---------------------------------------------------------------------------
// Dedup check
// ---------------------------------------------------------------------------

/** Check if an update with this hash already exists. Returns seq if found. */
export async function findUpdateByHash(
  db: D1Database,
  workspaceId: string,
  updateHash: string,
): Promise<number | null> {
  const row = await db.prepare(
    'SELECT seq FROM sync_updates WHERE workspace_id = ? AND update_hash = ?'
  ).bind(workspaceId, updateHash).first<{ seq: number }>();
  return row?.seq ?? null;
}

// ---------------------------------------------------------------------------
// Atomic seq allocation + insert (single D1 batch = single transaction)
// ---------------------------------------------------------------------------

/**
 * Atomically allocate next seq, insert update metadata, and upsert device cursor.
 *
 * Uses a single db.batch() call so all statements run within one implicit
 * transaction — no race window between seq allocation and insert.
 *
 * The trick: we can't reference a previous statement's result within the same
 * batch, so we use a subquery `(SELECT latest_seq FROM sync_workspaces ...)`
 * in the INSERT to read the seq that was just incremented in the same tx.
 *
 * Returns the allocated seq number (read back from the UPDATE ... RETURNING).
 */
export async function allocateSeqAndInsert(
  db: D1Database,
  workspaceId: string,
  deviceId: string,
  userId: string,
  updateHash: string,
  r2Key: string,
  sizeBytes: number,
): Promise<number> {
  const results = await db.batch([
    // 1. Increment seq and return it via RETURNING (D1/SQLite supports this)
    db.prepare(
      `UPDATE sync_workspaces
       SET latest_seq = latest_seq + 1, updated_at = datetime('now')
       WHERE workspace_id = ?
       RETURNING latest_seq`
    ).bind(workspaceId),

    // 2. Insert update metadata — subquery reads the seq just incremented above
    db.prepare(
      `INSERT INTO sync_updates (workspace_id, seq, device_id, user_id, update_hash, r2_key, size_bytes)
       VALUES (?, (SELECT latest_seq FROM sync_workspaces WHERE workspace_id = ?), ?, ?, ?, ?, ?)`
    ).bind(workspaceId, workspaceId, deviceId, userId, updateHash, r2Key, sizeBytes),

    // 3. Upsert device cursor — same subquery for last_push_seq
    db.prepare(
      `INSERT INTO sync_devices (workspace_id, device_id, user_id, last_push_seq, last_seen_at)
       VALUES (?, ?, ?, (SELECT latest_seq FROM sync_workspaces WHERE workspace_id = ?), datetime('now'))
       ON CONFLICT (workspace_id, device_id) DO UPDATE SET
         last_push_seq = (SELECT latest_seq FROM sync_workspaces WHERE workspace_id = ?),
         last_seen_at = datetime('now')`
    ).bind(workspaceId, deviceId, userId, workspaceId, workspaceId),
  ]);

  // Read the new seq from the RETURNING clause of statement 1
  const seqRow = results[0].results[0] as { latest_seq: number } | undefined;
  if (!seqRow) {
    throw new Error(`Failed to allocate seq for workspace ${workspaceId}`);
  }
  return seqRow.latest_seq;
}

// ---------------------------------------------------------------------------
// Pull queries
// ---------------------------------------------------------------------------

/** Get updates after a given seq, ordered by seq. */
export async function getUpdatesAfter(
  db: D1Database,
  workspaceId: string,
  afterSeq: number,
  limit: number = 50,
): Promise<SyncUpdateRow[]> {
  const result = await db.prepare(
    'SELECT * FROM sync_updates WHERE workspace_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?'
  ).bind(workspaceId, afterSeq, limit).all<SyncUpdateRow>();
  return result.results;
}

// ---------------------------------------------------------------------------
// Compaction queries
// ---------------------------------------------------------------------------

/**
 * Get update rows in (afterSeq, upToSeq], ordered by seq.
 * Used by compaction to build a deterministic snapshot target.
 */
export async function getUpdatesInRange(
  db: D1Database,
  workspaceId: string,
  afterSeq: number,
  upToSeq: number,
): Promise<SyncUpdateRow[]> {
  const result = await db.prepare(
    'SELECT * FROM sync_updates WHERE workspace_id = ? AND seq > ? AND seq <= ? ORDER BY seq ASC'
  ).bind(workspaceId, afterSeq, upToSeq).all<SyncUpdateRow>();
  return result.results;
}

/**
 * Update snapshot metadata iff current snapshot is behind the target snapshot seq.
 * Returns true when metadata is updated, false when another compaction already
 * wrote an equal/newer snapshot.
 */
export async function updateSnapshotMetaIfBehind(
  db: D1Database,
  workspaceId: string,
  snapshotSeq: number,
  snapshotKey: string,
  snapshotSize: number,
): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE sync_workspaces
     SET snapshot_seq = ?, snapshot_key = ?, snapshot_size = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND snapshot_seq < ? AND latest_seq >= ?`
  ).bind(snapshotSeq, snapshotKey, snapshotSize, workspaceId, snapshotSeq, snapshotSeq).run();

  return (result.meta?.changes ?? 0) > 0;
}

/** Delete update rows up to a given seq (garbage collection after compaction). */
export async function deleteUpdatesUpTo(
  db: D1Database,
  workspaceId: string,
  upToSeq: number,
): Promise<void> {
  await db.prepare(
    'DELETE FROM sync_updates WHERE workspace_id = ? AND seq <= ?'
  ).bind(workspaceId, upToSeq).run();
}

// ---------------------------------------------------------------------------
// Device cursor queries
// ---------------------------------------------------------------------------

/** Update device pull cursor. */
export async function updateDevicePullCursor(
  db: D1Database,
  workspaceId: string,
  deviceId: string,
  userId: string,
  lastPullSeq: number,
): Promise<void> {
  await db.prepare(
    `INSERT INTO sync_devices (workspace_id, device_id, user_id, last_pull_seq, last_seen_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT (workspace_id, device_id) DO UPDATE SET
       last_pull_seq = ?,
       last_seen_at = datetime('now')`
  ).bind(workspaceId, deviceId, userId, lastPullSeq, lastPullSeq).run();
}

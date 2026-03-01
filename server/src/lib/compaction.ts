/**
 * Loro snapshot compaction — merges accumulated update blobs into a single
 * snapshot so that recovery (pull with lastSeq=0) returns one blob instead
 * of thousands of individual updates.
 *
 * Triggered as a background task (via waitUntil) after each successful push
 * when the number of un-compacted updates exceeds COMPACT_THRESHOLD.
 */
import { LoroDoc } from 'loro-crdt';
import { getSnapshot, getUpdate, putSnapshot } from './r2.js';
import { getAllUpdatesAfter, updateSnapshotMeta, deleteUpdatesUpTo } from './db.js';

/** Compact after this many updates since last snapshot. */
const COMPACT_THRESHOLD = 50;

/** Returns true if the workspace has enough un-compacted updates. */
export function shouldCompact(latestSeq: number, snapshotSeq: number): boolean {
  return (latestSeq - snapshotSeq) >= COMPACT_THRESHOLD;
}

/**
 * Compact a workspace's updates into a single Loro snapshot.
 *
 * Steps:
 *   1. Load existing snapshot (if any)
 *   2. Import all update blobs since last snapshot
 *   3. Export a merged snapshot
 *   4. Write snapshot to R2
 *   5. Update D1 metadata (snapshot_seq, snapshot_key, snapshot_size)
 *   6. Delete compacted update rows from D1
 */
export async function compactWorkspace(
  db: D1Database,
  bucket: R2Bucket,
  workspaceId: string,
  latestSeq: number,
  snapshotSeq: number,
): Promise<void> {
  const doc = new LoroDoc();

  // 1. Load existing snapshot if any
  if (snapshotSeq > 0) {
    const snapshotBytes = await getSnapshot(bucket, workspaceId);
    if (snapshotBytes) {
      doc.import(snapshotBytes);
    }
  }

  // 2. Import all updates after snapshot
  const updates = await getAllUpdatesAfter(db, workspaceId, snapshotSeq);
  if (updates.length === 0) {
    return; // Nothing to compact
  }

  for (const update of updates) {
    const bytes = await getUpdate(bucket, update.r2_key);
    if (bytes) {
      doc.import(bytes);
    }
  }

  // 3. Export compacted snapshot
  const snapshot = doc.export({ mode: 'snapshot' });

  // 4. Store in R2
  const snapshotKey = await putSnapshot(bucket, workspaceId, snapshot);

  // 5. Update D1 metadata
  await updateSnapshotMeta(db, workspaceId, latestSeq, snapshotKey, snapshot.length);

  // 6. Delete compacted update rows from D1 (R2 blobs can be cleaned up later)
  await deleteUpdatesUpTo(db, workspaceId, latestSeq);

  console.log(
    `[compaction] ${workspaceId}: compacted ${updates.length} updates into snapshot ` +
    `(${snapshot.length} bytes), seq ${snapshotSeq} → ${latestSeq}`
  );
}

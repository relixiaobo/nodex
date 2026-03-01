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
import { getUpdatesInRange, updateSnapshotMetaIfBehind, deleteUpdatesUpTo } from './db.js';

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
 *   2. Import updates in (snapshotSeq, latestSeq]
 *   3. Export merged snapshot
 *   4. Write versioned snapshot to R2
 *   5. Conditionally update D1 metadata (skip stale concurrent compactions)
 *   6. Delete compacted update rows from D1 only when step 5 succeeded
 */
export async function compactWorkspace(
  db: D1Database,
  bucket: R2Bucket,
  workspaceId: string,
  latestSeq: number,
  snapshotSeq: number,
  snapshotKey: string | null,
): Promise<void> {
  if (latestSeq <= snapshotSeq) return;

  const doc = new LoroDoc();

  // 1. Load existing snapshot if any
  if (snapshotSeq > 0) {
    if (!snapshotKey) {
      throw new Error(`[compaction] ${workspaceId}: snapshot_seq=${snapshotSeq} but snapshot_key is null`);
    }
    const snapshotBytes = await getSnapshot(bucket, snapshotKey);
    if (!snapshotBytes) {
      throw new Error(`[compaction] ${workspaceId}: missing snapshot blob key=${snapshotKey}`);
    }
    doc.import(snapshotBytes);
  }

  // 2. Import all updates in (snapshotSeq, latestSeq]
  const updates = await getUpdatesInRange(db, workspaceId, snapshotSeq, latestSeq);
  if (updates.length === 0) {
    return;
  }

  for (const update of updates) {
    const bytes = await getUpdate(bucket, update.r2_key);
    if (!bytes) {
      // Fail fast: skipping missing updates can produce an incomplete snapshot,
      // and deleting metadata rows afterwards would lose data.
      throw new Error(
        `[compaction] ${workspaceId}: missing update blob seq=${update.seq} key=${update.r2_key}`,
      );
    }
    doc.import(bytes);
  }

  // 3. Export compacted snapshot
  const snapshot = doc.export({ mode: 'snapshot' });

  // 4. Store in R2 under a versioned key
  const nextSnapshotKey = await putSnapshot(bucket, workspaceId, latestSeq, snapshot);

  // 5. Update D1 metadata only if current snapshot is behind `latestSeq`
  const metadataUpdated = await updateSnapshotMetaIfBehind(
    db,
    workspaceId,
    latestSeq,
    nextSnapshotKey,
    snapshot.length,
  );

  if (!metadataUpdated) {
    console.warn(
      `[compaction] ${workspaceId}: stale run skipped, snapshot already >= ${latestSeq}`,
    );
    return;
  }

  // 6. Delete compacted update rows from D1 (R2 blobs can be cleaned up later)
  await deleteUpdatesUpTo(db, workspaceId, latestSeq);

  console.log(
    `[compaction] ${workspaceId}: compacted ${updates.length} updates into snapshot ` +
    `(${snapshot.length} bytes), seq ${snapshotSeq} → ${latestSeq}`,
  );
}

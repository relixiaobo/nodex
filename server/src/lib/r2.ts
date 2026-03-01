/**
 * R2 storage helpers for sync blobs.
 *
 * Key layout:
 *   {workspaceId}/updates/{updateHash}.bin     — individual update blobs
 *   {workspaceId}/snapshots/{snapshotSeq}.bin  — compacted snapshots (versioned)
 */

/** Write an update blob to R2. Returns the R2 key. */
export async function putUpdate(
  bucket: R2Bucket,
  workspaceId: string,
  updateHash: string,
  data: Uint8Array,
): Promise<string> {
  const key = `${workspaceId}/updates/${updateHash}.bin`;
  await bucket.put(key, data);
  return key;
}

/** Read an update blob from R2. Returns null if not found. */
export async function getUpdate(
  bucket: R2Bucket,
  r2Key: string,
): Promise<Uint8Array | null> {
  const obj = await bucket.get(r2Key);
  if (!obj) return null;
  const buf = await obj.arrayBuffer();
  return new Uint8Array(buf);
}

/** Read a snapshot blob by snapshot key. Returns null if not found. */
export async function getSnapshot(
  bucket: R2Bucket,
  snapshotKey: string,
): Promise<Uint8Array | null> {
  const obj = await bucket.get(snapshotKey);
  if (!obj) return null;
  const buf = await obj.arrayBuffer();
  return new Uint8Array(buf);
}

/** Write a compacted snapshot blob to R2. Returns the versioned snapshot key. */
export async function putSnapshot(
  bucket: R2Bucket,
  workspaceId: string,
  snapshotSeq: number,
  data: Uint8Array,
): Promise<string> {
  const key = `${workspaceId}/snapshots/${snapshotSeq}.bin`;
  await bucket.put(key, data);
  return key;
}

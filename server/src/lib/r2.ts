/**
 * R2 storage helpers for sync blobs.
 *
 * Key layout:
 *   {workspaceId}/snapshot.bin                — latest compacted snapshot
 *   {workspaceId}/updates/{updateHash}.bin    — individual update blobs
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

/** Read the snapshot blob from R2. Returns null if not found. */
export async function getSnapshot(
  bucket: R2Bucket,
  workspaceId: string,
): Promise<Uint8Array | null> {
  const key = `${workspaceId}/snapshot.bin`;
  const obj = await bucket.get(key);
  if (!obj) return null;
  const buf = await obj.arrayBuffer();
  return new Uint8Array(buf);
}

/** Write a compacted snapshot blob to R2. Returns the R2 key. */
export async function putSnapshot(
  bucket: R2Bucket,
  workspaceId: string,
  data: Uint8Array,
): Promise<string> {
  const key = `${workspaceId}/snapshot.bin`;
  await bucket.put(key, data);
  return key;
}

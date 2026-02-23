/**
 * SHA-256 hashing utility.
 * Uses the Web Crypto API available in Cloudflare Workers.
 */

/** Compute SHA-256 hex digest of a Uint8Array. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

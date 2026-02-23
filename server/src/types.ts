/**
 * Cloudflare Worker environment bindings.
 */
export interface Env {
  // D1 database (auth tables + sync metadata)
  SYNC_DB: D1Database;
  // R2 bucket (CRDT blobs — used in later steps)
  SYNC_BUCKET: R2Bucket;

  // Better Auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;

  // Google OAuth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // Chrome Extension ID (for OAuth redirect)
  CHROME_EXTENSION_ID: string;

  // Dev server origin for CORS (optional, defaults to main repo port 5199)
  DEV_ORIGIN?: string;
}

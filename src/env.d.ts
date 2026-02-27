/// <reference types="../.wxt/types" />

// Extend WXT-generated ImportMetaEnv with our custom Vite env vars
interface ImportMetaEnv {
  readonly DEV: boolean;
  /** Sync API URL (Cloudflare Worker). Defaults to http://localhost:8787 */
  readonly VITE_SYNC_API_URL: string;
}

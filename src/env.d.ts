/// <reference types="../.wxt/types" />

// Extend WXT-generated ImportMetaEnv with our custom Vite env vars
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

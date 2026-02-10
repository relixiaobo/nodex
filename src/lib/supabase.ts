/**
 * Supabase client initialization for WXT environment.
 *
 * Reads config from Vite environment variables (VITE_SUPABASE_*).
 * Re-exports getSupabase for convenience.
 */
import { initSupabase, getSupabase } from '../services/supabase.js';

let initialized = false;

export function setupSupabase() {
  if (initialized) return getSupabase();

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    );
  }

  initialized = true;
  return initSupabase(url, key);
}

export { getSupabase };

/**
 * Google OAuth + Supabase Auth flow for Chrome Extension.
 *
 * Uses chrome.identity.launchWebAuthFlow with Supabase's PKCE OAuth flow.
 * The flow: Extension → Supabase /authorize → Google → Supabase callback → Extension
 *
 * This avoids needing to register chromiumapp.org in Google Cloud Console,
 * because Google's redirect goes to Supabase's callback URL (already registered).
 */
import { getSupabase } from '../services/supabase.js';

export interface AuthUser {
  id: string;
  email?: string;
  avatarUrl?: string;
  name?: string;
}

/**
 * Signs in with Google using chrome.identity.launchWebAuthFlow + Supabase PKCE OAuth.
 * Returns the authenticated user on success.
 *
 * Requires:
 *  - Supabase Google provider enabled (Dashboard → Auth → Providers)
 *  - Google OAuth Web Application Client ID + Secret configured in Supabase
 *  - `https://<extension-id>.chromiumapp.org/` added to Supabase redirect URLs
 *  - `identity` permission in manifest
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  const supabase = getSupabase();
  const redirectTo = `https://${chrome.runtime.id}.chromiumapp.org/`;

  // Get OAuth URL from Supabase (PKCE flow, don't redirect the browser)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    throw new Error(error?.message ?? 'Failed to get OAuth URL from Supabase');
  }

  // Launch Chrome identity web auth flow (opens a Google popup)
  const callbackUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: data.url, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!responseUrl) {
          reject(new Error('Authentication was cancelled'));
        } else {
          resolve(responseUrl);
        }
      },
    );
  });

  // Extract the PKCE authorization code from the callback URL
  // Supabase redirects back with: https://<ext-id>.chromiumapp.org/?code=AUTH_CODE
  const url = new URL(callbackUrl);
  const authCode = url.searchParams.get('code');

  if (!authCode) {
    console.error('[auth] No code in callback URL:', callbackUrl);
    throw new Error('Authentication failed — no authorization code received');
  }

  // Exchange PKCE authorization code for Supabase session
  // (Supabase retrieves the stored code_verifier internally)
  const { data: sessionData, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(authCode);

  if (sessionError || !sessionData.user) {
    throw new Error(sessionError?.message ?? 'Failed to exchange code for session');
  }

  return userFromSupabase(sessionData.user);
}

/**
 * Signs out from Supabase.
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Returns the current authenticated user, or null if not authenticated.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return userFromSupabase(data.user);
}

/**
 * Subscribes to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void,
): () => void {
  const supabase = getSupabase();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }
    callback(userFromSupabase(session.user));
  });
  return () => subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function userFromSupabase(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    avatarUrl: user.user_metadata?.['avatar_url'] as string | undefined,
    name: user.user_metadata?.['full_name'] as string | undefined,
  };
}

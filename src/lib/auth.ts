/**
 * Google OAuth + Better Auth flow for Chrome Extension.
 *
 * Flow:
 *   1. Extension opens chrome.identity.launchWebAuthFlow → Worker sign-in URL
 *   2. Worker (Better Auth) redirects to Google → user authenticates
 *   3. Google redirects to Worker callback → Worker creates user + session + sets cookie
 *   4. Worker redirects to /auth/extension-redirect (same domain → cookie is present)
 *   5. /auth/extension-redirect reads session token from cookie, redirects to
 *      https://{ext-id}.chromiumapp.org/?session_token=TOKEN
 *   6. Extension captures URL, extracts token, stores in chrome.storage.local
 *   7. All subsequent API calls use Authorization: Bearer <token>
 */

const STORAGE_KEY = 'auth_session_token';

export interface AuthUser {
  id: string;
  email?: string;
  avatarUrl?: string;
  name?: string;
}

/**
 * Get the sync API base URL.
 */
function getSyncApiUrl(): string {
  return import.meta.env.VITE_SYNC_API_URL ?? 'http://localhost:8787';
}

/**
 * Signs in with Google using chrome.identity.launchWebAuthFlow + Better Auth.
 * Returns the authenticated user on success.
 *
 * Requires:
 *   - Worker running with Better Auth + Google OAuth configured
 *   - Google OAuth redirect URI registered: {WORKER_URL}/api/auth/callback/google
 *   - CHROME_EXTENSION_ID set in Worker env
 *   - `identity` permission in extension manifest
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  const apiUrl = getSyncApiUrl();
  const extensionRedirect = `${apiUrl}/auth/extension-redirect`;

  // Step 1: POST to Better Auth to get the Google OAuth URL
  // (Better Auth stores PKCE state in DB and returns the Google redirect URL)
  const signInRes = await fetch(`${apiUrl}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'google',
      callbackURL: extensionRedirect,
    }),
  });

  if (!signInRes.ok) {
    throw new Error(`Failed to initiate sign-in: ${signInRes.status}`);
  }

  const signInData = await signInRes.json() as { url?: string; redirect?: boolean };
  if (!signInData.url) {
    throw new Error('No redirect URL returned from sign-in endpoint');
  }

  // Step 2: Open the Google OAuth URL via chrome.identity.launchWebAuthFlow
  // Google login → callback to Worker → Worker creates session + sets cookie →
  // Worker redirects to /auth/extension-redirect → reads cookie → redirects to
  // https://{ext-id}.chromiumapp.org/?session_token=TOKEN
  const callbackUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: signInData.url!, interactive: true },
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

  // Extract session token from the callback URL
  // The extension-redirect endpoint redirects to: https://{ext-id}.chromiumapp.org/?session_token=TOKEN
  const url = new URL(callbackUrl);
  const sessionToken = url.searchParams.get('session_token');
  const error = url.searchParams.get('error');

  if (error) {
    console.error('[auth] OAuth error:', error);
    throw new Error(`Authentication failed: ${error}`);
  }

  if (!sessionToken) {
    console.error('[auth] No session_token in callback URL:', callbackUrl);
    throw new Error('Authentication failed — no session token received');
  }

  // Persist the session token
  await chrome.storage.local.set({ [STORAGE_KEY]: sessionToken });

  // Fetch user info using the session token
  const user = await fetchCurrentUser(sessionToken);
  if (!user) {
    throw new Error('Authentication succeeded but failed to fetch user info');
  }

  return user;
}

/**
 * Signs out: invalidate server session + clear local token.
 */
export async function signOut(): Promise<void> {
  const token = await getStoredToken();
  if (token) {
    try {
      const apiUrl = getSyncApiUrl();
      await fetch(`${apiUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore network errors during sign-out (token will expire anyway)
    }
  }
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * Returns the current authenticated user, or null if not authenticated.
 * Validates the stored session token against the server.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getStoredToken();
  if (!token) return null;

  const user = await fetchCurrentUser(token);
  if (!user) {
    // Token is invalid/expired — clean up
    await chrome.storage.local.remove(STORAGE_KEY);
  }
  return user;
}

/**
 * Returns the stored session token, or null.
 */
export async function getStoredToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch user info from Better Auth session endpoint using a Bearer token.
 */
async function fetchCurrentUser(token: string): Promise<AuthUser | null> {
  try {
    const apiUrl = getSyncApiUrl();
    const res = await fetch(`${apiUrl}/api/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      user?: { id: string; name?: string; email?: string; image?: string };
    } | null;

    if (!data?.user) return null;

    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      avatarUrl: data.user.image,
    };
  } catch {
    return null;
  }
}

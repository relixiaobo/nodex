/**
 * Nodex Sync Worker — Cloudflare Workers entry point.
 *
 * Routes:
 *   /api/auth/*            — Better Auth (Google OAuth, session management)
 *   /auth/extension-redirect — Chrome Extension OAuth redirect helper
 *   /api/session           — Custom session endpoint for Chrome Extension
 *   /sync/*                — Sync endpoints (auth-protected, Steps 4-5)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { createAuth } from './lib/auth.js';
import { requireAuth, type AuthVariables } from './middleware/auth.js';
import { handlePush } from './routes/push.js';
import { handlePull } from './routes/pull.js';
import type { Env } from './types.js';

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// CORS — must be before all routes
// ---------------------------------------------------------------------------

app.use('*', async (c, next) => {
  const devOrigin = c.env.DEV_ORIGIN ?? 'http://localhost:5199';
  const origins = [
    `chrome-extension://${c.env.CHROME_EXTENSION_ID}`,
    devOrigin,
  ];
  // Dev and Preview builds have their own keys → different extension IDs
  if (c.env.DEV_EXTENSION_ID) {
    origins.push(`chrome-extension://${c.env.DEV_EXTENSION_ID}`);
  }
  if (c.env.PREVIEW_EXTENSION_ID) {
    origins.push(`chrome-extension://${c.env.PREVIEW_EXTENSION_ID}`);
  }
  const corsMiddleware = cors({
    origin: origins,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// ---------------------------------------------------------------------------
// Better Auth routes
// ---------------------------------------------------------------------------

app.on(['POST', 'GET'], '/api/auth/**', async (c) => {
  try {
    const auth = createAuth(c.env);
    return await auth.handler(c.req.raw);
  } catch (err: unknown) {
    console.error('[auth] handler error:', err);
    return c.json({ error: 'Internal auth error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Chrome Extension OAuth redirect helper
//
// After Better Auth completes the Google OAuth flow and sets the session cookie,
// it redirects here (same Worker domain → cookie is present). We extract the
// session token from the cookie and redirect to the Chrome Extension URL with
// the token as a query parameter, since the extension can't read cross-origin cookies.
// ---------------------------------------------------------------------------

app.get('/auth/extension-redirect', async (c) => {
  // Determine which extension initiated the login.
  // The client passes its extension ID as ?ext_id=... on the callbackURL.
  // Fall back to the Store extension ID if not provided (backwards compat).
  const allowedIds = new Set([
    c.env.CHROME_EXTENSION_ID,
    c.env.DEV_EXTENSION_ID,
    c.env.PREVIEW_EXTENSION_ID,
  ].filter(Boolean));

  const requestedId = c.req.query('ext_id');
  const extId = requestedId && allowedIds.has(requestedId)
    ? requestedId
    : c.env.CHROME_EXTENSION_ID;
  const extRedirectBase = `https://${extId}.chromiumapp.org/`;

  // Read the session token from Better Auth's cookie.
  //
  // Better Auth stores session cookies as "token.signature" (HMAC-signed).
  // The `token` part is the actual session token stored in D1 `session.token`.
  // The `.signature` suffix is a server-side integrity check — not needed for
  // Bearer auth since we validate the token directly against D1.
  //
  // Reference: Better Auth source — packages/better-auth/src/cookies.ts
  // (createSessionCookie serializes as `${token}.${sign(token, secret)}`).
  //
  // If Better Auth changes this format, the extension-redirect will fail visibly
  // (token won't match any session row → /api/session returns null → client
  // shows "failed to fetch user info"). This is detectable, not a silent bug.
  // Better Auth prefixes cookies with `__Secure-` when baseURL is HTTPS.
  // Check both names to support local dev (HTTP) and staging/production (HTTPS).
  const rawCookie =
    getCookie(c, '__Secure-better-auth.session_token') ??
    getCookie(c, 'better-auth.session_token');

  if (!rawCookie) {
    console.error('[auth] extension-redirect: no session cookie found');
    return c.redirect(`${extRedirectBase}?error=no_session`);
  }

  const decoded = decodeURIComponent(rawCookie);
  const sessionToken = decoded.split('.')[0];

  const redirectUrl = new URL(extRedirectBase);
  redirectUrl.searchParams.set('session_token', sessionToken);
  return c.redirect(redirectUrl.toString());
});

// ---------------------------------------------------------------------------
// Custom session endpoint for Chrome Extension
//
// Better Auth's built-in get-session may not reliably work with Bearer tokens
// from cross-origin extension contexts. This endpoint directly queries the
// session table using the Bearer token.
// ---------------------------------------------------------------------------

app.get('/api/session', async (c) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return c.json(null, 200);
  }

  try {
    // Look up session by token
    const session = await c.env.SYNC_DB.prepare(
      'SELECT s.*, u.id as uid, u.name, u.email, u."emailVerified", u.image FROM session s JOIN user u ON s."userId" = u.id WHERE s.token = ? AND s."expiresAt" > datetime(\'now\')'
    ).bind(token).first();

    if (!session) {
      return c.json(null, 200);
    }

    return c.json({
      session: {
        id: session.id,
        token: session.token,
        userId: session.userId,
        expiresAt: session.expiresAt,
      },
      user: {
        id: session.uid,
        name: session.name,
        email: session.email,
        emailVerified: session.emailVerified,
        image: session.image,
      },
    });
  } catch (err) {
    console.error('[auth] /api/session error:', err);
    return c.json(null, 200);
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (c) => {
  return c.json({ ok: true, service: 'nodex-sync' });
});

// ---------------------------------------------------------------------------
// Privacy Policy (public page for Chrome Web Store listing)
// ---------------------------------------------------------------------------

app.get('/privacy', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>soma Privacy Policy</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #333; line-height: 1.6; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; margin-top: 32px; }
    p { margin: 8px 0; }
  </style>
</head>
<body>
  <h1>soma Privacy Policy</h1>
  <p><em>Last updated: February 27, 2026</em></p>

  <h2>What is soma</h2>
  <p>soma is a Chrome extension that provides knowledge management in the Chrome Side Panel. It lets you create, organize, and sync notes while browsing the web.</p>

  <h2>Data We Collect</h2>
  <p><strong>Account information</strong>: When you sign in with Google, we receive your name and email address to create your account.</p>
  <p><strong>Notes and content</strong>: The notes, tags, and other content you create within soma are stored to provide the service.</p>
  <p><strong>Web page content</strong>: When you use the web clipping feature, soma captures content from the current webpage that you choose to save.</p>

  <h2>How We Use Your Data</h2>
  <p>Your data is used solely to provide and improve the soma service: authenticate your account, store and sync your notes across devices, and enable web clipping when you request it.</p>
  <p>We do <strong>not</strong> use your data for advertising, analytics, or any purpose unrelated to the core service.</p>

  <h2>Data Storage</h2>
  <p>Your notes are stored locally in your browser for offline access. When signed in, your data is synced to secure cloud servers to enable cross-device access.</p>

  <h2>Data Sharing</h2>
  <p>We do <strong>not</strong> sell, trade, or transfer your data to third parties. Your data is only transmitted between your browser and our sync servers.</p>

  <h2>Data Deletion</h2>
  <p>You can delete your account and all associated data at any time by signing out and requesting account deletion. Local data can be removed by uninstalling the extension.</p>

  <h2>Contact</h2>
  <p>If you have questions about this privacy policy, please contact us at lixiaobock@gmail.com.</p>
</body>
</html>`;
  return c.html(html);
});

// ---------------------------------------------------------------------------
// Sync endpoints (auth-protected — push/pull implemented in Steps 4-5)
// ---------------------------------------------------------------------------

const sync = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
sync.use('*', requireAuth);

sync.post('/push', handlePush);

sync.post('/pull', handlePull);

app.route('/sync', sync);

export default app;

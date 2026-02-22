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
  const corsMiddleware = cors({
    origin: [
      `chrome-extension://${c.env.CHROME_EXTENSION_ID}`,
      'http://localhost:5201',  // client dev server
    ],
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
  const extId = c.env.CHROME_EXTENSION_ID;
  const extRedirectBase = `https://${extId}.chromiumapp.org/`;

  // Read the session token from Better Auth's cookie.
  // Cookie format is "token.signature" — extract just the token part for Bearer use.
  const rawCookie = getCookie(c, 'better-auth.session_token');

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
// Sync endpoints (auth-protected — push/pull implemented in Steps 4-5)
// ---------------------------------------------------------------------------

const sync = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
sync.use('*', requireAuth);

sync.post('/push', handlePush);

sync.post('/pull', handlePull);

app.route('/sync', sync);

export default app;

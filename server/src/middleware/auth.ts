/**
 * Auth middleware for protected routes.
 *
 * Validates the session via direct D1 query using the Bearer token.
 * We use direct D1 queries instead of Better Auth's `getSession()` because
 * the latter doesn't reliably work with Bearer tokens from cross-origin
 * Chrome Extension contexts (discovered during Auth PoC).
 */
import { createMiddleware } from 'hono/factory';
import type { Env } from '../types.js';

export interface AuthVariables {
  userId: string;
  sessionId: string;
}

/**
 * Middleware that requires a valid session via Bearer token.
 * Extracts userId and sessionId into Hono context variables.
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return c.json({ error: 'Unauthorized — no token' }, 401);
  }

  try {
    const session = await c.env.SYNC_DB.prepare(
      'SELECT s.id, s."userId", s."expiresAt" FROM session s WHERE s.token = ? AND s."expiresAt" > datetime(\'now\')'
    ).bind(token).first<{ id: string; userId: string; expiresAt: string }>();

    if (!session) {
      return c.json({ error: 'Unauthorized — invalid or expired session' }, 401);
    }

    c.set('userId', session.userId);
    c.set('sessionId', session.id);

    await next();
  } catch (err) {
    console.error('[auth middleware] error:', err);
    return c.json({ error: 'Internal auth error' }, 500);
  }
});

/**
 * Auth middleware for protected routes.
 *
 * Validates the Better Auth session from the request (cookie or Bearer token)
 * and attaches user/session info to the Hono context.
 *
 * Used by /sync/* routes (Steps 3+).
 */
import { createMiddleware } from 'hono/factory';
import { createAuth } from '../lib/auth.js';
import type { Env } from '../types.js';

export interface AuthVariables {
  userId: string;
  session: unknown;
}

/**
 * Middleware that requires a valid Better Auth session.
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('userId', session.user.id);
  c.set('session', session.session);

  await next();
});

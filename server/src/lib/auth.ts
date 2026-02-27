/**
 * Better Auth instance factory.
 *
 * Creates a new Better Auth instance per request (required because D1 binding
 * is only available from the request context in Cloudflare Workers).
 *
 * Uses Kysely + D1Dialect instead of Drizzle because drizzle-orm's D1 driver
 * has issues with RETURNING clauses that Better Auth relies on.
 */
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { Env } from '../types.js';

export function createAuth(env: Env) {
  const db = new Kysely({
    dialect: new D1Dialect({ database: env.SYNC_DB }),
  });

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,

    database: {
      db,
      type: 'sqlite',
    },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    // Allow requests from all Chrome Extension origins (Store + Preview + Dev)
    trustedOrigins: [
      `chrome-extension://${env.CHROME_EXTENSION_ID}`,
      ...(env.DEV_EXTENSION_ID ? [`chrome-extension://${env.DEV_EXTENSION_ID}`] : []),
      ...(env.PREVIEW_EXTENSION_ID ? [`chrome-extension://${env.PREVIEW_EXTENSION_ID}`] : []),
    ],

    // Bearer plugin: allows Authorization header instead of cookies.
    // Essential for Chrome Extension which can't rely on cross-origin cookies.
    plugins: [bearer()],

    session: {
      expiresIn: 60 * 60 * 24 * 7,   // 7 days
      updateAge: 60 * 60 * 24,        // refresh session after 1 day
    },
  });
}

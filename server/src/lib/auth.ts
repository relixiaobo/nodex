/**
 * Better Auth instance factory.
 *
 * Creates a new Better Auth instance per request (required because D1 binding
 * is only available from the request context in Cloudflare Workers).
 */
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../types.js';

export function createAuth(env: Env) {
  const db = drizzle(env.SYNC_DB);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,

    database: drizzleAdapter(db, {
      provider: 'sqlite',
    }),

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    // Allow requests from the Chrome Extension origin
    trustedOrigins: [
      `chrome-extension://${env.CHROME_EXTENSION_ID}`,
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

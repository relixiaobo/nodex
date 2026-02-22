/**
 * Tests for src/lib/auth.ts
 *
 * Note: signInWithGoogle() cannot be unit-tested because it requires
 * chrome.identity.launchWebAuthFlow (a real Chrome extension API) and a live
 * Worker + Google OAuth flow. Those paths are covered by manual verification.
 *
 * What we can test here:
 *  - AuthUser shape contract (via mock)
 *  - getCurrentUser() returns null when no stored token
 *  - Exported API surface matches expected shape
 */

import type { AuthUser } from '../../src/lib/auth.js';

// Ensure chrome.storage.local is available in test environment
beforeEach(() => {
  const store: Record<string, unknown> = {};
  globalThis.chrome = {
    ...globalThis.chrome,
    runtime: { ...globalThis.chrome?.runtime, id: 'test-extension-id' },
    storage: {
      ...globalThis.chrome?.storage,
      local: {
        get: vi.fn(async (key: string) => {
          if (typeof key === 'string') return { [key]: store[key] };
          return {};
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
    },
  } as unknown as typeof chrome;
});

describe('AuthUser type contract', () => {
  it('AuthUser has the expected fields', () => {
    const user: AuthUser = {
      id: 'uid_123',
      email: 'user@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      name: 'Test User',
    };

    expect(user.id).toBe('uid_123');
    expect(user.email).toBe('user@example.com');
    expect(user.avatarUrl).toBe('https://example.com/avatar.png');
    expect(user.name).toBe('Test User');
  });

  it('AuthUser allows optional fields to be absent', () => {
    const minimalUser: AuthUser = { id: 'uid_456' };
    expect(minimalUser.id).toBe('uid_456');
    expect(minimalUser.email).toBeUndefined();
    expect(minimalUser.avatarUrl).toBeUndefined();
    expect(minimalUser.name).toBeUndefined();
  });
});

describe('getCurrentUser with no stored token', () => {
  it('returns null when no session token is stored', async () => {
    const { getCurrentUser } = await import('../../src/lib/auth.js');
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });
});

describe('getStoredToken', () => {
  it('returns null when no token is stored', async () => {
    const { getStoredToken } = await import('../../src/lib/auth.js');
    const token = await getStoredToken();
    expect(token).toBeNull();
  });
});

describe('auth module exports', () => {
  it('exports the expected functions', async () => {
    const authModule = await import('../../src/lib/auth.js');
    expect(typeof authModule.signOut).toBe('function');
    expect(typeof authModule.signInWithGoogle).toBe('function');
    expect(typeof authModule.getCurrentUser).toBe('function');
    expect(typeof authModule.getStoredToken).toBe('function');
  });
});

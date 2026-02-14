import { beforeEach, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

import {
  getSupabase,
  initSupabase,
  isSupabaseReady,
  resetSupabase,
} from '../../src/services/supabase.js';

describe('supabase service lifecycle', () => {
  beforeEach(() => {
    resetSupabase();
    createClientMock.mockReset();
  });

  it('throws when getSupabase is called before init', () => {
    expect(isSupabaseReady()).toBe(false);
    expect(() => getSupabase()).toThrow('Supabase not initialized');
  });

  it('initializes client and marks service as ready', () => {
    const fakeClient = { id: 'client_1' };
    createClientMock.mockReturnValue(fakeClient);

    const client = initSupabase('https://example.supabase.co', 'anon_key_1');

    expect(createClientMock).toHaveBeenCalledWith('https://example.supabase.co', 'anon_key_1');
    expect(client).toBe(fakeClient);
    expect(getSupabase()).toBe(fakeClient);
    expect(isSupabaseReady()).toBe(true);
  });

  it('resets readiness and blocks access after reset', () => {
    createClientMock.mockReturnValue({ id: 'client_2' });
    initSupabase('https://example.supabase.co', 'anon_key_2');
    expect(isSupabaseReady()).toBe(true);

    resetSupabase();
    expect(isSupabaseReady()).toBe(false);
    expect(() => getSupabase()).toThrow('Supabase not initialized');
  });
});

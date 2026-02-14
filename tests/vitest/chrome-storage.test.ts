import { chromeLocalStorage } from '../../src/lib/chrome-storage.js';

describe('chrome-storage adapter', () => {
  it('serializes and revives Set values', async () => {
    expect(chromeLocalStorage).toBeDefined();
    if (!chromeLocalStorage) return;

    await chromeLocalStorage.setItem('k1', {
      state: {
        expandedNodes: new Set(['a:b', 'c:d']),
      },
      version: 1,
    });

    const raw = localStorage.getItem('k1');
    expect(raw).toContain('__type');
    expect(raw).toContain('Set');

    const restored = await chromeLocalStorage.getItem('k1');
    expect(restored).toEqual({
      state: {
        expandedNodes: new Set(['a:b', 'c:d']),
      },
      version: 1,
    });
  });

  it('returns null for missing key and supports removeItem', async () => {
    expect(chromeLocalStorage).toBeDefined();
    if (!chromeLocalStorage) return;

    expect(await chromeLocalStorage.getItem('missing')).toBeNull();

    await chromeLocalStorage.setItem('k2', { state: { foo: 'bar' }, version: 1 });
    expect(await chromeLocalStorage.getItem('k2')).toEqual({ state: { foo: 'bar' }, version: 1 });

    await chromeLocalStorage.removeItem('k2');
    expect(await chromeLocalStorage.getItem('k2')).toBeNull();
  });
});

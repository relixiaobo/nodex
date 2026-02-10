/**
 * Zustand persist middleware adapter for chrome.storage.local.
 *
 * Provides an async storage interface compatible with createJSONStorage().
 * Includes custom JSON reviver/replacer for Set<string> serialization.
 */
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const chromeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(name);
    return (result[name] as string) ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [name]: value });
  },
  removeItem: async (name: string): Promise<void> => {
    await chrome.storage.local.remove(name);
  },
};

/**
 * JSON replacer that converts Set instances to a tagged array format.
 * { __type: 'Set', values: [...] }
 */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return { __type: 'Set', values: [...value] };
  }
  return value;
}

/**
 * JSON reviver that restores tagged Set arrays back to Set instances.
 */
function reviver(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__type === 'Set' &&
    Array.isArray((value as Record<string, unknown>).values)
  ) {
    return new Set((value as Record<string, unknown[]>).values);
  }
  return value;
}

export const chromeLocalStorage = createJSONStorage(
  () => chromeStorage,
  { reviver, replacer },
);

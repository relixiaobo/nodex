import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteChatSession,
  getChatSession,
  getLatestChatSession,
  resetChatPersistenceForTests,
  saveChatSession,
} from '../../src/lib/ai-persistence.js';

function createAsyncRequest<T>(producer: () => T): IDBRequest<T> {
  const request = {
    onsuccess: null,
    onerror: null,
    result: undefined,
    error: null,
  } as unknown as IDBRequest<T>;

  queueMicrotask(() => {
    try {
      (request as { result: T }).result = producer();
      request.onsuccess?.({ target: request } as Event);
    } catch (error) {
      (request as { error: DOMException }).error = error as DOMException;
      request.onerror?.({ target: request } as Event);
    }
  });

  return request;
}

function createFakeIndexedDB(): IDBFactory {
  const stores = new Map<string, Map<string, Record<string, unknown>>>();
  let initialized = false;

  function ensureStore(name: string): Map<string, Record<string, unknown>> {
    let store = stores.get(name);
    if (!store) {
      store = new Map<string, Record<string, unknown>>();
      stores.set(name, store);
    }
    return store;
  }

  const db = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: (name: string) => {
      const target = ensureStore(name);
      return {
        indexNames: {
          contains: () => false,
        },
        createIndex: () => ({}),
        put: (value: Record<string, unknown>) => createAsyncRequest(() => {
          target.set(String(value.id), value);
          return value.id;
        }),
        get: (key: string) => createAsyncRequest(() => target.get(key)),
        delete: (key: string) => createAsyncRequest(() => {
          target.delete(key);
          return undefined;
        }),
        index: () => ({
          openCursor: (_query: unknown, direction?: IDBCursorDirection) => {
            const values = [...target.values()]
              .sort((a, b) => Number(a.updatedAt ?? 0) - Number(b.updatedAt ?? 0));
            if (direction === 'prev') values.reverse();

            let cursorIndex = 0;
            const request = {
              onsuccess: null,
              onerror: null,
              result: null,
              error: null,
            } as unknown as IDBRequest<IDBCursorWithValue | null>;

            const emit = () => {
              queueMicrotask(() => {
                if (cursorIndex >= values.length) {
                  (request as { result: IDBCursorWithValue | null }).result = null;
                  request.onsuccess?.({ target: request } as Event);
                  return;
                }

                const value = values[cursorIndex];
                (request as { result: IDBCursorWithValue | null }).result = {
                  value,
                  continue: () => {
                    cursorIndex += 1;
                    emit();
                  },
                } as IDBCursorWithValue;
                request.onsuccess?.({ target: request } as Event);
              });
            };

            emit();
            return request;
          },
        }),
      } as unknown as IDBObjectStore;
    },
    transaction: (storeName: string) => {
      const tx = {
        oncomplete: null as ((e: Event) => void) | null,
        onerror: null as ((e: Event) => void) | null,
        onabort: null as ((e: Event) => void) | null,
        objectStore: (name: string) => {
          const storeNameToUse = name || storeName;
          const target = ensureStore(storeNameToUse);
          return {
            put: (value: Record<string, unknown>) => createAsyncRequest(() => {
              target.set(String(value.id), value);
              return value.id;
            }),
            get: (key: string) => createAsyncRequest(() => target.get(key)),
            delete: (key: string) => createAsyncRequest(() => {
              target.delete(key);
              return undefined;
            }),
            index: () => ({
              openCursor: (_query: unknown, direction?: IDBCursorDirection) => {
                const values = [...target.values()]
                  .sort((a, b) => Number(a.updatedAt ?? 0) - Number(b.updatedAt ?? 0));
                if (direction === 'prev') values.reverse();

                let cursorIndex = 0;
                const request = {
                  onsuccess: null,
                  onerror: null,
                  result: null,
                  error: null,
                } as unknown as IDBRequest<IDBCursorWithValue | null>;

                const emit = () => {
                  queueMicrotask(() => {
                    if (cursorIndex >= values.length) {
                      (request as { result: IDBCursorWithValue | null }).result = null;
                      request.onsuccess?.({ target: request } as Event);
                      return;
                    }

                    const value = values[cursorIndex];
                    (request as { result: IDBCursorWithValue | null }).result = {
                      value,
                      continue: () => {
                        cursorIndex += 1;
                        emit();
                      },
                    } as IDBCursorWithValue;
                    request.onsuccess?.({ target: request } as Event);
                  });
                };

                emit();
                return request;
              },
            }),
          } as unknown as IDBObjectStore;
        },
      };

      queueMicrotask(() => queueMicrotask(() => {
        tx.oncomplete?.({ target: tx } as unknown as Event);
      }));

      return tx as unknown as IDBTransaction;
    },
  } as unknown as IDBDatabase;

  return {
    open: () => {
      const request = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: undefined,
        error: null,
        transaction: {
          objectStore: (name: string) => db.createObjectStore(name),
        },
      } as unknown as IDBOpenDBRequest;

      queueMicrotask(() => {
        (request as { result: IDBDatabase }).result = db;
        if (!initialized) {
          initialized = true;
          request.onupgradeneeded?.({ target: request } as IDBVersionChangeEvent);
        }
        request.onsuccess?.({ target: request } as Event);
      });

      return request;
    },
  } as unknown as IDBFactory;
}

const originalIndexedDB = globalThis.indexedDB;

describe('ai persistence', () => {
  beforeAll(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = createFakeIndexedDB();
  });

  afterAll(() => {
    if (originalIndexedDB) {
      (globalThis as { indexedDB?: IDBFactory }).indexedDB = originalIndexedDB;
    } else {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    }
  });

  beforeEach(() => {
    resetChatPersistenceForTests();
  });

  it('saves and restores the latest session', async () => {
    await saveChatSession({
      id: 'session_1',
      messages: [{ role: 'user', content: 'hello', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 1,
    });
    await saveChatSession({
      id: 'session_2',
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hi' }], api: 'anthropic-messages', provider: 'anthropic', model: 'claude-sonnet-4-5', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 2 }],
      createdAt: 2,
      updatedAt: 2,
    });

    expect((await getChatSession('session_1'))?.id).toBe('session_1');
    expect((await getLatestChatSession())?.id).toBe('session_2');
  });

  it('trims stored messages to the latest 100 entries', async () => {
    const messages = Array.from({ length: 105 }, (_, index) => ({
      role: 'user' as const,
      content: `message-${index}`,
      timestamp: index,
    }));

    const saved = await saveChatSession({
      id: 'session_many',
      messages,
      createdAt: 1,
      updatedAt: 1,
    });

    expect(saved.messages).toHaveLength(100);
    expect((saved.messages[0] as { content: string }).content).toBe('message-5');
  });

  it('deletes a saved session', async () => {
    await saveChatSession({
      id: 'session_delete',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    });

    await deleteChatSession('session_delete');
    expect(await getChatSession('session_delete')).toBeNull();
  });

  it('strips image blocks before persisting while keeping text details', async () => {
    const saved = await saveChatSession({
      id: 'session_images',
      messages: [
        {
          role: 'toolResult',
          toolCallId: 'call_1',
          toolName: 'browser',
          content: [
            { type: 'image', data: 'base64-image', mimeType: 'image/png' },
            { type: 'text', text: 'details' },
          ],
          isError: false,
          timestamp: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    });

    expect(saved.messages).toEqual([
      {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'browser',
        content: [
          { type: 'text', text: '[Image removed from storage]' },
          { type: 'text', text: 'details' },
        ],
        isError: false,
        timestamp: 1,
      },
    ]);
  });

  it('restores sessions without image payloads after persistence stripping', async () => {
    await saveChatSession({
      id: 'session_restore_images',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'prompt' },
            { type: 'image', data: 'base64-user-image', mimeType: 'image/jpeg' },
          ],
          timestamp: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    });

    expect(await getChatSession('session_restore_images')).toEqual({
      id: 'session_restore_images',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'prompt' },
            { type: 'text', text: '[Image removed from storage]' },
          ],
          timestamp: 1,
        },
      ],
      createdAt: 1,
      updatedAt: expect.any(Number),
    });
  });
});

import 'fake-indexeddb/auto';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { deleteDB } from 'idb';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getLinearPath, linearToTree, type ChatSession } from '../../src/lib/ai-chat-tree.js';
import {
  deleteChatSession,
  getChatSession,
  getLatestChatSession,
  listChatSessionMetas,
  resetChatPersistenceForTests,
  saveChatSession,
} from '../../src/lib/ai-persistence.js';

const DB_NAME = 'soma-ai-chat';
const STORE_NAME = 'sessions';
const UPDATED_AT_INDEX = 'updatedAt';

interface LegacyChatSession {
  id: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

function buildSession(
  id: string,
  messages: AgentMessage[],
  {
    createdAt = 1,
    selectedModelId,
    selectedProvider,
    updatedAt = createdAt,
    title,
  }: {
    createdAt?: number;
    selectedModelId?: string;
    selectedProvider?: string;
    updatedAt?: number;
    title?: string | null;
  } = {},
): ChatSession {
  const session = linearToTree(messages);
  session.id = id;
  session.createdAt = createdAt;
  session.updatedAt = updatedAt;
  if (title !== undefined) {
    session.title = title;
  }
  if (selectedModelId !== undefined) {
    session.selectedModelId = selectedModelId;
  }
  if (selectedProvider !== undefined) {
    session.selectedProvider = selectedProvider;
  }
  return session;
}

async function resetPersistence(): Promise<void> {
  resetChatPersistenceForTests();
  await deleteDB(DB_NAME);
  resetChatPersistenceForTests();
}

async function seedLegacySessions(sessions: LegacyChatSession[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const session of sessions) {
        store.put(session);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  });
}

describe('ai persistence', () => {
  beforeEach(async () => {
    await resetPersistence();
  });

  afterAll(async () => {
    await resetPersistence();
  });

  it('saves and restores the latest session while listing metadata separately', async () => {
    await saveChatSession(buildSession('session_1', [
      { role: 'user', content: 'hello', timestamp: 1 },
    ], { createdAt: 1, updatedAt: 1, title: 'hello' }));

    await saveChatSession(buildSession('session_2', [
      { role: 'user', content: 'follow up', timestamp: 2 },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }], api: 'anthropic-messages', provider: 'anthropic', model: 'claude-sonnet-4-5', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 3 },
    ], { createdAt: 2, updatedAt: 2, title: 'follow up' }));

    expect((await getChatSession('session_1'))?.id).toBe('session_1');
    expect((await getLatestChatSession())?.id).toBe('session_2');
    const metas = await listChatSessionMetas();
    expect(metas.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'session_2', title: 'follow up' },
      { id: 'session_1', title: 'hello' },
    ]);
    expect(metas[0].updatedAt).toBeGreaterThanOrEqual(metas[1].updatedAt);
  });

  it('persists per-session selected model state alongside the chat tree', async () => {
    await saveChatSession(buildSession('session_model', [
      { role: 'user', content: 'hello', timestamp: 1 },
    ], {
      selectedProvider: 'openai',
      selectedModelId: 'gpt-4o',
    }));

    const restored = await getChatSession('session_model');

    expect(restored?.selectedProvider).toBe('openai');
    expect(restored?.selectedModelId).toBe('gpt-4o');
  });

  it('keeps long sessions intact instead of trimming to the latest 100 entries', async () => {
    const messages = Array.from({ length: 105 }, (_, index) => ({
      role: 'user' as const,
      content: `message-${index}`,
      timestamp: index,
    }));

    const saved = await saveChatSession(buildSession('session_many', messages));

    expect(getLinearPath(saved)).toHaveLength(105);
    expect(getLinearPath(saved)[0].message).toMatchObject({
      role: 'user',
      content: 'message-0',
    });
    expect(getLinearPath(saved)[104].message).toMatchObject({
      role: 'user',
      content: 'message-104',
    });
  });

  it('deletes a saved session and its metadata record', async () => {
    await saveChatSession(buildSession('session_delete', [
      { role: 'user', content: 'delete me', timestamp: 1 },
    ]));

    await deleteChatSession('session_delete');

    expect(await getChatSession('session_delete')).toBeNull();
    expect(await listChatSessionMetas()).toEqual([]);
  });

  it('strips image blocks from message nodes before persisting', async () => {
    const saved = await saveChatSession(buildSession('session_images', [
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
    ]));

    expect(getLinearPath(saved).map((node) => node.message)).toEqual([
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

  it('restores persisted sessions without image payloads after stripping', async () => {
    await saveChatSession(buildSession('session_restore_images', [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'prompt' },
          { type: 'image', data: 'base64-user-image', mimeType: 'image/jpeg' },
        ],
        timestamp: 1,
      },
    ]));

    const restored = await getChatSession('session_restore_images');

    expect(getLinearPath(restored!).map((node) => node.message)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'prompt' },
          { type: 'text', text: '[Image removed from storage]' },
        ],
        timestamp: 1,
      },
    ]);
  });

  it('migrates v1 linear sessions into v2 tree sessions on open', async () => {
    await seedLegacySessions([
      {
        id: 'legacy_session',
        createdAt: 100,
        updatedAt: 200,
        messages: [
          { role: 'user', content: 'legacy hello', timestamp: 1 },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'legacy hi' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: 2,
          },
        ],
      },
    ]);

    resetChatPersistenceForTests();

    const migrated = await getChatSession('legacy_session');

    expect(migrated).not.toBeNull();
    expect(migrated?.id).toBe('legacy_session');
    expect(migrated?.createdAt).toBe(100);
    expect(migrated?.updatedAt).toBe(200);
    expect(migrated?.title).toBe('legacy hello');
    expect(getLinearPath(migrated!).map((node) => node.message)).toEqual([
      { role: 'user', content: 'legacy hello', timestamp: 1 },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'legacy hi' }],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 2,
      },
    ]);
    expect(await listChatSessionMetas()).toEqual([
      { id: 'legacy_session', title: 'legacy hello', updatedAt: 200 },
    ]);
  });
});

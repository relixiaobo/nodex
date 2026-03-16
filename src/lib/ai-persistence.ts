import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, unwrap } from 'idb';
import { linearToTree } from './ai-chat-tree.js';
import type { BridgeEntry, ChatSession, MessageNode } from './ai-chat-tree.js';
import { IMAGE_PLACEHOLDER, messageHasImage, replaceMessageImages } from './ai-message-images.js';

const DB_NAME = 'soma-ai-chat';
const DB_VERSION = 2;
const STORE_NAME = 'sessions';
const META_STORE_NAME = 'session-metas';
const UPDATED_AT_INDEX = 'updatedAt';
const STORE_NAMES = [STORE_NAME, META_STORE_NAME] as const;

interface ChatSessionMeta {
  id: string;
  title: string | null;
  updatedAt: number;
}

interface LegacyChatSession {
  id: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatPersistenceDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: ChatSession;
    indexes: {
      [UPDATED_AT_INDEX]: number;
    };
  };
  [META_STORE_NAME]: {
    key: string;
    value: ChatSessionMeta;
    indexes: {
      [UPDATED_AT_INDEX]: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<ChatPersistenceDB>> | null = null;
let dbInstance: IDBPDatabase<ChatPersistenceDB> | null = null;

export type { BridgeEntry, ChatSession, MessageNode };

function getIndexedDB(): IDBFactory {
  if (!globalThis.indexedDB) {
    throw new Error('indexedDB is not available');
  }

  return globalThis.indexedDB;
}

function isLegacyChatSession(session: unknown): session is LegacyChatSession {
  return !!session
    && typeof session === 'object'
    && 'messages' in session
    && Array.isArray((session as LegacyChatSession).messages)
    && !('mapping' in (session as Record<string, unknown>));
}

function migrateLegacySession(session: LegacyChatSession): ChatSession {
  const migrated = linearToTree(session.messages);
  migrated.id = session.id;
  migrated.createdAt = session.createdAt;
  migrated.updatedAt = session.updatedAt;
  return migrated;
}

function toSessionMeta(session: ChatSession): ChatSessionMeta {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
  };
}

function ensureStore(
  db: IDBPDatabase<ChatPersistenceDB>,
  transaction: IDBPTransaction<ChatPersistenceDB, typeof STORE_NAMES, 'versionchange'>,
  storeName: typeof STORE_NAMES[number],
): IDBObjectStore {
  const store = db.objectStoreNames.contains(storeName)
    ? unwrap(transaction.objectStore(storeName))
    : unwrap(db.createObjectStore(storeName, { keyPath: 'id' }));

  if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
    store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX);
  }

  return store;
}

function backfillSessionMetas(sessionStore: IDBObjectStore, metaStore: IDBObjectStore): void {
  const cursorRequest = sessionStore.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;

    const rawValue = cursor.value as ChatSession | LegacyChatSession;
    const nextValue = isLegacyChatSession(rawValue)
      ? migrateLegacySession(rawValue)
      : rawValue;

    cursor.update(nextValue);
    metaStore.put(toSessionMeta(nextValue));
    cursor.continue();
  };
}

async function getDB(): Promise<IDBPDatabase<ChatPersistenceDB>> {
  getIndexedDB();
  if (dbPromise) return dbPromise;

  dbPromise = openDB<ChatPersistenceDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      const sessionStore = ensureStore(db, transaction, STORE_NAME);
      const metaStore = ensureStore(db, transaction, META_STORE_NAME);

      if (oldVersion < 2) {
        backfillSessionMetas(sessionStore, metaStore);
      }
    },
    terminated() {
      dbInstance = null;
      dbPromise = null;
    },
  }).then((db) => {
    dbInstance = db;
    return db;
  });

  return dbPromise;
}

function stripMessageImagesForPersistence(message: AgentMessage): AgentMessage {
  if (!messageHasImage(message)) return message;
  return replaceMessageImages(message, () => IMAGE_PLACEHOLDER);
}

function stripMappingImagesForPersistence(mapping: Record<string, MessageNode>): Record<string, MessageNode> {
  return Object.fromEntries(
    Object.entries(mapping).map(([nodeId, node]) => [
      nodeId,
      {
        ...node,
        children: node.children.slice(),
        message: node.message ? stripMessageImagesForPersistence(node.message) : null,
      },
    ]),
  );
}

export async function saveChatSession(session: ChatSession): Promise<ChatSession> {
  const db = await getDB();
  const updatedAt = Date.now();
  const nextSession: ChatSession = {
    ...session,
    updatedAt,
    mapping: stripMappingImagesForPersistence(session.mapping),
  };

  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await Promise.all([
    tx.objectStore(STORE_NAME).put(nextSession),
    tx.objectStore(META_STORE_NAME).put(toSessionMeta(nextSession)),
  ]);
  await tx.done;

  return nextSession;
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const db = await getDB();
  return (await db.get(STORE_NAME, sessionId)) ?? null;
}

export async function getLatestChatSession(): Promise<ChatSession | null> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAMES, 'readonly');
  const metaCursor = await tx.objectStore(META_STORE_NAME)
    .index(UPDATED_AT_INDEX)
    .openCursor(null, 'prev');

  if (!metaCursor) {
    await tx.done;
    return null;
  }

  const session = await tx.objectStore(STORE_NAME).get(metaCursor.value.id);
  await tx.done;
  return session ?? null;
}

export async function listChatSessionMetas(): Promise<ChatSessionMeta[]> {
  const db = await getDB();
  const tx = db.transaction(META_STORE_NAME, 'readonly');
  const metas: ChatSessionMeta[] = [];
  let cursor = await tx.objectStore(META_STORE_NAME)
    .index(UPDATED_AT_INDEX)
    .openCursor(null, 'prev');

  while (cursor) {
    metas.push(cursor.value);
    cursor = await cursor.continue();
  }

  await tx.done;
  return metas;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await Promise.all([
    tx.objectStore(STORE_NAME).delete(sessionId),
    tx.objectStore(META_STORE_NAME).delete(sessionId),
  ]);
  await tx.done;
}

export function resetChatPersistenceForTests(): void {
  dbInstance?.close();
  dbInstance = null;
  dbPromise = null;
}

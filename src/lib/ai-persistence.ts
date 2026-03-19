import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, unwrap } from 'idb';
import { linearToTree } from './ai-chat-tree.js';
import type { BridgeEntry, ChatSession, MessageNode } from './ai-chat-tree.js';
import { buildChatSessionSearchSummary } from './ai-chat-summary.js';
import type { ChatTurnDebugRecord } from './ai-debug.js';
import { IMAGE_PLACEHOLDER, messageHasImage, replaceMessageImages } from './ai-message-images.js';

const DB_NAME = 'soma-ai-chat';
const DB_VERSION = 4;
const STORE_NAME = 'sessions';
const META_STORE_NAME = 'session-metas';
const DEBUG_STORE_NAME = 'session-debug-turns';
const UPDATED_AT_INDEX = 'updatedAt';
const SESSION_STORE_NAMES = [STORE_NAME, META_STORE_NAME] as const;
const ALL_STORE_NAMES = [STORE_NAME, META_STORE_NAME, DEBUG_STORE_NAME] as const;

export interface ChatSessionMeta {
  id: string;
  title: string | null;
  updatedAt: number;
  searchText: string;
  userMessageCount: number;
}

interface LegacyChatSession {
  id: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatDebugTurnsRecord {
  id: string;
  turns: ChatTurnDebugRecord[];
}

type PersistedChatSession = ChatSession & {
  debugTurns?: ChatTurnDebugRecord[];
};

interface ChatPersistenceDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: PersistedChatSession;
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
  [DEBUG_STORE_NAME]: {
    key: string;
    value: ChatDebugTurnsRecord;
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

function normalizeChatSession(session: ChatSession): ChatSession {
  const { debugTurns: _debugTurns, ...rest } = session as PersistedChatSession;
  return {
    ...rest,
  };
}

function normalizeChatDebugTurns(turns: ChatTurnDebugRecord[] | null | undefined): ChatTurnDebugRecord[] {
  return Array.isArray(turns) ? turns : [];
}

function toSessionMeta(session: ChatSession): ChatSessionMeta {
  const { searchText, userMessageCount } = buildChatSessionSearchSummary(session);

  return {
    id: session.id,
    title: session.title ?? null,
    updatedAt: session.updatedAt,
    searchText,
    userMessageCount,
  };
}

function ensureStore(
  db: IDBPDatabase<ChatPersistenceDB>,
  transaction: IDBPTransaction<ChatPersistenceDB, typeof ALL_STORE_NAMES, 'versionchange'>,
  storeName: typeof SESSION_STORE_NAMES[number],
): IDBObjectStore {
  const store = db.objectStoreNames.contains(storeName)
    ? unwrap(transaction.objectStore(storeName))
    : unwrap(db.createObjectStore(storeName, { keyPath: 'id' }));

  if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
    store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX);
  }

  return store;
}

function ensureDebugStore(
  db: IDBPDatabase<ChatPersistenceDB>,
  transaction: IDBPTransaction<ChatPersistenceDB, typeof ALL_STORE_NAMES, 'versionchange'>,
): IDBObjectStore {
  if (db.objectStoreNames.contains(DEBUG_STORE_NAME)) {
    return unwrap(transaction.objectStore(DEBUG_STORE_NAME));
  }

  return unwrap(db.createObjectStore(DEBUG_STORE_NAME, { keyPath: 'id' }));
}

function syncSessionMetas(sessionStore: IDBObjectStore, metaStore: IDBObjectStore): void {
  const cursorRequest = sessionStore.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;

    const rawValue = cursor.value as PersistedChatSession | LegacyChatSession;
    const nextValue = isLegacyChatSession(rawValue)
      ? migrateLegacySession(rawValue)
      : normalizeChatSession(rawValue);

    if (isLegacyChatSession(rawValue)) {
      cursor.update(nextValue);
    }

    metaStore.put(toSessionMeta(nextValue));
    cursor.continue();
  };
}

function migrateEmbeddedDebugTurns(sessionStore: IDBObjectStore, debugStore: IDBObjectStore): void {
  const cursorRequest = sessionStore.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;

    const rawValue = cursor.value as PersistedChatSession;
    const turns = normalizeChatDebugTurns(rawValue.debugTurns);
    if (turns.length > 0) {
      debugStore.put({
        id: rawValue.id,
        turns,
      } satisfies ChatDebugTurnsRecord);
      cursor.update(normalizeChatSession(rawValue));
    }

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

      if (oldVersion < 4) {
        syncSessionMetas(sessionStore, metaStore);
      }

      if (oldVersion < 3) {
        const debugStore = ensureDebugStore(db, transaction);
        migrateEmbeddedDebugTurns(sessionStore, debugStore);
      } else {
        ensureDebugStore(db, transaction);
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
  const normalizedSession = normalizeChatSession(session);

  // P1-6: Read existing inside the same transaction to avoid race with
  // markSessionSynced or importRemoteSession writing between read and write.
  const tx = db.transaction(SESSION_STORE_NAMES, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const existing = await store.get(session.id);
  const syncedAt = existing
    ? Math.max(normalizedSession.syncedAt ?? 0, existing.syncedAt ?? 0) || null
    : normalizedSession.syncedAt;
  const revision = existing
    ? Math.max(normalizedSession.revision, existing.revision)
    : normalizedSession.revision;

  const nextSession: ChatSession = {
    ...normalizedSession,
    updatedAt,
    syncedAt,
    revision,
    mapping: stripMappingImagesForPersistence(normalizedSession.mapping),
  };

  await store.put(nextSession);
  await tx.objectStore(META_STORE_NAME).put(toSessionMeta(nextSession));
  await tx.done;

  return nextSession;
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const db = await getDB();
  const session = await db.get(STORE_NAME, sessionId);
  return session ? normalizeChatSession(session) : null;
}

export async function getLatestChatSession(): Promise<ChatSession | null> {
  const db = await getDB();
  const tx = db.transaction(SESSION_STORE_NAMES, 'readonly');
  const metaCursor = await tx.objectStore(META_STORE_NAME)
    .index(UPDATED_AT_INDEX)
    .openCursor(null, 'prev');

  if (!metaCursor) {
    await tx.done;
    return null;
  }

  const session = await tx.objectStore(STORE_NAME).get(metaCursor.value.id);
  await tx.done;
  return session ? normalizeChatSession(session) : null;
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
  const tx = db.transaction(ALL_STORE_NAMES, 'readwrite');
  await Promise.all([
    tx.objectStore(STORE_NAME).delete(sessionId),
    tx.objectStore(META_STORE_NAME).delete(sessionId),
    tx.objectStore(DEBUG_STORE_NAME).delete(sessionId),
  ]);
  await tx.done;
}

export async function saveChatDebugTurns(sessionId: string, turns: ChatTurnDebugRecord[]): Promise<ChatTurnDebugRecord[]> {
  const db = await getDB();
  const normalizedTurns = normalizeChatDebugTurns(turns);
  const tx = db.transaction(DEBUG_STORE_NAME, 'readwrite');
  await tx.objectStore(DEBUG_STORE_NAME).put({
    id: sessionId,
    turns: normalizedTurns,
  } satisfies ChatDebugTurnsRecord);
  await tx.done;
  return normalizedTurns;
}

export async function getChatDebugTurns(sessionId: string): Promise<ChatTurnDebugRecord[]> {
  const db = await getDB();
  const record = await db.get(DEBUG_STORE_NAME, sessionId);
  return normalizeChatDebugTurns(record?.turns);
}

export function resetChatPersistenceForTests(): void {
  dbInstance?.close();
  dbInstance = null;
  dbPromise = null;
}

/**
 * Clear all chat sessions from IndexedDB (used on sign-out to prevent
 * cross-user data leaks).
 */
export async function clearAllChatSessions(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(ALL_STORE_NAMES, 'readwrite');
  await Promise.all([
    tx.objectStore(STORE_NAME).clear(),
    tx.objectStore(META_STORE_NAME).clear(),
    tx.objectStore(DEBUG_STORE_NAME).clear(),
  ]);
  await tx.done;
}

// ---------------------------------------------------------------------------
// Chat sync — push / pull
// ---------------------------------------------------------------------------

export interface ChatSyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
}

/**
 * Get all sessions that have local changes not yet synced.
 * A session is dirty when updatedAt > syncedAt (or syncedAt is null).
 */
export async function getDirtyChatSessions(): Promise<ChatSession[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const dirty: ChatSession[] = [];
  let cursor = await tx.objectStore(STORE_NAME).openCursor();

  while (cursor) {
    const session = normalizeChatSession(cursor.value);
    if (session.syncedAt === null || session.updatedAt > session.syncedAt) {
      dirty.push(session);
    }
    cursor = await cursor.continue();
  }

  await tx.done;
  return dirty;
}

/**
 * Mark a session as synced (update syncedAt + revision in IndexedDB).
 * P1-6: Read and write in the same transaction to avoid overwriting newer
 * content written by persistChatSession between a separate read and write.
 */
export async function markSessionSynced(sessionId: string, revision: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(SESSION_STORE_NAMES, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const session = await store.get(sessionId);
  if (!session) {
    await tx.done;
    return;
  }

  const now = Date.now();
  // Only update sync fields, preserve everything else (including newer content)
  const updated = { ...session, syncedAt: now, revision };
  await store.put(updated);
  await tx.objectStore(META_STORE_NAME).put(toSessionMeta(updated));
  await tx.done;
}

/**
 * Import a remote session into IndexedDB (from pull).
 * Only overwrites if local session has no unsynchronized changes.
 * P1-6: Read and write in the same transaction to avoid races.
 * Returns 'imported' | 'skipped' (local has pending changes) | 'conflict'.
 */
export async function importRemoteSession(
  remoteSession: ChatSession,
  remoteRevision: number,
): Promise<'imported' | 'skipped' | 'conflict'> {
  const db = await getDB();
  const tx = db.transaction(SESSION_STORE_NAMES, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const metaStore = tx.objectStore(META_STORE_NAME);
  const local = await store.get(remoteSession.id);

  if (!local) {
    // New session — import directly
    const synced: ChatSession = {
      ...remoteSession,
      syncedAt: Date.now(),
      revision: remoteRevision,
    };
    await store.put(synced);
    await metaStore.put(toSessionMeta(synced));
    await tx.done;
    return 'imported';
  }

  const localSession = normalizeChatSession(local);

  // Local has unsynchronized changes — conflict
  if (localSession.syncedAt !== null && localSession.updatedAt > localSession.syncedAt) {
    // LWW: remote wins if it's newer
    if (remoteSession.updatedAt >= localSession.updatedAt) {
      const synced: ChatSession = {
        ...remoteSession,
        syncedAt: Date.now(),
        revision: remoteRevision,
      };
      await store.put(synced);
      await metaStore.put(toSessionMeta(synced));
      await tx.done;
      return 'conflict'; // Imported but was a conflict
    }
    await tx.done;
    return 'skipped'; // Local is newer, will push on next cycle
  }

  // Local is clean — overwrite with remote
  const synced: ChatSession = {
    ...remoteSession,
    syncedAt: Date.now(),
    revision: remoteRevision,
  };
  await store.put(synced);
  await metaStore.put(toSessionMeta(synced));
  await tx.done;
  return 'imported';
}

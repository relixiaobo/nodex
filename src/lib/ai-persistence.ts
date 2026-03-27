import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, unwrap } from 'idb';
import { linearToTree } from './ai-chat-tree.js';
import type { BridgeEntry, ChatSession, MessageNode } from './ai-chat-tree.js';
import {
  buildChatSessionSearchSummary,
  buildChatSessionUserMessageSummaries,
  joinChatSessionSearchText,
} from './ai-chat-summary.js';
import type { ChatTurnDebugRecord } from './ai-debug.js';
import { IMAGE_PLACEHOLDER, messageHasImage, replaceMessageImages } from './ai-message-images.js';

const DB_NAME = 'soma-ai-chat';
const DB_VERSION = 6;
const STORE_NAME = 'sessions';
const META_STORE_NAME = 'session-metas';
const USER_MESSAGE_META_STORE_NAME = 'session-user-metas';
const DEBUG_STORE_NAME = 'session-debug-turns';
const UPDATED_AT_INDEX = 'updatedAt';
const SESSION_ID_INDEX = 'sessionId';
const SESSION_ORDER_INDEX = 'sessionOrder';
const SESSION_META_STORE_NAMES = [STORE_NAME, META_STORE_NAME] as const;
const SESSION_DATA_STORE_NAMES = [STORE_NAME, META_STORE_NAME, USER_MESSAGE_META_STORE_NAME] as const;
const ALL_STORE_NAMES = [STORE_NAME, META_STORE_NAME, USER_MESSAGE_META_STORE_NAME, DEBUG_STORE_NAME] as const;

export interface ChatSessionMeta {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  selectedModelId: string | null;
  selectedProvider: string | null;
  selectedThinkingLevel: ChatSession['selectedThinkingLevel'] | null;
  contentSearchText: string;
  searchText: string;
  userMessageCount: number;
}

export interface ChatSessionShell {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  selectedModelId: string | null;
  selectedProvider: string | null;
  selectedThinkingLevel: ChatSession['selectedThinkingLevel'] | null;
}

export interface UpdateChatSessionShellInput {
  title?: string | null;
  selectedModelId?: string | null;
  selectedProvider?: string | null;
  selectedThinkingLevel?: ChatSession['selectedThinkingLevel'] | null;
}

export interface ChatSessionUserMessageMeta {
  id: string;
  sessionId: string;
  messageId: string;
  text: string;
  createdAt: number;
  order: number;
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
  [USER_MESSAGE_META_STORE_NAME]: {
    key: string;
    value: ChatSessionUserMessageMeta;
    indexes: {
      [SESSION_ID_INDEX]: string;
      [SESSION_ORDER_INDEX]: [string, number];
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
  const { contentSearchText, searchText, userMessageCount } = buildChatSessionSearchSummary(session);

  return {
    id: session.id,
    title: session.title ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    selectedModelId: session.selectedModelId ?? null,
    selectedProvider: session.selectedProvider ?? null,
    selectedThinkingLevel: session.selectedThinkingLevel ?? null,
    contentSearchText,
    searchText,
    userMessageCount,
  };
}

function toSessionShell(session: Pick<ChatSessionMeta, keyof ChatSessionShell>): ChatSessionShell {
  return {
    id: session.id,
    title: session.title ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    selectedModelId: session.selectedModelId ?? null,
    selectedProvider: session.selectedProvider ?? null,
    selectedThinkingLevel: session.selectedThinkingLevel ?? null,
  };
}

function applyPersistedSessionShell(
  session: ChatSession,
  shell: Pick<ChatSessionShell, keyof ChatSessionShell>,
): ChatSession {
  return {
    ...session,
    title: shell.title ?? null,
    createdAt: shell.createdAt,
    updatedAt: shell.updatedAt,
    selectedModelId: shell.selectedModelId ?? undefined,
    selectedProvider: shell.selectedProvider ?? undefined,
    selectedThinkingLevel: shell.selectedThinkingLevel ?? null,
  };
}

function applySessionShellPatch<T extends ChatSession | ChatSessionMeta>(
  session: T,
  patch: UpdateChatSessionShellInput,
  updatedAt: number,
): T {
  return {
    ...session,
    title: patch.title !== undefined ? patch.title : session.title,
    updatedAt,
    selectedModelId: patch.selectedModelId !== undefined ? patch.selectedModelId : session.selectedModelId,
    selectedProvider: patch.selectedProvider !== undefined ? patch.selectedProvider : session.selectedProvider,
    selectedThinkingLevel: patch.selectedThinkingLevel !== undefined
      ? patch.selectedThinkingLevel
      : session.selectedThinkingLevel,
  };
}

function ensureStore(
  db: IDBPDatabase<ChatPersistenceDB>,
  transaction: IDBPTransaction<ChatPersistenceDB, typeof ALL_STORE_NAMES, 'versionchange'>,
  storeName: typeof SESSION_META_STORE_NAMES[number],
): IDBObjectStore {
  const store = db.objectStoreNames.contains(storeName)
    ? unwrap(transaction.objectStore(storeName))
    : unwrap(db.createObjectStore(storeName, { keyPath: 'id' }));

  if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
    store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX);
  }

  return store;
}

function ensureUserMessageMetaStore(
  db: IDBPDatabase<ChatPersistenceDB>,
  transaction: IDBPTransaction<ChatPersistenceDB, typeof ALL_STORE_NAMES, 'versionchange'>,
): IDBObjectStore {
  const store = db.objectStoreNames.contains(USER_MESSAGE_META_STORE_NAME)
    ? unwrap(transaction.objectStore(USER_MESSAGE_META_STORE_NAME))
    : unwrap(db.createObjectStore(USER_MESSAGE_META_STORE_NAME, { keyPath: 'id' }));

  if (!store.indexNames.contains(SESSION_ID_INDEX)) {
    store.createIndex(SESSION_ID_INDEX, SESSION_ID_INDEX);
  }

  if (!store.indexNames.contains(SESSION_ORDER_INDEX)) {
    store.createIndex(SESSION_ORDER_INDEX, [SESSION_ID_INDEX, 'order']);
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

function toSessionUserMessageMetas(session: ChatSession): ChatSessionUserMessageMeta[] {
  return buildChatSessionUserMessageSummaries(session).map((message) => ({
    id: `${session.id}:${message.messageId}`,
    sessionId: session.id,
    messageId: message.messageId,
    text: message.text,
    createdAt: message.createdAt,
    order: message.order,
  }));
}

function backfillDerivedSessionStores(
  sessionStore: IDBObjectStore,
  options: {
    metaStore?: IDBObjectStore | null;
    userMessageStore?: IDBObjectStore | null;
    debugStore?: IDBObjectStore | null;
  },
): void {
  const cursorRequest = sessionStore.openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;

    const rawValue = cursor.value as PersistedChatSession | LegacyChatSession;
    const nextValue = isLegacyChatSession(rawValue) ? migrateLegacySession(rawValue) : normalizeChatSession(rawValue);
    let shouldUpdateSession = isLegacyChatSession(rawValue);

    if (options.debugStore && !isLegacyChatSession(rawValue)) {
      const turns = normalizeChatDebugTurns(rawValue.debugTurns);
      if (turns.length > 0) {
        options.debugStore.put({
          id: rawValue.id,
          turns,
        } satisfies ChatDebugTurnsRecord);
        shouldUpdateSession = true;
      }
    }

    if (options.metaStore) {
      options.metaStore.put(toSessionMeta(nextValue));
    }

    if (options.userMessageStore) {
      for (const messageMeta of toSessionUserMessageMetas(nextValue)) {
        options.userMessageStore.put(messageMeta);
      }
    }

    if (shouldUpdateSession) {
      cursor.update(nextValue);
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
      const userMessageStore = ensureUserMessageMetaStore(db, transaction);
      const debugStore = ensureDebugStore(db, transaction);

      if (oldVersion < 3 || oldVersion < 4 || oldVersion < 5 || oldVersion < 6) {
        backfillDerivedSessionStores(sessionStore, {
          metaStore: oldVersion < 4 || oldVersion < 6 ? metaStore : null,
          userMessageStore: oldVersion < 5 ? userMessageStore : null,
          debugStore: oldVersion < 3 ? debugStore : null,
        });
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

async function replaceSessionUserMessageMetas(
  tx: IDBPTransaction<ChatPersistenceDB, typeof SESSION_DATA_STORE_NAMES, 'readwrite'>,
  session: ChatSession,
): Promise<void> {
  const store = tx.objectStore(USER_MESSAGE_META_STORE_NAME);
  await deleteSessionUserMessageMetas(tx, session.id);
  for (const messageMeta of toSessionUserMessageMetas(session)) {
    await store.put(messageMeta);
  }
}

async function deleteSessionUserMessageMetas(
  tx: IDBPTransaction<ChatPersistenceDB, typeof SESSION_DATA_STORE_NAMES | typeof ALL_STORE_NAMES, 'readwrite'>,
  sessionId: string,
): Promise<void> {
  const store = tx.objectStore(USER_MESSAGE_META_STORE_NAME);
  let cursor = await store.index(SESSION_ID_INDEX).openCursor(IDBKeyRange.only(sessionId));

  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

export async function saveChatSession(session: ChatSession): Promise<ChatSession> {
  const db = await getDB();
  const updatedAt = Date.now();
  const normalizedSession = normalizeChatSession(session);

  // P1-6: Read existing inside the same transaction to avoid race with
  // markSessionSynced or importRemoteSession writing between read and write.
  const tx = db.transaction(SESSION_DATA_STORE_NAMES, 'readwrite');
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
  await replaceSessionUserMessageMetas(tx, nextSession);
  await tx.done;

  return nextSession;
}

export async function saveChatSessionShellPatch(
  sessionId: string,
  patch: UpdateChatSessionShellInput,
  options: {
    touchUpdatedAt?: boolean;
  } = {},
): Promise<ChatSessionShell | null> {
  const db = await getDB();
  const tx = db.transaction(SESSION_META_STORE_NAMES, 'readwrite');
  const metaStore = tx.objectStore(META_STORE_NAME);
  const existingMeta = await metaStore.get(sessionId);

  if (existingMeta) {
    const nextUpdatedAt = options.touchUpdatedAt ? Date.now() : existingMeta.updatedAt;
    const nextMetaBase = applySessionShellPatch(existingMeta, patch, nextUpdatedAt);
    const nextMeta: ChatSessionMeta = {
      ...nextMetaBase,
      contentSearchText: existingMeta.contentSearchText ?? '',
      searchText: joinChatSessionSearchText(nextMetaBase.title, existingMeta.contentSearchText ?? ''),
      userMessageCount: existingMeta.userMessageCount ?? 0,
    };

    await metaStore.put(nextMeta);
    await tx.done;
    return toSessionShell(nextMeta);
  }

  const existing = await tx.objectStore(STORE_NAME).get(sessionId);
  if (!existing) {
    await tx.done;
    return null;
  }

  const existingSession = normalizeChatSession(existing);
  const nextUpdatedAt = options.touchUpdatedAt ? Date.now() : existingSession.updatedAt;
  const derivedMeta = toSessionMeta(existingSession);
  const nextMetaBase = applySessionShellPatch(derivedMeta, patch, nextUpdatedAt);
  const nextMeta: ChatSessionMeta = {
    ...nextMetaBase,
    contentSearchText: derivedMeta.contentSearchText,
    searchText: joinChatSessionSearchText(nextMetaBase.title, derivedMeta.contentSearchText),
    userMessageCount: derivedMeta.userMessageCount,
  };

  await metaStore.put(nextMeta);
  await tx.done;

  return toSessionShell(nextMeta);
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const db = await getDB();
  const tx = db.transaction([STORE_NAME, META_STORE_NAME] as const, 'readonly');
  const [session, meta] = await Promise.all([
    tx.objectStore(STORE_NAME).get(sessionId),
    tx.objectStore(META_STORE_NAME).get(sessionId),
  ]);
  await tx.done;
  if (!session) return null;
  const normalizedSession = normalizeChatSession(session);
  return meta ? applyPersistedSessionShell(normalizedSession, toSessionShell(meta)) : normalizedSession;
}

export async function getChatSessionMeta(sessionId: string): Promise<ChatSessionMeta | null> {
  const db = await getDB();
  return (await db.get(META_STORE_NAME, sessionId)) ?? null;
}

export async function getChatSessionShell(sessionId: string): Promise<ChatSessionShell | null> {
  const meta = await getChatSessionMeta(sessionId);
  return meta ? toSessionShell(meta) : null;
}

export async function getLatestChatSession(): Promise<ChatSession | null> {
  const db = await getDB();
  const tx = db.transaction([STORE_NAME, META_STORE_NAME] as const, 'readonly');
  const metaCursor = await tx.objectStore(META_STORE_NAME)
    .index(UPDATED_AT_INDEX)
    .openCursor(null, 'prev');

  if (!metaCursor) {
    await tx.done;
    return null;
  }

  const session = await tx.objectStore(STORE_NAME).get(metaCursor.value.id);
  await tx.done;
  if (!session) return null;
  return applyPersistedSessionShell(normalizeChatSession(session), toSessionShell(metaCursor.value));
}

export async function getLatestChatSessionShell(): Promise<ChatSessionShell | null> {
  const db = await getDB();
  const tx = db.transaction(META_STORE_NAME, 'readonly');
  const metaCursor = await tx.objectStore(META_STORE_NAME)
    .index(UPDATED_AT_INDEX)
    .openCursor(null, 'prev');

  if (!metaCursor) {
    await tx.done;
    return null;
  }

  const shell = toSessionShell(metaCursor.value);
  await tx.done;
  return shell;
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

export async function listChatSessionMetasPage(options: {
  after?: number | null;
  before?: number | null;
  excludeId?: string | null;
  limit: number;
  offset: number;
  predicate?: (meta: ChatSessionMeta) => boolean;
}): Promise<{ items: ChatSessionMeta[]; hasMore: boolean }> {
  const db = await getDB();
  const tx = db.transaction(META_STORE_NAME, 'readonly');
  const items: ChatSessionMeta[] = [];
  const needed = options.limit + 1;
  const predicate = options.predicate ?? (() => true);
  let matched = 0;
  let cursor = await tx.objectStore(META_STORE_NAME)
    .index(UPDATED_AT_INDEX)
    .openCursor(null, 'prev');

  while (cursor) {
    const meta = cursor.value;

    if (options.excludeId && meta.id === options.excludeId) {
      cursor = await cursor.continue();
      continue;
    }

    if (options.after !== null && options.after !== undefined && meta.updatedAt < options.after) {
      cursor = await cursor.continue();
      continue;
    }

    if (options.before !== null && options.before !== undefined && meta.updatedAt > options.before) {
      cursor = await cursor.continue();
      continue;
    }

    if (!predicate(meta)) {
      cursor = await cursor.continue();
      continue;
    }

    if (matched >= options.offset) {
      items.push(meta);
      if (items.length >= needed) break;
    }

    matched += 1;
    cursor = await cursor.continue();
  }

  await tx.done;

  return {
    items: items.slice(0, options.limit),
    hasMore: items.length > options.limit,
  };
}

export async function listChatSessionUserMessageMetasPage(options: {
  sessionId: string;
  limit: number;
  offset: number;
  predicate?: (message: ChatSessionUserMessageMeta) => boolean;
}): Promise<{ items: ChatSessionUserMessageMeta[]; hasMore: boolean }> {
  const db = await getDB();
  const tx = db.transaction(USER_MESSAGE_META_STORE_NAME, 'readonly');
  const items: ChatSessionUserMessageMeta[] = [];
  const needed = options.limit + 1;
  const predicate = options.predicate ?? (() => true);
  const canAdvanceByOffset = options.predicate === undefined && options.offset > 0;
  let matched = 0;
  let cursor = await tx.objectStore(USER_MESSAGE_META_STORE_NAME)
    .index(SESSION_ORDER_INDEX)
    .openCursor(IDBKeyRange.bound([options.sessionId, 0], [options.sessionId, Number.MAX_SAFE_INTEGER]));

  if (canAdvanceByOffset && cursor) {
    cursor = await cursor.advance(options.offset);
  }

  while (cursor) {
    const message = cursor.value;

    if (!predicate(message)) {
      cursor = await cursor.continue();
      continue;
    }

    if (canAdvanceByOffset || matched >= options.offset) {
      items.push(message);
      if (items.length >= needed) break;
    }

    if (!canAdvanceByOffset) {
      matched += 1;
    }
    cursor = await cursor.continue();
  }

  await tx.done;

  return {
    items: items.slice(0, options.limit),
    hasMore: items.length > options.limit,
  };
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(ALL_STORE_NAMES, 'readwrite');
  await Promise.all([
    tx.objectStore(STORE_NAME).delete(sessionId),
    tx.objectStore(META_STORE_NAME).delete(sessionId),
    deleteSessionUserMessageMetas(tx, sessionId),
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
    tx.objectStore(USER_MESSAGE_META_STORE_NAME).clear(),
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
  const tx = db.transaction(SESSION_META_STORE_NAMES, 'readwrite');
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
 * Update only the revision field in IndexedDB (without touching syncedAt).
 *
 * Used after a push 409 conflict where local wins (importRemoteSession →
 * 'skipped'): the local content is newer and should be re-pushed, but the
 * stale revision must be updated so the next push uses the correct base
 * revision and succeeds instead of looping on 409.
 */
export async function updateSessionRevision(sessionId: string, revision: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const session = await store.get(sessionId);
  if (!session) {
    await tx.done;
    return;
  }
  await store.put({ ...session, revision });
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
  const tx = db.transaction(SESSION_DATA_STORE_NAMES, 'readwrite');
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
    await replaceSessionUserMessageMetas(tx, synced);
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
      await replaceSessionUserMessageMetas(tx, synced);
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
  await replaceSessionUserMessageMetas(tx, synced);
  await tx.done;
  return 'imported';
}

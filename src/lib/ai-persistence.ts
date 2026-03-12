import type { AgentMessage } from '@mariozechner/pi-agent-core';

const DB_NAME = 'soma-ai-chat';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const UPDATED_AT_INDEX = 'updatedAt';
const MAX_MESSAGES_PER_SESSION = 100;
const MAX_SESSIONS = 10;

let dbPromise: Promise<IDBDatabase> | null = null;

export interface ChatSession {
  id: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

function getIndexedDB(): IDBFactory {
  if (!globalThis.indexedDB) {
    throw new Error('indexedDB is not available');
  }
  return globalThis.indexedDB;
}

async function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = getIndexedDB().open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? req.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });

      if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
        store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function pruneMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_SESSION) return messages;
  return messages.slice(messages.length - MAX_MESSAGES_PER_SESSION);
}

async function trimOldSessions(db: IDBDatabase): Promise<void> {
  const sessions = await listChatSessions(db);
  const extraSessions = sessions.slice(MAX_SESSIONS);
  if (extraSessions.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const session of extraSessions) {
      store.delete(session.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function listChatSessions(db?: IDBDatabase): Promise<ChatSession[]> {
  const database = db ?? await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index(UPDATED_AT_INDEX);
    const req = index.openCursor(null, 'prev');
    const sessions: ChatSession[] = [];

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(sessions);
        return;
      }
      sessions.push(cursor.value as ChatSession);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveChatSession(session: ChatSession): Promise<ChatSession> {
  const db = await openDB();
  const nextSession: ChatSession = {
    ...session,
    messages: pruneMessages(session.messages),
    updatedAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(nextSession);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  await trimOldSessions(db);
  return nextSession;
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(sessionId);
    req.onsuccess = () => resolve((req.result as ChatSession | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getLatestChatSession(): Promise<ChatSession | null> {
  const sessions = await listChatSessions();
  return sessions[0] ?? null;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function resetChatPersistenceForTests(): void {
  dbPromise = null;
}

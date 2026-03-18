/**
 * Chat session sync routes.
 *
 * PUT  /chat/sessions/:id  — Push a chat session (CAS on revision)
 * GET  /chat/sessions      — Pull sessions updated since a given timestamp
 */
import { Hono } from 'hono';
import type { Env } from '../types.js';
import type { AuthVariables } from '../middleware/auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatSessionRow {
  id: string;
  user_id: string;
  workspace_id: string;
  title: string | null;
  message_count: number;
  revision: number;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMessages(session: unknown): number {
  const mapping = (session as Record<string, unknown>).mapping;
  if (!mapping || typeof mapping !== 'object') return 0;
  return Object.keys(mapping).length;
}

/** Verify that the authenticated user owns the workspace. */
async function verifyWorkspaceOwnership(
  db: D1Database,
  workspaceId: string,
  userId: string,
): Promise<{ error: string; status: 403 | 404 } | null> {
  const workspace = await db.prepare(
    'SELECT owner_id FROM sync_workspaces WHERE workspace_id = ?',
  ).bind(workspaceId).first<{ owner_id: string }>();

  if (!workspace) {
    return { error: 'Workspace not found', status: 404 };
  }
  if (workspace.owner_id !== userId) {
    return { error: 'Forbidden — not workspace owner', status: 403 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const chat = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * PUT /chat/sessions/:id — Push a chat session with compare-and-swap.
 *
 * Body: { session: ChatSession, baseRevision: number, workspaceId: string }
 *
 * - If session doesn't exist on server → create (revision = 1)
 * - If baseRevision matches server → accept, revision++, write R2
 * - If baseRevision mismatch → 409 with remote session
 */
chat.put('/sessions/:id', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  let body: { session: unknown; baseRevision: number; workspaceId: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { session, baseRevision, workspaceId } = body;
  if (!session || typeof baseRevision !== 'number' || !workspaceId) {
    return c.json({ error: 'Missing required fields: session, baseRevision, workspaceId' }, 400);
  }

  const sessionJson = JSON.stringify(session);
  const sizeBytes = new TextEncoder().encode(sessionJson).length;

  // Size guard: 2MB max per session
  if (sizeBytes > 2 * 1024 * 1024) {
    return c.json({ error: 'Session too large (> 2MB)' }, 413);
  }

  const db = c.env.SYNC_DB;
  const r2 = c.env.SYNC_BUCKET;
  const r2Key = `chat/${workspaceId}/${sessionId}.json`;

  // P0-1: Verify workspace ownership
  const ownershipError = await verifyWorkspaceOwnership(db, workspaceId, userId);
  if (ownershipError) {
    return c.json({ error: ownershipError.error }, ownershipError.status);
  }

  const title = (session as Record<string, unknown>).title ?? null;
  const messageCount = countMessages(session);
  const now = Date.now();

  // P1-3: Atomic create — INSERT OR IGNORE so concurrent creates don't race
  const insertResult = await db.prepare(
    `INSERT OR IGNORE INTO chat_sessions (id, user_id, workspace_id, title, message_count, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(sessionId, userId, workspaceId, title, messageCount, now, now).run();

  if ((insertResult.meta?.changes ?? 0) > 0) {
    // New session created — write blob to R2
    await r2.put(r2Key, sessionJson);
    return c.json({ revision: 1 });
  }

  // Existing session — P1-3: Atomic CAS via conditional UPDATE
  const updateResult = await db.prepare(
    `UPDATE chat_sessions
     SET title = ?, message_count = ?, revision = revision + 1, updated_at = ?
     WHERE id = ? AND workspace_id = ? AND revision = ?`,
  ).bind(title, messageCount, now, sessionId, workspaceId, baseRevision).run();

  if ((updateResult.meta?.changes ?? 0) === 0) {
    // CAS failed — revision mismatch (conflict)
    const current = await db.prepare(
      'SELECT revision FROM chat_sessions WHERE id = ? AND workspace_id = ?',
    ).bind(sessionId, workspaceId).first<{ revision: number }>();

    if (!current) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const remoteJson = await r2.get(r2Key);
    const remoteSession = remoteJson ? JSON.parse(await remoteJson.text()) : null;
    return c.json({ conflict: true, remoteSession, remoteRevision: current.revision }, 409);
  }

  // P1-4: CAS passed in D1 — now write blob to R2
  // If R2 fails, revision is advanced but blob is stale. Next push will
  // hit 409, pull the stale blob, and re-push — self-healing.
  await r2.put(r2Key, sessionJson);

  // Read back the new revision
  const updated = await db.prepare(
    'SELECT revision FROM chat_sessions WHERE id = ? AND workspace_id = ?',
  ).bind(sessionId, workspaceId).first<{ revision: number }>();

  return c.json({ revision: updated?.revision ?? baseRevision + 1 });
});

/**
 * GET /chat/sessions?workspaceId={wsId}&since={timestamp}
 *
 * Pull sessions updated after `since` timestamp.
 * Returns metadata list + full session JSON from R2.
 */
chat.get('/sessions', async (c) => {
  const userId = c.get('userId');
  const workspaceId = c.req.query('workspaceId');
  const since = Number(c.req.query('since') ?? '0');

  if (!workspaceId) {
    return c.json({ error: 'Missing workspaceId' }, 400);
  }

  const db = c.env.SYNC_DB;
  const r2 = c.env.SYNC_BUCKET;

  // P0-1: Verify workspace ownership
  const ownershipError = await verifyWorkspaceOwnership(db, workspaceId, userId);
  if (ownershipError) {
    return c.json({ error: ownershipError.error }, ownershipError.status);
  }

  // P1-5: ORDER BY ASC so oldest changes come first (cursor-safe)
  const rows = await db.prepare(
    'SELECT * FROM chat_sessions WHERE workspace_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT 100',
  ).bind(workspaceId, since).all<ChatSessionRow>();

  // P1-5: hasMore flag for pagination
  const hasMore = rows.results.length >= 100;

  if (rows.results.length === 0) {
    return c.json({ sessions: [], metas: [], hasMore: false });
  }

  // Fetch full sessions from R2 in parallel, zip with metas
  const pairs = await Promise.all(
    rows.results.map(async (row) => {
      const r2Key = `chat/${workspaceId}/${row.id}.json`;
      const obj = await r2.get(r2Key);
      if (!obj) return null;
      try {
        const session = JSON.parse(await obj.text());
        const meta = { id: row.id, title: row.title, revision: row.revision, updatedAt: row.updated_at };
        return { session, meta };
      } catch {
        return null;
      }
    }),
  );

  const valid = pairs.filter((p): p is NonNullable<typeof p> => p !== null);

  return c.json({
    sessions: valid.map((p) => p.session),
    metas: valid.map((p) => p.meta),
    hasMore,
  });
});

export default chat;

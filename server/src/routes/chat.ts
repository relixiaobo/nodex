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

  // Check existing server state
  const existing = await db.prepare(
    'SELECT revision FROM chat_sessions WHERE id = ? AND workspace_id = ?',
  ).bind(sessionId, workspaceId).first<{ revision: number }>();

  if (!existing) {
    // New session — create
    const now = Date.now();
    await Promise.all([
      r2.put(r2Key, sessionJson),
      db.prepare(
        `INSERT INTO chat_sessions (id, user_id, workspace_id, title, message_count, revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        sessionId, userId, workspaceId,
        (session as Record<string, unknown>).title ?? null,
        countMessages(session),
        now, now,
      ).run(),
    ]);

    return c.json({ revision: 1 });
  }

  // Existing session — CAS check
  if (existing.revision !== baseRevision) {
    // Conflict: return remote session for client to resolve
    const remoteJson = await r2.get(r2Key);
    const remoteSession = remoteJson ? JSON.parse(await remoteJson.text()) : null;

    return c.json({
      conflict: true,
      remoteSession,
      remoteRevision: existing.revision,
    }, 409);
  }

  // CAS passed — accept
  const newRevision = existing.revision + 1;
  const now = Date.now();

  await Promise.all([
    r2.put(r2Key, sessionJson),
    db.prepare(
      `UPDATE chat_sessions
       SET title = ?, message_count = ?, revision = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    ).bind(
      (session as Record<string, unknown>).title ?? null,
      countMessages(session),
      newRevision, now,
      sessionId, workspaceId,
    ).run(),
  ]);

  return c.json({ revision: newRevision });
});

/**
 * GET /chat/sessions?workspaceId={wsId}&since={timestamp}
 *
 * Pull sessions updated after `since` timestamp.
 * Returns metadata list + full session JSON from R2.
 */
chat.get('/sessions', async (c) => {
  const workspaceId = c.req.query('workspaceId');
  const since = Number(c.req.query('since') ?? '0');

  if (!workspaceId) {
    return c.json({ error: 'Missing workspaceId' }, 400);
  }

  const db = c.env.SYNC_DB;
  const r2 = c.env.SYNC_BUCKET;

  // Get metas from D1
  const rows = await db.prepare(
    'SELECT * FROM chat_sessions WHERE workspace_id = ? AND updated_at > ? ORDER BY updated_at DESC LIMIT 100',
  ).bind(workspaceId, since).all<ChatSessionRow>();

  if (rows.results.length === 0) {
    return c.json({ sessions: [], metas: [] });
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
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMessages(session: unknown): number {
  const mapping = (session as Record<string, unknown>).mapping;
  if (!mapping || typeof mapping !== 'object') return 0;
  return Object.keys(mapping).length;
}

export default chat;

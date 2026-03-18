-- Chat session sync metadata (Phase 4)
-- Full session JSON lives in R2: chat/{workspace_id}/{session_id}.json

CREATE TABLE IF NOT EXISTS chat_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  title         TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  revision      INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_ws_updated
  ON chat_sessions(workspace_id, updated_at);

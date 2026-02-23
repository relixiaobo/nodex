-- Sync metadata tables (Step 2)
-- These tables track sync state; actual CRDT bytes live in R2.

-- Workspace sync metadata
CREATE TABLE IF NOT EXISTS sync_workspaces (
  workspace_id  TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,                    -- Better Auth user ID
  latest_seq    INTEGER NOT NULL DEFAULT 0,
  snapshot_seq  INTEGER NOT NULL DEFAULT 0,       -- latest snapshot covers up to this seq
  snapshot_key  TEXT,                             -- R2 key: /{wsId}/snapshot.bin
  snapshot_vv   TEXT,                             -- Base64 encoded VersionVector
  snapshot_size INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Device sync cursors
CREATE TABLE IF NOT EXISTS sync_devices (
  workspace_id  TEXT NOT NULL,
  device_id     TEXT NOT NULL,                   -- PeerID string
  user_id       TEXT NOT NULL,                   -- Better Auth user ID (denormalized for auth queries)
  last_push_seq INTEGER NOT NULL DEFAULT 0,      -- last seq this device pushed
  last_pull_seq INTEGER NOT NULL DEFAULT 0,      -- last cursor seq this device confirmed
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, device_id),
  FOREIGN KEY (workspace_id) REFERENCES sync_workspaces(workspace_id) ON DELETE CASCADE
);

-- Incremental update metadata (append log index; R2 stores bytes, D1 stores seq/device/hash/key)
CREATE TABLE IF NOT EXISTS sync_updates (
  workspace_id  TEXT NOT NULL,
  seq           INTEGER NOT NULL,                -- monotonically increasing per workspace
  device_id     TEXT NOT NULL,                   -- source device (for echo filtering)
  user_id       TEXT NOT NULL,                   -- Better Auth user ID
  update_hash   TEXT NOT NULL,                   -- SHA-256 hex (idempotency key)
  r2_key        TEXT NOT NULL,                   -- R2 object key
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, seq),
  UNIQUE (workspace_id, update_hash),
  FOREIGN KEY (workspace_id) REFERENCES sync_workspaces(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_updates_workspace_seq
  ON sync_updates(workspace_id, seq);

CREATE INDEX IF NOT EXISTS idx_sync_updates_workspace_device_seq
  ON sync_updates(workspace_id, device_id, seq);

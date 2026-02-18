-- Editor migration: text + marks + inline_refs model
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS marks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS inline_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_nodes_inline_refs ON nodes USING GIN (inline_refs);

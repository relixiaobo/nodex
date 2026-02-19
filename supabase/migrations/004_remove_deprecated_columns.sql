-- Phase 3: Remove deprecated columns from data model simplification
-- Metanode → node.meta[] (completed in migration 003)
-- AssociatedData → Tuple.children[1:] (no schema change needed, runtime-only)
--
-- This migration removes the now-unused columns and indexes.

-- Drop deprecated indexes first
DROP INDEX IF EXISTS idx_nodes_meta_node_id;
DROP INDEX IF EXISTS idx_nodes_association_map;

-- Drop deprecated columns
ALTER TABLE nodes DROP COLUMN IF EXISTS meta_node_id;
ALTER TABLE nodes DROP COLUMN IF EXISTS association_map;

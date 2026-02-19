-- ============================================================
-- 003: 添加 meta 列（替代 Metanode 间接层）
--
-- node.meta TEXT[] 存储元信息 Tuple ID 列表，
-- 替代原来的 _metaNodeId → Metanode.children[] 间接链路。
-- ============================================================

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS meta TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_nodes_meta ON nodes USING GIN (meta);

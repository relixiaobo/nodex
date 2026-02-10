-- ============================================================
-- Nodex 核心数据库 Schema
-- 忠实复制 Tana "Everything is a Node" 数据模型
-- 后端：Supabase (PostgreSQL)
-- ============================================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- ============================================================
-- 用户表
-- ============================================================
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================
-- 核心节点表 —— "一切皆行"
--
-- 忠实映射 Tana 的 TanaNode 结构。
-- 所有实体（内容、标签定义、字段定义、搜索、视图、
-- Tuple、Metanode、AssociatedData）存储在同一张表中。
-- ============================================================
CREATE TABLE nodes (
  -- ─── 身份标识 ───
  id TEXT PRIMARY KEY,

  -- ─── Nodex 扩展：工作区归属 ───
  -- Tana 通过 _ownerId 链向上追溯推导，Nodex 直接存储以提升查询效率
  workspace_id TEXT NOT NULL,

  -- ─── props（忠实复制 Tana Node.props）───

  -- 创建时间戳（毫秒，JavaScript epoch）
  created BIGINT NOT NULL,

  -- 节点名称/内容。支持 HTML 富文本编码：
  --   <span data-inlineref-node="nodeId"></span>  节点引用
  --   <span data-inlineref-date='...'></span>     日期引用
  --   <strong>, <code>, <mark>, <em>, <strike>    格式化
  name TEXT NOT NULL DEFAULT '',

  -- 节点描述
  description TEXT,

  -- 文档类型。NULL = 普通用户内容节点（Tana 中占 46.6%）
  -- 有效值：tuple, metanode, associatedData, tagDef, attrDef, viewDef,
  --         codeblock, visual, url, chat, journal, journalPart, search,
  --         command, systemTool, chatbot, syntax, placeholder,
  --         workspace, home, settings, webClip
  doc_type TEXT,

  -- 父/所有者节点 ID。每个节点恰好一个 Owner。
  -- 特殊值: "{wsId}_TRASH", "{wsId}_SCHEMA", "SYS_0"
  owner_id TEXT,

  -- 关联元节点 ID —— Metanode 间接层核心
  -- ContentNode.meta_node_id → Metanode
  -- Metanode.owner_id → ContentNode （双向链接）
  meta_node_id TEXT,

  -- 模板来源 ID。从 TagDef 模板实例化时指向原始模板 Tuple
  source_id TEXT,

  -- 位标志。1=基础, 2=次要, 64=特殊, 65=组合
  flags INTEGER NOT NULL DEFAULT 0,

  -- 完成时间戳（毫秒）。NULL = 未完成
  done BIGINT,

  -- 图片宽高（仅 visual 类型节点）
  image_width INTEGER,
  image_height INTEGER,

  -- 视图模式：list, table, tiles, cards, navigationList
  view TEXT,

  -- 发布时间戳
  published BIGINT,

  -- 编辑模式标志
  edit_mode BOOLEAN,

  -- 搜索上下文节点
  search_context_node TEXT,

  -- ─── 关系与数据 ───

  -- 子节点 ID 有序列表。决定 UI 渲染顺序。
  -- 对于 Tuple: children[0]=键(SYS_A*/attrDefId), children[1:]=值
  -- 对于 Metanode: 全部是 Tuple 子节点
  -- 对于普通节点: 混合内容子节点和字段 Tuple
  children TEXT[] NOT NULL DEFAULT '{}',

  -- 字段值关联映射。key=子节点ID(字段Tuple), value=associatedData节点ID
  -- 提供字段值的快速索引查找
  -- Tana 中 2,605/2,606 的值指向 associatedData 类型节点
  association_map JSONB NOT NULL DEFAULT '{}',

  -- 各编辑者的访问/编辑计数。索引对应全局 editors 数组
  touch_counts INTEGER[] NOT NULL DEFAULT '{}',

  -- 各编辑者的最后修改时间戳。索引对应全局 editors 数组。0=未修改
  modified_ts BIGINT[] NOT NULL DEFAULT '{}',

  -- ─── Nodex 扩展字段 ───

  -- AI 生成的摘要
  ai_summary TEXT,

  -- 来源 URL（网页剪藏）
  source_url TEXT,

  -- 乐观锁版本号
  version INTEGER NOT NULL DEFAULT 1,

  -- 最后修改时间戳（毫秒）
  updated_at BIGINT NOT NULL,

  -- 创建/修改者用户 ID
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- ============================================================
-- 索引
-- ============================================================

-- 工作区级查询（最常用）
CREATE INDEX idx_nodes_workspace ON nodes (workspace_id);

-- 父节点查询（树形遍历）
CREATE INDEX idx_nodes_owner ON nodes (owner_id);

-- 文档类型查询（按类型过滤：tagDef, attrDef, search 等）
CREATE INDEX idx_nodes_doc_type ON nodes (doc_type) WHERE doc_type IS NOT NULL;

-- Metanode 查找（从内容节点找 Metanode）
CREATE INDEX idx_nodes_meta_node ON nodes (meta_node_id) WHERE meta_node_id IS NOT NULL;

-- 模板来源查找（从实例 Tuple 找模板 Tuple）
CREATE INDEX idx_nodes_source ON nodes (source_id) WHERE source_id IS NOT NULL;

-- 子节点数组查询（GIN 索引支持 @> 和 && 操作符）
CREATE INDEX idx_nodes_children ON nodes USING GIN (children);

-- 全文搜索（中英文通用的 simple 配置）
CREATE INDEX idx_nodes_name_fts ON nodes USING GIN (to_tsvector('simple', name));

-- AssociationMap 查询
CREATE INDEX idx_nodes_association_map ON nodes USING GIN (association_map);

-- 完成状态查询
CREATE INDEX idx_nodes_done ON nodes (done) WHERE done IS NOT NULL;

-- 工作区 + 文档类型复合查询（获取某工作区的所有标签定义等）
CREATE INDEX idx_nodes_ws_doctype ON nodes (workspace_id, doc_type) WHERE doc_type IS NOT NULL;

-- ============================================================
-- AI 向量搜索表
-- ============================================================
CREATE TABLE node_embeddings (
  node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  embedding vector(1536),  -- text-embedding-3-small 维度
  updated_at BIGINT NOT NULL
);

-- IVFFlat 索引用于近似最近邻搜索
CREATE INDEX idx_embeddings_vector ON node_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- 工作区成员表
-- ============================================================
CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'editor',  -- 'owner', 'editor', 'viewer'
  joined_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (workspace_id, user_id)
);

-- ============================================================
-- 全局编辑者表
-- 对应 Tana 导出 JSON 的 editors 数组
-- touchCounts/modifiedTs 的索引对应此表的 index 列
-- ============================================================
CREATE TABLE editors (
  workspace_id TEXT NOT NULL,
  index INTEGER NOT NULL,
  identifier TEXT NOT NULL,  -- 邮箱或系统标识（如 "system+ai@tagr"）
  PRIMARY KEY (workspace_id, index)
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE editors ENABLE ROW LEVEL SECURITY;

-- 用户只能访问其所属工作区的节点
CREATE POLICY "Users can access workspace nodes" ON nodes
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- 用户只能访问其所属工作区的 embeddings
CREATE POLICY "Users can access workspace embeddings" ON node_embeddings
  FOR ALL USING (
    node_id IN (
      SELECT n.id FROM nodes n
      JOIN workspace_members wm ON n.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- 用户只能查看自己的成员关系
CREATE POLICY "Users can view own memberships" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());

-- 用户只能访问其所属工作区的编辑者
CREATE POLICY "Users can access workspace editors" ON editors
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 实时同步启用
-- Supabase Realtime 基于 PostgreSQL Logical Replication
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE nodes;

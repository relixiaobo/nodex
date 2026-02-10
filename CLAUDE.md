# Nodex

Chrome Side Panel 云端知识管理工具，忠实复刻 Tana 核心功能。

## 项目概述

Nodex 让用户在浏览网页时，通过 Chrome Side Panel 记录和组织信息，与历史笔记协同阅读，并提供 AI 辅助功能（聊天、网页操作等）。

**核心设计原则**：忠实复制 Tana 的 "Everything is a Node" 数据模型，包括 Tuple、Metanode、AssociatedData 间接层，不做简化。

## 技术栈

| 层面 | 选择 | 说明 |
|------|------|------|
| **语言** | TypeScript 5 | ESM, strict mode, ES2022 target |
| **扩展框架** | WXT | Vite 基座，自动 manifest，HMR，跨浏览器 |
| **UI 框架** | React 19 | Tana 同款，生态最大 |
| **CSS** | Tailwind CSS 4 | Tana 同款（`tw-` 前缀），配合 shadcn/ui |
| **UI 组件** | shadcn/ui | 基于 Radix UI，Tailwind 原生支持 |
| **编辑器** | TipTap (ProseMirror) | Schema-driven 树模型，内置大纲操作 |
| **状态管理** | Zustand | 4KB，支持 persist + immer 中间件 |
| **后端** | Supabase (PostgreSQL) | Realtime、RLS、pgvector |
| **同步** | Supabase Realtime + Zustand persist | 乐观更新 + chrome.storage 缓存 |
| **构建** | Vite (via WXT) | 快速 HMR，tree-shaking |
| **ID 生成** | nanoid | 21 字符, URL-safe |

**模块系统**: ESM (`"type": "module"`)，服务层导入路径需 `.js` 后缀

## 常用命令

```bash
npm run dev          # WXT 开发模式 (自动加载扩展到 Chrome，HMR)
npm run build        # WXT 生产构建 → .output/chrome-mv3/
npm run zip          # 打包为 .zip (用于发布)
npm run typecheck    # TypeScript 类型检查 (tsc --noEmit)
```

## 项目结构

```
wxt.config.ts              # WXT 主配置 (React module + Tailwind v4 插件)
src/
  assets/
    main.css               # Tailwind v4 CSS-first 入口 (@import "tailwindcss" + @theme)
  entrypoints/
    sidepanel/             # Chrome Side Panel (主 UI 入口)
      index.html           # HTML 容器
      main.tsx             # React createRoot 入口
      App.tsx              # 根组件 (初始化 + 布局)
    background/            # Service Worker (打开 Side Panel + 消息中转)
      index.ts
    content/               # Content Script (网页剪藏, 占位)
      index.ts
  components/
    outliner/              # 大纲核心
      OutlinerView.tsx     # 大纲容器 (渲染根节点的子节点列表)
      OutlinerItem.tsx     # 大纲项 (递归, 懒加载子节点)
      BulletChevron.tsx    # 展开/折叠按钮 + 叶节点圆点
      DragHandle.tsx       # 拖拽手柄 (lucide GripVertical)
    editor/                # 编辑器
      NodeEditor.tsx       # Per-Node TipTap 编辑器 (聚焦创建/失焦销毁 + 键盘快捷键)
    search/                # 搜索
      CommandPalette.tsx   # Cmd+K 命令面板 (cmdk, 节点搜索 + 容器导航)
    panel/                 # 面板系统
      PanelStack.tsx       # 面板栈导航 (push/pop/replace)
      NodePanel.tsx        # 节点面板 (Header + OutlinerView)
      NodePanelHeader.tsx  # 面板头 (sidebar toggle + back + title)
    sidebar/               # 侧栏
      Sidebar.tsx          # 侧栏布局
      SidebarNav.tsx       # 导航项 (Library/Inbox/Journal/Searches/Trash)
  hooks/
    use-node.ts            # 订阅单节点 + 懒加载
    use-children.ts        # 订阅子节点列表 + 懒加载
    use-realtime.ts        # Supabase Realtime 订阅
  stores/
    node-store.ts          # 归一化节点实体 (immer, 乐观更新, 含树操作)
    ui-store.ts            # UI 状态 (面板栈/展开/焦点/侧栏, persist → chrome.storage)
    workspace-store.ts     # 工作区 + 用户认证 (persist → chrome.storage)
  lib/
    chrome-storage.ts      # Zustand persist 适配器 (chrome.storage.local + Set 序列化)
    supabase.ts            # WXT 环境 Supabase 初始化 (VITE_* env vars)
    tree-utils.ts          # 树遍历工具 (flatten/navigate/parent/sibling)
  types/                   # 核心类型 (不变)
    node.ts                # NodexNode, DocType, NodeProps, WORKSPACE_CONTAINERS
    system-nodes.ts        # SYS_A*(60+), SYS_D*(12), SYS_V*(22+), SYS_T*(25+)
    index.ts               # 统一导出
  services/                # 数据服务层 (不变)
    supabase.ts            # 客户端单例
    node-service.ts        # CRUD + 树操作 + 批量 + rowToNode/NodeRow
    tag-service.ts         # 标签应用 (Metanode+Tuple)
    field-service.ts       # 字段值 (Tuple+AssociationMap)
    search-service.ts      # 搜索 + 反向引用
    tana-import.ts         # Tana JSON 导入
    index.ts               # 统一导出
  env.d.ts                 # 自定义 VITE_* 环境变量类型声明
supabase/
  migrations/
    001_create_nodes.sql   # DB Schema (单表 nodes + 辅助表)
research/                  # 只读参考资料
```

## 数据模型核心概念

### 一切皆节点

单表 `nodes` 存储所有类型。`doc_type` 列区分节点类型（22 种 + 1 Nodex 新增）。无 `doc_type` 的是普通内容节点（占 46.6%）。

### 三大间接层（忠实保留 Tana）

1. **Tuple** (`doc_type='tuple'`, 占 29.3%): 万能键值对。`children[0]` = 键 (SYS_A* 或 attrDefId)，`children[1:]` = 值。
2. **Metanode** (`doc_type='metanode'`, 占 13.5%): 元信息代理。通过 `_metaNodeId` 链接到内容节点，`children` 全部是 Tuple。
3. **AssociatedData** (`doc_type='associatedData'`, 占 6.3%): 通过 `associationMap` 映射，提供字段值索引。

### 标签应用链路 (六步)

```
ContentNode._metaNodeId → Metanode
  Metanode.children → Tuple [SYS_A13, tagDefId]   ← 标签绑定
  Metanode.children → Tuple [SYS_A55, SYS_V03]    ← checkbox 配置
ContentNode.children → Tuple [attrDefId, valueNodeId]  ← 字段实例 (_sourceId → 模板)
ContentNode.associationMap → { tupleId: associatedDataId }
```

### 字段值存储 (三层)

```
ContentNode
  ├── children: [..., fieldTupleId, ...]
  ├── associationMap: { fieldTupleId: associatedDataId }
  └── Tuple (children: [attrDefId, valueNodeId])
```

### 工作区容器命名

容器节点 ID = `{workspaceId}_{SUFFIX}`，后缀见 `WORKSPACE_CONTAINERS` 常量。

### AssociationMap 语义

经数据验证修正：AssociationMap 的 KEY 主要是普通内容子节点（88.1%），不限于字段 Tuple。它是 children → associatedData 的**通用映射机制**。

## 数据库设计要点

- **单表 `nodes`**: 所有 Tana props 平铺为 PostgreSQL 列（snake_case）
- **`children TEXT[]`**: 有序子节点列表，GIN 索引
- **`association_map JSONB`**: 字段值索引映射，GIN 索引
- **乐观锁**: `version` 列，每次更新 +1，updateNode 先读后写验证
- **RLS**: 基于 `workspace_members` 表的工作区级别行级安全
- **Realtime**: `nodes` 表已加入 `supabase_realtime` publication

## 代码约定

### TypeScript

- 所有导入使用 `.js` 后缀（ESM 要求）
- Props 更新用 `Partial<NodeProps>`，不要求 `created`
- 节点创建用 `CreateNodeInput`，更新用 `UpdateNodeInput`
- 系统常量统一从 `src/types/index.js` 导入 (`SYS_A`, `SYS_D`, `SYS_V`, `SYS_T`)

### 数据库列名映射

| TypeScript (camelCase) | PostgreSQL (snake_case) |
|------------------------|-------------------------|
| `workspaceId` | `workspace_id` |
| `props._docType` | `doc_type` |
| `props._ownerId` | `owner_id` |
| `props._metaNodeId` | `meta_node_id` |
| `props._sourceId` | `source_id` |
| `props._flags` | `flags` |
| `props._done` | `done` |
| `associationMap` | `association_map` |
| `touchCounts` | `touch_counts` |
| `modifiedTs` | `modified_ts` |
| `updatedAt` | `updated_at` |
| `createdBy` | `created_by` |

转换函数：`rowToNode()` / `nodeToRow()`（在 `node-service.ts` 中）。

### 关键 SYS_A* 常量速查

| 常量 | 值 | 用途 |
|------|----|------|
| `SYS_A.NODE_SUPERTAGS` | `SYS_A13` | 标签绑定（最核心） |
| `SYS_A.CHILD_SUPERTAG` | `SYS_A14` | 默认子标签 |
| `SYS_A.SEARCH_EXPRESSION` | `SYS_A15` | 搜索表达式 |
| `SYS_A.VIEWS` | `SYS_A16` | 视图配置 |
| `SYS_A.TYPE_CHOICE` | `SYS_A02` | 字段数据类型 |
| `SYS_A.SHOW_CHECKBOX` | `SYS_A55` | checkbox 显示 |
| `SYS_A.LOCKED` | `SYS_A12` | 锁定状态 |
| `SYS_A.COLOR` | `SYS_A11` | 节点颜色 |

## 已知注意事项

### Tana 导入

- Tana 导出的 `touchCounts`/`modifiedTs` 有两种格式：标准数组 `[1769, 0]` 和 JSON 字符串 `'{"0":1769}'`（紧凑稀疏格式）。`parseCompactArray()` 统一处理。
- 工作区 ID 通过 `_ownerId` 链 + 容器后缀（`_SCHEMA`, `_TRASH` 等）反向推导。
- `research/b8AyeCJNsefK@2026-01-30.json` 是 16MB 文件，不要直接用 Read 工具打开，用 Python/Bash 脚本处理。

### 引用完整性

- 导入的 41,753 节点中，children 缺失引用 267 条（0.06%）—— 属于预期范围（跨工作区引用等）。
- `_metaNodeId` 引用 100% 完整。

## 开发路线图

- [x] 数据模型设计 (TypeScript 类型 + PostgreSQL Schema)
- [x] 核心服务层 (CRUD / 标签 / 字段 / 搜索 / 导入)
- [x] 数据迁移验证 (41,753 节点 100% 转换成功)
- [x] 技术选型 (WXT + React 19 + Tailwind 4 + TipTap + Zustand + shadcn/ui)
- [x] 核心架构设计 (Per-Node Editor + 归一化 Zustand Store + Side Panel 直连 Supabase)
- [x] WXT 项目初始化 + 基础骨架 (entrypoints, stores, components, hooks, build OK)
- [x] TipTap 编辑器集成 (Per-Node Editor, 聚焦创建/失焦销毁, 富文本 bold/italic/code)
- [x] 键盘导航 (Enter→创建兄弟, Tab→缩进, Shift+Tab→反缩进, ↑↓→焦点, Backspace→删除空节点)
- [x] 离线/Demo 模式 (isSupabaseReady() guard, 本地种子容器节点, 全操作本地可用)
- [x] Lucide 图标 + UI 优化 (sidebar/header 图标, search trigger)
- [x] 搜索面板 Cmd+K (cmdk command palette, 节点搜索, 容器快速导航)
- [x] 节点上下移动 (Ctrl/Cmd+Shift+↑/↓)
- [x] 拖拽排序 (HTML5 DnD, before/after/inside 三区域判定, 视觉指示器)
- [ ] 标签 + 字段 UI
- [ ] AI 功能集成
- [ ] 实时同步验证 (多标签)
- [ ] 网页剪藏

## Tana 产品技术栈（逆向分析结果）

通过运行时分析 app.tana.inc 确认：React 18+ / MobX / Tailwind + CSS Modules + Emotion / 自研 contentEditable 编辑器 / Vite 构建 / Sentry 错误追踪。主包 4.9MB + vendor 6.6MB（完整 Web 应用）。

关键组件架构：`OutlinerItem` → `NodeAsListElement` → `BulletChevron` + `span.editable[contenteditable]`。面板系统：`PanelStack` → `NodePanel` → `NodePanelContent`。

## Chrome Side Panel 约束

| 约束 | 应对策略 |
|------|----------|
| 无法控制面板宽度 (300-700px+) | CSS container queries + ResizeObserver |
| Service Worker 随时可能终止 | Zustand persist → chrome.storage |
| MV3 CSP 限制 | 所有资源本地打包，无 CDN |
| 与网页通信 | chrome.runtime.sendMessage + content script |

## 参考文档

- `research/tana-data-model-specification.md` — 数据模型权威规格（设计决策的 source of truth）
- `.claude/plans/ancient-plotting-lemon.md` — 技术选型详细方案（含 Tana 逆向分析完整数据）
- Tana 官方: https://tana.inc
- Supabase 文档: https://supabase.com/docs
- WXT 文档: https://wxt.dev
- TipTap 文档: https://tiptap.dev
- shadcn/ui 文档: https://ui.shadcn.com

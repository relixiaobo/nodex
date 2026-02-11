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
docs/                      # 文档 (roadmap, testing, research)
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

### 点击区域标准 (Hit Area Standard)

所有可交互的小元素（图标、按钮、小型点击目标）必须保证足够大的点击区域：

- **最小点击区域**: 28px × 15px（与行高 h-7 对齐）
- **实现方式**: 外层透明容器撑大点击区域，内层保持视觉尺寸不变
- **示例**: BulletChevron 的 bullet 外层 `h-7 w-[15px]`（28×15 hit area），内层 `h-[15px] w-[15px]`（视觉尺寸）
- **线性点击区域**: 垂直/水平线条类元素至少 `w-4`（16px）宽度
- **参考组件**: `BulletChevron.tsx`（group/bullet 模式）、`OutlinerItem.tsx`（indent guide）

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
- `docs/research/b8AyeCJNsefK@2026-01-30.json` 是 16MB 文件，不要直接用 Read 工具打开，用 Python/Bash 脚本处理。

### 引用完整性

- 导入的 41,753 节点中，children 缺失引用 267 条（0.06%）—— 属于预期范围（跨工作区引用等）。
- `_metaNodeId` 引用 100% 完整。

## 开发路线图

详细路线图见 `docs/ROADMAP.md`，以下为当前进度摘要：

- [x] 数据模型 + 服务层 + 迁移验证
- [x] WXT + React 19 + TipTap + Zustand 基础骨架
- [x] Outliner 核心 (编辑/键盘导航/拖拽/搜索面板)
- [x] Supertags 基础 (#触发/应用/TagBadge/TagSelector)
- [x] Fields 基础 (>触发/字段名编辑+自动完成/交错渲染/字段值编辑器)
- [ ] **Phase 1.1**: References & @引用 ← 当前
- [ ] **Phase 1.2**: Supertags 完善 (模板/继承/配置页)
- [ ] **Phase 1.3**: Fields 全类型 (Date/Number/URL/Email/Checkbox)
- [ ] **Phase 1.4**: Date 节点 & 日记
- [ ] **Phase 2**: 视图 & 搜索 (Table/Cards/Calendar/Live Queries)
- [ ] **Phase 3**: AI & 网页 (AI Chat/剪藏/网页辅助)
- [ ] **Phase 4**: 同步 & 可靠性 (Supabase Realtime/离线/导入导出)
- [ ] **Phase 5**: 高级功能 (Command Nodes/Publishing/API)

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

## 测试与验证

### MCP 工具分工

| 工具集 | 用途 | 适用目标 |
|--------|------|----------|
| **`chrome-devtools` MCP** | JS 执行、a11y 快照、DOM 操作 | `http://localhost:5199` (standalone) |
| **`claude-in-chrome` MCP** | 截图、缩放、视觉比较、元素交互 | 任意标签页 (含 Tana 参考) |

**关键限制**：
- `chrome-devtools` 只能连接 localhost，不能连接 chrome-extension:// 页面
- `claude-in-chrome` 可以截图任何标签页，但 JS 执行受限于 Vite 模块隔离
- 两个工具都无法模拟真实键盘事件（ProseMirror 忽略 `isTrusted: false`）
- 截图前先调整页面为 1000x800 或更小
- **Tana 操作限制**: 只允许操作 `just_for_claude` 工作区，禁止操作用户其他工作区（如 Xiaobo）

### Standalone 测试环境

```bash
npm run dev:test   # 启动 http://localhost:5199/standalone/index.html
```

- `standalone/TestApp.tsx` 跳过 Supabase 初始化，纯离线模式
- 种子数据 68 个节点（`src/entrypoints/test/seed-data.ts`，含 Schema + TagDef + AttrDef）
- **Store 全局访问**：`window.__nodeStore` / `window.__uiStore` / `window.__wsStore`

### 自测流程 → `/self-test` Skill

每次改完代码后，运行 `/self-test` 执行标准验证流程。参数：`/self-test all|store|visual|build`

- Skill 是通用自测规范（`.claude/skills/self-test/SKILL.md`）
- 项目特定配置见 `docs/TESTING.md`（脚本、seed data、已知 bug、检查点）
- 测试脚本目录：`tests/scripts/`

## 参考文档

- `docs/research/tana-data-model-specification.md` — 数据模型权威规格（设计决策的 source of truth）
- `.claude/plans/ancient-plotting-lemon.md` — 技术选型详细方案（含 Tana 逆向分析完整数据）
- Tana 官方: https://tana.inc
- Supabase 文档: https://supabase.com/docs
- WXT 文档: https://wxt.dev
- TipTap 文档: https://tiptap.dev
- shadcn/ui 文档: https://ui.shadcn.com

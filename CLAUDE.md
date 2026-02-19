# Nodex

Chrome Side Panel 云端知识管理工具，忠实复刻 Tana 核心功能。

## 项目概述

Nodex 让用户在浏览网页时，通过 Chrome Side Panel 记录和组织信息，与历史笔记协同阅读，并提供 AI 辅助功能（聊天、网页操作等）。

**核心设计原则**：基于 Tana 的 "Everything is a Node" 数据模型，保留 Tuple 核心抽象，简化掉 Firebase 时代的 Metanode 和 AssociatedData 间接层。

## 沟通约定

| 用户说 | Claude 应做 |
|--------|------------|
| "描述/分析/研究 X" | 产品级文档，不含代码引用、文件路径或实现细节 |
| "设计/方案/计划 X" | 技术方案，含文件清单和修改思路，但不写代码 |
| "实现/修复/添加 X" | 直接写代码 |
| 不确定 | 先问意图层级再动手 |

**额外规则**:
- 用户要求"匹配 Tana"时，先截图对比再改代码，不要凭代码猜测
- 不要过度工程化（如用户要文档时不要建框架，要修 bug 时不要重构周边代码）
- 特性行为的权威来源是 `docs/features/` 中的特性规格，其次是 `docs/research/`

**`docs/features/` 维护职责**:
- 由 Claude 负责维护，用户不会直接编辑这些文件
- 用户通过聊天提出需求、反馈和建议，Claude 负责将其沉淀到对应的特性文档中
- 实现新特性或修复行为 bug 后，主动更新对应文档的"当前状态"和"决策记录"
- 发现新的边界条件或与 Tana 的差异时，补充到"与 Tana 的已知差异"段
- 新特性（跨 2+ session 的复杂功能）首次讨论时，创建新的 `docs/features/xxx.md`

**交付后默认动作（无需用户提醒）**:
- 每次完成“实现/修复/更新”后，Claude 默认同步文档，不等待用户额外指令
- Bug 修复：在 `docs/TASKS.md` 中勾选对应子任务或移到「已完成」
- 行为变更：更新对应 `docs/features/*.md`（行为规格、决策记录、当前状态）
- 可测性变更：更新 `docs/TESTING.md`（自动化与环境）和 `docs/MANUAL-TEST-CHECKLIST.md`（关键人工验收）
- 人工验收用例仅在「Agent 无法可靠自动验证」或「核心高风险路径」时新增；默认不把常规验证压给用户
- 若本次改动不涉及行为或流程变化，在最终回复中显式说明“无需文档变更”

## 测试同步硬规则（新增）

为确保“功能迭代后主动更新测试”可执行，不仅依赖习惯，必须遵守以下规则：

1. 只要改动 `src/` 下代码，必须同步新增或更新 `tests/vitest/*.test.ts`。
2. 只要改动了 `tests/vitest/`，必须同步更新 `docs/TESTING.md` 的覆盖映射。
3. PR / push 的 CI 会执行 `npm run check:test-sync`，违反以上规则直接失败。
4. 每轮迭代提交前，默认顺序：`typecheck` → `check:test-sync` → `test:run` → `build`。

## 多 Agent 协作规则

详细协作规范见 `docs/AGENT-COLLABORATION.md`（文档治理、任务跟踪、交接协议、冲突预防）。

### 快速参考

- **角色分工**: `nodex`（主仓库）= Review + Merge；`nodex-codex` / `nodex-cc` / `nodex-cc-2` = 功能开发 + 提 PR
- **Git Worktree**: 所有 Agent 共享一个 `.git` 仓库，`git fetch` 一次全局可见。分支前缀：`codex/<feature>`、`cc/<feature>`、`cc2/<feature>`
- **禁止直接 push main**: Dev Agent **绝对不能**直接向 main 分支 push commit。所有代码变更必须通过 PR 合入，由 nodex review 后 merge。唯一例外：nodex 自身的小修复和紧急改动
- **任务跟踪**: `docs/TASKS.md`（单一事实来源）
- **Draft PR**: 开发开始后立即创建 Draft PR，让进度和修改文件对所有人可见
- **PR 状态管理**: Dev Agent 开发中保持 Draft 状态；完成后 `gh pr ready` 转为 Ready。nodex **只 review Ready 状态的 PR**，Draft PR 会被忽略
- **Review 驱动**: Dev Agent 完成后 `gh pr ready` → nodex 自行检查并 review → 意见直接写 PR comment
- **文档所有权**: 改功能同步更新 `docs/features/*.md`，改测试同步更新 `docs/TESTING.md`
- **高风险文件**: `node-store.ts`、`OutlinerItem.tsx`、`system-nodes.ts` — 同一时间只有一个 Agent 改，开发前在 TASKS.md 声明文件锁
- **Dev Server 端口**: 主仓库 `5199`，nodex-codex `5200`，nodex-cc `5201`，nodex-cc-2 `5202`

### 接到任务后的强制第一步（不可跳过）

无论是用户指定任务还是自己找到任务，Dev Agent 写第一行代码之前**必须**执行：

```bash
# 1. 编辑 docs/TASKS.md：
#    - 更新「Agent 状态」表（填入当前任务、分支、修改中的文件）
#    - 将任务移到「进行中」或新建条目（含 Owner、Branch、Files、Progress）

# 2. 创建分支 + commit TASKS.md 变更 + Draft PR
git checkout -b cc/<feature> origin/main
git add docs/TASKS.md && git commit -m "docs: claim task — <任务名>"
git push -u origin cc/<feature>
gh pr create --draft --title "[WIP] feat: ..." --body "ref: <任务名>"
```

**为什么不可跳过**：其他 Agent（包括 nodex）通过 `Read docs/TASKS.md` 判断全局工作状态。不更新 = 对其他人不可见 = 可能产生文件冲突。

## 实现策略

- 涉及 **3+ 文件**的 UI 特性，必须分步实现，每步后 `npm run typecheck` + 视觉验证
- 改动导致**页面白屏/崩溃**时，立即 `git stash` 回退，不要在错误基础上修补
- 新增 UI 交互（hover、拖拽、动画）先在**隔离组件**中验证，再集成到主树
- 每完成一个有意义的功能点或修复后应**主动 git commit**
- Commit message 简要关联任务名称，如 `feat: node selection phase 1 — escape to select mode`

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
    tag-service.ts         # 标签应用 (meta+Tuple)
    field-service.ts       # 字段值 (Tuple.children 直接存值)
    search-service.ts      # 搜索 + 反向引用
    tana-import.ts         # Tana JSON 导入
    index.ts               # 统一导出
  env.d.ts                 # 自定义 VITE_* 环境变量类型声明
supabase/
  migrations/
    001_create_nodes.sql   # DB Schema (单表 nodes + 辅助表)
docs/                      # 文档 (roadmap, testing, research, features)
.github/                   # PR 模板
```

## 数据模型核心概念

### 一切皆节点

单表 `nodes` 存储所有类型。`doc_type` 列区分节点类型（22 种 + 1 Nodex 新增）。无 `doc_type` 的是普通内容节点（占 46.6%）。

### 配置页面 = 系统标签模板（核心设计模式）

Tana 的配置页面（字段配置、标签配置等）不是定制 UI，而是**标准 NodePanel 渲染被系统标签标记的节点**：

- **attrDef** 被 `SYS_T02` (FIELD_DEFINITION) 标记 → 配置页 = SYS_T02 的模板字段
- **tagDef** 被 `SYS_T01` (SUPERTAG) 标记 → 配置页 = SYS_T01 的模板字段

配置页上的每个配置项（Field type 下拉、Options 列表、Toggle 开关等）都是系统标签模板字段的实例，通过不同渲染组件呈现：`TupleAsPicker`（下拉）、`ToggleButton`（开关）、标准 `OutlinerItem`（节点列表）。

详见 `docs/research/tana-config-page-architecture.md`。

### 间接层（简化后只保留 Tuple）

1. **Tuple** (`doc_type='tuple'`, 占 29.3%): 万能键值对。`children[0]` = 键 (SYS_A* 或 attrDefId)，`children[1:]` = 值（字段值直接存这里）。
2. **node.meta** (`TEXT[]` 列): 元信息 Tuple ID 列表。`meta = [tagTupleId, checkboxTupleId, ...]`

### 标签应用链路 (四步)

```
ContentNode.meta → [TagTuple.id, CbTuple.id]
  TagTuple.children: [SYS_A13, tagDefId]   ← 标签绑定
  CbTuple.children: [SYS_A55, SYS_V03]     ← checkbox 配置
ContentNode.children → Tuple [attrDefId, valueNodeId1, valueNodeId2, ...]  ← 字段实例（值直接存 children）
```

### 字段值存储 (两层)

```
ContentNode
  ├── children: [..., fieldTupleId, ...]
  └── FieldTuple.children: [attrDefId, valueNodeId1, valueNodeId2, ...]
```

### 工作区容器命名

容器节点 ID = `{workspaceId}_{SUFFIX}`，后缀见 `WORKSPACE_CONTAINERS` 常量。

### AssociationMap 语义（已废弃）

~~经数据验证修正：AssociationMap 的 KEY 主要是普通内容子节点（88.1%），不限于字段 Tuple。~~ AssociationMap 已废弃。字段值直接存储在 Tuple.children[1:] 中。

### "一切皆节点"设计守则（实现时必须遵守）

> **核心判断标准**：这个信息该存为节点/Tuple，还是 JSON/字符串/UI 状态？**答案永远是前者。**

实现 P2/P3 功能时，以下 6 条守则不可违背：

1. **视图配置 = ViewDef 节点 + Tuple**，不是 JSON blob。视图可通过 supertag 模板继承
2. **Filter/Sort/Group = ViewDef 的持久化 Tuple**，不是 React state 或 Zustand 临时状态。视图切换时自动保存/恢复
3. **搜索条件 = Tuple 树**，不是 DSL 字符串 `"#task AND status:TODO"`。Query Builder 直接渲染 Tuple 节点树
4. **日期字段值 = 日节点引用**，不是字符串 `"2026-02-16"`。日期是一等公民（可挂 children/tag/field）
5. **剪藏元数据 = Supertag 字段**，不是节点属性。所有新增元数据走 attrDef，不加 NodexNode 顶层属性
6. **AI 命令 = Command Node**，prompt/参数/输出全部是节点/字段/children，不建独立配置系统

详细设计见 `docs/features/data-model.md` § 设计守则。

## 数据库设计要点

- **单表 `nodes`**: 所有 Tana props 平铺为 PostgreSQL 列（snake_case）
- **`children TEXT[]`**: 有序子节点列表，GIN 索引
- **`meta TEXT[]`**: 元信息 Tuple ID 列表，GIN 索引
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
- **文本交互区域**: click handler 绑定在占满空间的 `flex-1` 容器上，不是 `truncate` 的文本 span 上。文本右侧空白区域也要响应点击
- **icon 对齐规则**: icon + 多行文本（name + description）布局时，icon 用 `items-start`（对齐首行），不要用 `items-center`（会跟多行内容居中）

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
| `meta` | `meta` |
| `props._sourceId` | `source_id` |
| `props._flags` | `flags` |
| `props._done` | `done` |
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
- `meta` 数组引用完整性由 invariants helper 验证。

## 任务跟踪与文档

- **任务跟踪**: `docs/TASKS.md`（单一事实来源，一次 Read 获取全局状态）
- **共享经验**: `docs/LESSONS.md`（所有 Agent 共用的陷阱、设计模式、方法论）
- 特性行为规格见 `docs/features/`
- 多 Agent 协作规范见 `docs/AGENT-COLLABORATION.md`

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
- Vitest 套件目录：`tests/vitest/`

### 人工验收准入标准（严格控制）

- `docs/MANUAL-TEST-CHECKLIST.md` 是“例外清单”，不是全量回归清单
- 仅满足以下任一条件才写入人工验收：
  - Agent 受技术限制无法可靠验证（如 ProseMirror `isTrusted` 键盘事件、真实拖拽手感、跨分辨率视觉细节）
  - 核心路径且失败代价高（数据丢失、结构破坏、导航/编辑主链路中断）
- 一般功能默认由 Agent 自测闭环（脚本 + 静态检查 + 可自动化交互），不要求用户逐项手点

### Vitest-First 测试策略

- 优先把可测试规则从组件中下沉到 `src/lib/` 或 `src/stores/`，用 Vitest 覆盖
- 每次修复 bug，补一个对应 Vitest 回归用例
- 优先验证树结构不变量（`children` / `_ownerId` / `trash` / `meta` 一致性）
- 仅保留最小量浏览器自动化用于 Vitest 无法可靠覆盖的真实交互链路

## 参考文档

### 设计系统
- `docs/design-system.md` — UI 视觉标准（色彩/排版/间距/圆角/交互状态/组件模式）

### 特性规格（行为定义）
- `docs/features/references.md` — References & @引用
- `docs/features/supertags.md` — Supertags 系统
- `docs/features/fields.md` — Fields 全类型

### 逆向研究（Tana 分析）
- `docs/research/tana-data-model-specification.md` — 数据模型权威规格
- `docs/research/tana-config-page-architecture.md` — 配置页面 node 结构

### 项目
- GitHub: https://github.com/relixiaobo/nodex

### 外部文档
- Tana 官方: https://tana.inc
- Supabase: https://supabase.com/docs
- WXT: https://wxt.dev
- TipTap: https://tiptap.dev
- shadcn/ui: https://ui.shadcn.com

# soma

> Think where you read.

浏览器侧边栏知识管理工具，忠实复刻 Tana 核心功能。

## 项目概述

soma 让用户在浏览网页时，通过 Chrome Side Panel 记录和组织信息，与历史笔记协同阅读，并提供 AI 辅助功能（聊天、网页操作等）。

**核心设计原则**：基于 Tana 的 "Everything is a Node" 数据模型，保留 Field Entry 核心抽象，简化掉 Firebase 时代的 Metanode 和 AssociatedData 间接层。

## 沟通约定

| 用户说 | Claude 应做 |
|--------|------------|
| "描述/分析/研究 X" | 产品级文档，不含代码引用、文件路径或实现细节 |
| "设计/方案/计划 X" | 技术方案，含文件清单和修改思路，但不写代码 |
| "实现/修复/添加 X" | 直接写代码 |
| 不确定 | 先问意图层级再动手 |

**额外规则**:
- 用户要求”匹配 Tana”时，先截图对比再改代码，不要凭代码猜测
- 不要过度工程化（如用户要文档时不要建框架，要修 bug 时不要重构周边代码）
- **UI 改动先问 spec**：改 UI 时，先确认 padding、alignment、icon、color 等视觉细节再动手，不要猜了再改。第一次就做对，避免 2-3 轮视觉修正循环
- **交互行为先确认**：实现交互功能前，用 GIVEN → WHEN → THEN 格式确认目标行为。特别是：创建新节点 vs 变换当前节点 vs 添加子/兄弟节点？触发方式是什么？不确定就问
- **永远不要提出 flat metadata 方案**：”一切皆节点”是铁律。永远不要提出 nestLevel metadata、JSON blob、DSL 字符串等捷径方案，必须用真实节点树层级建模

**交付后默认动作（无需用户提醒）**:
- Bug 修复 / 任务完成：在 `docs/TASKS.md` 中勾选或移到「已完成」
- 用户可感知的功能/修复：往 `docs/changelog-next.md` 追加一行描述
- 若本次改动不涉及任务变化，在最终回复中显式说明

## 版本管理

- **当前版本**: 以 `package.json` 的 `version` 字段为准
- **Git tag**: 每次发版打 `v{version}` tag（如 `v0.1.1`）
- **Changelog draft**: `docs/changelog-next.md` 记录下一版本的用户可感知变化，每完成一个功能/修复追加一行
- **发版流程**:
  1. 读 `docs/changelog-next.md` + `git log v{上一版本}..HEAD` 整理变化
  2. 在 `src/lib/changelog.ts` 的 `CHANGELOG` 数组头部添加新版本 entry
  3. 更新 `package.json` version
  4. 提交、打 tag、清空 `docs/changelog-next.md`

## 测试同步规则

1. 改动 `src/` 必须同步更新 `tests/vitest/*.test.ts`（CI `check:test-sync` 强制检查）。
2. 每轮迭代提交前，默认顺序：`typecheck` → `check:test-sync` → `test:run` → `build`。

## 多 Agent 协作规则

- **角色分工**: nodex（主仓库）= Review + Merge + 视觉验证；Dev Agent = 功能开发 + 提 PR
- **禁止直接 push main**: Dev Agent 所有代码通过 PR 合入。唯一例外：nodex 自身的小修复
- **禁止 Dev Agent 合并 PR**: Dev Agent 不得执行 `gh pr merge`。完成后 `gh pr ready` 标记，由 nodex review + merge
- **任务跟踪**: `docs/TASKS.md`（单一事实来源）
- **PR 工作流**: Draft PR 开发中 → `gh pr ready` 完成后 → nodex review Ready PR
- **高风险文件**: `node-store.ts`、`OutlinerItem.tsx`、`system-nodes.ts` — 同一时间只有一个 Agent 改
- **验证分工**: Dev Agent = `typecheck` → `vitest` → `build`；nodex = 视觉验证（Chrome 扩展）

### nodex 派发任务流程

当用户要求 nodex 将任务指派给某个 Dev Agent 时，nodex 一次性完成以下准备工作，再通知 Dev Agent 开工：

1. **更新 `docs/TASKS.md`**：添加任务条目（含 checklist）+ 更新 Agent 状态表
2. **创建分支 + Draft PR**（代替 Dev Agent 做）：
   ```bash
   git checkout -b cc/<feature> origin/main
   git add docs/TASKS.md && git commit -m "docs: claim task — <任务名>"
   git push -u origin cc/<feature>
   ```
3. **撰写完整 PR body**（含 Summary、分阶段 checklist、注意事项、Test plan），通过 `gh pr create --draft --body` 写入 PR description
4. **切回 main**，通知 Dev Agent：`git fetch origin && git checkout cc/<feature>`，然后开始执行

> Dev Agent 拿到的是一个**已就绪的 Draft PR**，只需读 PR description 即可了解完整计划，无需额外沟通。

**PR body 必须包含 `## Exact Behavior` 区块**（用 GIVEN/WHEN/THEN 格式描述交互行为），避免 Dev Agent 猜错实现方向。

### Dev Agent 开工第一步（若 nodex 未预创建 PR）

```bash
# 1. 编辑 docs/TASKS.md（声明任务 + 文件锁）
# 2. 创建分支 + Draft PR
git checkout -b cc/<feature> origin/main
git add docs/TASKS.md && git commit -m "docs: claim task — <任务名>"
git push -u origin cc/<feature>
gh pr create --draft --title "[WIP] feat: ..." --body "ref: <任务名>"
```

## 实现策略

- 涉及 **3+ 文件**的特性，必须先出计划（文件清单 + 修改思路）获得确认，再分步实现，每步后 `npm run typecheck`
- nodex（主 Agent）可通过 Chrome 扩展做视觉验证；Dev Agent 只需通过 `typecheck` + `vitest` + `build` 自验
- 改动导致**页面白屏/崩溃**时，立即 `git stash` 回退，不要在错误基础上修补
- 新增 UI 交互（hover、拖拽、动画）先在**隔离组件**中验证，再集成到主树
- 每完成一个有意义的功能点或修复后应**主动 git commit**
- Commit message 简要关联任务名称，如 `feat: node selection phase 1 — escape to select mode`

### 架构决策：补丁 vs 重构

**当你在给第二个组件补同样的能力时，停下来重新审视架构，不要继续打补丁。**

决策三问：
1. **是通用需求还是特例？** — 只有一个组件需要 → 补丁；多个组件都需要 → 进入第 2 步
2. **区别在哪一层？** — 行为不同 → 各自实现；只是渲染/布局不同 → 提取交互层，渲染通过 delegate/children 注入
3. **接口是否清晰？** — 能用一个 config 对象描述所有变化点 → 好抽象，做；需要大量 if/else 判断调用方 → 过早抽象，等第三个案例

**案例**：OutlinerItem 和 FieldRow 各自实现 selection/keyboard/pointer 逻辑，FieldRow 持续缺失能力（batch delete、justDragged、Shift+Arrow）。本质是"行为相同但渲染不同"→ 提取 `OutlinerRow`（统一交互）+ `RowInteractionConfig`（delegate 差异点），两个组件各自只保留渲染逻辑。

**实施原则**：按依赖方向分步——先提取被依赖的新抽象，再让消费者逐个迁移，每步 typecheck → test → build 卡点。

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
| **后端** | Cloudflare Workers + D1 + R2 | Better Auth + Google OAuth |
| **同步** | Loro CRDT + Cloudflare Sync | 乐观更新 + chrome.storage 缓存 |
| **构建** | Vite (via WXT) | 快速 HMR，tree-shaking |
| **ID 生成** | nanoid | 21 字符, URL-safe |

**模块系统**: ESM (`"type": "module"`)，服务层导入路径需 `.js` 后缀

## 常用命令

```bash
npm run dev            # WXT Dev 模式 → .output/chrome-mv3-dev/ (HMR, staging API)
npm run build:preview  # Preview 构建 → .output/chrome-mv3-preview/ (production API, dev key)
npm run build          # Store 构建 → .output/chrome-mv3/ (production API, 无 dev key)
npm run zip            # 打包 Store 构建为 .zip (用于发布)
npm run typecheck      # TypeScript 类型检查 (tsc --noEmit)
```

### 三环境分离

| 环境 | 命令 | 输出目录 | Backend | Extension ID | 图标 |
|------|------|---------|---------|-------------|------|
| Store | `npm run zip` | `.output/chrome-mv3/` | production | 商店分配 `joabcnfl…` | 圆角绿底暖纸色 S |
| Preview | `npm run build:preview` | `.output/chrome-mv3-preview/` | production | `andlcnfk…` | + 蓝点 |
| Dev | `npm run dev` | `.output/chrome-mv3-dev/` | staging | `gkpgogoc…` | + 橙点 |

三个环境各有独立 extension key，可同时加载到 Chrome 中共存。图标右下角的彩色圆点区分当前版本。源文件 `docs/icon-drafts/soma-logo-final.png`（2048x2048），图标 `public/icon*/`（16/32/48/128px，圆角）。

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
      CommandPalette.tsx   # ⌘K 命令面板 (Raycast 风格, fuzzy search + 命令注册表)
    toolbar/               # 顶栏 (替代已移除的 Sidebar)
      TopToolbar.tsx       # 顶栏布局 ([←][→] [🔍 Search ⌘K] [●🧑])
      UndoRedoButtons.tsx  # Undo/Redo 按钮 (调用 Loro undoDoc/redoDoc)
      SearchTrigger.tsx    # 搜索触发器 (假输入框, 点击打开 CommandPalette)
      SyncDot.tsx          # 同步状态圆点
      ToolbarUserMenu.tsx  # 用户头像 + 下拉菜单
    panel/                 # 面板系统
      PanelStack.tsx       # 面板栈导航 (push/pop/replace)
      NodePanel.tsx        # 节点面板 (Header + OutlinerView)
      NodePanelHeader.tsx  # 面板头 (breadcrumb + title)
    ui/                    # 通用 UI 组件
      Kbd.tsx              # 键盘快捷键徽章 (⌘K / Esc / ⌘⇧D)
  hooks/
    use-node.ts            # 订阅单节点 + 懒加载
    use-children.ts        # 订阅子节点列表 + 懒加载
    use-nav-undo-keyboard.ts  # 全局 ⌘Z/⌘⇧Z 键盘处理 (非编辑态 → Loro undoDoc/redoDoc)
  stores/
    node-store.ts          # 归一化节点实体 (immer, 乐观更新, 含树操作)
    ui-store.ts            # UI 状态 (面板栈/展开/焦点/搜索, persist → chrome.storage)
    workspace-store.ts     # 工作区 + 用户认证 (persist → chrome.storage)
  lib/
    chrome-storage.ts      # Zustand persist 适配器 (chrome.storage.local + Set 序列化)
    fuzzy-search.ts        # 轻量 fuzzy search 评分器
    node-capabilities.ts   # 节点能力查询 (isLockedNode, canCreateChildrenUnder, canEditFieldEntryValue)
    system-node-presets.ts # 系统节点预设 (SYSTEM_NODE_PRESETS, getSystemNodePreset)
    palette-commands.ts    # ⌘K 命令注册表 (系统命令 + 日记导航)
    tree-utils.ts          # 树遍历工具 (flatten/navigate/parent/sibling)
  types/                   # 核心类型
    node.ts                # NodexNode, DocType, NodeProps, CONTAINER_IDS
    system-nodes.ts        # SYS_A*(60+), SYS_D*(12), SYS_V*(22+), SYS_T*(25+)
    index.ts               # 统一导出
  services/                # 数据服务层
    tana-import.ts         # Tana JSON 导入
    index.ts               # 统一导出
  env.d.ts                 # 自定义 VITE_* 环境变量类型声明
docs/                      # TASKS.md + design-system.md + research/
.github/                   # PR 模板
```

## 数据模型核心概念

### 一切皆节点

单表 `nodes` 存储所有类型。`doc_type` 列区分节点类型（22 种 + 1 soma 新增）。无 `doc_type` 的是普通内容节点（占 46.6%）。

### 配置页面 = 系统标签模板（核心设计模式）

Tana 的配置页面（字段配置、标签配置等）不是定制 UI，而是**标准 NodePanel 渲染被系统标签标记的节点**：

- **attrDef** 被 `SYS_T02` (FIELD_DEFINITION) 标记 → 配置页 = SYS_T02 的模板字段
- **tagDef** 被 `SYS_T01` (SUPERTAG) 标记 → 配置页 = SYS_T01 的模板字段

配置页上的每个配置项（Field type 下拉、Options 列表、Toggle 开关等）都是系统标签模板字段的实例，通过不同渲染组件呈现：`ConfigSelectPicker`（下拉）、`ToggleButton`（开关）、标准 `OutlinerItem`（节点列表）。

详见 `docs/research/tana-config-page-architecture.md`。

### 间接层（简化后只保留 Field Entry）

1. **Field Entry** (`type='fieldEntry'`): 字段实例。`fieldDefId` 指向定义，`children` = 值节点列表。
2. **node.tags** (`string[]`): 节点绑定的标签 ID 列表。

### 标签应用链路

```
ContentNode.tags → [tagDefId1, tagDefId2, ...]    ← 直接绑定
ContentNode.children → FieldEntry [fieldDefId → attrDefId, children → valueNodeId1, valueNodeId2, ...]
```

### 字段值存储

```
ContentNode
  ├── children: [..., fieldEntryId, ...]
  └── FieldEntry { fieldDefId, children: [valueNodeId1, valueNodeId2, ...] }
```

### 系统节点与 CONTAINER_IDS

系统节点 ID = `{workspaceId}_{SUFFIX}`，后缀见 `CONTAINER_IDS` 常量（JOURNAL、TRASH、SCHEMA、SETTINGS 等）。

**系统节点不再是特殊类型**——它们是普通节点 + `locked` 属性。保护机制通过 `isLockedNode()` 能力检查实现，而非 ID 检测。新工作区只自动创建 Journal、Trash、Schema、Settings（不再创建 Library/Inbox）。

节点能力查询：`src/lib/node-capabilities.ts`（`isLockedNode()`、`canCreateChildrenUnder()`、`canEditFieldEntryValue()`）。系统节点预设：`src/lib/system-node-presets.ts`（`SYSTEM_NODE_PRESETS`、`getSystemNodePreset()`）。

### 应用页面 vs 用户数据（铁律分离）

> **判断标准**：用户清空所有数据后，这个页面还应不应该存在？如果"应该"→ 应用页面；如果"不应该"→ 用户数据。

- **用户数据**（Journal、Trash、Schema、Settings 等系统节点 + 用户自建节点）= 节点，存在 LoroDoc 中，可搜索、可同步
- **应用页面**（About、Changelog、Feedback 等）= 纯 UI 路由（`app:` 前缀），不创建节点，不进入 LoroDoc，不可搜索
- 应用页面可以复用 NodePanel 的布局样式，但数据层绝对不能共通

面板栈 `panelHistory` 支持两种 ID：节点 ID（如 `ws123_JOURNAL`）和应用页面 ID（如 `app:about`）。

**演进方向**：`app:about` 是临时方案。多工作区架构上线后，About/Changelog/Help 等内容迁移为"官方工作区"（soma 维护的只读工作区）的节点。官方工作区、个人工作区、协作工作区本质是同一个模型，区别在于 role（`owner`/`editor`/`viewer`）。每个工作区 = 独立 LoroDoc。

### "一切皆节点"设计守则（实现时必须遵守）

> **核心判断标准**：这个信息该存为节点/字段，还是 JSON/字符串/UI 状态？**答案永远是前者。**

实现 P2/P3 功能时，以下 6 条守则不可违背：

1. **视图配置 = ViewDef 节点 + 字段**，不是 JSON blob。视图可通过 supertag 模板继承
2. **Filter/Sort/Group = ViewDef 的持久化字段**，不是 React state 或 Zustand 临时状态。视图切换时自动保存/恢复
3. **搜索条件 = 节点树**，不是 DSL 字符串 `"#task AND status:TODO"`。Query Builder 直接渲染条件节点树
4. **日期字段值 = 日节点引用**，不是字符串 `"2026-02-16"`。日期是一等公民（可挂 children/tag/field）
5. **剪藏元数据 = Supertag 字段**，不是节点属性。所有新增元数据走 attrDef，不加 NodexNode 顶层属性
6. **AI 命令 = Command Node**，prompt/参数/输出全部是节点/字段/children，不建独立配置系统

详细设计见 `docs/_archive/features/data-model.md` § 设计守则。

## 数据存储

- **本地**: Loro CRDT document，持久化到 chrome.storage + IndexedDB
- **远端**: Cloudflare D1 (metadata) + R2 (Loro snapshots/updates)
- **同步**: SyncManager push/pull Loro updates，30s 定期 + nudge

## 代码约定

### 关键陷阱（从实践中总结）

- **Loro CRDT**: 每个 store action 结束必须调用 `loroDoc.commitDoc()`，否则 `doc.subscribe` 不触发 → UI 不更新
- **Zustand 禁止全量订阅**: 永远不要 `useNodeStore((s) => s.entities)`。计算放入 selector 内部，返回原始值
- **contenteditable 焦点切换**: 在 `mousedown` 中完成，不要等 `click`（blur 会在 click 前卸载编辑器）
- **FIELD_TYPES 大小写**: 值全部小写（`'options'` 不是 `'OPTIONS'`），必须用 `FIELD_TYPES.*` 常量

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
- 工作区 ID 通过 `_ownerId` 链 + 系统节点后缀（`_SCHEMA`, `_TRASH` 等）反向推导。
- `docs/research/b8AyeCJNsefK@2026-01-30.json` 是 16MB 文件，不要直接用 Read 工具打开，用 Python/Bash 脚本处理。

### 引用完整性

- 导入的 41,753 节点中，children 缺失引用 267 条（0.06%）—— 属于预期范围（跨工作区引用等）。
- `meta` 数组引用完整性由 invariants helper 验证。

## 任务跟踪

- **唯一事实来源**: `docs/TASKS.md`
- **迭代记录**: GitHub PR（计划在 PR description，讨论在 PR comment）
- **深度研究**: 复杂问题先研究再动手，研究成果沉淀到 `docs/research/`

## Chrome Side Panel 约束

| 约束 | 应对策略 |
|------|----------|
| 无法控制面板宽度 (300-700px+) | CSS container queries + ResizeObserver |
| Service Worker 随时可能终止 | Zustand persist → chrome.storage |
| MV3 CSP 限制 | 所有资源本地打包，无 CDN |
| 与网页通信 | chrome.runtime.sendMessage + content script |

## 测试与验证

### MCP 工具分工（仅 nodex 使用）

| 工具集 | 用途 | 适用目标 |
|--------|------|----------|
| **`chrome-devtools` MCP** | JS 执行、a11y 快照、DOM 操作 | `http://localhost:5199` (standalone) |
| **`claude-in-chrome` MCP** | 截图、缩放、视觉比较、元素交互 | 任意标签页 (含 Tana 参考) |

> Dev Agent 不需要跑 dev server，也不使用 MCP 工具。视觉验证统一由 nodex 或用户完成。

**关键限制**：
- `chrome-devtools` 只能连接 localhost，不能连接 chrome-extension:// 页面
- `claude-in-chrome` 可以截图任何标签页，但 JS 执行受限于 Vite 模块隔离
- 两个工具都无法模拟真实键盘事件（ProseMirror 忽略 `isTrusted: false`）
- 截图前先调整页面为 1000x800 或更小
- **Tana 操作限制**: 只允许操作 `just_for_claude` 工作区，禁止操作用户其他工作区（如 Xiaobo）

### Chrome 扩展测试环境

nodex 和用户通过 Chrome 直接加载解压扩展进行视觉验证：

```bash
# Dev — HMR 热重载，连接 staging API
npm run dev
# Chrome → 扩展管理 → 加载已解压的扩展 → 选择 .output/chrome-mv3-dev

# Preview — 连接 production API，用于发布前验证
npm run build:preview
# Chrome → 扩展管理 → 加载已解压的扩展 → 选择 .output/chrome-mv3-preview
```

Dev 和 Preview 可同时加载（不同 extension ID），通过工具栏图标颜色区分。

**测试 PR 分支**：`gh pr checkout <number>` → `npm run dev` → Chrome 中直接看效果

### Standalone 测试环境

```bash
npm run dev:test   # 启动 http://localhost:5199/standalone/index.html
```

- `standalone/TestApp.tsx` 纯离线模式（跳过 Auth + Sync）
- 种子数据 68 个节点（`src/entrypoints/test/seed-data.ts`，含 Schema + TagDef + AttrDef）
- **Store 全局访问**：`window.__nodeStore` / `window.__uiStore` / `window.__wsStore`

### 自测流程

- 改完代码运行 `/self-test`（Skill：`.claude/skills/self-test/SKILL.md`）
- Vitest 套件：`tests/vitest/`
- 每次修复 bug，补一个 Vitest 回归用例
- **测试通过 ≠ 完成**：键盘快捷键、焦点管理、选择逻辑等 UI 交互改动，Vitest 通过后仍须浏览器验证（`npm run dev` + 实际操作）。这三类是"测试绿灯但浏览器失败"的重灾区

## 参考文档

- `docs/design-system.md` — UI 视觉标准
- `docs/research/` — Tana 逆向分析 + 深度研究成果
- `docs/_archive/` — 历史文档存档（不再维护，需要时查阅）
- GitHub: https://github.com/relixiaobo/nodex

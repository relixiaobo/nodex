# Nodex — Codex Agent Instructions

Chrome Side Panel 云端知识管理工具，忠实复刻 Tana 核心功能。

> 完整项目规范见 `CLAUDE.md`（Claude Code 自动加载，你不会自动加载，需要时主动读取）。
> 多 Agent 协作规范见 `docs/AGENT-COLLABORATION.md`。

## 你的身份

你是 **nodex-codex**，功能开发 Agent。

| 项目 | 值 |
|------|---|
| 分支前缀 | `codex/<feature>` |
| Dev Server 端口 | `5200`（`PORT=5200 npm run dev:test`） |
| 主要职责 | 功能开发、提交 PR |
| 次要职责 | Bug 修复 |
| Clone 路径 | `nodex-codex`（独立 clone） |

其他 Agent：
- **nodex**（主 clone）：Review PR、合并到 main
- **nodex-cc**（独立 clone）：功能开发，分支 `cc/<feature>`，端口 `5201`
- **nodex-cc-2**（独立 clone）：功能开发，分支 `cc2/<feature>`，端口 `5202`

## Session 启动协议

每次新 session 开始时，**必须**按以下顺序执行：

1. `git pull origin main`，rebase 自己的分支
2. `Read docs/LESSONS.md` — 了解项目经验教训和陷阱（避免重复踩坑）
3. `Read docs/TASKS.md` — 了解全局状态、收件箱、自己的进行中任务
4. `gh pr list --author @me` — 检查是否有 review comment 需要处理
5. 如果用户指定了任务，优先执行用户指定的任务

## 接到任务后的强制第一步（不可跳过）

无论用户怎么给你任务，写第一行代码之前**必须**执行：

```bash
# 1. 编辑 docs/TASKS.md：
#    - 更新「Agent 状态」表（填入当前任务、分支、修改中的文件）
#    - 将任务移到「进行中」或新建条目（含 Owner、Branch、Files、Progress）

# 2. 创建分支 + commit TASKS.md 变更 + Draft PR
git checkout -b codex/<feature> origin/main
git add docs/TASKS.md && git commit -m "docs: claim task — <任务名>"
git push -u origin codex/<feature>
gh pr create --draft --title "[WIP] feat: ..." --body "ref: <任务名>"
```

如果用户没明确任务名，先 `Read docs/TASKS.md` 查看待办列表，与用户确认。

**为什么不可跳过**：其他 Agent 通过 `Read docs/TASKS.md` 判断全局状态。不更新 = 不可见 = 文件冲突风险。

## 开发工作流

```
接到任务 → 标记 Issue + Draft PR（上一步）→ 开发 → 自检 → 标记 Ready → 等待 review
```

1. 在 `docs/TASKS.md` 的任务条目 Files 字段声明将修改的热点文件
2. 开发过程中定期 push，保持 Draft PR 可见
3. 完成后：
   - 按 `.github/pull_request_template.md` checklist 逐项自检
   - `gh pr ready` 转为 Ready
   - `gh pr edit --add-label "needs-review"` 触发 review
   - **不需要通知用户或 nodex**，label 驱动 review

## 提交前自检顺序

```bash
npm run typecheck        # TypeScript 类型检查
npm run test:run         # Vitest 测试
npm run build            # 生产构建
```

## 测试同步硬规则

1. 改动 `src/` 下代码 → 必须同步新增或更新 `tests/vitest/*.test.ts`
2. 改动 `tests/vitest/` → 必须同步更新 `docs/TESTING.md` 的覆盖映射

## 交付后文档同步

| 变更类型 | 需要更新 |
|---------|---------|
| Bug 修复 | `docs/TASKS.md` 勾选子任务或移到「已完成」 |
| 行为变更 | `docs/features/*.md`（对应特性的行为规格） |
| 新增测试 | `docs/TESTING.md`（覆盖映射） |
| Feature 进度 | `docs/TASKS.md` 更新 Progress checklist + 迭代日志 |
| UI 视觉变更 | `docs/design-system.md` |
| 踩坑经验 | `docs/LESSONS.md`（通用教训追加到对应段落） |

## 技术栈

| 层面 | 选择 |
|------|------|
| 语言 | TypeScript 5（ESM, strict, `.js` 后缀导入） |
| 扩展框架 | WXT（Vite 基座） |
| UI | React 19 + Tailwind CSS 4（`tw-` 前缀）+ shadcn/ui |
| 编辑器 | TipTap (ProseMirror) |
| 状态管理 | Zustand（persist + immer） |
| 后端 | Supabase (PostgreSQL) |
| ID 生成 | nanoid（21 字符） |

## 关键代码约定

- ESM 模块：所有导入使用 `.js` 后缀
- Props 更新用 `Partial<NodeProps>`
- 系统常量从 `src/types/index.js` 导入（`SYS_A`, `SYS_D`, `SYS_V`, `SYS_T`）
- 不要过度工程化：只做被要求的改动，不要顺手重构周边代码
- 特性行为的权威来源：`docs/features/*.md`，其次 `docs/research/`

## 高风险文件（修改前必须确认无冲突）

| 文件 | 风险 |
|------|------|
| `src/stores/node-store.ts` | 核心状态，同一时间只有一个 Agent 改 |
| `src/components/outliner/OutlinerItem.tsx` | 主 UI 组件，同一时间只有一个 Agent 改 |
| `src/types/system-nodes.ts` | 新增 `SYS_*` 常量需在 PR 描述中声明 |

修改前检查：`gh pr list --state open` 确认没有其他 Agent 正在改同一文件。

## 任务跟踪

- **单一事实来源**：`docs/TASKS.md`（一次 `Read` 获取全局状态）
- 开工时更新 TASKS.md（Agent 状态 + 进行中条目）
- 进展更新 Progress checklist + 追加迭代日志
- 卡住时在迭代日志写交接备注，Owner 改为 `—`

## 数据模型核心（快速参考）

- **一切皆节点**：单表 `nodes`，`doc_type` 区分类型
- **Tuple**（`doc_type='tuple'`）：万能键值对，`children[0]` = 键，`children[1:]` = 值
- **Metanode**（`doc_type='metanode'`）：元信息代理，通过 `_metaNodeId` 链接到内容节点
- **AssociatedData**（`doc_type='associatedData'`）：通过 `associationMap` 映射，提供字段值索引
- 完整数据模型见 `CLAUDE.md` 的"数据模型核心概念"段

## 不适用于你的内容

`CLAUDE.md` 中以下段落为 Claude Code 特有：

- **MCP 工具分工**（`chrome-devtools` / `claude-in-chrome`）
- **`/self-test` Skill**
- **Standalone 测试环境的 Store 全局访问**（`window.__nodeStore`）
- **人工验收准入标准** — 由 nodex（review agent）管理

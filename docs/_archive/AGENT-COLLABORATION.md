# 多 Agent 协作方案

> 本文档定义多个 AI Agent 并行开发同一项目的协作规范。
> 所有 Agent 通过 git worktree 共享同一仓库，在独立分支上工作，通过 CLAUDE.md 中的引用读到本文件。

---

## 1. 角色与身份

| 角色 | 说明 |
|------|------|
| **用户** | 最终决策者：优先级调整、方向纠偏、合并/拒绝 |
| **Agent** | 各自在独立 worktree + 独立分支工作，通过 `docs/TASKS.md` + Git PR 异步协调 |

每个 Agent 工作时在 commit 和文档中使用自己的身份标识，方便追溯。

### 当前 Agent 清单

| Agent ID | 工具 | 主要职责 | 次要职责 | 分支前缀 | Worktree 路径 |
|----------|------|---------|---------|---------|--------------|
| **nodex** | Claude Code (主会话) | Review PR、合并到 main、视觉验证 | 小修复、紧急改动 | `main` 或临时分支 | 主仓库 (`nodex/`) |
| **Dev Agent** | Claude Code (独立会话) | 功能开发、提交 PR | Bug 修复 | `cc/<feature>` 等 | worktree (`nodex-<name>/`) |

> Dev Agent 按需创建：`git worktree add ../nodex-<name> -b <branch> origin/main`，在该目录启动 Claude Code 即可。

### Agent 自我识别

所有 worktree 共享同一个 `.git` 仓库（`nodex/`），代码和文档通过 git 同步。每个 Agent 通过 **Worktree 路径** 和 **Git 分支前缀** 确认自己的身份。

### 验证分工

| 验证类型 | 谁做 | 怎么做 |
|---------|------|--------|
| `typecheck` / `vitest` / `build` | Dev Agent | 提 PR 前自验 |
| Chrome 扩展视觉验证 | nodex（主 Agent） | `npm run dev` → Chrome 加载 `.output/chrome-mv3-dev` |
| 用户验收 | 用户 | `gh pr checkout <number>` → `npm run dev` → Chrome Side Panel 实测 |

> Dev Agent **不需要**跑 dev server 或做视觉验证。

---

## 2. Agent 工作流

### 2.1 Session 启动协议（所有 Agent）

每次新 session 开始时，Agent **必须**按以下顺序执行：

1. **识别自己**：通过 worktree 路径 / 端口 / 分支确认身份
2. **同步代码**：
   ```bash
   git stash --include-untracked   # 暂存本地未提交改动（防止脏文件遮盖上游更新）
   git fetch origin
   git merge origin/main           # 或 rebase 自己的分支
   git stash pop                   # 恢复暂存（如有冲突会提示，需手动解决）
   ```
   > ⚠️ **为什么必须 stash**：git worktree 共享 `.git`，`git pull/merge` 只更新 committed history，**不会覆盖工作区的未提交修改**。如果其他 Agent 远程更新了共享文档（TASKS.md、CLAUDE.md、docs/*.md），本地的旧版脏文件会遮盖新内容，导致读到过时信息。
3. **验证工作区干净**：`git status` 确认无意外的未提交文件（特别是共享文档）
4. **读取共享知识**：`Read docs/LESSONS.md` — 了解项目经验教训和陷阱
5. **检查自己的 open PR**：`gh pr list --author @me` — 是否有 review comment 需要处理
6. **检查待办**：
   - **所有 Agent**: `Read docs/TASKS.md` — 了解全局状态、收件箱、自己的进行中任务
   - **nodex**: 额外 `gh pr list --state open` — 是否有待审 PR

### 2.2 接到任务后的强制标记（不可跳过）

任务来源通常是用户在聊天中指定（如"做节点选中 Phase 1"）。无论任务怎么来的，Dev Agent 写第一行代码之前**必须**执行以下操作：

```bash
# 1. 编辑 docs/TASKS.md：
#    - 更新「Agent 状态」表（填入当前任务、分支、修改中的文件）
#    - 将任务移到「进行中」或新建条目（含 Owner、Branch、Files、Progress）
#    - 如果收件箱有条目，顺手归类

# 2. 创建分支 + commit TASKS.md 变更 + Draft PR
git checkout -b cc/<feature> origin/main
git add docs/TASKS.md && git commit -m "docs: claim task — <任务名>"
git push -u origin cc/<feature>
gh pr create --draft --title "[WIP] feat: ..." --body "ref: <任务名>"
```

**为什么不可跳过**：
- 其他 Agent 通过 `Read docs/TASKS.md` 判断全局状态（一次读取，无网络依赖）
- 不更新 = 对其他人不可见 = 可能产生文件冲突
- nodex（review agent）启动时首先读 TASKS.md 了解全局

**如果用户没明确任务名**：先 `Read docs/TASKS.md` 查看待办列表，与用户确认后标记。

### 2.3 开发 Agent 工作流

```
接到任务 → 更新 TASKS.md + Draft PR（§2.2）→ 开发 → 自检 → 标记 Ready → 等待 review
```

1. §2.2 的标记步骤已包含创建分支和 Draft PR
2. 在 `docs/TASKS.md` 的任务条目 Files 字段**声明将修改的热点文件**（见 §5 文件锁）
3. 开发过程中定期 push **到自己的分支**，保持 Draft PR 可见
4. 自验清单（提 PR 前必须通过）：
   - `npm run typecheck` — 类型检查
   - `npm run check:test-sync` — 测试同步检查
   - `npx vitest run` — 单元测试
   - `npm run build` — 生产构建
5. 完成后：
   - 将 PR 从 Draft 转为 Ready：`gh pr ready`
   - **不需要通知用户或 nodex**，nodex 通过 `gh pr list` 发现待审 PR
   - **不需要跑 dev server 或做视觉验证**，视觉验证由 nodex 或用户完成

#### ⛔ 禁止直接 push main（硬性规则）

Dev Agent（nodex-codex / nodex-cc / nodex-cc-2）**绝对不能**直接向 `main` 分支 push commit。违反此规则等同于绕过 code review，可能导致：
- 未经审查的代码进入主干，引入 bug 或架构问题
- 其他 Agent 的工作被意外覆盖
- 无法追溯变更的审批链路

**唯一的合入路径**：`feature branch` → `PR` → `nodex review` → `merge to main`

**唯一例外**：nodex（review agent）自身可在 main 上做小修复和紧急改动。

#### PR 状态管理

| 状态 | 含义 | nodex 行为 |
|------|------|-----------|
| **Draft** | 开发中，尚未完成 | **忽略**，不 review |
| **Ready** | 开发完成，等待 review | review → comment/merge |

- Dev Agent 开发中必须保持 PR 为 **Draft** 状态
- 开发完成、自检通过后，用 `gh pr ready` 转为 Ready
- nodex 只关注 Ready 状态的 PR：`gh pr list --state open` 后过滤 Draft

### 2.4 Review Agent 工作流（nodex）

```
检查 Ready PR → 视觉验证 → Review PR → 留 comment / 合并 → 后续修正
```

1. Session 开始时检查 Ready 状态的 PR：
   ```bash
   gh pr list --state open  # 查看所有 open PR，跳过 Draft 状态的
   ```
2. **只 review Ready 状态的 PR**，Draft PR 代表开发中，不做 review
3. **视觉验证**（nodex 独有职责）：
   ```bash
   gh pr checkout <number>   # 切到 PR 分支
   npm run dev               # Chrome 加载 .output/chrome-mv3-dev 实测
   git checkout main         # 测试完切回
   ```
4. Review 内容：代码质量、测试覆盖、文档同步、设计系统合规、视觉效果、**是否有不当的 entities 全量订阅等性能问题**
5. **Review 意见直接写在 PR comment 中**（不通过用户转达）
   - 需要修改：在 PR 留 comment，dev agent 下次 session 会看到
   - 可以合并：直接合并，做必要的后续修正（如设计系统微调）
6. 也可直接在 main 上做小修复或紧急改动

### 2.5 常量/类型协调

- 新增 `SYS_*` / `NDX_*` 常量前，先在 PR 描述中声明，避免 ID 冲突
- `system-nodes.ts` 属于高风险文件，两个 Agent 不能同时修改

---

## 3. 共享文档治理

### 3.1 文档分类总览

| 类别 | 文件 | 冲突风险 | 所有权模型 | 写入策略 |
|------|------|---------|-----------|---------|
| **治理** | `CLAUDE.md` | 高 | 共有 | 仅用户批准后修改 |
| **治理** | `docs/AGENT-COLLABORATION.md` | 低 | 共有 | 仅用户批准后修改 |
| **任务** | `docs/TASKS.md` | 中 | 共有 | Agent 状态各改自己的行；进行中各改自己的任务 |
| **经验** | `docs/LESSONS.md` | 低 | 共有 | 追加式，遇到新经验时追加到对应段落 |
| **规格** | `docs/features/*.md` | 低 | 按文件独占 | 改功能时同步更新对应文件 |
| **测试** | `docs/TESTING.md` | 中 | 共有 | 只追加自己的 section |
| **测试** | `docs/MANUAL-TEST-CHECKLIST.md` | 低 | 共有 | 只追加 |
| **设计** | `docs/design-system.md` | 低 | 共有 | 涉及视觉变更时更新 |
| **研究** | `docs/research/*.md` | 无 | 只读 | 原则上不修改（参考资料） |
| **代码** | `src/**` | 高 | 按文件独占 | 同一时间只有一个 Agent 改同一文件 |

### 3.2 共享文档编辑硬规则

> ⚠️ **对共享文档的修改必须立即 commit**（同一操作中，不允许留在工作区未提交）。
>
> **共享文档**：`docs/TASKS.md`、`CLAUDE.md`、`docs/LESSONS.md`、`docs/TESTING.md`、`docs/AGENT-COLLABORATION.md`、`docs/features/*.md`
>
> **为什么**：多个 Agent（包括 nodex）会远程修改这些文件。未提交的本地改动会在下次 `git pull/merge` 后遮盖上游更新，导致 Agent 读到过时内容却以为已经是最新（`git pull` 显示 "Already up to date" 但工作区文件是旧的）。
>
> **正确做法**：编辑共享文档 → 立即 `git add` + `git commit` → 继续其他工作
>
> **错误做法**：编辑共享文档 → 先做其他开发 → 稍后一起 commit（期间其他 Agent 的更新会被遮盖）

### 3.3 详细规则

#### CLAUDE.md（治理核心）

- **谁能改**: 任何 Agent 可以提议修改，但需用户明确批准
- **改什么**: 新增约定、修正过时信息、添加技术参考
- **怎么改**: 先提出修改内容 → 用户确认 → 再 commit
- **冲突预防**: 改动范围尽量小，不重构已有段落结构

#### docs/features/\*.md（特性规格）

- **谁能改**: 正在实现该特性的 Agent
- **怎么改**: 实现/修复后同步更新"当前状态"、"决策记录"、"与 Tana 差异"
- **冲突预防**: 同一时间只有一个 Agent 在做某个特性
- **注意**: 这是行为定义的权威来源，更新时要准确

#### docs/TESTING.md（测试覆盖映射）

- **谁能改**: 新增/修改了测试的 Agent
- **怎么改**: 只追加新的 section 或在自己的 section 内修改
- **冲突预防**: 按 section 编号划分，不删改别人的 section

#### docs/MANUAL-TEST-CHECKLIST.md（人工验收）

- **谁能改**: 发现需要人工验收的 Agent
- **怎么改**: 只追加新的检查项
- **冲突预防**: 只追加，不删改已有项

#### docs/design-system.md（设计系统）

- **谁能改**: 涉及 UI 视觉变更的 Agent
- **怎么改**: 新增/修正设计 token、组件模式
- **注意**: 修改前先读完已有内容，避免与现有设计矛盾

#### docs/research/\*.md（逆向研究）

- **只读**: 除非发现明显错误，否则不修改
- **新增研究**: 创建新文件，不修改已有文件

#### src/\*\*（源代码）

- **所有权**: 同一时间只有一个 Agent 修改同一文件
- **高风险文件**（核心共享状态）:
  - `src/stores/node-store.ts`
  - `src/components/outliner/OutlinerItem.tsx`
  - `src/types/system-nodes.ts`
- **冲突预防**: 任务认领前先检查目标文件是否有其他 Agent 在改

### 3.4 交付后文档同步清单

每次完成"实现/修复/更新"后，Agent 应按此清单同步文档：

| 变更类型 | 需要更新 |
|---------|---------|
| Bug 修复 | `docs/TASKS.md` 勾选子任务或移到「已完成」 |
| 行为变更 | `docs/features/*.md`（对应特性） |
| 新增测试 | `docs/TESTING.md`（覆盖映射） |
| 需要人工验收 | `docs/MANUAL-TEST-CHECKLIST.md` |
| Feature 进度 | `docs/TASKS.md` 更新 Progress checklist + 迭代日志 |
| UI 视觉变更 | `docs/design-system.md` |
| 踩坑经验 | `docs/LESSONS.md`（通用教训追加到对应段落） |

---

## 4. 任务跟踪（docs/TASKS.md）

所有任务统一在 `docs/TASKS.md` 跟踪（纯文本，一次 `Read` 获取全局状态）。

### 4.1 TASKS.md 结构

| 区域 | 用途 | 谁维护 |
|------|------|--------|
| **收件箱** | 用户随手记录 bug/想法 | 用户写入，agent 归类后删除 |
| **Agent 状态** | 谁在做什么、改哪些文件 | Dev agent 开工时更新 |
| **进行中** | 活跃任务详情（owner/branch/files/progress/迭代日志） | Dev agent 持续更新 |
| **待办** | 按优先级排列的任务列表（P2 > P3） | nodex 或用户调整优先级 |
| **已完成** | 完成记录 | nodex merge 时移入 |

### 4.2 Agent 操作规则

```bash
# 开工：编辑 docs/TASKS.md（更新 Agent 状态 + 移动任务到「进行中」）
# 进展：更新 Progress checklist + 追加迭代日志
# 卡住：在迭代日志中写明原因、已尝试方案、建议下一步，Owner 改为 —
# 完成：nodex merge PR 时移到「已完成」
```

### 4.3 交接协议

当一个 Agent 卡住时：

**交出方**：
1. 在 `docs/TASKS.md` 对应任务的迭代日志中写详细交接备注（已尝试方案、排除的方向、建议下一步）
2. Owner 改为 `—`，Agent 状态表清空自己的行
3. Commit + push 当前进度到自己的分支

**接收方**：
1. `git fetch origin` 获取最新代码
2. 读 TASKS.md 对应任务的迭代日志了解完整上下文
3. 更新 Owner 为自己，更新 Agent 状态表
4. 在迭代日志中追加新的尝试记录

**关键原则**：
- **不要重复已失败的方案** — 先读完迭代日志再动手
- **交接备注要具体** — "可能是 keymap 问题"不够，要写"在 L362 加 console.log 确认 handler 是否被调用"

---

## 5. 冲突预防

### 热点文件清单

| 文件 | 风险 | 策略 |
|------|------|------|
| `src/stores/node-store.ts` | 高 | 同一时间只有一个 Agent 改 |
| `src/components/outliner/OutlinerItem.tsx` | 高 | 同一时间只有一个 Agent 改 |
| `src/types/system-nodes.ts` | 高 | 新增常量需协调 |
| `CLAUDE.md` | 高 | 需用户批准 |

### 文件锁声明

Agent 开始开发时，在 `docs/TASKS.md` 的任务条目和 Agent 状态表中声明将修改的热点文件：

```
🔒 Working on: node-store.ts, OutlinerItem.tsx
```

其他 Agent 开始工作前**检查 TASKS.md Agent 状态表和 open PR**，确认没有文件冲突。

查看所有 open PR 修改的文件：
```bash
gh pr list --state open --json number,title,files --jq '.[] | "\(.number) \(.title)"'
```

### 分工原则

- 按文件归属划分任务，不仅按功能划分
- 任务认领前先检查：我要改的文件是否有其他 Agent 正在改？
- 有重叠时，通过用户协调先后顺序

---

## 6. Git Worktree 管理

所有 Agent 通过 git worktree 共享同一个 `.git` 仓库（主仓库 `nodex/`），不再各自维护独立 clone。

### 目录结构

```
~/Documents/Coding/
├── nodex/          ← 主仓库 (.git 在此)，nodex agent，分支 main
└── nodex-<name>/   ← worktree，Dev Agent，按需创建
```

### 创建新 Dev Agent

```bash
# 在主仓库执行
git worktree add ../nodex-<name> -b <branch> origin/main
cd ../nodex-<name>
npm install          # 每个 worktree 需独立安装依赖
claude               # 启动 Claude Code，自动读取 CLAUDE.md
```

### 关键特性

- **fetch 一次 = 全局更新**：任意 worktree 执行 `git fetch origin`，所有 worktree 立即可见
- **分支互斥**：同一分支不能在两个 worktree 同时检出（git 自动阻止），天然防冲突
- **node_modules 独立**：每个 worktree 需各自 `npm install`（.git 共享，node_modules 不共享）
- **轻量级**：worktree 只是工作目录 + 指向主仓库 `.git` 的链接，不会完整复制仓库

### 常用操作

```bash
# 查看所有 worktree
git worktree list

# 在 worktree 中开始新任务
cd ~/Documents/Coding/nodex-<name>
git checkout -b cc/<feature> origin/main

# 移除 worktree（任务完成后清理）
git worktree remove <path>

# 清理已删除 worktree 的残留引用
git worktree prune
```

### 注意事项

- 不要在 worktree 中 checkout 另一个 worktree 正在使用的分支（git 会报错）
- Claude Code 的项目记忆按路径索引（`~/.claude/projects/-Users-...-nodex-<name>/`），路径不变所以记忆保留
- 主仓库 `nodex/` 的 `.git/worktrees/` 目录存储 worktree 元数据，不要手动删除
- **worktree 脏文件陷阱**：`git pull/merge` 只更新 committed history，不覆盖工作区的未提交修改。当其他 Agent 在 main 上更新了共享文档（如 TASKS.md），你的 worktree pull 后会显示 "Already up to date"，但文件内容仍是旧的。**解决**：pull 前先 `git stash`（见 §2.1 启动协议）

---

## 7. 用户角色：决策者而非中继站

以下环节**不再需要用户手动传话**：

| 环节 | 机制 |
|------|------|
| 任务分配 | 用户在聊天中指定，agent 更新 `docs/TASKS.md` |
| 进度了解 | 用户 `Read docs/TASKS.md`（或 agent 汇报） |
| 触发 review | Dev agent `gh pr ready`，nodex 通过 `gh pr list` 自行发现 |
| 传达 review 意见 | nodex 直接在 PR comment 中写，dev agent 下次 session 自行读取 |
| 冲突协调 | Agent 状态表声明文件锁，有重叠时用户介入 |

**用户保留的核心职责**：
- 调整优先级（编辑 TASKS.md 待办排序）
- 方向纠偏（在 TASKS.md 收件箱记录，或在 PR 中 comment）
- 最终合并/拒绝决策（可委托 nodex 执行）
- 指定特定 Agent 做特定任务

---

## 8. 与 CLAUDE.md 的关系

CLAUDE.md 的"多 Agent 协作规则"段引用本文件：

```markdown
详细协作规范见 `docs/AGENT-COLLABORATION.md`。
```

CLAUDE.md 保留 Git 分支规范和验证分工等快速参考信息，
本文件承载完整的协作流程和模板。

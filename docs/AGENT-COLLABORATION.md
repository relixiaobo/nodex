# 多 Agent 协作方案

> 本文档定义多个 AI Agent 并行开发同一项目的协作规范。
> 所有 Agent 通过 CLAUDE.md 中的引用读到本文件。

---

## 1. 角色与身份

| 角色 | 说明 |
|------|------|
| **用户** | 最终决策者：优先级调整、方向纠偏、合并/拒绝 |
| **Agent** | 各自在独立 clone + 独立分支工作，通过 GitHub 异步协调 |

每个 Agent 工作时在 commit 和文档中使用自己的身份标识，方便追溯。

### 当前 Agent 清单

| Agent ID | 工具 | 主要职责 | 次要职责 | 分支前缀 | Dev Server 端口 | Clone 路径 |
|----------|------|---------|---------|---------|----------------|-----------|
| **nodex** | Claude Code (主会话) | Review PR、合并到 main、协调任务 | 小修复、紧急改动 | `main` 或临时分支 | `5199` | 主 clone |
| **nodex-codex** | Codex | 功能开发、提交 PR | Bug 修复 | `codex/<feature>` | `5200` | 独立 clone |
| **nodex-cc** | Claude Code (独立会话) | 功能开发、提交 PR | Bug 修复 | `cc/<feature>` | `5201` | 独立 clone |
| **nodex-cc-2** | Claude Code (独立会话) | 功能开发、提交 PR | Bug 修复 | `cc2/<feature>` | `5202` | 独立 clone |

### Agent 自我识别

所有 Agent 共享同一套 `CLAUDE.md` 和 `AGENT-COLLABORATION.md`。每个 Agent 通过以下方式确认自己的身份：

| 识别依据 | nodex | nodex-codex | nodex-cc | nodex-cc-2 |
|---------|-----------|-------------|----------|------------|
| Clone 路径 | `nodex`（主 clone） | `nodex-codex` | `nodex-cc` | `nodex-cc-2` |
| Dev Server 端口 | `5199` | `5200` | `5201` | `5202` |
| Git 分支 | `main` | `codex/*` | `cc/*` | `cc2/*` |

### 端口分配规则

- **主 clone**: `http://localhost:5199`（默认，CLAUDE.md 中已配置）
- **Agent clone**: 通过 `PORT=<port> npm run dev:test` 启动，避免端口冲突
- 端口范围 `5199-5210`，每个 Agent 固定一个端口
- MCP 工具（chrome-devtools）连接对应端口的 standalone 测试环境

---

## 2. Agent 工作流

### 2.1 Session 启动协议（所有 Agent）

每次新 session 开始时，Agent **必须**按以下顺序执行：

1. **识别自己**：通过 clone 路径 / 端口 / 分支确认身份
2. **同步代码**：`git pull origin main`（dev agent 额外 rebase 自己的分支）
3. **读取共享知识**：`Read docs/LESSONS.md` — 了解项目经验教训和陷阱
4. **检查自己的 open PR**：`gh pr list --author @me` — 是否有 review comment 需要处理
5. **检查待办**：
   - **所有 Agent**: `Read docs/TASKS.md` — 了解全局状态、收件箱、自己的进行中任务
   - **nodex**: 额外 `gh pr list --label needs-review` — 是否有待审 PR

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

### 2.3 开发 Agent 工作流（nodex-codex / nodex-cc / nodex-cc-2）

```
接到任务 → 标记 Issue + Draft PR（§2.2）→ 开发 → 自检 → 标记 Ready → 等待 review
```

1. §2.2 的标记步骤已包含创建分支和 Draft PR
2. 在 Issue comment 中**声明将修改的热点文件**（见 §5 文件锁）
3. 开发过程中定期 push，保持 Draft PR 可见
4. 完成后：
   - 按 PR template checklist 逐项自检
   - 将 PR 从 Draft 转为 Ready：`gh pr ready`
   - 添加 `needs-review` label：`gh pr edit --add-label "needs-review"`
   - **不需要通知用户或 nodex**，label 驱动 review

### 2.4 Review Agent 工作流（nodex）

```
检查 needs-review → Review PR → 留 comment / 合并 → 后续修正
```

1. Session 开始时检查：`gh pr list --label "needs-review"`
2. Review 内容：代码质量、测试覆盖、文档同步、设计系统合规
3. **Review 意见直接写在 GitHub PR comment 中**（不通过用户转达）
   - 需要修改：在 PR 留 comment，移除 `needs-review`，dev agent 下次 session 会看到
   - 可以合并：直接合并，做必要的后续修正（如设计系统微调）
4. 也可直接在 main 上做小修复或紧急改动

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
| **规格** | `docs/features/*.md` | 低 | 按文件独占 | 改功能时同步更新对应文件 |
| **测试** | `docs/TESTING.md` | 中 | 共有 | 只追加自己的 section |
| **测试** | `docs/MANUAL-TEST-CHECKLIST.md` | 低 | 共有 | 只追加 |
| **设计** | `docs/design-system.md` | 低 | 共有 | 涉及视觉变更时更新 |
| **研究** | `docs/research/*.md` | 无 | 只读 | 原则上不修改（参考资料） |
| **代码** | `src/**` | 高 | 按文件独占 | 同一时间只有一个 Agent 改同一文件 |

> `docs/issues.md` 和 `docs/ROADMAP.md` 已废弃，不再维护。

### 3.2 详细规则

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

### 3.3 交付后文档同步清单

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

原 [GitHub Issues](https://github.com/relixiaobo/nodex/issues) 保留为历史存档，不再作为协作状态来源。

### 4.1 TASKS.md 结构

| 区域 | 用途 | 谁维护 |
|------|------|--------|
| **收件箱** | 用户随手记录 bug/想法 | 用户写入，agent 归类后删除 |
| **Agent 状态** | 谁在做什么、改哪些文件 | Dev agent 开工时更新 |
| **进行中** | 活跃任务详情（owner/branch/files/progress/notes） | Dev agent 持续更新 |
| **待办** | 按优先级排列的任务列表（P2 > P3） | nodex 或用户调整优先级 |
| **已完成** | 完成记录 | nodex merge 时移入 |

### 4.2 Agent 操作规则

```bash
# 开工：编辑 docs/TASKS.md（更新 Agent 状态 + 移动任务到「进行中」）
# 进展：更新 Progress checklist + Notes
# 卡住：在 Notes 中写明原因、已尝试方案、建议下一步，Owner 改为 —
# 完成：nodex merge PR 时移到「已完成」
```

### 4.3 交接协议

当一个 Agent 卡住时：

**交出方**：
1. 在 `docs/TASKS.md` 对应任务的 Notes 中写详细交接备注（已尝试方案、排除的方向、建议下一步）
2. Owner 改为 `—`，Agent 状态表清空自己的行
3. Commit + push 当前进度到自己的分支

**接收方**：
1. `git pull` 获取最新代码
2. 读 TASKS.md 对应任务的 Notes 了解完整上下文
3. 更新 Owner 为自己，更新 Agent 状态表
4. 在 Notes 中追加新的尝试记录

**关键原则**：
- **不要重复已失败的方案** — 先读完 Notes 再动手
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

其他 Agent 开始工作前**检查当前 open 的 Issues 和 Draft PR**，确认没有文件冲突。

查看所有 open PR 修改的文件：
```bash
gh pr list --state open --json number,title,files --jq '.[] | "\(.number) \(.title)"'
```

### 分工原则

- 按文件归属划分任务，不仅按功能划分
- 任务认领前先检查：我要改的文件是否有其他 Agent 正在改？
- 有重叠时，通过用户协调先后顺序

---

## 6. 用户角色：决策者而非中继站

以下环节**不再需要用户手动传话**：

| 环节 | 机制 |
|------|------|
| 任务分配 | 用户在聊天中指定，agent 更新 `docs/TASKS.md` |
| 进度了解 | 用户 `Read docs/TASKS.md`（或 agent 汇报） |
| 触发 review | Dev agent 加 `needs-review` label，nodex 自行检查 |
| 传达 review 意见 | nodex 直接在 PR comment 中写，dev agent 下次 session 自行读取 |
| 冲突协调 | Agent 状态表声明文件锁，有重叠时用户介入 |

**用户保留的核心职责**：
- 调整优先级（编辑 TASKS.md 待办排序）
- 方向纠偏（在 TASKS.md 收件箱记录，或在 PR 中 comment）
- 最终合并/拒绝决策（可委托 nodex 执行）
- 指定特定 Agent 做特定任务

---

## 7. 与 CLAUDE.md 的关系

CLAUDE.md 的"多 Agent 协作规则"段引用本文件：

```markdown
详细协作规范见 `docs/AGENT-COLLABORATION.md`。
```

CLAUDE.md 保留 Git 分支规范和 dev server 端口等快速参考信息，
本文件承载完整的协作流程和模板。

# 多 Agent 协作方案

> 本文档定义多个 AI Agent 并行开发同一项目的协作规范。
> 所有 Agent 通过 CLAUDE.md 中的引用读到本文件。

---

## 1. 角色与身份

| 角色 | 说明 |
|------|------|
| **用户** | 唯一协调人，分配任务、review PR、决定合并 |
| **Agent** | 各自在独立 clone + 独立分支工作，通过文件系统交换信息 |

每个 Agent 工作时在 commit 和文档中使用自己的身份标识，方便追溯。

### 当前 Agent 清单

| Agent ID | 工具 | 主要职责 | 次要职责 | 分支前缀 | Dev Server 端口 | Clone 路径 |
|----------|------|---------|---------|---------|----------------|-----------|
| **nodex** | Claude Code (主会话) | Review PR、合并到 main、协调任务 | 小修复、紧急改动 | `main` 或临时分支 | `5199` | 主 clone |
| **nodex-codex** | Codex | 功能开发、提交 PR | Bug 修复 | `codex/<feature>` | `5200` | 独立 clone |
| **nodex-cc** | Claude Code (独立会话) | 功能开发、提交 PR | Bug 修复 | `cc/<feature>` | `5201` | 独立 clone |

### Agent 自我识别

三个 Agent 共享同一套 `CLAUDE.md` 和 `AGENT-COLLABORATION.md`。每个 Agent 通过以下方式确认自己的身份：

| 识别依据 | nodex | nodex-codex | nodex-cc |
|---------|-----------|-------------|----------|
| Clone 路径 | `nodex`（主 clone） | `nodex-codex` | `nodex-cc` |
| Dev Server 端口 | `5199` | `5200` | `5201` |
| Git 分支 | `main` | `codex/*` | `cc/*` |

**识别后的行为差异**：
- **nodex**: 收到 PR 后 review 代码质量、测试覆盖、文档同步，确认无误后合并。可以做小修复但不主动认领大功能
- **nodex-codex / nodex-cc**: 从 `docs/issues.md` 认领任务或接收用户分配的功能，在独立分支开发，完成后提 PR 并等待 review

### 端口分配规则

- **主 clone**: `http://localhost:5199`（默认，CLAUDE.md 中已配置）
- **Agent clone**: 通过 `PORT=<port> npm run dev:test` 启动，避免端口冲突
- 端口范围 `5199-5210`，每个 Agent 固定一个端口
- MCP 工具（chrome-devtools）连接对应端口的 standalone 测试环境

### Agent 工作流

1. **功能开发 Agent**（nodex-codex / nodex-cc）:
   - 从 `main` 创建功能分支（`codex/<feature>` 或 `cc/<feature>`）
   - 在独立 clone 中开发，使用分配的端口运行 dev server
   - 完成后提交 PR 到 `main`
   - PR 中说明改动范围、测试结果、涉及的热点文件

2. **主会话 Agent**（nodex）:
   - Review PR、提出修改意见或直接合并
   - 处理 Agent 间的任务分配和冲突协调
   - 也可直接在 main 上做小修复或紧急改动

3. **常量/类型协调**:
   - 新增 `SYS_*` / `NDX_*` 常量前，先在 PR 描述中声明，避免 ID 冲突
   - `system-nodes.ts` 属于高风险文件，两个 Agent 不能同时修改

---

## 2. 共享文档治理

项目中有多种需要协作维护的文档，各有不同的冲突风险和写入策略。

### 2.1 文档分类总览

| 类别 | 文件 | 冲突风险 | 所有权模型 | 写入策略 |
|------|------|---------|-----------|---------|
| **治理** | `CLAUDE.md` | 高 | 共有 | 仅用户批准后修改 |
| **治理** | `docs/AGENT-COLLABORATION.md` | 低 | 共有 | 仅用户批准后修改 |
| **跟踪** | `docs/issues.md` | 中 | 共有 | 只追加，不改已有行 |
| **跟踪** | `docs/issues/*.md` | 低 | 按编号独占 | 每 issue 独立文件 |
| **跟踪** | `docs/ROADMAP.md` | 中 | 共有 | 仅更新自己负责的 Feature 状态 |
| **规格** | `docs/features/*.md` | 低 | 按文件独占 | 改功能时同步更新对应文件 |
| **测试** | `docs/TESTING.md` | 中 | 共有 | 只追加自己的 section |
| **测试** | `docs/MANUAL-TEST-CHECKLIST.md` | 低 | 共有 | 只追加 |
| **设计** | `docs/design-system.md` | 低 | 共有 | 涉及视觉变更时更新 |
| **研究** | `docs/research/*.md` | 无 | 只读 | 原则上不修改（参考资料） |
| **代码** | `src/**` | 高 | 按文件独占 | 同一时间只有一个 Agent 改同一文件 |

### 2.2 详细规则

#### CLAUDE.md（治理核心）

- **谁能改**: 任何 Agent 可以提议修改，但需用户明确批准
- **改什么**: 新增约定、修正过时信息、添加技术参考
- **怎么改**: 先提出修改内容 → 用户确认 → 再 commit
- **冲突预防**: 改动范围尽量小，不重构已有段落结构

#### docs/issues.md（索引表）

- **谁能改**: 所有 Agent
- **怎么改**:
  - 新建 issue: 追加到 Open 表末尾
  - 认领 issue: 修改该行的状态和负责人
  - 关闭 issue: 移到 Closed 表
- **冲突预防**: 只追加行，不修改别人的行

#### docs/issues/\*.md（详情文件）

- **谁能改**: 当前负责该 issue 的 Agent
- **怎么改**: 追加新方案，保留前人记录
- **冲突预防**: 每个 issue 独立文件，天然无冲突

#### docs/features/\*.md（特性规格）

- **谁能改**: 正在实现该特性的 Agent
- **怎么改**: 实现/修复后同步更新"当前状态"、"决策记录"、"与 Tana 差异"
- **冲突预防**: 同一时间只有一个 Agent 在做某个特性
- **注意**: 这是行为定义的权威来源，更新时要准确

#### docs/ROADMAP.md（进度跟踪）

- **谁能改**: 完成/推进某个 Feature 的 Agent
- **怎么改**: 仅更新自己负责的 Feature 行的状态和日期
- **冲突预防**: 不改别人的行

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

### 2.3 交付后文档同步清单

每次完成"实现/修复/更新"后，Agent 应按此清单同步文档：

| 变更类型 | 需要更新 |
|---------|---------|
| Bug 修复 | `gh issue close <N>` 或 PR 中 `fixes #N` |
| 行为变更 | `docs/features/*.md`（对应特性） |
| 新增测试 | `docs/TESTING.md`（覆盖映射） |
| 需要人工验收 | `docs/MANUAL-TEST-CHECKLIST.md` |
| Feature 进度 | GitHub Issue 勾选子任务 checkbox |
| UI 视觉变更 | `docs/design-system.md` |

---

## 3. Issue 跟踪（GitHub Issues）

所有 Bug 和 Feature 统一在 [GitHub Issues](https://github.com/relixiaobo/nodex/issues) 跟踪。

看板地址：[Nodex Board](https://github.com/users/relixiaobo/projects/1)

> `docs/issues.md` 和 `docs/ROADMAP.md` 已废弃，不再维护。

### 3.1 Labels 约定

| Label | 用途 |
|-------|------|
| `bug` | Bug |
| `enhancement` | 新功能 |
| `P1` / `P2` / `P3` | 优先级 |
| `agent:nodex-codex` / `agent:nodex-cc` | Agent 认领标记 |
| `blocked` | 被其他任务阻塞 |
| `needs-review` | 等待 review/merge |

### 3.2 Agent 操作规则

```bash
# 新建 issue
gh issue create --title "..." --label "bug,P1" --milestone "Phase 1: 数据基础"

# 认领 issue（添加 agent label）
gh issue edit <N> --add-label "agent:nodex-codex"

# 完成后关闭（或 PR 中用 fixes #N 自动关闭）
gh issue close <N>

# 卡住时：在 issue 中留 comment 说明进展，移除自己的 agent label
gh issue edit <N> --remove-label "agent:nodex-codex" --add-label "blocked"
gh issue comment <N> --body "卡住了，原因：... 建议下一步：..."
```

### 3.3 交接协议

当一个 Agent 卡住时：

**交出方**：
1. 在 GitHub Issue 中留详细 comment（已尝试方案、排除的方向、建议下一步）
2. 移除自己的 `agent:*` label，添加 `blocked` label
3. Commit + push 当前进度到自己的分支

**接收方**：
1. `git pull` 获取最新代码
2. 读 Issue 的 comment 了解完整上下文
3. 添加自己的 `agent:*` label，移除 `blocked`
4. 在 Issue 中追加 comment 记录新的尝试

**关键原则**：
- **不要重复已失败的方案** — 先读完 Issue comments 再动手
- **交接备注要具体** — "可能是 keymap 问题"不够，要写"在 L362 加 console.log 确认 handler 是否被调用"

---

## 6. 冲突预防

### 热点文件清单

| 文件 | 风险 | 策略 |
|------|------|------|
| `src/stores/node-store.ts` | 高 | 同一时间只有一个 Agent 改 |
| `src/components/outliner/OutlinerItem.tsx` | 高 | 同一时间只有一个 Agent 改 |
| `src/types/system-nodes.ts` | 高 | 新增常量需协调 |
| `docs/issues.md` | 中 | 只追加行，不修改已有行 |
| `docs/TESTING.md` | 中 | 各 Agent 只追加自己的 section |
| `docs/ROADMAP.md` | 中 | 仅更新自己负责的行 |
| `CLAUDE.md` | 高 | 需用户批准 |

### 分工原则

- 按文件归属划分任务，不仅按功能划分
- 任务认领前先检查：我要改的文件是否有其他 Agent 正在改？
- 有重叠时，通过用户协调先后顺序

---

## 7. 与 CLAUDE.md 的关系

CLAUDE.md 的"多 Agent 协作规则"段引用本文件：

```markdown
详细协作规范见 `docs/AGENT-COLLABORATION.md`。
```

CLAUDE.md 保留 Git 分支规范和 dev server 端口等快速参考信息，
本文件承载完整的协作流程和模板。

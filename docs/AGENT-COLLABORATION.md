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

| Agent ID | 工具 | 职责 | 分支前缀 | Dev Server 端口 | Clone 路径 |
|----------|------|------|---------|----------------|-----------|
| **claude-cc** | Claude Code (主会话) | Review、合并 PR、协调任务、主线开发 | `main` 或临时分支 | `5199` | 主 clone |
| **nodex-codex** | Codex | 独立功能开发，提交 PR | `codex/<feature>` | `5200` | 独立 clone |
| **nodex-cc** | Claude Code (独立会话) | 独立功能开发，提交 PR | `cc/<feature>` | `5201` | 独立 clone |

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

2. **主会话 Agent**（claude-cc）:
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

| 变更类型 | 需要更新的文档 |
|---------|--------------|
| Bug 修复 | `docs/issues.md`（关闭）+ `docs/issues/<N>.md`（如有） |
| 行为变更 | `docs/features/*.md`（对应特性） |
| 新增测试 | `docs/TESTING.md`（覆盖映射） |
| 需要人工验收 | `docs/MANUAL-TEST-CHECKLIST.md` |
| Feature 进度 | `docs/ROADMAP.md` + `docs/issues.md`（Feature 行） |
| UI 视觉变更 | `docs/design-system.md` |

---

## 3. Issue 跟踪

### 3.1 索引表格式（docs/issues.md）

索引表 = 轻量一行一条，方便快速扫描和多 Agent 追加。

```markdown
## Open

| # | 标题 | 状态 | 负责人 | 优先级 | 创建 |
|---|------|------|--------|--------|------|
| 49 | Cmd+Enter 无法切换 Checkbox | 📋 待认领 | — | P1 | 02-14 |
| 50 | 某新功能 | 🔧 进行中 | codex-a | P2 | 02-15 |

## Closed

| # | 标题 | 关闭人 | 关闭日期 |
|---|------|--------|----------|
| 43 | Field name 末尾 Enter 不应切换建议字段 | claude-main | 02-14 |
```

### 3.2 状态枚举

| 状态 | 含义 | 谁可以设 |
|------|------|---------|
| 📋 待认领 | 新建，没人在做 | 任何人创建 issue 时 |
| 🔧 进行中 | 有人正在处理 | 认领的 Agent |
| 🔁 交接 | 当前 Agent 卡住，需要另一个接手 | 卡住的 Agent |
| ✅ 已关闭 | 已修复/已实现 | 修复的 Agent |

### 3.3 操作规则

- **新建**: 追加到 Open 表末尾（只追加，不修改已有行）
- **认领**: 将状态改为 `🔧 进行中`，填自己的身份
- **卡住**: 将状态改为 `🔁 交接`，清空负责人，在详情文件写交接备注
- **关闭**: 移到 Closed 表，在详情文件标注解决方案

### 3.4 详情文件（docs/issues/\<number\>.md）

仅在以下情况创建详情文件：
- Bug 需要多轮调查（记录尝试过的方案）
- 需要交接给另一个 Agent
- 功能实现涉及多步决策

简单 bug（一次修复、无需上下文）不需要详情文件。

模板：

```markdown
# #<number> <标题>

**状态**: 🔁 交接 / 🔧 进行中 / ✅ 已关闭
**负责人**: <agent-id> / —（待认领）
**优先级**: P1 / P2 / P3
**关联**: ref #20 / fixes #49

---

## 问题描述

<现象、复现步骤、预期 vs 实际>

## 已尝试方案

| # | 方案 | 结果 | 操作人 |
|---|------|------|--------|
| 1 | ... | 未生效 — <原因> | claude-main |
| 2 | ... | 部分生效 — <残留问题> | claude-main |

## 相关代码

- `src/path/file.ts` L100-120 — <说明>
- `src/path/other.ts` — <说明>

## 相关 commit

- `abc1234` <commit message>
- `def5678` <commit message>

## 交接备注

> 下一个接手的 Agent 从这里开始读

- **当前判断**: <对根因的最新理解>
- **排除的方向**: <已证明不是原因的假设>
- **建议下一步**: <具体可执行的调试动作>
- **风险提示**: <可能的副作用或注意事项>
```

---

## 4. 交接协议

当一个 Agent 无法解决问题时：

### 交出方（卡住的 Agent）

1. 创建或更新 `docs/issues/<number>.md`，填写完整的调查上下文
2. `issues.md` 索引表状态改为 `🔁 交接`，清空负责人
3. Commit + push 到自己的分支（或 main）
4. 告知用户："#49 我卡住了，已记录交接备注，可以交给其他 Agent"

### 接收方（新 Agent）

1. `git pull` 获取最新代码
2. 读 `docs/issues/<number>.md` 了解完整上下文
3. 索引表状态改为 `🔧 进行中`，填自己的身份
4. 在详情文件的"已尝试方案"表格中继续追加
5. 解决后关闭，或继续交接

### 关键原则

- **不要重复已失败的方案** — 先读完交接备注再动手
- **追加而非覆盖** — 在详情文件中追加新方案，保留前人的记录
- **交接备注要具体** — "可能是 keymap 问题"不够，要写"在 L362 加 console.log 确认 handler 是否被调用"

---

## 5. Feature 工作项

Feature 级别的跟踪使用 `docs/issues.md` 的 Open Features 段。

Feature 内的子任务如果需要交接，同样创建 `docs/issues/<number>.md`。

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

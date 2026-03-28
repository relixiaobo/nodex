# Sub-Agent Implementation Study

> Date: 2026-03-28
> Context: soma Chrome Side Panel 笔记应用需要 sub-agent 系统实现后台并发 AI 任务
> 基于: 产品调研 + 开源框架分析 + soma 现有架构 + `multi-agent-orchestration.md` + `phase-4-orchestration.md`

---

## 1. 产品调研

### 1.1 开发者工具类

#### Claude Code — Agent Tool (Subagent)

**Source**: [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code), [Agent Teams guide](https://claudefa.st/blog/guide/agents/agent-teams)

**架构模式**: 两层并行——

1. **Subagent（会话内）**: 主 agent 通过 `Agent` tool 生成子 agent。每个 subagent 运行在独立 context window，拥有收紧的权限集（只有 Read/Grep/Glob/Bash/Agent 等工具，不能直接 Edit/Write）。支持 `worktree` 隔离模式（临时 git worktree，独立代码副本）。分 foreground（阻塞主 agent 等待结果）和 background（主 agent 继续工作，完成后通知）两种模式。

2. **Agent Teams（跨会话）**: Lead session 生成 teammate sessions，每个 teammate 是完整 Claude Code 实例。通过 mailbox 系统直接互发消息（不仅是 hub-and-spoke）。共享 task list（pending/in-progress/completed），支持任务依赖。文件级锁防止竞争条件。

**通信模型**: Subagent = 纯结果回报（只向主 agent 返回文本摘要），不能互相通信。Agent Teams = 文件系统上的 mailbox + shared task list。

**结果沉淀**: Subagent 的输出是文本（回传给主 agent context）。如果在 worktree 中修改了文件，worktree 路径和分支名返回给主 agent。Agent Teams 直接写文件系统。

**进度可见性**: Subagent 运行时主 agent 无法观察中间过程（foreground 阻塞等待，background 只收到最终结果）。Agent Teams 通过 task list states 可查看进度。

**对 soma 的启发**:
- **两层分离** 很有价值：简单任务用轻量 subagent（结果回传），复杂协作用完整 agent。soma 的 Phase 4 Step 1-2 对应前者，Step 3-4 对应后者
- **权限收紧** 是好实践：subagent 不需要所有工具。soma 的 subagent 可能不需要 `browser` tool
- **Context 隔离** 是关键——subagent 不继承主 agent 的完整对话历史，只收到任务描述。降低 token 成本 + 聚焦任务

---

#### Cursor / Windsurf

**Source**: Cursor docs, Windsurf Cascade documentation

**架构模式**: Cursor 引入了 **Background Agent** (2025)——可以在后台分支上独立执行编码任务（创建分支、编写代码、运行测试、创建 PR），用户可以继续在前台编辑。本质是"fire-and-forget + 完成通知"模式。Windsurf 的 Cascade 是"思维链式"agent——多步骤顺序执行，每步可调用多种工具（搜索、编辑、终端），但不支持并发 sub-agent。

**通信模型**: 单向——agent 在后台运行，完成后通知前台。用户不能中途干预（区别于 Claude Code 的 steer）。

**结果沉淀**: 直接写入文件系统（代码文件），通过 git diff 展示变更。

**进度可见性**: Cursor Background Agent 在侧栏显示任务状态（running/completed/failed）+ 简要日志。Windsurf Cascade 逐步展示思考链。

**对 soma 的启发**:
- "Background Agent 在独立分支上工作" 映射到 soma 的 "subagent 写入独立节点子树"
- 用户无法中途干预是局限——soma 的 clarification flow 是重要差异化

---

#### Devin / SWE-agent

**Source**: [Cognition Labs Devin](https://devin.ai/), [SWE-agent GitHub](https://github.com/princeton-nlp/SWE-agent)

**架构模式**: Devin 是全自主编码 agent，使用 **plan → execute → verify** 三阶段循环。内部分解为子任务（读代码、修改文件、运行测试、调试），每个子任务是一个工具调用序列。SWE-agent 是开源实现，使用 Agent-Computer Interface（ACI）——将编辑器、终端等抽象为工具。

**通信模型**: 单 agent 内部循环，无真正的 multi-agent 通信。任务分解是 LLM 内在推理，不是显式 delegation。

**结果沉淀**: 代码变更作为 PR 提交。中间状态保存为 trajectory（可回放调试）。

**进度可见性**: Devin 有实时 UI 展示当前步骤（"Reading file X", "Running tests", "Fixing error"）+ 浏览器/编辑器/终端三窗口实时画面。SWE-agent 输出 trajectory log。

**对 soma 的启发**:
- **三阶段循环** (plan → execute → verify) 是好模式，soma 的 subagent 也应该有 verify 步骤（写入节点后 `node_read` 验证）
- **Trajectory 回放** 有启发——但 soma 是节点级操作，自然在 outliner 中可见，不需要额外 trajectory
- **实时步骤展示** 是好 UX——soma 的 task indicator 可以显示当前步骤描述

---

#### GitHub Copilot Workspace

**Source**: [GitHub Copilot Workspace docs](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-workspace)

**架构模式**: **Specification → Plan → Implementation → Review** 四阶段 agent 流程。每个阶段产出一个人类可审查的 artifact（spec doc → file change plan → code diffs → review checklist）。用户在每个阶段可以修改 AI 的输出，然后 AI 基于修改后的输出继续下一阶段。

**通信模型**: 阶段间串行传递 artifact，不是 agent 间通信。本质是单 agent 多阶段。

**结果沉淀**: 每阶段的 artifact 持久化在 workspace session 中，最终产出 PR。

**进度可见性**: 每阶段完成后展示结果，等待用户确认或修改后继续。

**对 soma 的启发**:
- **阶段间的人类介入点** 是好设计——但对 soma 的后台任务太重（每步都等确认违背"不阻塞 Chat"目标）
- 适合 soma 的 "planning mode"——复杂任务先出计划，用户确认后一次性执行
- **Plan artifact = 节点** 在 soma 中很自然——subagent 的执行计划可以是一个 #task 节点

---

### 1.2 AI 应用平台类

#### ChatGPT — Deep Research

**Source**: [OpenAI Deep Research blog](https://openai.com/index/introducing-deep-research/)

**架构模式**: 用户提出研究问题 → agent 自主执行多轮搜索+阅读+综合（5-30 分钟），用户可以离开页面。底层是 o3 驱动的多步推理 agent，每步决定下一步行动（搜索、读取、写摘要、继续深入）。不是显式的 multi-agent，而是 **单 agent + 长时间运行 + 后台执行**。

**通信模型**: 单向——用户发起，agent 独立运行，完成后返回完整报告。运行期间用户无法干预。

**结果沉淀**: 最终报告作为 assistant message 返回，包含引用和来源链接。不写入外部系统。

**进度可见性**: 实时显示当前步骤（"搜索中: X"、"阅读: Y"、"正在综合 Z 个来源"）。进度描述更新频率约 10-30 秒。运行时间估算（"约 5 分钟"）。

**对 soma 的启发**:
- **长时间后台运行 + 进度更新** 是核心 UX 模式——soma 的 task indicator 应该展示步骤描述而非仅状态
- **运行期间不可干预** 是局限——soma 的 clarification flow 是差异化优势
- **报告 = 纯文本** 是局限——soma 的结果 = 节点树，结构化 + 可搜索 + 可关联
- Deep Research 的"先收集再综合"模式适合 soma 的"先 clip 多个页面再整理"场景

---

#### Google Gemini — Deep Research

**Source**: [Google Gemini Deep Research](https://blog.google/products/gemini/google-gemini-deep-research/)

**架构模式**: 类似 ChatGPT Deep Research——用户输入研究主题 → Gemini 先生成**研究计划**（大纲）供用户审查修改 → 用户确认后 agent 执行多步搜索+综合（后台运行）。关键区别是**先出计划、用户确认后执行**。

**通信模型**: 两步——(1) 同步生成计划 (2) 异步执行计划。计划确认后 agent 独立运行。

**结果沉淀**: 最终报告作为 Google Docs 导出（可选），或留在对话中。

**进度可见性**: 执行期间显示"Research in progress"动画 + 当前步骤描述。预估完成时间。

**对 soma 的启发**:
- **先计划再执行** 是重要模式——减少浪费（agent 执行了 10 分钟才发现方向不对），同时让用户有掌控感
- soma 可以实现：subagent 收到任务 → 先用 `node_create` 写计划节点（#task-step） → 主 agent 可选择性呈现给用户 → 确认后执行
- **但不应该强制每次都出计划**——简单任务直接执行，复杂任务自动出计划

---

#### Perplexity

**Source**: [Perplexity docs](https://docs.perplexity.ai/)

**架构模式**: **Search → Read → Synthesize** 单 agent 循环。每次查询触发多个并行搜索（不同搜索引擎/知识源），收集结果后综合为带引用的回答。不是真正的 multi-agent，而是并行工具调用。

**通信模型**: 内部工具并行调用，无 agent 间通信。

**结果沉淀**: 回答 + 引用链接作为对话消息。Pro 用户可导出。

**进度可见性**: 实时显示搜索来源列表（逐个出现） + "阅读中" + "生成回答中"。

**对 soma 的启发**:
- **并行搜索是好模式**——soma 的 subagent 可以并行处理多个 URL（每个 URL 一个 `browser` tool 调用）
- **来源可追溯** 是重要 UX——soma 的结果节点应该通过 reference 链接到源节点

---

### 1.3 Agent 框架类

> 详见 `docs/research/multi-agent-orchestration.md` §2 完整框架调研（10+ 框架对比）。以下仅提取与 soma subagent 实现最相关的设计模式。

#### OpenAI Agents SDK

**Source**: [openai-agents-js](https://github.com/openai/openai-agents-js)

**核心模式**: **Agent Handoff** — agent 可以将对话控制权转移给另一个 agent。每个 agent 有独立的 instructions、tools、model。Handoff 携带上下文（对话历史的筛选子集）。支持 **Guardrails**（input/output 验证，与 agent 并行执行）。

**生命周期 Hooks**: `AgentHooks` (on_start, on_end, on_handoff, on_tool_start, on_tool_end) + `RunHooks` (on_agent_start, on_agent_end) 提供完整的生命周期观测。

**对 soma 的启发**:
- Handoff 是"上下文传递"，不是"后台并发"——不适合 soma 的非阻塞后台模式
- **Guardrails 并行执行** 是好模式——soma 的 subagent 可以并行运行输出验证（如检查节点是否正确创建）
- **生命周期 Hooks** 设计优秀——soma 的 AgentOrchestrator 应该暴露类似 hooks 供 UI 订阅

---

#### LangGraph — State Machine Multi-Agent

**Source**: [LangGraph.js](https://github.com/langchain-ai/langgraphjs)

**核心模式**: **Graph-based State Machine** — 节点是 agent/function，边是条件路由。两种多 agent 模式：
1. **Supervisor**: 中心 agent 路由到 specialist agents（每次只运行一个）
2. **Swarm**: 去中心化 handoff（每个 agent 可以决定转给谁）

**并发执行**: 支持 parallel branches（scatter-gather）——多个节点并行执行，下游节点等待所有并行分支完成后合并结果。

**检查点**: 内置 `Checkpointer` 在每个节点执行后保存状态快照，支持从任意检查点恢复（time travel debugging）。

**对 soma 的启发**:
- **Scatter-gather 并行** 模式完美匹配 soma 的"并行处理多个页面"场景
- **检查点恢复** 是好思路，但在 soma 中 Loro CRDT 已经提供了数据层持久化——subagent 失败时已写入的节点自动保留
- **Bundle 太大，LangChain 依赖链是 dealbreaker**——只借鉴模式，不引入框架

---

#### CrewAI — Role-Based Orchestration

**Source**: [CrewAI](https://www.crewai.com/), [crewai-ts](https://github.com/ShMcK/crewai-ts)

**核心模式**: **角色驱动** — 每个 agent 有 role（角色）、goal（目标）、backstory（背景）。Agent 间通过 Task 连接——Task 定义输入、输出、执行者。支持 **Delegation**（agent 可以把子任务委派给其他 agent）。

**Process 模式**: Sequential（任务串行）、Hierarchical（manager agent 分配）、Consensual（多 agent 协商）。

**对 soma 的启发**:
- **Hierarchical process** = soma 的 "主 agent delegate to subagent" 模式
- **角色 = #skill 节点** — soma 的 subagent 用 #skill 节点配置"角色"，比 CrewAI 的硬编码角色更灵活
- CrewAI 的 delegation 是**同步的**（delegate 后等待结果）——soma 需要**异步** delegation

---

#### AutoGen — Multi-Agent Conversation

**Source**: [Microsoft AutoGen](https://github.com/microsoft/autogen), [AutoGen v0.4 Research](https://www.microsoft.com/en-us/research/articles/autogen-v0-4/)

**核心模式**: **Agent 间对话** — 多个 agent 通过消息传递进行对话。支持 Round-robin（轮流发言）、Random（随机选择下一发言者）、Selector（LLM 决定谁发言）。

**事件驱动 (v0.4+)**: Actor model——每个 agent = actor with typed message handlers (`@message_handler`)。Runtime 路由消息。`CancellationToken` in `MessageContext` 支持取消。`SingleThreadedAgentRuntime` + asyncio queue。Fan-out 用 `asyncio.gather()`。

**对 soma 的启发**:
- "Agent 间对话"模式对 soma **过于复杂**——soma 的 subagent 是独立工作者，不需要互相"讨论"
- **Event-driven 消息路由** 的思路好——映射到 soma 的 EventTarget message bus
- **Actor 模型的 full isolation**（agents only communicate via messages）验证了 soma 的"独立 Agent 实例 + 消息总线"设计
- **Python/.NET 为主，JS 版不成熟**——不适用

---

#### Mastra — TypeScript-First Framework

**Source**: [Mastra.ai](https://mastra.ai/)

**核心模式**: **Workflow Graph** — 类似 LangGraph 的状态机，但 TypeScript 原生。支持 suspend/resume（长时间运行的 workflow 可以暂停等待外部输入后恢复）。内置 MCP 集成。两种生命周期：`FilesystemLifecycle`（init → destroy）和 `SandboxLifecycle`（start → stop → destroy）。

**对 soma 的启发**:
- **Suspend/resume** 正好映射到 soma 的 clarification flow——subagent 暂停等待 clarification 后恢复
- **两种生命周期** 有启发——soma 的简单 subagent 用两阶段（running → completed），复杂 subagent 用三阶段（running → stopping → stopped）
- **但框架太重**（完整 AI stack），且主要面向服务端——不适合 Chrome extension

---

#### AG-UI Protocol — Agent-to-UI Standard

**Source**: [AG-UI Protocol](https://docs.ag-ui.com/), [Event Types Guide](https://www.copilotkit.ai/blog/master-the-17-ag-ui-event-types)

**核心模式**: **16 typed SSE events in 5 categories** — 标准化 agent-to-frontend 通信协议：
1. **Lifecycle**: RUN_STARTED, RUN_FINISHED, RUN_ERROR, STEP_STARTED, STEP_FINISHED
2. **Text**: TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT (streaming delta), TEXT_MESSAGE_END
3. **Tool**: TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END
4. **State**: STATE_DELTA (incremental state sync), STATE_SNAPSHOT
5. **Special**: RAW, INTERRUPT (human-in-the-loop approval), CUSTOM

**对 soma 的启发**:
- **Event 分类法** 非常优秀——soma 的 `AgentMessageType` 应该借鉴这个 5 层分类
- **`STATE_DELTA`** 映射到 Loro CRDT 的增量更新——soma 天然支持
- **`INTERRUPT`** 映射到 soma 的 `clarification-needed`——验证了这个设计模式是行业共识
- **不需要引入框架**——只借鉴 event taxonomy 设计思路

---

### 1.4 笔记/知识管理类（最相关）

#### Notion AI

**Source**: [Notion AI docs](https://www.notion.com/product/ai)

**架构模式**: AI 深度集成 block 模型——AI 操作 = block 操作。三种模式：
1. **Inline AI**（选中文本 → AI 操作：翻译、改写、总结等）→ 结果替换/插入 block
2. **AI Chat**（侧边栏）→ 可搜索整个 workspace，回答基于 workspace 内容
3. **AI Autofill**（数据库属性）→ 基于其他属性自动填充字段值
4. **Connectors**（2025+）→ 连接外部数据源（Slack、Google Drive），AI 搜索范围扩展

**通信模型**: 单 agent，不同入口（inline/chat/autofill）触发相同的 AI backend。没有 multi-agent 编排。

**结果沉淀**: **直接写入 block 模型** — AI 输出 = 新 block 或修改现有 block。与用户手写的 block 形式完全一致（"一切皆 block"）。

**进度可见性**: Inline 操作显示 streaming 动画（逐字出现）。Chat 侧栏显示 typing indicator。Autofill 显示 loading spinner。

**对 soma 的启发**:
- **AI 输出直接写入数据模型（block/node）** 是最重要的模式——soma 已经走在这条路上（agent 用 node tools 操作 Loro CRDT），但需要在 subagent 场景中保持一致
- **AI Autofill = soma 的 tag template auto-fill** — 标签应用时 AI 自动填充字段值。这是 subagent 的一个具体用例
- **Notion 没有后台长时间任务** — AI 操作都是即时的（<30s）。soma 的 subagent（分钟级后台任务）在笔记领域是差异化

---

#### Mem.ai

**Source**: [Mem.ai](https://mem.ai/)

**架构模式**: **"Self-Organizing"** 笔记——AI 自动给笔记打标签、建关联、生成摘要。用户只管写入，组织由 AI 完成。底层是 RAG（向量检索 + LLM 综合）。

**通信模型**: 单 agent，后台异步处理。用户写入 → 后台 AI 处理 → 结果静默更新到笔记。

**结果沉淀**: AI 生成的 tag、关联、摘要直接附加到笔记上。与用户手动的操作形式一致。

**进度可见性**: 最小化——AI 操作在后台静默进行，用户通常不感知过程。偶尔在笔记旁显示"AI processed"标记。

**对 soma 的启发**:
- **静默后台处理** 是 Mem 的核心模式——但结果不透明（"AI 为什么这样分类？"），用户很快失去信任
- soma 的差异化：AI 操作可见可追溯（outliner 上的节点操作），且通过 undo 可撤回
- **"Self-organizing" 不等于好组织** — Mem 用户普遍反馈"找不到东西"。soma 选择"用户召唤 + AI 执行"模式是对的

---

#### Tana AI

**Source**: [Tana AI docs](https://help.tana.inc/ai-in-tana.html), Tana 逆向分析

**架构模式**: AI 作为**节点内命令**——用户在节点上触发 AI 操作（`Make AI node`），AI 使用系统 prompt + 当前上下文生成内容。两种模式：
1. **AI Command Node**: 用户创建 `#ai-command` 节点，定义 prompt template + 输入来源 → 执行后生成子节点
2. **Field Auto-Fill**: Supertag 的字段定义中配置 AI prompt → 应用标签时自动填充字段值

**通信模型**: 单 agent，同步执行。AI command 执行时阻塞 UI（没有后台模式）。

**结果沉淀**: **AI 输出 = 子节点** — 完全融入 "everything is a node" 模型。AI 命令节点是模板（可复用），执行结果是普通节点。

**进度可见性**: 执行时显示 loading 状态在节点 bullet 上。没有步骤级进度。

**对 soma 的启发**:
- **AI command = #skill 节点** — Tana 的设计验证了 soma 的 `#skill` 节点方向。关键差异：Tana 的 AI command 是同步阻塞的，soma 的 subagent 是异步后台的
- **Field Auto-Fill = soma 的 template field fill** — 这个具体模式应该在 soma 的 tag 应用流中实现（Phase 5 Taste 学习的一部分）
- **AI 输出 = 子节点** — 完美对齐 soma 的 "一切皆节点"。subagent 的所有产出必须是节点
- **Tana 没有后台/并发能力** — soma 的 subagent 系统在笔记领域是显著创新

---

## 2. 开源实现分析

### 2.1 Agent 隔离

**问题**: 如何创建独立的 agent runtime（独立 context window、独立 tools），同时共享底层数据层？

| 方案 | 实现 | 隔离程度 | 共享能力 | 适用于 soma |
|------|------|---------|---------|------------|
| **独立 Agent 实例** | Claude Code, pi-agent-core | 完全隔离 context/tools/model | 通过数据层共享 | ✅ 推荐 |
| **Forked context** | OpenAI Agents handoff | 携带部分历史 | 共享对话历史 | ❌ 太耦合 |
| **共享 state** | LangGraph, Google ADK | 隔离执行但共享状态对象 | state dict/typed schema | ⚠️ 部分适用 |
| **进程隔离** | Claude Code Agent Teams | 完全独立进程 | 文件系统 | ❌ Chrome 限制 |

**推荐方案: 独立 Agent 实例 + 共享 Loro CRDT**

```typescript
// 每个 subagent 是一个独立的 pi-agent-core Agent 实例
const subagent = new Agent({
  initialState: { model: resolvedModel },
  streamFn: sharedStreamFn,        // 共享代理层（token 路由）
  getApiKey: sharedGetApiKey,      // 共享 API key 解析
  // 不共享: context, tools, systemPrompt
});

// 独立的工具集（可能是主 agent 工具的子集）
subagent.setTools(getSubagentTools(task.skills));

// 独立的 system prompt（从 #skill 节点构建）
subagent.setSystemPrompt(buildSubagentPrompt(task));

// 数据层共享: subagent 使用相同的 loroDoc 模块
// → 写入的节点自动可见、自动同步
```

**为什么这比 "共享 state" 更好**: soma 的数据层是 Loro CRDT，不是简单的 state dict。每个 agent 通过相同的 `loroDoc` 模块读写节点——CRDT 天然处理并发写入冲突，不需要额外的锁或协调。这比 LangGraph 的 typed state schema 更强大（CRDT vs eventual consistency）。

---

### 2.2 通信模型

**问题**: 主 agent ↔ sub-agent 之间的通信方式？

| 方案 | 实现 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| **Promise/callback** | 直接 async | 最简单 | 无法中途通信 | 简单委派 |
| **EventTarget** | 浏览器原生 | 零依赖、类型化事件 | 无持久化 | 协调信号 |
| **Shared state** | Loro CRDT subscription | 数据自动可见 | 无法 request/response | 数据交换 |
| **Message bus** | 自建 EventTarget wrapper | 支持 pub/sub + mailbox | 需维护 | 复杂协调 |
| **steer() injection** | pi-agent-core | mid-stream 注入 | 只能注入到 agent 对话流 | Clarification |

**推荐方案: Hybrid（Loro CRDT + EventTarget 消息总线）**

这是 `multi-agent-orchestration.md` §4 Pattern 4 的结论，经过对 10+ 框架的调研验证：

- **数据交换** 通过 Loro CRDT——结果、进度、协作产出全部是节点（一切皆节点）
- **协调信号** 通过 EventTarget 消息总线——任务生命周期、clarification、取消等轻量事件

```typescript
// 数据流: subagent → Loro CRDT → UI 自动更新
subagentTools.node_create({ parentId: taskNodeId, text: '提取结果...' });

// 协调流: subagent → EventTarget → 主 agent
bus.send({ from: subagentId, to: 'main', type: 'task-completed', payload: { resultNodeIds } });
```

**为什么纯 Blackboard 不够**: Clarification request 需要结构化的 request/response。subagent 写一个"我有问题"节点，主 agent 怎么知道这是 clarification 而不是普通结果？消息总线提供语义明确的事件类型。

**为什么纯 Message Bus 不够**: 数据在消息中传递不持久化，违背"一切皆节点"。消息 payload 中放完整数据 = 数据只在内存中，面板关闭就丢失。

**借鉴 AG-UI Protocol 的 5 层事件分类**: 原有的 `AgentMessageType` 可以增强为更结构化的分类——

```typescript
type AgentMessageType =
  // Lifecycle（任务生命周期）
  | 'task-delegated'           // ~ AG-UI RUN_STARTED
  | 'task-completed'           // ~ AG-UI RUN_FINISHED
  | 'task-failed'              // ~ AG-UI RUN_ERROR
  | 'task-cancelled'
  // Progress（步骤级进度）
  | 'task-progress'            // ~ AG-UI STEP_STARTED/FINISHED
  // Tool visibility（工具调用可观测）
  | 'tool-call-start'          // ~ AG-UI TOOL_CALL_START
  | 'tool-call-end'            // ~ AG-UI TOOL_CALL_END
  // State（数据变更通知）
  | 'data-available'           // ~ AG-UI STATE_DELTA
  // Special（特殊交互）
  | 'clarification-needed'     // ~ AG-UI INTERRUPT
  | 'clarification-response'
```

---

### 2.3 结果沉淀

**问题**: agent 产出如何持久化？

| 方案 | 实现 | 优点 | 缺点 |
|------|------|------|------|
| **文本回传** | Claude Code subagent | 简单、低 token | 结果不持久化 |
| **直接写入数据层** | Notion AI, Tana AI | 结构化、可搜索 | agent 需要数据写入能力 |
| **两者结合** | Claude Code Teams | 写文件 + 摘要回报 | 复杂度高 |

**推荐方案: 按场景分层持久化**

不同模式的 subagent 产出不同形式的结果：

| 模式 | 结果形式 | 持久化 |
|------|---------|--------|
| **轻量（Chat-only）** | 文本回传给主 agent | Session（IndexedDB） |
| **重量（Node-producing）** | 节点树 + 文本摘要 | Session（IndexedDB）+ 节点（Loro CRDT） |

**Session 是唯一保证存在的持久化层**——无论哪种模式，subagent 的完整对话（tool calls、推理链、中间结果）都通过 IndexedDB session 可回溯。主 agent 在 Chat 中通过 `<cite type="chat">` 链接到 subagent session。

重量模式额外写入 Loro CRDT 节点（通过 node tools），结果天然结构化、可搜索、可关联。

```
轻量模式:
  subagent 分析完成 → 文本结果回传主 agent → Chat 中呈现 + cite session

重量模式:
  subagent 执行:
    1. node_create → 创建结果节点树
    2. 完成 → bus.send('task-completed', { resultNodeIds: [...] })
  主 agent 收到:
    → Chat: "定价提取完成 [查看结果]¹ [执行过程]²"
                           ↑ node cite  ↑ chat cite (session)
```

---

### 2.4 进度可见性

**问题**: 长时间运行的 agent 如何向用户呈现进度？

| 方案 | 实现 | 粒度 | 用户体验 |
|------|------|------|---------|
| **无进度** | Mem.ai | 无 | 差（用户不知道在干嘛） |
| **状态标签** | Cursor Background Agent | 粗（running/done/failed） | 基本 |
| **步骤描述** | ChatGPT Deep Research | 中（"搜索中: X"） | 好 |
| **实时画面** | Devin | 细（编辑器+终端+浏览器实时） | 最好但最重 |
| **节点实时更新** | soma 特有 | 中-细（outliner 中看到节点出现） | 自然 |

**推荐方案: 三层进度**

1. **Badge** — Chat header 右上角，显示运行中任务数量（最轻量，始终可见）
2. **Task list** — 点击 badge 展开，每个任务显示名称 + 状态 + 当前步骤描述
3. **Outliner 实时更新** — subagent 写入的节点在 outliner 中实时出现（CRDT subscription 自动触发 UI 更新）

```
层级 1: [●2] ← badge (2 个任务运行中)

层级 2: 点击展开
  ├── ● 提取定价信息 — "正在读取 OpenAI 页面..."  [✕]
  └── ◐ 整理会议笔记 — "等待确认: 按日期还是按主题分？"  [→]

层级 3: 用户导航到相关节点 → 看到子节点逐步出现
  "定价对比"
    ├── Claude 3.5 Sonnet — $3/$15  ← 刚出现
    ├── GPT-4o — $2.50/$10          ← 刚出现
    └── (正在提取...)               ← loading 状态
```

**为什么 "Outliner 实时更新" 是 soma 的独特优势**: 其他产品的进度都是专门构建的 UI（进度条、步骤列表等）。soma 的进度 = 节点出现在 outliner 中——这是数据模型的自然结果，不需要额外 UI。用户在 outliner 中就能看到 subagent 的工作进展。

---

### 2.5 生命周期管理

**问题**: spawn → run → complete/fail → cleanup 的完整状态机？

```
                         ┌──────────────────────┐
                         │                      ▼
  [idle] → [spawning] → [running] → [completed]
                         │     ▲        │
                         │     │        └─→ [failed]
                         │     │
                         ├──→ [waiting-clarification]
                         │         │
                         │         └─→ [running] (clarification 回复后)
                         │
                         └──→ [cancelled] (用户取消)
```

**推荐实现**:

```typescript
type SubagentStatus =
  | 'spawning'                // Agent 实例创建中
  | 'running'                 // 正常执行
  | 'waiting-clarification'   // 等待主 agent 回复
  | 'completed'               // 成功完成
  | 'failed'                  // 执行失败
  | 'cancelled';              // 用户取消

interface SubagentHandle {
  id: string;
  agent: Agent;
  task: TaskDescriptor;
  status: SubagentStatus;
  abortController: AbortController;
  createdAt: number;
  completedAt?: number;
  resultNodeIds: string[];
  currentStep?: string;       // 当前步骤描述（供 UI 展示）
  error?: string;
}
```

**Cleanup 策略**:
- `completed` / `failed` / `cancelled` → 30 秒后从 `subagents` Map 中移除（给 UI 时间展示最终状态）
- Agent 实例 `abort()` 后，确保所有 event listener 移除（`bus.unsubscribe`）
- 已写入 Loro 的节点不删除——部分结果仍有价值

**对比框架**: OpenAI Agents SDK 的 `RunHooks` 提供 `on_agent_start` / `on_agent_end`，但缺少 `waiting-clarification` 状态。LangGraph 的 checkpointer 更复杂但可恢复。soma 不需要跨会话恢复（Sidepanel-Only 模型），所以轻量状态机足够。

---

### 2.6 并发控制

**问题**: 多个 sub-agent 并发时，API rate limit、数据冲突、UI 更新如何处理？

#### API Rate Limit

| 策略 | 实现 | 适用 |
|------|------|------|
| **共享令牌桶** | 全局 rate limiter | ✅ 推荐 |
| **每 agent 独立** | 各自管理 | ❌ 总量可能超限 |
| **队列调度** | 串行化 LLM 调用 | ⚠️ 太保守 |

**推荐**: 全局 rate limiter 在 `streamFn` 层实现——所有 agent（主 + sub）共享同一个 `streamProxyWithApiKey` 函数，在 proxy 层做 rate limiting。

```typescript
// 所有 agent 共享同一个 streamFn
const sharedStreamFn: StreamFn = async (model, context, options) => {
  await rateLimiter.acquire(); // 全局令牌桶
  return streamProxyWithApiKey(model, context, {
    ...options,
    authToken,
    proxyUrl,
  });
};
```

#### 数据冲突

**Loro CRDT 天然解决**——不同 agent 写不同节点时完全并行，写同一节点时 CRDT 自动合并。不需要应用层锁。

唯一需要注意的是**语义冲突**（不是数据冲突）：两个 subagent 给同一个节点加了不同的标签，技术上 CRDT 会保留两者，但语义上可能矛盾。解决方案：在 task delegation 时明确每个 subagent 的作用域（操作哪些节点），避免重叠。

#### UI 更新

多个 subagent 并发写入节点 → 多个 CRDT subscription 同时触发 → 多个 React re-render。

**策略**: 使用 `requestAnimationFrame` 或 `startTransition` 批量合并 UI 更新。Zustand 的 `immer` 中间件已经在做类似优化。如果出现性能问题，可以在 CRDT subscription handler 中 debounce（50ms）。

---

### 2.7 取消机制

**问题**: 用户中途取消时如何优雅终止？

**推荐: 三层取消**

```typescript
async cancel(subagentId: string): Promise<void> {
  const handle = this.subagents.get(subagentId);
  if (!handle) return;

  // 1. 信号层: AbortController — 取消所有进行中的 fetch/async 操作
  handle.abortController.abort();

  // 2. Agent 层: pi-agent-core abort() — 终止 agent loop
  handle.agent.abort();

  // 3. 协调层: 通知其他 agent
  this.bus.send({
    from: 'orchestrator',
    to: subagentId,
    type: 'task-cancelled',
    payload: { reason: 'User cancelled' },
  });

  // 4. 状态更新
  handle.status = 'cancelled';

  // 5. Cleanup (延迟，给 UI 时间展示)
  setTimeout(() => this.subagents.delete(subagentId), 30_000);
}
```

**已写入的部分结果保留**——用户可能需要。如果用户想清理，可以手动删除或通过主 agent 指令删除。

**对比**: Claude Code 的 `abort()` 会立即终止，但 worktree 中的文件变更保留。soma 的模式一致——abort 终止执行，已写入 Loro 的节点保留。

**借鉴 Vercel AI SDK 的 `onAbort({ steps })` 模式**: 在 `TaskDescriptor` 中添加可选的 `onCancel` 回调，让任务定义者有机会做取消后清理——

```typescript
interface TaskDescriptor {
  // ... existing fields
  onCancel?: (context: {
    createdNodeIds: string[];  // subagent 取消前已创建的节点
    lastStep: string;          // 最后在做什么
  }) => Promise<void>;
}
```

---

### 2.8 错误恢复

**问题**: sub-agent 失败时，已写入的部分结果如何处理？

| 策略 | 实现 | 适用场景 |
|------|------|---------|
| **保留部分结果** | 默认 | 大多数场景 |
| **回滚全部** | Loro undo | 需要原子性时 |
| **标记为 incomplete** | 状态字段 | 需要区分完成/未完成时 |

**推荐: 保留 + 标记**

```typescript
// subagent 失败时:
handle.status = 'failed';
handle.error = error.message;

// 标记任务节点为失败
withCommitOrigin('ai:subagent', () => {
  loroDoc.setNodeDataBatch(taskNodeId, {
    // #task 节点的 status 字段设为 'failed'
  });
  commitDoc();
});

// 通知主 agent
bus.send({
  from: subagentId,
  to: 'main',
  type: 'task-failed',
  payload: {
    error: error.message,
    partialResultNodeIds: handle.resultNodeIds,
  },
});
```

主 agent 收到失败通知后在 Chat 中报告："提取定价信息失败（API 限速），已完成 2/5 个页面。已提取的结果在 <ref>定价对比</ref> 节点中。是否重试剩余部分？"

**为什么不默认回滚**: 部分结果通常仍有价值（提取了 2/5 个页面）。回滚 = 浪费已做的工作。如果用户不想要部分结果，可以手动删除或让主 agent 清理。

**重试策略**: 失败后主 agent 可以创建新 subagent 重试——传入 `partialResultNodeIds` 让新 subagent 知道哪些已完成，只处理剩余部分。这比 LangGraph 的 checkpointer 恢复更轻量，也更符合"一切皆节点"原则。

---

## 3. soma 推荐方案

> **设计原则：从用户场景出发，不从实现概念出发。**
> 用户不关心"subagent"——他们只需要 AI 帮忙做事。
> 系统应该清晰、简单、优雅，而非面面俱到。

### 3.1 用户真实场景

| 场景 | 工具调用量 | 耗时 | 用户期望 |
|------|-----------|------|---------|
| "比较这两篇文章的核心论点" | 多（读取多个节点 + 分析） | 20-60s | Chat 中看到分析结论 |
| "帮我把所有 #article 加上 Author 字段" | 多（搜索 + 批量编辑） | 1-3min | 节点被更新，不需要阻塞聊天 |
| "从 5 个页面提取定价信息" | 很多（5x 浏览器 + 创建节点） | 2-5min | 后台执行，结果出现在 outliner |
| "翻译这段话" | 少（1 次编辑） | 5-10s | 直接看到结果 |
| "总结今天的笔记" | 中（读取 + 分析） | 15-30s | Chat 中返回摘要 |

**观察**：
1. "翻译这段话"不需要 subagent——主 agent 直接做，tool call 少，不污染 context
2. 其余场景受益于 subagent，但理由不同：有的是**context isolation**（工具调用多），有的是**非阻塞**（耗时长），有的两者都需要
3. 用户**从头到尾都在跟主 agent 对话**——subagent 应该完全透明
4. 结果应该**回到对话流中**，不要散布到 5 个地方

### 3.2 核心设计：Subagent = `delegate` Tool

**一句话**：Subagent 不是一套框架，而是主 agent 的一个工具——`delegate`。

就像 Claude Code 的 `Agent` tool：主 agent 决定什么时候用，用完拿结果。用户只看到主 agent 的回答，不知道背后发生了 delegation。

```typescript
// src/lib/ai-tools/delegate-tool.ts — 这是整个 subagent 系统的全部

const delegateTool: AgentTool = {
  name: 'delegate',
  label: 'Delegate Task',
  description: `在隔离的 context 中执行任务。拥有与你相同的完整工具集（node 操作、浏览器、搜索等）。用于：
    - 工具调用较多，避免污染当前对话上下文
    - 任务可以独立执行，不需要逐步与用户交互
    返回文本摘要。完整执行过程自动保存，用户可回溯。`,
  parameters: Type.Object({
    task: Type.String({ description: '完整的任务描述' }),
    background: Type.Optional(Type.Boolean({
      description: '后台执行（用于耗时 >30s 的任务），默认 false'
    })),
  }),
  execute: async (toolCallId, params, signal) => {
    // 1. 创建独立 Agent 实例（已有基础设施）
    const agent = createAgent(model);
    const session = createSession();
    saveChatSession(session);  // 持久化到 IndexedDB

    // 2. 配置（复用已有函数）
    agent.setTools(getAITools());  // 与主 agent 相同的完整工具集，隔离的 context
    agent.setSystemPrompt(buildDelegatePrompt(params.task));

    // 3a. 同步执行（短任务）
    if (!params.background) {
      await agent.prompt(params.task);
      return {
        content: [{ type: 'text', text: extractSummary(agent) }],
        details: { sessionId: session.id },
      };
    }

    // 3b. 异步执行（长任务）——立即返回，完成后通过 followUp 通知
    runInBackground(agent, session, params.task, signal);
    return {
      content: [{ type: 'text', text: `任务已在后台启动。` }],
      details: { sessionId: session.id, background: true },
    };
  },
};
```

### 3.3 两种执行模式，同一个机制

#### 同步模式（短任务，context isolation）

```
用户: "比较这两篇文章的核心论点"

主 Agent 内部:
  → 判断：需要读取多个节点 + 深度分析，tool calls 多 → 用 delegate
  → 调用 delegate tool（background: false）
  → delegate 内部：独立 Agent 执行 5-6 个 tool calls → 返回摘要

Chat 中用户看到:
  AI: "这两篇文章有三个关键差异：..."
       [delegate tool call — 折叠，可展开查看详情]
```

用户视角：跟直接提问没有区别。唯一的痕迹是 tool call 块可以展开看细节。

#### 异步模式（长任务，非阻塞）

```
用户: "从这 5 个页面提取定价信息"

主 Agent 内部:
  → 判断：需要访问 5 个页面，耗时长 → 用 delegate（background: true）
  → delegate tool 立即返回 "任务已在后台启动"
  → 主 agent 回复用户

Chat 中用户看到:
  AI: "好的，我在后台提取定价信息。你可以继续聊天。"

[用户继续聊天...]

[...2 分钟后，subagent 完成，通过 followUp() 通知主 agent...]

Chat 中用户看到:
  AI: "定价提取完成，创建了 8 个节点。[查看结果]¹ [执行过程]²"
                                        ↑ node cite   ↑ chat cite
```

### 3.4 回溯：复用现有 Citation 系统

每个 delegate 调用自动创建独立 session（IndexedDB）。回溯链路全部复用已有基础设施：

**入口 1 — Tool call 展开**：Chat 中的 delegate tool call 块，展开可看到摘要 + "查看完整过程" 链接

**入口 2 — Citation badge**：主 agent 报告完成时用 `<cite type="chat" id="sessionId">执行过程</cite>`，hover 预览，点击打开 subagent session

**入口 3 — 用户主动询问**：`"刚才那个任务是怎么做的？"` → 主 agent 知道 sessionId，引用给用户

**Session 隔离**：`ChatSessionMeta` 加 `type?: 'chat' | 'delegate'`。Chat history 列表过滤 `type !== 'delegate'`，不被污染。

### 3.5 Clarification 简化

~~复杂方案~~：subagent 暂停 → 发消息给主 agent → 主 agent 路由到 Chat → 用户回答 → 消息返回 → subagent 恢复。需要 pause/resume 协议、消息总线、状态机。

**简单方案：做能做的，带着问题返回。**

```
Subagent 执行提取任务 → 遇到歧义 → 不暂停，做出最佳判断并继续
→ 返回结果 + 说明："我用了 Developer 价格表。如果你要 Enterprise 的，告诉我。"

用户: "用 Enterprise 的"

主 Agent: → 再次调用 delegate，带上修正指令
```

这跟人类协作方式一致——助手不会因为一个细节暂停整个任务等你回复，而是做出合理判断，完成后汇报。如果需要修正，再来一轮。

**更自然、更鲁棒、不需要任何新协议。**

### 3.6 取消

```
用户: "取消那个定价提取"
主 Agent: → 找到对应的后台 delegate → agent.abort()
AI: "已取消。已提取的部分结果保留在 [定价对比] 节点中。"
```

不需要三层取消机制——`agent.abort()` 终止 agent loop，`AbortSignal` 取消进行中的 fetch。两行代码。

### 3.7 完整架构

```
新增代码:
  src/lib/ai-tools/delegate-tool.ts    (~100-150 行)

复用已有基础设施:
  Agent class          — pi-agent-core（创建独立实例）
  createSession()      — ai-chat-tree.ts（创建 session）
  saveChatSession()    — ai-persistence.ts（IndexedDB 持久化）
  getAITools()         — ai-tools/index.ts（node tools）
  followUp()           — pi-agent-core（异步完成通知）
  agent.abort()        — pi-agent-core（取消）
  CitationBadge        — chat/CitationBadge.tsx（回溯入口）
  ChatCitePopover      — chat/ChatCitePopover.tsx（session 预览）
  switchToChatSession  — chat-panel-actions.ts（打开 session）
  ToolCallBlock        — chat/ToolCallBlock.tsx（tool call 展示）
  Loro CRDT            — loro-doc.ts（数据共享）
  streamProxyWithApiKey — ai-proxy.ts（LLM 代理）

不需要:
  ❌ AgentOrchestrator class
  ❌ AgentMessageBus (EventTarget)
  ❌ SubagentHandle / 6 种状态
  ❌ #task 节点（作为基础设施）
  ❌ TaskIndicator badge
  ❌ TaskList UI
  ❌ Clarification protocol (pause/resume)
  ❌ Inter-agent collaboration
  ❌ AG-UI event taxonomy
  ❌ 三层取消机制
  ❌ Rate limiting infrastructure
  ❌ 两种显式模式分类
```

### 3.8 为什么这比之前的方案更好

| | 之前的方案 | 新方案 |
|--|--|--|
| **核心抽象** | AgentOrchestrator + MessageBus + SubagentHandle | `delegate` tool（一个文件） |
| **新增代码** | ~500-600 行 + 3 个新 UI 组件 | ~100-150 行，零新 UI 组件 |
| **用户感知** | badge、task list、#task 节点、subagent session — 5 个地方 | Chat 对话流中自然出现，tool call 可展开 |
| **Clarification** | pause/resume 协议 + 消息路由 | 做完带着问题返回，下一轮修正 |
| **取消** | 三层（AbortController + abort() + bus notification） | `agent.abort()` |
| **扩展性** | 每个新场景需要适配 orchestrator | 每个新场景 = delegate tool 的一次调用 |
| **鲁棒性** | 状态机 6 种状态 + 消息路由 + 生命周期管理 | tool call 只有 running/done/error |

### 3.9 未来扩展

当 `delegate` tool 被证明可靠后，自然的扩展方向：

1. **并发后台任务**：主 agent 多次调用 delegate（background: true），每个独立运行。不需要 orchestrator——就是多个 tool call。用户问"有什么在跑？"→ 主 agent 查看 pending tool calls 即可回答。

2. **专业化 subagent**：通过 `#skill` 节点定制 subagent 的 system prompt 和工具集。在 delegate tool 参数中加 `skills: string[]`。

3. **系统级后台任务**：Schema evolution、Taste 学习等可以作为系统触发的 delegate 调用，不经过 Chat。

4. **如果真的需要 Task UI**：当并发后台任务成为高频场景时，再加 badge + task list。但现在不需要——过早加 UI 是过度工程化。

---

## 附录: 产品调研速查表

| 产品 | 多 Agent | 后台执行 | 中途干预 | 结果持久化 | 进度展示 | 对 soma 最大启发 |
|------|---------|---------|---------|-----------|---------|-----------------|
| Claude Code | ✅ 两层 | ✅ background | ❌ | 文件/文本 | ❌ | 两层分离 + 权限收紧 |
| Cursor | ❌ | ✅ | ❌ | 文件 (git) | 基本 | 独立分支 = 独立节点子树 |
| Devin | ❌ 单 agent | ✅ | ❌ | PR | 详细实时 | 三阶段循环 + 步骤展示 |
| Copilot WS | ❌ 单 agent | ⚠️ 阻塞 | ✅ 每阶段 | PR | 阶段间 | 先计划再执行 |
| ChatGPT DR | ❌ 单 agent | ✅ | ❌ | 对话消息 | 好 | 步骤描述更新 |
| Gemini DR | ❌ 单 agent | ✅ | ✅ 计划 | Docs | 好 | 先计划再执行 |
| Perplexity | ❌ 并行工具 | ❌ | ❌ | 对话消息 | 好 | 并行搜索模式 |
| OpenAI SDK | ✅ handoff | ❌ 同步 | ❌ | N/A | hooks | Guardrails + Hooks |
| LangGraph | ✅ graph | ✅ parallel | ❌ | checkpointer | N/A | Scatter-gather + 检查点 |
| CrewAI | ✅ roles | ❌ 同步 | ❌ | N/A | N/A | Hierarchical delegation |
| AutoGen | ✅ 对话 | ❌ | ❌ | N/A | N/A | Event-driven 消息路由 |
| Mastra | ✅ workflow | ✅ suspend | ✅ resume | N/A | N/A | Suspend/resume |
| Notion AI | ❌ 单 agent | ❌ | ❌ | Block 模型 | streaming | AI 输出 = block |
| Mem.ai | ❌ 单 agent | ✅ 静默 | ❌ | 笔记附加 | 无 | 静默后台处理 |
| Tana AI | ❌ 单 agent | ❌ | ❌ | 子节点 | loading | AI command = #skill |

---

## 总结

### 核心结论

1. **Subagent 的价值是 context isolation + 非阻塞**，不是"多 agent 编排"。大多数日常 AI 请求不需要 subagent；真正受益的是工具调用多（污染 context）或耗时长（阻塞 Chat）的场景。

2. **Subagent = 一个 tool，不是一套框架。** Claude Code 的 Agent tool 是最佳参考——主 agent 的一个工具，执行在隔离 context 中，结果回传到对话流。~100 行代码，零新 UI 组件，全部复用已有基础设施。

3. **用户不应该感知"subagent"的存在。** 用户始终在跟主 agent 对话。结果在 Chat 流中自然出现。过程可通过 tool call 展开或 cite 链接回溯。不需要 badge、task list、#task 节点等专门 UI。

4. **Clarification 不需要 pause/resume 协议。** Subagent 做出最佳判断，完成后带着问题返回。用户给反馈后再来一轮。这更自然、更鲁棒、不需要任何新协议。

5. **Session 持久化提供完整可回溯性。** 每个 delegate 调用自动创建 IndexedDB session。通过现有 `CitationBadge` + `ChatCitePopover` + `switchToChatSession` 访问——零新 UI 代码。

6. **先做最小可用版本，按需扩展。** 并发任务 UI、专业化 subagent、系统级后台任务——都是 `delegate` tool 被验证后的自然扩展，不需要预先设计。

### 设计演进

| 版本 | 核心抽象 | 复杂度 |
|------|---------|--------|
| v1（phase-4-orchestration.md） | AgentOrchestrator + MessageBus + SubagentHandle + TaskUI | ~500-600 行 + 3 新 UI 组件 |
| v2（本文前几版） | 两种模式 + 独立 session + Citation 引用 | ~300-400 行 + type 字段 |
| **v3（最终方案）** | **`delegate` tool** | **~100-150 行，零新 UI** |

每次简化都砍掉了"可能需要但现在不需要"的东西。留下的是真正解决用户问题的最小集合。

### 下一步

实现 `src/lib/ai-tools/delegate-tool.ts`（~100-150 行），加入主 agent 工具集。

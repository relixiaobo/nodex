# AI 基础设施与新兴标准：对 soma 的参考价值

> 研究日期: 2026-03-09
> 覆盖: MCP、A2A、Skills/Subagents、OpenClaw、Chrome Built-in AI、Agent SDK、AGENTS.md

---

## 一、全景：协议栈正在分层定型

```
┌─────────────────────────────────────────────────────┐
│                  应用层 (Application)                 │
│   Notion Agents · Tana Command Nodes · soma Skills   │
├─────────────────────────────────────────────────────┤
│               编排层 (Orchestration)                  │
│   LangGraph · CrewAI · Anthropic Agent SDK           │
│   OpenAI Agents SDK · Vercel AI SDK                  │
├─────────────────────────────────────────────────────┤
│             Agent 间通信 (Agent ↔ Agent)              │
│   A2A (Google) · ACP (IBM) · ANP (社区)              │
├─────────────────────────────────────────────────────┤
│             Agent→工具 (Agent → Tools)               │
│   MCP ← 事实标准 (97M+月下载, AAIF 治理)             │
├─────────────────────────────────────────────────────┤
│              本地推理 (On-Device AI)                  │
│   Chrome Built-in AI · WebLLM/WebGPU · Gemini Nano  │
└─────────────────────────────────────────────────────┘
```

**关键判断**：MCP 已定型为标准，A2A 在成长期，其余仍在实验期。soma 需要关注的不是所有层，而是与自身定位最相关的几个切面。

---

## 二、逐项分析与 soma 参考价值

### 1. MCP — 必须做

**现状**：MCP 是 AI→工具连接的事实标准。97M+ 月 SDK 下载量，10,000+ 公开 server，OpenAI/Google/Microsoft/Anthropic 全部采纳，Linux Foundation AAIF 治理。

**竞品已全部接入**：

| 产品 | MCP 实现 | 暴露的能力 |
|------|---------|-----------|
| Tana | 官方，Local API + MCP | 节点 CRUD、字段管理、schema 操作 |
| Notion | 官方，Hosted MCP | 页面/数据库搜索、读写、更新 |
| Obsidian | 社区，24+ servers | 笔记读写、标签管理、链接遍历 |
| Heptabase | 社区 | 白板/卡片搜索、导出、写回 |
| Anytype | 官方 | 空间/对象查询、创建、全局搜索 |

**对 soma 的价值**：

> **soma 的知识图谱如果不能被外部 AI 访问，就只是一个孤岛。MCP 让它成为用户 AI 工作流的活跃节点。**

场景示例：
- 开发者在 Claude Code / Cursor 中写代码 → 查询 soma 笔记中关于这个 API 的记录
- 用户让 ChatGPT 帮忙总结本周工作 → ChatGPT 通过 MCP 读取 soma 的日记和任务节点
- 用户用 Readwise MCP 导入高亮 → soma MCP 创建对应节点并打标签

**建议暴露的 MCP Tools**：

| Tool | 描述 |
|------|------|
| `search_nodes(query, filters?)` | 全文 + 结构化搜索 |
| `get_node(id)` | 节点 + children + meta + tags |
| `create_node(parent, name, tags?, fields?)` | 带 supertag 结构创建 |
| `update_node(id, name?, tags?, fields?)` | 修改节点 |
| `get_children(id)` | 子节点列表 |
| `list_tags()` | 发现 schema |
| `get_nodes_by_tag(tag_id)` | 按标签查询 |

**实现路径**：
1. **Phase 1**：Cloudflare Worker 暴露 MCP（Streamable HTTP），数据来自已同步的 D1/R2。soma 后端已在 Cloudflare，天然契合。加 OAuth 2.1 鉴权
2. **Phase 2**：本地 Native Messaging Host（Node.js 小进程），走 stdio transport，可离线访问本地 Loro 数据
3. **Phase 3**：观察 WebMCP 标准（Chrome Canary 预览中），如果成熟可直接从扩展暴露

**优先级：高。竞品已全部接入，soma 不做就是差异化劣势。**

---

### 2. Skills / Command Nodes — 核心 AI 架构

**行业共识**：Skill 是介于"原始 prompt"和"自主 Agent"之间的正确抽象层。

| | Prompt | Skill | Agent |
|---|---|---|---|
| 结构 | 自由文本 | 打包的：指令 + 工具 + 上下文 + 校验 | 自主决策 + 工具调用 + 记忆 |
| 可组合 | 复制粘贴 | 版本化、可链、可测试 | 动态分解任务 |
| 可靠性 | 低（每次结果不同） | 中高（结构化 I/O） | 低（不可预测） |
| 适用场景 | 一次性提问 | 重复性结构化操作 | 开放性探索 |

**Tana Command Nodes 是金标准**：

```
CommandNode（节点）
  ├── Step 1: set-field(Author, AI提取)
  ├── Step 2: add-tag(#article)
  ├── Step 3: ai-prompt("总结要点", context=当前节点)
  └── Step 4: create-node(parent=当前节点, content=AI输出)
```

- 命令就是节点，参数是 Tuple，上下文是节点引用
- 触发方式：Cmd+K / supertag 按钮 / 节点事件
- 可组合：一个命令可以调用另一个命令

**对 soma 的价值**：

> soma 共享 Tana 的数据模型，Command Nodes 架构**天然适配**。Skill = 节点，步骤 = 子节点，参数 = Tuple。不需要独立配置系统。

**与现有设计守则完美一致**：
- 守则 #6："AI Command = Command Node — prompt/参数/输出全部是节点"
- `SYS_A.AI_INSTRUCTIONS`（SYS_A160）已预留
- `SYS_A.AI_PAYLOAD`（SYS_A176）已预留

**实施路径**：

```
Phase 1: AI Chat（单步 AI 调用）
  → 用户选节点 → Cmd+K → "Ask AI" → 输出插入为子节点
  → 基础设施：AI Gateway + BYOK

Phase 2: 持久化 Command Nodes
  → 命令节点数据模型（doc_type='command'）
  → 顺序执行引擎（遍历 children，按类型分发）
  → 内建系统命令：set-field / add-tag / remove-tag / create-node / ai-prompt

Phase 3: Supertag 集成
  → 命令绑定到 supertag → 标签实例上显示操作按钮
  → 模板继承：子标签继承父标签的命令

Phase 4: 事件触发 + 组合
  → 节点创建/打标签/字段变更 → 自动触发命令
  → 命令调用命令（组合）
  → API 请求命令（外部集成）
```

**Anthropic 的核心建议**：先做 Workflow（预定义流水线），再做 Agent（动态自主）。大多数 PKM 场景只需要 2-5 步的顺序流水线。

**优先级：高。这是 soma AI 功能的骨架架构。**

---

### 3. Chrome Built-in AI — 免费本地层

**已可用的 API**：

| API | 状态 | Chrome 版本 | 用途 |
|-----|------|------------|------|
| **Summarizer** | 稳定 | 138+ | 网页/文本摘要 |
| **Language Detector** | 稳定 | — | 语言检测 |
| **Translator** | 稳定 | — | 翻译 |
| **Prompt API** | 扩展 Origin Trial | — | 通用本地推理 |
| **Writer** | Origin Trial | 137-148 | 写作辅助 |
| **Rewriter** | Origin Trial | 137-148 | 改写 |

**硬件要求**（限制）：22GB 磁盘、>4GB VRAM、16GB RAM、4+ CPU 核心。不支持 Android/iOS。

**对 soma 的价值**：

> 作为"免费本地 AI 层"，在用户不配置 API key 的情况下提供基础 AI 能力。

**适用场景**：
- 剪藏时自动生成摘要（Summarizer API，免费，离线）
- 检测语言并自动翻译（Language Detector + Translator）
- 节点内容改写/润色（Writer/Rewriter，Origin Trial）
- 简单分类和标签建议（Prompt API，Gemini Nano）

**不适用**：
- 复杂多步推理（模型能力有限）
- 需要访问大量笔记上下文的问答（上下文窗口小）
- 需要跨平台一致性的功能（硬件限制排除大量用户）

**策略**：Feature-detect，有则用，无则 fallback 到云端 AI。不能作为核心依赖。

**优先级：中。作为 AI Gateway 的本地加速层，而非独立方向。**

---

### 4. A2A — 暂时不做，保持关注

**现状**：Google 2025 年 4 月发布，Linux Foundation 治理，v0.3，150+ 支持组织。

**与 MCP 的关系**：

```
MCP = Agent → 工具（垂直：给 Agent 接工具）
A2A = Agent → Agent（水平：Agent 之间协作）
```

互补，不竞争。生产系统两者都用：MCP 接入工具，A2A 协调 Agent。

**对 soma 的价值**：

A2A 的场景是多 Agent 协作——让 soma 作为一个"知识 Agent"被其他 Agent 查询。例如：
- 研究 Agent 需要检查"用户已经知道什么" → 发现 soma 的 Agent Card → 发送 A2A Task
- 编码 Agent 想保存架构决策 → 委派"捕获知识"任务给 soma

**为什么暂时不做**：
- soma 当前是单用户工具，不是多 Agent 系统
- A2A 要求 soma 有自己的推理层（不只是服务数据，而是理解请求）
- MCP 已能覆盖"被外部 AI 读写"的核心需求
- A2A 生态仍以企业场景为主，消费级应用较少

**优先级：低。MCP 覆盖了 80% 的需求。A2A 等 soma 有了 AI 推理层（Phase 2+）后再考虑。**

---

### 5. OpenClaw — 不相关，但有启示

**是什么**：不是协议或标准，是一个开源自主 AI Agent（247K GitHub stars）。用户通过消息平台操作，可执行邮件、日历、浏览器、命令行等任务。

**启示**：
- 消费级自主 Agent 已经有了巨大需求（300K-400K 用户）
- 但安全性堪忧（512 个漏洞，有"失控"事件）
- Agent 能力越强，治理越重要

**对 soma 的价值**：验证了"个人 AI Agent"市场的存在，但 soma 不应该做通用自主 Agent。soma 的 Agent 能力应限定在知识图谱操作范围内，安全可控。

**优先级：不做。**

---

### 6. Vercel AI SDK — 推荐的 AI 集成方案

**为什么是它**：
- TypeScript/React 原生（与 soma 技术栈完美匹配）
- 25+ provider 支持（零锁定：OpenAI、Anthropic、Google、DeepSeek…）
- 19.5KB per provider（适合扩展的包大小约束）
- Streaming-native（适合 AI Chat UI）
- 工具调用、结构化输出、多模态全支持

**对 soma 的价值**：如果 soma 的 AI Gateway 走 Cloudflare Workers 路线，Vercel AI SDK 是最佳选择——provider 无关、bundle 小、流式支持好。

**替代方案对比**：

| 方案 | 优势 | 劣势 |
|------|------|------|
| Vercel AI SDK | 最佳 TS/React 集成，多 provider | 相对较新 |
| 直接调用 provider API | 最简单 | provider 锁定，自己处理流式 |
| LangChain.js | 编排能力强 | Bundle 大，过度抽象 |

**优先级：中高。Phase 1 AI Gateway 实现时采用。**

---

### 7. AGENTS.md — 小动作，可顺手做

**是什么**：开源标准（AAIF 治理），在项目根目录放一个 AGENTS.md 文件，指导 AI 编码 Agent 如何与项目交互。20,000+ GitHub 仓库已采用。Cursor、Windsurf、Kilo Code、OpenAI Codex 支持。

**对 soma 的价值**：soma 已有 CLAUDE.md。如果 AGENTS.md 标准进一步普及，可以从 CLAUDE.md 提取关键部分生成 AGENTS.md，扩大 AI Agent 兼容性。

**优先级：低。顺手可做，不紧急。**

---

## 三、综合：soma AI 基础设施路线图

```
现在                6 个月后              12 个月后
 │                    │                    │
 ▼                    ▼                    ▼

Phase 1              Phase 2              Phase 3
AI Gateway           结构化 AI             发现与开放
─────────           ─────────            ─────────
• BYOK 配置          • Command Nodes      • 上下文感知浮现 v2
  (Vercel AI SDK)      数据模型+执行引擎     (语义匹配)
• AI Chat            • AI 字段自动填充     • MCP Server
  (网页+笔记上下文)    (剪藏时+手动触发)      (Cloudflare Worker)
• Chrome Built-in    • Supertag 按钮      • A2A Agent Card
  AI 作为本地加速层     触发 AI 命令          (如果需要)
• 基础 prompt 操作   • 自定义 prompt 模板
  (摘要/翻译/解释)
```

### 优先级排序（按投资回报率）

| 排名 | 方向 | 投入 | 回报 | 理由 |
|------|------|------|------|------|
| 1 | **AI Gateway + BYOK** | 中 | 极高 | AI 所有功能的基础；BYOK 填补品类空白 |
| 2 | **AI Chat（带上下文）** | 中 | 高 | 用户可感知的第一个 AI 功能；利用独有位置 |
| 3 | **Chrome Built-in AI** | 低 | 中 | 免费基础 AI，提升无 API key 用户体验 |
| 4 | **Command Nodes** | 高 | 极高 | AI 功能的骨架；与数据模型深度契合 |
| 5 | **MCP Server** | 中 | 高 | 竞品全部已做；让 soma 成为 AI 工作流节点 |
| 6 | **AI 字段自动填充** | 中 | 高 | 利用 supertag/field 结构化优势 |
| 7 | **A2A** | 高 | 不确定 | 生态未成熟，等 Phase 2+ 再评估 |

---

## 四、不应该做的事（明确排除）

1. **不做自己的 Agent 协议** — MCP/A2A 已有标准，不要造轮子
2. **不做通用自主 Agent** — OpenClaw 式的"什么都能做"不是 soma 的定位，安全风险高
3. **不依赖 Chrome Built-in AI 作为核心** — 硬件限制排除大量用户，只能做可选加速层
4. **不做 Skills 市场** — GPT Store 的教训：发现难、质量差、变现难。用"官方工作区预置命令模板"替代
5. **不做复杂多 Agent 编排** — PKM 场景 90% 只需 2-5 步顺序流水线，DAG/Swarm 是过度工程
6. **不急着做 AGENTS.md** — CLAUDE.md 已足够，等标准更成熟再考虑

---

## 附：调研来源索引

- MCP 协议生态: Model Context Protocol specification, PulseMCP directory, Tana/Notion/Obsidian/Anytype MCP 实现
- A2A 与 Agent 互操作: A2A specification, AAIF/Linux Foundation, Microsoft/Google/IBM 实现
- Skills/Subagents: Claude Skills, Tana Command Nodes, Notion Custom Agents, Anthropic "Building Effective Agents", OpenAI Agents SDK, CrewAI, LangGraph
- OpenClaw 与新兴标准: OpenClaw wiki, Chrome Built-in AI APIs, Vercel AI SDK 6, AGENTS.md, NIST AI Agent Standards, WebMCP

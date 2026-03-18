# AI Features Architecture

> soma 所有 AI 功能的统一架构设计。
> 日期: 2026-03-18

---

## 1. 设计原则

**AI 不替你思考，而是把你自己的思考照亮。**

所有 AI 功能共享三个约束：

1. **结果是节点**：AI 的产出写入 LoroDoc（节点、字段、queryCondition），用户可以看到、编辑、删除
2. **配置是节点**：AI 的行为由 `#agent` 节点配置（system prompt = 子节点，模型/温度 = 字段），用户可以在大纲中编辑
3. **调用走 proxy**：所有 LLM 调用通过 `streamProxyWithApiKey` → Worker proxy → 各 provider，统一 auth + 计费

---

## 2. 功能一览

| 功能 | 类型 | 工具集 | 对话模式 | 模型来源 | 状态 |
|------|------|--------|---------|---------|------|
| **Chat** | 完整 Agent | node_crud + search + undo + browser | 多轮持久化 | Per-session 选择 | ✅ 已实现 |
| **Spark** | 单轮 LLM | 无（纯文本输入输出） | 单轮 | #agent 节点 `Spark` | ✅ 已实现 |
| **Chat Title** | 单轮 LLM | 无 | 单轮 fire-and-forget | 跟随 Chat session 模型 | ✅ 已实现 |
| **Search Agent** | 轻量 Agent | generate_search_conditions | 1-2 轮（含 error retry） | #agent 节点 `Search` | 📋 计划中 |
| **Image Description** | 单轮 LLM | 无（vision 输入，文本输出） | 单轮 fire-and-forget | Settings 默认模型 | 📋 计划中 |

---

## 3. 两种 AI 调用模式

### 模式 A：完整 Agent（pi-agent-core）

用于需要**多轮对话 + 工具调用 + error retry** 的场景。

```
用户输入
  → Agent.prompt() / Agent.continue()
  → LLM → tool_use → 执行工具 → tool_result → LLM → ...
  → 直到 stop_reason = "stop"
```

- 实例：Chat Agent, Search Agent
- 基础设施：`pi-agent-core` Agent 类 + `streamFn` + tool 定义
- 特点：有状态（消息历史）、可 abort、支持 steering

### 模式 B：单轮 LLM 调用

用于**输入确定、输出确定、不需要工具**的场景。

```
system prompt + user message
  → streamProxyWithApiKey()
  → 收集 text_delta → 返回完整文本
```

- 实例：Spark、Chat Title、Image Description
- 基础设施：直接调 `streamProxyWithApiKey`（参考 `callSparkLLM` 模式）
- 特点：无状态、fire-and-forget、可并行

### 何时用 Tool 做结构化输出

当需要结构化 JSON 而非自由文本时，用**工具定义**强制输出格式：

```typescript
// 定义工具 schema（TypeBox）
const tool: Tool = {
  name: 'generate_result',
  description: '...',
  parameters: Type.Object({ ... }),
};

// 传入 tools 数组，模型返回 toolCall
const stream = streamProxyWithApiKey(model, {
  systemPrompt: '...',
  messages: [...],
  tools: [tool],
}, options);
```

pi-ai 不支持 `response_format: json_schema`，工具定义是获取结构化输出的标准方式。好处：TypeBox schema 验证 + 所有主流模型都支持 tool_use + error 可回传让模型自动修正。

---

## 4. 模型配置层级

```
Per-session 选择（Chat only）
  ↓ fallback
#agent 节点配置（Spark, Search 等）
  ↓ fallback
Settings 默认 AI 模型（全局 fallback）
  ↓ fallback
已配置 Provider 中的第一个推荐模型
```

### 4.1 Settings 默认 AI 模型

`NDX_F.SETTING_DEFAULT_AI_MODEL` — Settings 页面的模型选择器，为所有未明确配置模型的 AI 功能提供 fallback。

- 适用于：Image Description、未来的轻量 AI 功能
- 不适用于：Chat（有 per-session 选择器）、Spark/Search（有 #agent 节点）

### 4.2 #agent 节点配置

每个独立 AI 功能对应一个 `#agent` 节点（在 Schema 下自动创建）：

```
Schema
  ├── #agent: Chat          ← Chat Agent 的 system prompt + 模型配置
  ├── #agent: Spark         ← Spark 提取的 prompt + 模型/温度
  └── #agent: Search        ← Search 条件生成的 prompt + 模型（待建）
```

`#agent` 节点的字段：
- `NDX_F.AGENT_MODEL` — 模型选择
- `NDX_F.AGENT_TEMPERATURE` — 温度
- `NDX_F.AGENT_MAX_TOKENS` — 最大 token
- `NDX_F.AGENT_SKILLS` — 技能列表（仅 Chat）
- 子节点 = system prompt 行

### 4.3 Per-session 模型选择（仅 Chat）

Chat 输入框的模型选择器覆盖 #agent 配置，存储在 `ChatSession.selectedModelId`。适用于用户想在单次对话中切换模型的场景。

---

## 5. 各功能详细设计

### 5.1 Chat Agent

**已实现。** 详见 CLAUDE.md「AI 架构概览」。

- 工具：node_create / node_read / node_edit / node_delete / node_search / undo / browser
- 上下文：system prompt（#agent 子节点）+ dynamic context（page-context, time-context）+ 消息历史
- 持久化：IndexedDB（消息树 + debug turns）
- 压缩：Bridge Message + Handoff Memo（自动触发）

### 5.2 Spark（结构提取）

**已实现。** 详见 `src/lib/ai-spark.ts`。

- 模式 B：单轮 LLM，`callSparkLLM()`
- 输入：网页内容（page-capture cache）
- 输出：JSON `{ napkin, insights[] }` → 创建 #spark 子节点树
- 三态交互：pending → loading → complete

### 5.3 Chat Title 生成

**已实现。** 详见 `src/lib/ai-service.ts` `generateSessionTitle()`。

- 模式 B：单轮 LLM，fire-and-forget
- 输入：首条 user + assistant 消息摘要（≤500 字符）
- 输出：3-8 词标题
- 模型：跟随当前 Chat session（命中 prompt cache）

### 5.4 Search Agent

**计划中。** 详见 `search-node-design.md`（数据模型）+ TASKS.md。

- 模式 A：轻量 Agent（1-2 轮 + error retry）
- 工具：`generate_search_conditions`（TypeBox schema，返回 queryCondition 树 JSON）
- 上下文：workspace schema（所有 tagDef + fieldDef 的 name/id/type）
- UI：Search Node 内嵌可编辑自然语言描述 → Agent 生成 queryCondition → 隐藏条件节点 → 显示搜索结果
- 配置：#agent 节点 `Search`

### 5.5 Image Description 生成

**计划中。** 详见 `image-node-support.md` 决策 9。

- 模式 B：单轮 vision LLM，fire-and-forget
- 输入：图片（fetch → base64）
- 输出：文本描述 → 写入 `NDX_F.IMAGE_DESCRIPTION` fieldEntry
- 触发：图片节点创建成功后异步
- 模型：Settings 默认 AI 模型

---

## 6. 共享基础设施

| 基础设施 | 位置 | 用途 |
|----------|------|------|
| `streamProxyWithApiKey()` | `ai-proxy.ts` | 所有 LLM 调用的统一入口 |
| `getApiKeyForProvider()` | `ai-provider-config.ts` | 解析当前 provider 的 API key |
| `getStoredToken()` | `auth.ts` | 获取 auth token for Worker proxy |
| `readAgentNodeConfig()` | `ai-agent-node.ts` | 读取 #agent 节点的模型/温度/prompt 配置 |
| `buildAgentSystemPrompt()` | `ai-agent-node.ts` | 从 #agent 子节点构建 system prompt |
| `resolveModel()` | `ai-service.ts` | 模型解析链（session → agent → available → default） |
| `ensureSparkAgentNode()` | `ai-agent-node.ts` | 确保 Spark #agent 节点存在（bootstrap） |
| `validateToolArguments()` | `pi-ai` | TypeBox schema 验证工具调用参数 |

---

## 7. 待实现

- [ ] **Settings 默认 AI 模型** — `NDX_F.SETTING_DEFAULT_AI_MODEL` 字段 + `resolveModel` fallback 链集成
- [ ] **Search Agent** — #agent 节点 `Search` + `generate_search_conditions` 工具 + Search Node 内嵌 UI
- [ ] **Image Description** — 客户端 vision API 调用 + NDX_F.IMAGE_DESCRIPTION fieldDef
- [ ] **⌘K Chat 融合** — Chat 历史搜索 + AI 模式 Tab 切换（设计：`command-palette-chat-integration.md`）

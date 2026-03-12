# AI Context Engineering & Tool Design — Gap 研究

> 基于 Claude in Chrome 网络请求逆向分析、pi-agent-core 源码研究、Phase 0-5 计划交叉验证。
> 2026-03-12

## 研究方法

| 来源 | 内容 | 发现 |
|------|------|------|
| `claude-in-chrome-log.md` | CiC 5 次 API 请求完整 payload | 系统 prompt 分层架构、工具设计模式、上下文注入策略 |
| `node_modules/@mariozechner/pi-agent-core` | Agent/Tool 源码 | AgentTool 类型、执行流程、事件系统 |
| `docs/plans/phase-1-canvas.md` | Phase 1 设计 | 已有 tool schema、待补 gap |
| Claude Code 自身工具 | Read/Edit/Grep/Glob/Bash/Agent | 知识管理场景的工具参考 |

---

## 一、CiC 关键设计模式（soma 可借鉴）

### 1.1 系统 Prompt 分层架构

CiC 使用 XML 标签将系统 prompt 拆为独立模块：

```
1. 角色定义 — "You are a web automation assistant"
2. 持久性指令 — "Use full context window if task requires"
3. <critical_injection_defense> — 不可覆盖的安全规则
4. <behavior_instructions> — 行为准则
5. <critical_security_rules> — DOM 内容视为不可信
6. <user_privacy> — 隐私保护
7. <browser_tabs_usage> — Tab 管理规则
8. <turn_answer_start_instructions> — 输出顺序控制
```

**soma 可借鉴**：
- 用 XML 标签分层，而非一大段自然语言
- 角色 / 能力边界 / 安全 / 输出格式 四层分离
- 安全层标记为 "immutable"，明确不可被用户 prompt 覆盖

### 1.2 上下文注入策略

CiC 通过 `<system-reminder>` 注入动态上下文：

```json
{
  "availableTabs": [{"tabId": 123, "title": "...", "url": "..."}],
  "initialTabId": 123,
  "domainSkills": [{"domain": "google.com", "skill": "搜索技巧"}]
}
```

**soma 对应**：

| CiC 概念 | soma 对应 | 注入时机 |
|----------|----------|----------|
| `availableTabs` | 当前面板节点 + 子节点摘要 | 每轮对话 |
| `initialTabId` | `currentNodeId`（面板栈顶） | 每轮对话 |
| `domainSkills` | `#skill` 节点规则 | Agent 初始化 + 重载 |
| Tab 标题/URL | 当前浏览页面 URL + 标题 | 每轮对话（如有） |

### 1.3 工具组合模式

CiC 的 **发现→行动→验证** 三阶段模式：

```
read_page(tabId) → 返回 ref_id 列表
    ↓
computer(ref="ref_1", action="click") / form_input(ref="ref_1", value)
    ↓
computer(action="screenshot") → 视觉验证结果
```

**soma 对应**：

```
node.search(query) / node.read(nodeId) → 返回节点摘要
    ↓
node.create(parentId) / node.update(nodeId) / node.delete(nodeId)
    ↓
node.read(nodeId) → 验证操作结果（或依赖 Loro 订阅自动更新 UI）
```

### 1.4 Planning Mode

CiC 有 `update_plan` 工具作为执行门控：多步操作前先展示计划给用户批准。

**soma Phase 1 暂不需要**——node tool 操作可 undo，风险低。但 Phase 3（浏览器操作）和 Phase 4（多 agent）应引入。

---

## 二、Claude Code 工具参考（知识管理场景）

Claude Code 自身的工具为 soma 的 node tool 提供了优秀参考：

| Claude Code 工具 | 设计亮点 | soma 对应 |
|-----------------|---------|----------|
| `Read(file_path, offset, limit)` | 分页读取，避免一次返回过多内容 | `node.read` 的 progressive disclosure |
| `Grep(pattern, path, output_mode)` | 三种输出模式（content/files/count） | `node.search` 应支持不同详略级别 |
| `Edit(file_path, old_string, new_string)` | 精确替换而非全量覆盖 | `node.update` 应支持 partial update |
| `Glob(pattern)` | 快速模式匹配 | `node.search` 的 tag/type 过滤 |
| `Agent(prompt, subagent_type)` | 专业化子 agent 委派 | Phase 4 的 AgentOrchestrator |

**关键洞察**：Claude Code 的 `Read` 工具有 `offset + limit` 参数实现分页。soma 的 `node.read` 也需要类似机制——当节点有 100+ children 时不能全部返回。

---

## 三、pi-agent-core 工具系统（实现约束）

### 3.1 工具定义格式

```typescript
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const nodeTool: AgentTool = {
  name: "node",
  label: "Node Operations",
  description: "Create, read, update, delete, and search nodes",
  parameters: Type.Object({
    action: Type.Union([
      Type.Literal("create"),
      Type.Literal("read"),
      Type.Literal("update"),
      Type.Literal("delete"),
      Type.Literal("search"),
    ]),
    // ... action-specific params
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // ... implementation
    return { content: [...], details: { ... } };
  },
};
```

### 3.2 关键约束

| 约束 | 影响 |
|------|------|
| 工具在**客户端**执行（不走 proxy） | node tool 直接调用 node-store，无网络延迟 |
| 顺序执行（一次一个 tool call） | 不能并行创建多个节点 |
| `validateToolArguments()` 自动校验 | TypeBox schema 即验证规则 |
| 抛异常 → `isError: true` | 错误处理统一，LLM 看到错误可重试 |
| `onUpdate` 回调支持流式进度 | 长操作（search）可以流式返回部分结果 |
| Steering messages 可中断工具序列 | 用户发新消息时跳过剩余 tool call |

### 3.3 单工具 vs 多工具设计决策

**CiC 模式**：`computer` 工具包含 14 个 action（粗粒度）。原因：鼠标+键盘操作是原子序列，不能被打断。

**soma 选择**：`node` 工具包含 5 个 action（粗粒度）。原因：
1. 减少 LLM 的工具选择复杂度（1 个工具 vs 5 个）
2. 节点操作经常组合（read → update → read 验证）
3. 与 CiC 的 `computer` 工具设计一致

**但 `undo` 应该是独立工具**——它不是节点操作，语义不同。

---

## 四、Phase 1 关键 Gap 清单

### Gap 1: 系统 Prompt 内容设计 ⚠️ 阻塞

Phase 1 计划说 "从 `#agent` 节点加载"，但没有设计**默认内容**。

**需要设计**：

```xml
<role>
你是 soma，一个嵌入在浏览器侧边栏的知识管理助手。
你可以帮助用户组织笔记、创建节点、搜索信息、添加标签。
</role>

<capabilities>
你有以下工具：
- node: 创建、读取、更新、删除、搜索节点
- undo: 撤销最近的操作
</capabilities>

<context>
用户当前正在查看的面板节点和浏览的网页信息会以 <panel-context> 提供。
</context>

<output_rules>
- 引用节点时使用 [[nodeId|节点名称]] 格式，用户可以点击跳转
- 创建或修改节点后，简要说明做了什么
- 不要一次创建超过 10 个节点，除非用户明确要求
- 回复使用用户的语言（中文/英文）
</output_rules>

<safety>
- 不要删除用户没有明确要求删除的节点（优先 move to trash）
- 不要修改系统节点（Journal、Schema、Settings 等 locked 节点）
- 不要在笔记中插入 AI 生成的内容，除非用户要求
</safety>
```

### Gap 2: 动态上下文注入策略 ⚠️ 阻塞

每轮对话应该注入什么上下文？需要明确：

```typescript
interface TurnContext {
  // 面板上下文（每轮注入）
  currentPanel: {
    nodeId: string;
    nodeName: string;
    breadcrumb: string[];  // 路径：Journal > 2026-03-12
    childCount: number;
    children: { id: string; name: string; hasChildren: boolean }[];  // 前 20 个
  } | null;

  // 页面上下文（如有活动标签页）
  activePage: {
    url: string;
    title: string;
  } | null;

  // 选中上下文（如有选中节点）
  selectedNodes: {
    ids: string[];
    count: number;
  } | null;
}
```

**注入方式**（学习 CiC 的 `<system-reminder>`）：

```
<panel-context>
当前面板：Journal > 2026-03-12（ID: ws_xxx_day_20260312）
子节点 (3)：
  - "AI 研究笔记" (id: abc123, 5 children)
  - "会议记录" (id: def456, 0 children)
  - "#task 买咖啡豆" (id: ghi789, checkbox: done)
</panel-context>

<page-context>
用户正在浏览：https://arxiv.org/abs/2403.xxxxx — "Attention Is All You Need"
</page-context>
```

### Gap 3: node.read Progressive Disclosure 分页策略 ⚠️ 阻塞

当前 Phase 1 计划：`read` 返回 `children: [{ id, name, hasChildren, childCount }]`。

**问题**：100+ children 的节点怎么办？

**设计**（参考 Claude Code 的 Read `offset+limit`）：

```typescript
// node.read 参数
{
  action: "read",
  nodeId: string,
  depth?: number,       // 默认 1（只返回直接子节点摘要），最大 3
  childOffset?: number, // 子节点分页起始，默认 0
  childLimit?: number,  // 子节点分页数量，默认 20，最大 50
  includeFields?: boolean, // 是否包含字段值，默认 true
}

// 返回
{
  id: string,
  name: string,
  content?: string,        // 节点正文（description）
  tags: string[],          // 标签名称列表
  fields: { name: string, value: string }[],  // 字段键值对
  children: {
    total: number,
    offset: number,
    items: { id: string, name: string, hasChildren: boolean, childCount: number, tags: string[] }[]
  },
  parent: { id: string, name: string } | null,
  breadcrumb: string[],    // 路径
}
```

### Gap 4: node.search 结果格式 & 限制

```typescript
// node.search 参数
{
  action: "search",
  query?: string,        // 文本搜索（fuzzy）
  tags?: string[],       // 标签过滤（AND）
  type?: string,         // 节点类型过滤
  dateRange?: { from?: string, to?: string },  // 创建日期范围
  limit?: number,        // 默认 20，最大 50
  offset?: number,       // 分页
}

// 返回
{
  total: number,
  items: {
    id: string,
    name: string,
    tags: string[],
    snippet: string,     // 匹配文本上下文（前后 50 字符）
    createdAt: string,
    parentName: string,  // 父节点名称（提供位置感）
  }[]
}
```

### Gap 5: #agent 节点 Bootstrap

**问题**：`#agent` 节点何时创建？fresh workspace 没有它。

**设计**：
- `#agent` 是系统节点，在 `bootstrap-system-nodes.ts` 中随 Journal/Schema/Settings 一起创建
- 默认内容 = 硬编码的初始系统 prompt（用户可编辑覆盖）
- `SYS_D.AGENT = 'SYS_D_AGENT'` 新系统节点常量
- `SYSTEM_NODE_PRESETS` 新增 agent 预设

### Gap 6: Chat 中的节点引用渲染

Phase 1 计划说用 `[[nodeId|text]]` 格式，但缺少：

1. **解析**：ChatMessage 渲染时正则匹配 `\[\[([^\]|]+)\|([^\]]+)\]\]`
2. **渲染**：inline `<button>` 样式，点击调用 `pushPanel(nodeId)`
3. **样式**：与大纲中的 inline reference 一致（下划线 + 主色）
4. **失效处理**：nodeId 指向已删除节点 → 灰色 + 删除线

### Gap 7: Tool Call 渲染（ChatMessage 中显示工具调用）

CiC 不直接展示 tool call 细节。Claude Code 显示工具调用摘要。

**soma 选择**：
- 默认折叠，显示工具图标 + 一行摘要（如 "Created node: 会议记录"）
- 点击展开显示完整参数和结果
- 错误的 tool call 以红色高亮

### Gap 8: API Key 迁移到节点存储

Phase 0 用 chrome.storage.local 存储 API key。Phase 1 迁移到节点模型：

- **API key** → Settings 节点的字段（password 类型渲染，显示为 `sk-ant-••••`）
- **模型/参数** → `#agent` 节点的字段（model 下拉、temperature、max tokens）
- 两者分开：Settings = 全局配置（provider + key），`#agent` = agent 自身配置
- 数据在 Loro 中，随工作区同步

---

## 五、Phase 2-5 次优先 Gap

### Phase 2: Spark 提取与现有 page-capture 的关系

代码已有 `src/lib/page-capture/` 模块化抓取基础设施。Phase 2 的 Shadow Cache 应复用：

```
page-capture/orchestrator.ts → 抓取页面内容
    ↓
Shadow Cache (IndexedDB) → 缓存原始 HTML（TTL 30 天）
    ↓
Spark Agent → 三轮认知压缩（使用缓存内容，不重新抓取）
```

### Phase 3: 统一 Target 参数

Phase 3 计划的三模式 target（NL/Ref/CSS）是好设计。但需要明确：
- `ref` 从哪里来？→ `read_page` 返回的 ref_id（CiC 模式）
- `ref` 的生命周期？→ 页面导航后失效
- 失败回退顺序？→ NL → CSS → 报错

### Phase 4: AgentOrchestrator 的 Steering 集成

pi-agent-core 已有 `getSteeringMessages()` 机制。Phase 4 的 clarification flow 可以复用：
- 子 agent 需要澄清 → 发 steering message 给主 agent
- 主 agent 决定：自己回答 / 问用户 / 取消

### Phase 5: Loro OpLog Peer ID 验证

Phase 5 假设 Loro OpLog 存储 peer ID 以区分 agent vs 用户操作。**需要验证**。

---

## 六、建议的 Phase 1 实施顺序

基于 gap 分析，建议将 Phase 1 拆为 4 步：

### Step 1: 基础设施（不涉及 AI 逻辑）
- `#agent` 系统节点 bootstrap
- `SYS_D.AGENT` 常量
- 默认系统 prompt 硬编码内容

### Step 2: Node Tool 实现
- `AgentTool` 定义（TypeBox schema）
- 5 个 action 的 `execute` 函数
- `undo` 工具
- 工具注册到 Agent

### Step 3: 上下文注入
- `buildTurnContext()` 函数：收集面板/页面/选中上下文
- 系统 prompt 从 `#agent` 节点加载
- `<panel-context>` 注入到每轮对话

### Step 4: Chat 成熟化
- `[[nodeId|text]]` 引用解析 + 渲染
- Tool call 折叠渲染
- Chat 持久化（IndexedDB）
- ⌘K "Ask AI" 入口

---

## 七、决策清单（已确认 2026-03-12）

| # | 决策项 | 结论 | 影响 |
|---|--------|------|------|
| 1 | 系统 prompt 默认语言 | 英文编写，回复跟随用户语言 | Phase 1 |
| 2 | node.read 默认返回多少 children | 20（支持 offset 翻页） | Phase 1 |
| 3 | node.search 默认返回多少结果 | 20（支持 offset 翻页） | Phase 1 |
| 4 | Chat 引用格式 | `<ref id="nodeId">text</ref>`（inline）+ `<cite id="nodeId">N</cite>`（角标）。Agent 统一输出，消费端按上下文物化：Chat→导航链接；node.create 内容→ProseMirror inlineReference；children→Reference node | Phase 1+ |
| 5 | Tool call 渲染 | 默认折叠一行摘要，不阻塞主流程，UI 优化后续再做 | Phase 1 |
| 6 | API key 存储 | 存为 Settings 节点字段（Loro），Phase 1 从 chrome.storage.local 迁移。模型/temperature/max tokens 等配置存为 `#agent` 节点字段 | Phase 1 |
| 7 | Planning mode（操作前确认） | Phase 1 不引入 | — |
| 8 | 动态上下文注入 | 统一用 `<system-reminder>` 标签注入（面板节点、页面 URL/标题、选中节点、时间等），按需扩展 | Phase 1 |
| 9 | #agent 节点是否 locked | 否，用户可编辑系统 prompt、Rules、配置 | Phase 1 |
| 10 | page-capture 复用 | 作为统一页面抓取层，Clip / Spark (P2) / Browser tool (P3) 三方共用 | Phase 2-3 |

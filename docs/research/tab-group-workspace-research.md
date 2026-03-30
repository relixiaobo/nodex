# Tab Group 作为 Agent 工作区

> Date: 2026-03-28
> Context: soma 主 agent（无 subagent）如何利用 Chrome tab group 改善浏览器任务体验

---

## 0. 当前问题

soma 的 agent 用 `browser` tool 操作浏览器时：
- 打开的页面混在用户标签页中——用户分不清哪些是自己的、哪些是 agent 的
- agent 完成后留下一堆散落的标签页——用户手动一个个关
- 没有"工作区"概念——每次浏览器操作都是孤立的 tool call

Tab group 解决的核心问题：**给 agent 的浏览器操作一个可见的、隔离的、可整体管理的工作区。**

---

## 1. 用户场景分析（无 subagent）

### 场景 A：多页信息提取

```
用户: "对比 Anthropic、OpenAI、Google 三家的模型定价"

当前（无 tab group）:
  agent 打开 3 个标签页，混在用户标签页中
  [GitHub] [Anthropic] [Twitter] [OpenAI] [Gmail] [Google AI]
  用户: "哪些是我的？哪些是 agent 开的？"
  agent 完成后 3 个标签页留着 → 用户手动关

有 tab group:
  用户标签页不受影响
  [GitHub] [Twitter] [Gmail]
  ┌─ 🔵 对比模型定价 ─────────────────────────────┐
  │ [Anthropic Pricing] [OpenAI Pricing] [Google AI] │
  └─────────────────────────────────────────────────┘
  agent 完成后 → 折叠或关闭整个 group
```

**执行流程**（主 agent 同步执行，无 subagent）：
1. `browser({ action: 'group_create', title: '对比模型定价', urls: [...] })` — 1 次 tool call
2. `browser({ action: 'get_text', tabId: 201 })` — 读页面 1
3. `browser({ action: 'get_text', tabId: 202 })` — 读页面 2
4. `browser({ action: 'get_text', tabId: 203 })` — 读页面 3
5. 分析 + 创建节点 + 回复用户
6. `browser({ action: 'group_collapse', groupId: 42 })` — 折叠工作区

**用户等待时间**：~30-60s（3 个页面读取 + LLM 分析）。用户需要等，但标签页不乱。

---

### 场景 B：引用验证

```
用户: "检查这篇文章里引用的 5 个数据源是否准确"

agent:
  1. 读取文章节点，提取引用 URL
  2. 创建 tab group "引用验证" (红色)
  3. 打开 5 个引用页面
  4. 逐个读取并验证
  5. 报告结果 + 折叠 group
```

用户可以**在 agent 工作期间看到 group 里的标签页在逐个加载**——这是天然的进度指示。

---

### 场景 C：用户和 agent 共建研究工作区

这是 tab group 最独特的场景——**不是 agent 一次性完成的任务，而是持续的研究工作区**。

```
Day 1:
  用户: "我在研究 CRDT 技术，帮我找一些关键资料"
  agent: 创建 tab group "CRDT 研究" (绿色)
         打开 Loro GitHub、CRDT.tech、Martin Kleppmann 的论文...
  用户: 手动往 group 里加了几个自己找到的页面

Day 2:
  用户: "总结一下 CRDT 研究 group 里的内容"
  agent: （通过 getPageContext 看到 "CRDT 研究" group 有 8 个标签页）
         读取所有页面 → 生成总结

Day 3:
  用户: "这个研究差不多了，关掉 group 吧"
  agent: browser({ action: 'group_close', groupId: ... })
```

**关键点**：
- Tab group 不是一次性工具——它是一个**持续的工作区**
- 用户和 agent 都可以往 group 里加/减标签页
- agent 通过 `getPageContext()` 感知 group 的当前状态
- `"总结这个 group"` 是非常自然的交互

---

### 场景 D：Clip 增强——自动展开来源

```
用户 clip 了一篇文章，文章里引用了 3 个外部链接

agent（Spark 提取时）:
  1. 读取文章内容
  2. 发现 3 个关键引用链接
  3. 创建 tab group "文章来源" (灰色, 折叠)
  4. 打开 3 个来源页面（在折叠的 group 中）
  5. 从来源中补充 Spark 分析

用户看到:
  ▸ 文章来源 (3)  ← 折叠状态，不打扰，但用户好奇时可以展开看
```

折叠的 group 是一种**温和的存在感**——"AI 帮你准备好了，你想看就看"。

---

### 场景 E：浏览器操作的"撤销空间"

```
用户: "帮我在 GitHub 上创建一个新 repo 并配置好"

当前: agent 直接在用户的 GitHub 标签页上操作 → 用户担心 agent 做错

有 tab group:
  agent 创建 "GitHub 操作" group → 在 group 内的新标签页中操作
  用户可以随时切到 group 看 agent 在做什么
  如果做错 → 关闭 group 即可（原有标签页不受影响）
```

Tab group = 浏览器操作的**沙箱**。agent 不会"弄乱"用户的标签页。

---

## 1.5 主 agent 的限制（诚实评估）

没有 subagent 时，tab group 的使用有明确的边界：

| 方面 | 能做 | 不能做 |
|------|------|--------|
| **视觉隔离** | ✅ agent 标签页独立成组 | — |
| **批量管理** | ✅ 整体折叠/关闭 | — |
| **工作区感知** | ✅ getPageContext 显示 group 结构 | — |
| **共建工作区** | ✅ 用户和 agent 共同维护 group | — |
| **后台执行** | ❌ | 主 agent 同步执行，读 5 个页面期间用户等待 |
| **Context 隔离** | ❌ | 5 个 get_text 结果全部进入主 agent context |
| **并行读取** | ❌ | 只能顺序读取，一次一个 tool call |

**结论**：tab group 解决的是**浏览器侧的组织问题**，不解决**执行效率问题**（那是 delegate tool 的事）。两者价值独立，可以分别交付。

---

## 1. 核心思路

| Claude Code | soma |
|---|---|
| `git worktree` — 隔离的代码副本 | `tab group` — 隔离的浏览器工作区 |
| agent 在 worktree 中修改文件，不影响主分支 | agent 在 tab group 中打开/操作页面，不影响用户标签页 |
| 任务完成后 worktree 可清理 | 任务完成后 tab group 可折叠/关闭 |
| 多个 worktree 并行 | 多个 tab group 并行 |

---

## 2. Chrome Tab Group API

### 2.1 权限

```json
{ "permissions": ["tabGroups"] }
```

`"tabGroups"` 是**静默权限**——不会触发用户安装时的权限警告弹窗。

### 2.2 核心操作

**创建 tab group**（两步）：

```typescript
// 1. 创建标签页
const tab1 = await chrome.tabs.create({ url: 'https://anthropic.com/pricing' });
const tab2 = await chrome.tabs.create({ url: 'https://openai.com/pricing' });

// 2. 编组 + 配置
const groupId = await chrome.tabs.group({ tabIds: [tab1.id, tab2.id] });
await chrome.tabGroups.update(groupId, {
  title: '提取定价信息',
  color: 'blue',
  collapsed: false,
});
```

注意：`chrome.tabs.create()` 没有 `groupId` 参数。必须先创建 tab，再用 `chrome.tabs.group()` 加入组。

**往现有 group 中添加标签页**：

```typescript
const newTab = await chrome.tabs.create({ url: 'https://...' });
await chrome.tabs.group({ tabIds: newTab.id, groupId: existingGroupId });
```

**查询 group 内的标签页**：

```typescript
const tabs = await chrome.tabs.query({ groupId: someGroupId });
```

**折叠/展开**：

```typescript
await chrome.tabGroups.update(groupId, { collapsed: true });
```

**关闭整个 group**（关闭组内所有标签页）：

```typescript
const tabs = await chrome.tabs.query({ groupId });
await chrome.tabs.remove(tabs.map(t => t.id));
// group 自动销毁（0 个 tab 时 Chrome 自动删除 group）
```

**解散 group**（标签页保留但脱离分组）：

```typescript
const tabs = await chrome.tabs.query({ groupId });
await chrome.tabs.ungroup(tabs.map(t => t.id));
```

### 2.3 事件

| 事件 | 触发时机 |
|------|---------|
| `tabGroups.onCreated` | group 被创建 |
| `tabGroups.onUpdated` | title/color/collapsed 变更 |
| `tabGroups.onMoved` | group 在窗口内移动 |
| `tabGroups.onRemoved` | group 被关闭或最后一个 tab 被移除 |

### 2.4 9 种颜色

`"grey"` / `"blue"` / `"red"` / `"yellow"` / `"green"` / `"pink"` / `"purple"` / `"cyan"` / `"orange"`

不支持自定义 hex 颜色。

### 2.5 重要限制

| 限制 | 说明 |
|------|------|
| Group 是窗口级的 | 不能跨窗口存在 |
| Group ID 不持久 | 浏览器重启后 ID 变化 |
| 无 `create()` 方法 | 必须通过 `chrome.tabs.group()` 间接创建 |
| 新建 tab 不能直接指定 group | 必须先 create 再 group（两次 API 调用） |
| Saved groups（Chrome 120+） | 扩展无法检测 group 是否已保存，也无法枚举未打开的已保存 group |

---

## 3. soma 现有浏览器基础设施

| 能力 | 实现 | 位置 |
|------|------|------|
| `tab` action (list/switch/create/close) | `handleTab()` | background/index.ts |
| 所有操作支持 `tabId` 参数 | `BrowserBasePayload.tabId` | browser-tool.ts |
| AI 感知当前标签页 | `getPageContext()` → `<page-context>` | ai-context.ts |
| 每个 tab 的 CDP session | `TabSessionState` per tabId | cdp-manager.ts |
| Tab ID 解析 | `resolveTargetTabId()` | background/index.ts |
| **Tab Group** | **零代码** | — |

---

## 4. 设计方案

### 4.1 用户视角

```
用户: "从 Anthropic、OpenAI、Google 三个定价页提取模型价格"

agent 行为:
  1. 创建 tab group "提取定价信息" (蓝色)
  2. 在 group 中打开 3 个标签页
  3. 逐个读取页面内容
  4. 提取信息，创建节点
  5. 任务完成 → 折叠 group（或关闭，取决于用户偏好）
  6. Chat 中报告结果

用户浏览器:
  [GitHub] [Twitter] [Gmail]  ← 用户的标签页，完全不受影响
  ┌─ 🔵 提取定价信息 ──────────────────────────────┐
  │ [Anthropic Pricing] [OpenAI Pricing] [Google AI] │  ← agent 的工作区
  └─────────────────────────────────────────────────┘
```

### 4.2 browser tool 扩展

在现有 `tab` action 基础上，新增 `group` action：

```typescript
// browser tool 的 tab action 扩展
type BrowserTabAction =
  | 'list' | 'switch' | 'create' | 'close'  // 已有
  | 'group_create'    // 创建 tab group（可包含初始 URL 列表）
  | 'group_add'       // 往现有 group 中添加标签页
  | 'group_list'      // 列出所有 group 及其标签页
  | 'group_close'     // 关闭整个 group（关闭所有标签页）
  | 'group_collapse';  // 折叠/展开 group
```

**`group_create` — 核心操作**（一步完成创建+配置+打开多个页面）：

```typescript
// agent 调用:
browser({
  action: 'group_create',
  title: '提取定价信息',
  color: 'blue',
  urls: [
    'https://anthropic.com/pricing',
    'https://openai.com/pricing',
    'https://ai.google.dev/pricing',
  ],
})

// 返回:
{
  groupId: 42,
  tabs: [
    { tabId: 101, url: 'https://anthropic.com/pricing' },
    { tabId: 102, url: 'https://openai.com/pricing' },
    { tabId: 103, url: 'https://ai.google.dev/pricing' },
  ]
}
```

内部实现：3 次 `chrome.tabs.create()` + 1 次 `chrome.tabs.group()` + 1 次 `chrome.tabGroups.update()`。对 agent 来说是一次 tool call。

**`group_close` — 完成后清理**：

```typescript
browser({ action: 'group_close', groupId: 42 })
// 内部: query group 内的 tabs → chrome.tabs.remove() → group 自动销毁
```

### 4.3 AI context 增强

当前 `getPageContext()` 输出：

```
<page-context>
Tabs:
* [active, id:101] "GitHub" — github.com
* [id:102] "Twitter" — twitter.com
</page-context>
```

增强为感知 group：

```
<page-context>
Tabs:
* [active, id:101] "GitHub" — github.com
* [id:102] "Twitter" — twitter.com

Tab Groups:
* [group:42, blue] "提取定价信息" (3 tabs)
  - [id:201] "Anthropic Pricing" — anthropic.com/pricing
  - [id:202] "OpenAI Pricing" — openai.com/pricing
  - [id:203] "Google AI Pricing" — ai.google.dev/pricing
</page-context>
```

agent 通过 context 知道 group 的存在，后续操作可以直接用 `tabId` 定位到 group 内的具体页面。

### 4.4 完整工作流示例

```
用户: "从这 3 个定价页提取所有模型价格"

Turn 1 — agent 创建工作区:
  tool call: browser({ action: 'group_create', title: '提取定价信息', color: 'blue',
                       urls: ['anthropic.com/pricing', 'openai.com/pricing', 'ai.google.dev/pricing'] })
  → 返回 groupId: 42, tabs: [{id:201}, {id:202}, {id:203}]

Turn 2 — agent 逐页读取:
  tool call: browser({ action: 'get_text', tabId: 201 })
  → 返回 Anthropic 定价页内容
  tool call: browser({ action: 'get_text', tabId: 202 })
  → 返回 OpenAI 定价页内容
  tool call: browser({ action: 'get_text', tabId: 203 })
  → 返回 Google AI 定价页内容

  （如果用 delegate tool 做 context isolation，这 3 个 tool calls 不污染主 agent context）

Turn 3 — agent 创建节点 + 报告:
  tool call: node_create({ text: '...定价对比...' })
  → 创建结果节点

  tool call: browser({ action: 'group_collapse', groupId: 42 })
  → 折叠 group（用户可以手动关闭，也可以留着）

  agent: "定价提取完成，创建了 [定价对比] 节点。工作标签页已折叠。"
```

### 4.5 与 delegate tool 的关系

Tab group 和 delegate tool 是**正交的能力**：

| | 无 delegate | 有 delegate |
|--|--|--|
| **无 tab group** | 当前状态：agent 在用户标签页中操作 | 隔离 context，但标签页操作仍混在用户标签页中 |
| **有 tab group** | 标签页隔离，但 tool calls 污染主 agent context | **完全隔离**：标签页隔离 + context 隔离 |

可以独立实现、独立交付：
1. **先做 tab group**（浏览器侧隔离）— 用户立即受益
2. **后做 delegate**（context 侧隔离）— 需要时再加

---

## 5. 实现清单

### 新增权限

```diff
// wxt.config.ts 或 manifest
  permissions: [
    ...existing,
+   "tabGroups",
  ]
```

### 新增/修改文件

| 文件 | 改动 | 行数估算 |
|------|------|---------|
| `background/index.ts` | 新增 `group_create`, `group_add`, `group_list`, `group_close`, `group_collapse` handler | ~80 行 |
| `browser-tool.ts` | 扩展 `BrowserTabAction` 类型 + tool description | ~30 行 |
| `browser-actions/interaction.ts` | 新增 `handleTabGroup()` 函数 | ~20 行 |
| `browser-messaging.ts` | 新增消息类型 | ~10 行 |
| `ai-context.ts` | `getPageContext()` 增强，输出 group 信息 | ~30 行 |
| `tests/vitest/` | tab group handler 测试 | ~60 行 |
| **合计** | | **~230 行** |

### 不需要

- ❌ 新的 tool（复用现有 browser tool）
- ❌ 新的 UI 组件
- ❌ 新的状态管理
- ❌ 新的权限弹窗（tabGroups 是静默权限）

---

## 6. 注意事项

| 事项 | 说明 | 应对 |
|------|------|------|
| Group ID 不持久 | 浏览器重启后 ID 变化 | 不依赖持久化 groupId，用 title 匹配或每次新建 |
| 用户手动关闭 group | `onRemoved` 事件触发 | agent 需要处理 "group 不存在了" 的 tool call 错误 |
| 用户手动移除 group 中的 tab | tab count 变化 | agent 每次操作前通过 `group_list` 或 `tabs.query({ groupId })` 确认状态 |
| 创建 tab 后才能加入 group | 两步操作 | `group_create` 封装为一步 |
| group 内 tab 物理相邻 | Chrome 自动移动 tab 位置 | 无需处理，Chrome 自动排列 |
| 最多 9 种颜色 | 不支持自定义颜色 | 足够区分并发任务 |

---

## 7. agent system prompt 中的 tab group 使用指导

agent 需要知道何时以及如何使用 tab group。在 system prompt 或 tool description 中加入简洁的规则：

```
Tab group 使用规则：
- 需要打开 2+ 个新页面时，创建 tab group 归组
- 只打开 1 个页面时，不需要 group
- 用 group title 描述任务目的（如"对比模型定价"）
- 任务完成后折叠 group（用户可自行关闭或保留）
- 用户说"总结这个 group"时，读取 group 内所有标签页
- 不要关闭用户的 tab group（只操作 agent 自己创建的）
```

这不需要复杂的代码——只是 prompt 中的行为引导。agent 的 LLM 会自然遵循这些规则来决定何时创建/折叠/关闭 group。

---

## 8. 总结

**Tab group 对主 agent 的核心价值**（无需 subagent）：

| 价值 | 说明 |
|------|------|
| **视觉隔离** | agent 的标签页不混入用户的 |
| **整体管理** | 一键折叠/关闭整组标签页 |
| **工作区感知** | agent 通过 context 知道 group 存在及其内容 |
| **共建研究** | 用户和 agent 都可以往同一个 group 中添加页面 |
| **天然进度** | 用户看到 group 中标签页在加载 = 知道 agent 在工作 |
| **操作沙箱** | agent 在 group 中操作，不影响用户原有标签页 |

**不能解决的**（需要 delegate tool）：
- 后台执行（主 agent 同步阻塞）
- Context 污染（多次 get_text 的结果占满 context）
- 并行读取（顺序执行 tool calls）

**实现量**：~230 行，复用现有 browser tool，零新 UI，静默权限。

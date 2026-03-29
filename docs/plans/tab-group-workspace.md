# Tab Group 工作区

> Agent 在浏览器中执行任务时，用 tab group 隔离工作区，不干扰用户的标签页。
>
> **前置调研**：`docs/research/tab-group-workspace-research.md`（Chrome API 详情 + 场景分析）
> **独立于**：subagent / delegate tool（正交能力，分别交付）

---

## 一、问题

Agent 用 `browser` tool 操作浏览器时：
- 打开的页面混在用户标签页中——用户分不清哪些是自己的、哪些是 agent 的
- Agent 完成后留下散落的标签页——用户手动一个个关
- 没有"工作区"概念——每次浏览器操作都是孤立的 tool call

---

## 二、设计

### 核心规则

**Agent 为了自己的工作打开页面 → 创建 tab group。帮用户打开页面 → 不创建。**

| 场景 | 创建 group？ | 原因 |
|------|-------------|------|
| "对比这三家的模型定价" | ✅ | agent 自主浏览，需要打开多个页面完成任务 |
| "帮我调研 CRDT 技术" | ✅ | agent 需要打开资料页面 |
| "检查这篇文章的引用" | ✅ | agent 需要打开引用链接验证 |
| "帮我查一下 X 的官网" | ✅ | agent 搜索/浏览，哪怕只有 1 个页面 |
| "帮我打开 GitHub" | ❌ | 用户指挥导航，等同于用户自己点击 |
| "切到刚才那个标签页" | ❌ | 操作已有标签页 |
| "总结这个页面" | ❌ | 读取用户当前页面，不开新标签页 |

### Agent 对 group 的操作边界

- Agent **只操作自己创建的 group**——不修改、不关闭、不往用户 group 中加标签页
- Agent 通过内存中的 `Set<number>` 记住自己创建的 groupId
- 浏览器重启后 set 清空 → agent 不认识的 group 一律视为用户的 → 安全
- 用户的 group 是**只读上下文**——agent 可以读取其中的页面内容（用户授权时），但不修改 group 结构

### 任务完成后的 group 处理

- **默认折叠**（`collapsed: true`）——不关闭，因为用户可能想回看
- 用户可以自行展开、关闭、或保留作为持续工作区
- Agent 在 Chat 中报告时提到："工作标签页已折叠，你可以在 [对比模型定价] group 中查看。"

---

## 三、System Reminder 增强

当前 `getPageContext()` 输出所有标签页的平铺列表。增强为区分 ungrouped tabs 和 tab groups：

```
<page-context>
Tabs:
* [active, id:101] "GitHub" — github.com
* [id:102] "Gmail" — gmail.com

Tab Groups:
* [group:42, blue] "对比模型定价" (3 tabs)
  - [id:201] "Anthropic Pricing" — anthropic.com/pricing
  - [id:202] "OpenAI Pricing" — openai.com/pricing
  - [id:203] "Google AI Pricing" — ai.google.dev/pricing
* [group:33, green] "周末旅行" (4 tabs)
  - [id:301] "机票比价" — flights.ctrip.com
  - [id:302] "酒店" — booking.com
  - [id:303] "攻略" — mafengwo.cn
  - [id:304] "天气" — weather.com
* [group:55, purple, collapsed] "工作" (8 tabs)
</page-context>
```

规则：
- **Tabs** = 不在任何 group 中的标签页
- **Tab Groups** = 所有 group（无论用户创建还是 agent 创建），展示 title、color、tab 数量
- **折叠的 group** 只显示标题和 tab 数量，不展开列出每个 tab（节省 context）
- **展开的 group** 列出每个 tab 的 id、title、URL

Agent 通过 context 自然感知：
- 用户说"总结周末旅行里的内容" → agent 看到 group:33 → 读取 4 个 tab
- 用户说"定价提取得怎么样了" → agent 看到自己创建的 group:42 → 知道工作区状态
- 有折叠的 group → agent 不主动展开或操作（除非用户要求）

---

## 四、Browser Tool 扩展

> **设计原则**：完全遵循现有 browser tool 的模式——
> - `action: 'tab'` + `tabAction` 子操作（不新增顶层 action）
> - 参数通过 `browserToolParameters` 的 Optional 字段传递
> - 返回值 `Record<string, unknown>`，经 `formatResultText()` → JSON.stringify 序列化给 LLM
> - Side Panel → Background 通过 `sendBrowserMessage(BROWSER_TAB, payload)` 通信
> - 错误通过 `throw new Error(message)` → 被 `assertBrowserResponseOk` 捕获

### 4.1 现有 tab action 模式（参考）

```typescript
// browser-messaging.ts — 消息类型
export type BrowserTabAction = 'switch' | 'create' | 'close' | 'list';

export interface BrowserTabPayload extends BrowserBasePayload {
  tabAction: BrowserTabAction;
  url?: string;
}

// interaction.ts — Side Panel 端入口
export async function handleTab(params) {
  const tabAction = requireNonEmptyString(params.tabAction, 'tabAction', 'tab');
  // 参数验证 → sendBrowserMessage(BROWSER_TAB, payload) → assertBrowserResponseOk
  return mutationResult(result, params.tabId);
}

// background/index.ts — Background 端处理
async function handleBrowserTab(payload: BrowserTabPayload): Promise<Record<string, unknown>> {
  switch (payload.tabAction) {
    case 'list':   return { tabs: [...] };
    case 'switch': return { switched: true, title, url };
    case 'create': return { created: true, tabId, title, url };
    case 'close':  return { closed: true };
  }
}
```

**返回值约定**：
- 操作确认用 boolean flag（`created: true`、`switched: true`、`closed: true`）
- 新建资源返回 ID（`tabId: number`）
- 查询返回数组（`tabs: [{tabId, title, url, active}]`）
- 所有 mutation action 通过 `mutationResult()` 自动附带截图

### 4.2 扩展：新增 tabAction

```diff
// browser-messaging.ts
- export type BrowserTabAction = 'switch' | 'create' | 'close' | 'list';
+ export type BrowserTabAction = 'switch' | 'create' | 'close' | 'list'
+   | 'group_create' | 'group_add' | 'group_list' | 'group_collapse' | 'group_close';

  export interface BrowserTabPayload extends BrowserBasePayload {
    tabAction: BrowserTabAction;
    url?: string;
+   urls?: string[];           // group_create: 初始 URL 列表
+   groupId?: number;          // group_add/collapse/close: 目标 group
+   groupTitle?: string;       // group_create: group 名称
+   groupColor?: string;       // group_create: 颜色（9 种之一）
+   collapsed?: boolean;       // group_collapse: 折叠/展开
  }
```

### 4.3 Background handler 实现

```typescript
// background/index.ts — 在 handleBrowserTab 的 switch 中新增

const agentCreatedGroups = new Set<number>();

case 'group_create': {
  if (!payload.urls?.length) throw new Error("'group_create' requires non-empty 'urls' array.");
  const title = payload.groupTitle ?? 'Agent workspace';

  // 1. 批量创建标签页
  const tabs = await Promise.all(
    payload.urls.map(url => createTab({ url: normalizeBrowserUrl(url), active: false }))
  );
  const tabIds = tabs.map(t => t.id!).filter(Boolean);
  if (tabIds.length === 0) throw new Error('Failed to create any tabs.');

  // 2. 编组（chrome.tabs.group 返回 groupId）
  const groupId = await chrome.tabs.group({ tabIds });

  // 3. 配置 title + color
  await chrome.tabGroups.update(groupId, {
    title,
    color: (payload.groupColor as chrome.tabGroups.ColorEnum) || 'blue',
    collapsed: false,
  });

  // 4. 记住这是 agent 创建的
  agentCreatedGroups.add(groupId);

  return {
    created: true,
    groupId,
    title,
    tabs: tabs.map(t => ({ tabId: t.id, title: t.title ?? '', url: t.url ?? '' })),
  };
}

case 'group_add': {
  if (!payload.groupId) throw new Error("'group_add' requires 'groupId'.");
  // 可以传 tabId（已有 tab 加入 group）或 url（新建 tab 再加入）
  let tabId = payload.tabId;
  if (!tabId && payload.url) {
    const tab = await createTab({ url: normalizeBrowserUrl(payload.url), active: false });
    tabId = tab.id;
  }
  if (!tabId) throw new Error("'group_add' requires 'tabId' or 'url'.");
  await chrome.tabs.group({ tabIds: [tabId], groupId: payload.groupId });
  return { added: true, tabId, groupId: payload.groupId };
}

case 'group_list': {
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  const result = await Promise.all(groups.map(async (g) => {
    const tabs = await chrome.tabs.query({ groupId: g.id });
    return {
      groupId: g.id,
      title: g.title,
      color: g.color,
      collapsed: g.collapsed,
      isAgentCreated: agentCreatedGroups.has(g.id),
      tabs: tabs.map(t => ({ tabId: t.id, title: t.title ?? '', url: t.url ?? '' })),
    };
  }));
  return { groups: result };
}

case 'group_collapse': {
  if (!payload.groupId) throw new Error("'group_collapse' requires 'groupId'.");
  const collapsed = payload.collapsed ?? true;
  await chrome.tabGroups.update(payload.groupId, { collapsed });
  return { collapsed, groupId: payload.groupId };
}

case 'group_close': {
  if (!payload.groupId) throw new Error("'group_close' requires 'groupId'.");
  const tabs = await chrome.tabs.query({ groupId: payload.groupId });
  const tabIds = tabs.map(t => t.id!).filter(Boolean);
  if (tabIds.length > 0) await chrome.tabs.remove(tabIds);
  agentCreatedGroups.delete(payload.groupId);
  return { closed: true, closedTabCount: tabIds.length };
}
```

**返回值设计**（遵循现有约定）：

| tabAction | 返回值 | 说明 |
|-----------|--------|------|
| `group_create` | `{ created: true, groupId, title, tabs: [{tabId, title, url}] }` | 同 `create` 的 `created: true` 模式，扩展为返回多个 tab |
| `group_add` | `{ added: true, tabId, groupId }` | 确认 flag + 资源 ID |
| `group_list` | `{ groups: [{groupId, title, color, collapsed, isAgentCreated, tabs}] }` | 同 `list` 返回数组模式 |
| `group_collapse` | `{ collapsed: boolean, groupId }` | 最终状态 |
| `group_close` | `{ closed: true, closedTabCount }` | 同 `close` 的 `closed: true` 模式 |

### 4.4 Side Panel 端（interaction.ts）

`handleTab()` 不需要改——现有代码已经把 `tabAction` + 所有参数透传给 background：

```typescript
// 现有代码，不改
export async function handleTab(params) {
  const tabAction = requireNonEmptyString(params.tabAction, 'tabAction', 'tab');
  // ... 参数验证 ...
  const result = await sendBrowserMessage(BROWSER_TAB, { tabAction, tabId, url, ... });
  assertBrowserResponseOk(result);
  return mutationResult(result, params.tabId);
}
```

只需要：
1. 放宽参数验证（group actions 不要求 `tabId`）
2. 透传新参数（`urls`, `groupId`, `groupTitle`, `groupColor`, `collapsed`）

注意：`mutationResult()` 会自动截图。对 `group_list` 这种纯查询操作，应该用 `textResult()` 代替（不截图）。

### 4.5 browser-tool.ts 参数扩展

```typescript
// 新增到 browserToolParameters（遵循现有 Type.Optional 模式）
groupId: Type.Optional(Type.Number({
  description: "For tab group actions: target group ID.",
})),
groupTitle: Type.Optional(Type.String({
  description: "For 'group_create': display name for the group.",
})),
groupColor: Type.Optional(Type.Union([
  Type.Literal('grey'), Type.Literal('blue'), Type.Literal('red'),
  Type.Literal('yellow'), Type.Literal('green'), Type.Literal('pink'),
  Type.Literal('purple'), Type.Literal('cyan'), Type.Literal('orange'),
], { description: "For 'group_create': group color (default: blue)." })),
urls: Type.Optional(Type.Array(Type.String(), {
  description: "For 'group_create': URLs to open in the group.",
})),
collapsed: Type.Optional(Type.Boolean({
  description: "For 'group_collapse': true to collapse, false to expand.",
})),
```

`tabAction` 类型扩展：

```typescript
tabAction: Type.Optional(Type.Union([
  Type.Literal('switch'),
  Type.Literal('create'),
  Type.Literal('close'),
  Type.Literal('list'),
  Type.Literal('group_create'),
  Type.Literal('group_add'),
  Type.Literal('group_list'),
  Type.Literal('group_collapse'),
  Type.Literal('group_close'),
], { description: "For 'tab': operation to perform." })),
```

`executeBrowserTool()` switch case 不用改——`action: 'tab'` 已经统一走 `handleTab()`，新 tabAction 在 background 端 dispatch。

### 4.6 Tool description 更新

在 `BROWSER_DESCRIPTION` 的 Control actions 区域追加：

```
- "tab": Switch, create, close, or list browser tabs. Manage tab groups for workspace isolation.
  Tab group sub-actions:
  · tabAction "group_create" + urls + groupTitle: Open pages in a named tab group.
    Use when YOU need to visit pages for a task. NOT for user-directed navigation.
  · tabAction "group_add" + groupId + url: Add a page to an existing group.
  · tabAction "group_list": List all tab groups with their tabs.
  · tabAction "group_collapse" + groupId: Collapse/expand a group after task completion.
  · tabAction "group_close" + groupId: Close all tabs in a group.
  Only collapse/close groups you created. User's groups are read-only.
```

---

## 五、用户场景完整流程

### 场景 1：多页信息提取

```
用户: "对比 Anthropic、OpenAI、Google 三家的模型定价"

agent turn:
  1. browser({ action: 'tab', tabAction: 'group_create',
       groupTitle: '对比模型定价', groupColor: 'blue',
       urls: ['https://anthropic.com/pricing', 'https://openai.com/pricing', 'https://ai.google.dev/pricing'] })
     → { groupId: 42, tabs: [{id:201,...}, {id:202,...}, {id:203,...}] }

  2. browser({ action: 'get_text', tabId: 201 })  → Anthropic 定价内容
  3. browser({ action: 'get_text', tabId: 202 })  → OpenAI 定价内容
  4. browser({ action: 'get_text', tabId: 203 })  → Google AI 定价内容

  5. node_create({ text: '...定价对比结果...' })

  6. browser({ action: 'tab', tabAction: 'group_collapse', groupId: 42, collapsed: true })

  agent: "三家的模型定价对比已整理到 [定价对比] 节点中。工作标签页已折叠。"
```

### 场景 2：共建研究工作区

```
Day 1:
  用户: "帮我找一些 CRDT 的关键资料"
  agent: browser({ action: 'tab', tabAction: 'group_create',
           groupTitle: 'CRDT 研究', groupColor: 'green',
           urls: ['https://crdt.tech', 'https://github.com/loro-dev/loro', ...] })
  agent: "已创建 CRDT 研究工作区，打开了 4 个关键页面。你可以随时往里面加更多页面。"

  用户手动拖了几个自己找的页面进 group

Day 2:
  [system-reminder 中显示: Tab Groups: [group:42, green] "CRDT 研究" (7 tabs)]

  用户: "总结一下 CRDT 研究 group 里的内容"
  agent: browser({ action: 'tab', tabAction: 'group_list' })
         → 看到 group:42 有 7 个 tab
         → 逐个 get_text 读取
         → 生成总结

Day 5:
  用户: "CRDT 研究差不多了，关掉 group 吧"
  agent: browser({ action: 'tab', tabAction: 'group_close', groupId: 42 })
  agent: "已关闭 CRDT 研究工作区。"
```

### 场景 3：用户的 group 是只读上下文

```
用户手动创建了 "周末旅行" group (4 个标签页)

[system-reminder 中显示: Tab Groups: [group:33, green] "周末旅行" (4 tabs)]

用户: "帮我看看周末旅行 group 里的酒店，有没有含早餐的"
agent: （看到 group:33 是用户的 → 不修改 group 结构）
       browser({ action: 'get_text', tabId: 302 })  → 读取酒店页面
       agent: "这家酒店不含早餐，但有..."

       （agent 只读 tab 内容，不往 group 里加/删标签页）
```

---

## 六、权限

```diff
// wxt.config.ts manifest.permissions
  permissions: [
    ...existing,
+   "tabGroups",
  ]
```

`"tabGroups"` 是静默权限——不触发用户安装时的权限警告弹窗。

---

## 七、文件变更

| Action | File | Scope |
|--------|------|-------|
| **Modify** | `wxt.config.ts` | 添加 `"tabGroups"` 权限 |
| **Modify** | `src/lib/ai-tools/browser-tool.ts` | 扩展 `tabAction` 类型 + 新参数 + tool description |
| **Modify** | `src/lib/ai-tools/browser-actions/interaction.ts` | `handleTab()` 新增 group 分支 |
| **Modify** | `src/lib/ai-tools/browser-messaging.ts` | 新增 group 相关消息类型 |
| **Modify** | `src/entrypoints/background/index.ts` | 新增 group handler（create/add/list/collapse/close） |
| **Modify** | `src/lib/ai-context.ts` | `getPageContext()` 区分 ungrouped tabs 和 tab groups |
| **Create** | `tests/vitest/browser-tab-group.test.ts` | Group handler 单元测试 |

预估 ~230 行新增代码，零新文件（除测试），零新 UI 组件。

---

## 八、Checklist

- [ ] `wxt.config.ts` 添加 `"tabGroups"` 权限
- [ ] `browser-tool.ts` 扩展 tabAction 类型 + 新增参数
- [ ] `browser-tool.ts` 更新 tool description（group 使用规则）
- [ ] `browser-messaging.ts` 新增 group 消息类型
- [ ] `background/index.ts` 实现 `group_create` handler
- [ ] `background/index.ts` 实现 `group_add` handler
- [ ] `background/index.ts` 实现 `group_list` handler
- [ ] `background/index.ts` 实现 `group_collapse` handler
- [ ] `background/index.ts` 实现 `group_close` handler
- [ ] `background/index.ts` 维护 `agentCreatedGroups: Set<number>`
- [ ] `ai-context.ts` 重构 `getPageContext()` — 区分 tabs / groups / collapsed
- [ ] `tests/vitest/browser-tab-group.test.ts`
- [ ] `npm run verify`
- [ ] 浏览器验证：创建 group → 读取页面 → 折叠 → 关闭

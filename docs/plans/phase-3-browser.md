# Phase 3: 浏览器 — browser tool + CDP

> 依赖：Phase 0 (基座)
> 可并行：Phase 1 (node tool)
> 来源：ai-strategy.md §9 "Tool 2: browser" + §8 "浏览器能力分层" + ai-strategy.md 工具设计研究

---

## 目标

Agent 能读取和操作网页——这是 soma 作为浏览器扩展的**独特竞争优势**。

来源：ai-strategy.md §14 "杀手级场景"

> 四项能力的交集只有 soma：浏览器侧边栏（实时读取网页）+ 结构化数据模型（supertag/field）+ Schema 动态演化 + AI + 已有 schema。

**交付物**：用户在 Chat 中说"读取当前页面内容" → agent 调用 browser tool → 返回页面文本。进阶：agent 可以点击、填表、截图验证。

---

## 统一 browser tool（16 actions）

来源：ai-strategy.md §9 "Tool 2: browser"

> 研究了 Claude in Chrome（18 工具）、Playwright MCP、Computer Use、browser-use 等 7 个系统后设计。

### Action 清单

| 分类 | Action | 功能 | CDP 需求 |
|------|--------|------|---------|
| **观察 (4)** | `read_page` | 读取页面结构化文本 | 不需要 |
| | `get_text` | 获取指定元素文本 | 不需要 |
| | `find` | 查找页面元素 | 不需要 |
| | `screenshot` | 页面截图 | 必须（后台截图不抢焦点） |
| **交互 (6)** | `click` | 点击元素 | CDP 更好（trusted events） |
| | `type` | 输入文本 | CDP 更好 |
| | `key` | 按键/快捷键 | CDP 更好 |
| | `scroll` | 滚动页面 | 不需要 |
| | `drag` | 拖拽元素 | 必须 |
| | `fill_form` | 批量填写表单 | CDP 更好 |
| **控制 (3)** | `navigate` | 导航到 URL | 不需要 |
| | `tab` | 标签页操作 | 不需要 |
| | `wait` | 等待条件满足 | 不需要 |
| **执行 (1)** | `javascript` | 执行 JS 代码 | 不需要（scripting API） |
| **调试 (2)** | `read_network` | 读取网络请求 | 必须 |
| | `read_console` | 读取控制台日志 | 必须 |

来源：ai-strategy.md 工具设计研究 "CDP 权限验证矩阵"

**统计**：6 个必须 CDP，5 个 CDP 更好，5 个不需要。

### 统一目标定位（三模式自动降级）

来源：ai-strategy.md §9

```
模式 1 — NL（自然语言）: "the login button"
  → agent 描述目标，browser tool 内部用 find 定位
  → 最自然，但最慢（需要额外 DOM 搜索）

模式 2 — Ref（元素引用）: "ref_1"
  → 前一次 read_page/find 返回的元素带 ref 标记
  → agent 直接引用，精确且快

模式 3 — CSS: "button.login-btn"
  → 直接 CSS 选择器
  → 精确但依赖页面实现细节
```

三种模式在 tool 参数中是同一个 `target` 字段，browser tool 内部按优先级尝试：Ref → CSS → NL。

---

## 浏览器能力分层

来源：ai-strategy.md §8 "浏览器能力分层"

| 层级 | 权限 | 生命周期 | 用途 |
|------|------|---------|------|
| **L0 常驻** | Content Script + `activeTab` | 扩展安装后始终可用 | DOM 读取、基础 clip、高亮 |
| **L1 常驻** | `scripting` API (MAIN world) | 扩展安装后始终可用 | 访问页面 JS 上下文、SPA 数据 |
| **L2 按需** | `debugger` (CDP) | 用户召唤时 attach，完成后 detach | 深度页面操作、后台截图、trusted events |

### 权限申请策略

来源：ai-strategy.md §8 "权限申请策略"

**`debugger` 权限在 Phase 3 启动时声明**，不需要提前在 v0.1 就声明。Chrome 扩展添加新权限会触发一次权限升级提示（用户确认后继续），这是可接受的用户体验。

**权限升级的影响**：Chrome 会在扩展更新时弹出"需要额外权限"提示，用户同意后扩展正常运行。这比在 v0.1 就声明用不到的 `debugger` 权限更合理——用户不需要在安装时就授予调试权限。

Phase 3 实现时在 `wxt.config.ts` 中声明 `debugger` 权限。

### CDP 生命周期管理

```
用户通过 Chat 触发需要 CDP 的操作
  → background.ts: chrome.debugger.attach(tabId)
  → 用户看到 Chrome 提示栏 "soma is debugging this tab"
  → agent 执行 CDP 操作（screenshot / click / fill_form 等）
  → 任务完成
  → background.ts: chrome.debugger.detach(tabId)
  → 提示栏消失
```

**关键**：attach/detach 粒度是**任务级**（一组相关操作），不是 action 级（每个操作都 attach/detach 太慢）。

---

## ReAct 截图验证循环

来源：ai-strategy.md §9 "CDP 深度操作"

Agent 执行多步网页操作时，用截图验证每步结果：

```
agent 计划: [click "Login"] → [type email] → [type password] → [click "Submit"]

Step 1: browser.click("Login button")
  → browser.screenshot()
  → LLM 验证：登录表单是否出现？
  → ✓ 出现 → 继续
  → ✗ 未出现 → 调整策略（可能需要先关闭弹窗）

Step 2: browser.type(email, "user@example.com")
  → browser.screenshot()
  → LLM 验证：email 字段是否填入？
  → ✓ → 继续
  ...
```

**screenshot 使用 CDP 后台截图**（`Page.captureScreenshot`），不抢焦点——用户可以继续浏览其他标签页。

---

## 通信架构

### Content Script ↔ Background ↔ Side Panel

```
Side Panel (Agent)
  │ chrome.runtime.sendMessage
  ↓
Background (Service Worker)
  │ 路由决策：
  │   L0/L1 操作 → chrome.tabs.sendMessage → Content Script
  │   L2 操作   → chrome.debugger.sendCommand → CDP
  ↓
Content Script (页面内)
  │ DOM 操作 / JS 执行
  │ 结果通过 chrome.runtime.sendMessage 返回
  ↓
Background → Side Panel
```

### 消息类型

复用现有 `src/lib/page-capture/messaging.ts` 的消息模式，扩展 browser tool 相关消息：

```typescript
type BrowserToolMessage =
  | { type: 'browser:read_page'; tabId: number }
  | { type: 'browser:get_text'; tabId: number; selector: string }
  | { type: 'browser:find'; tabId: number; query: string }
  | { type: 'browser:click'; tabId: number; target: TargetSpec }
  | { type: 'browser:type'; tabId: number; target: TargetSpec; text: string }
  // ... 其余 actions
```

---

## Tool 参数设计

```typescript
const browserTool: AgentTool = {
  name: 'browser',
  description: 'Interact with the current web page',
  parameters: Type.Object({
    action: StringEnum([
      'read_page', 'get_text', 'find', 'screenshot',
      'click', 'type', 'key', 'scroll', 'drag', 'fill_form',
      'navigate', 'tab', 'wait',
      'javascript',
      'read_network', 'read_console'
    ]),
    // Action-specific params (union type)
    target: Type.Optional(Type.String()),  // NL / Ref / CSS
    text: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    code: Type.Optional(Type.String()),
    // ...
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 根据 action 路由到具体实现
    // L0/L1: 通过 Content Script
    // L2: 通过 CDP
  }
}
```

---

## 分步实施建议

Browser tool 的 16 个 action 不需要一次全部实现。按价值和复杂度分批：

### Batch 1: 观察（最高价值，最低风险）

- `read_page` — agent 能读取页面内容（核心能力）
- `get_text` — 读取指定元素
- `find` — 查找元素（返回带 ref 的元素列表）

只需 Content Script，不需要 CDP。**这批可以在 Phase 0 完成后立即开始**。

### Batch 2: 截图 + 基础交互

- `screenshot` — CDP 后台截图
- `click` — 点击元素（Content Script fallback + CDP trusted events）
- `type` — 输入文本
- `scroll` — 滚动
- `navigate` — 导航

需要 CDP attach/detach 生命周期管理。

### Batch 3: 深度交互

- `key` — 按键/快捷键
- `fill_form` — 批量表单填写
- `drag` — 拖拽
- `wait` — 等待条件
- `javascript` — JS 执行

### Batch 4: 调试

- `read_network` — 网络请求读取
- `read_console` — 控制台日志

---

## 文件变更

| Action | File | Scope |
|--------|------|-------|
| **Create** | `src/lib/ai-tools/browser-tool.ts` | browser tool 定义 + action 路由 (~150 行) |
| **Create** | `src/lib/ai-tools/browser-actions/read-page.ts` | read_page 实现 |
| **Create** | `src/lib/ai-tools/browser-actions/get-text.ts` | get_text 实现 |
| **Create** | `src/lib/ai-tools/browser-actions/find.ts` | find 实现（返回带 ref 的元素） |
| **Create** | `src/lib/ai-tools/browser-actions/screenshot.ts` | CDP screenshot |
| **Create** | `src/lib/ai-tools/browser-actions/click.ts` | click (CS + CDP) |
| **Create** | `src/lib/ai-tools/browser-actions/type.ts` | type (CS + CDP) |
| **Create** | `src/lib/ai-tools/browser-actions/...` | 其余 actions |
| **Create** | `src/lib/ai-tools/browser-target.ts` | 三模式目标定位 (~80 行) |
| **Create** | `src/lib/ai-tools/cdp-manager.ts` | CDP attach/detach 生命周期 (~100 行) |
| **Modify** | `src/entrypoints/background/index.ts` | CDP 消息处理 + attach/detach |
| **Modify** | `src/entrypoints/content/index.ts` | browser tool 消息处理 |
| **Modify** | `wxt.config.ts` | 声明 `debugger` 权限 |
| **Modify** | `src/lib/ai-service.ts` | 注册 browser tool |
| **Create** | `tests/vitest/browser-tool.test.ts` | browser tool 测试 |

---

## Exact Behavior

### read_page（Batch 1 核心）

```
GIVEN 用户在浏览某个网页
  AND Chat 已打开
WHEN 用户输入 "读取当前页面的内容"
THEN agent 调用 browser.read_page
  AND Content Script 提取页面结构化文本（标题/段落/列表/表格）
  AND 返回结果包含页面元素的 ref 标记（供后续 action 引用）
  AND agent 在 Chat 中展示摘要或直接用于其他任务
```

### screenshot + click（ReAct 验证）

```
GIVEN 用户输入 "帮我登录这个网站"
WHEN agent 调用 browser.click("login button")
THEN CDP attach（如果未 attach）
  AND Chrome 显示 "soma is debugging this tab" 提示栏
  AND agent 执行 click
  AND agent 调用 browser.screenshot 验证结果
  AND 如果结果符合预期 → 继续下一步
  AND 如果结果不符合 → agent 调整策略重试
WHEN 整个任务完成
THEN CDP detach
  AND 提示栏消失
```

---

## 验证标准

1. Chat 中输入"读取当前页面" → 返回页面结构化文本
2. `read_page` 返回的元素带 ref 标记 → `click("ref_1")` 能准确定位
3. `screenshot` 返回可用的 base64 图片
4. CDP attach/detach 生命周期正确（任务完成后 detach）
5. 用户切换标签页后 agent 仍能操作目标页面（CDP 后台）
6. `npm run typecheck && npm run test:run && npm run build` 全过

---

## 提交策略

1. `feat: browser tool — read_page + get_text + find (Content Script)`
2. `feat: CDP manager — attach/detach lifecycle for debugger API`
3. `feat: browser tool — screenshot + click + type (CDP)`
4. `feat: browser tool — remaining actions (navigate/scroll/key/drag/fill_form/wait/javascript)`
5. `test: browser tool unit tests`

---

## Out of Scope

- ReAct 自动化工作流编排 → Phase 4 (subagent)
- CDP Clip 增强（动态页面内容提取）→ Phase 2 可选依赖
- 跨标签页操作编排 → Phase 4
- 页面操作录制/回放 → 未排期

# Phase 3: 浏览器 — browser tool + CDP

> 依赖：Phase 0 (基座)
> 可并行：Phase 1/1.5 (node tools)
> 工具定义：`tool-definitions.md`（参数 schema + 返回值 + 设计模式）
> 来源：ai-strategy.md §9 "Tool 2: browser" + §8 "浏览器能力分层" + CiC 逆向分析

---

## 目标

Agent 能读取和操作网页——这是 soma 作为浏览器扩展的**独特竞争优势**。

来源：ai-strategy.md §14 "杀手级场景"

> 四项能力的交集只有 soma：浏览器侧边栏（实时读取网页）+ 结构化数据模型（supertag/field）+ Schema 动态演化 + AI + 已有 schema。

**交付物**：用户在 Chat 中说"读取当前页面内容" → agent 调用 browser tool → 返回页面文本。进阶：agent 可以点击、填表、截图验证。

---

## 统一 browser tool（17 actions）

> 完整参数 schema + 返回值见 `tool-definitions.md`。

单工具多 action（与 CiC 的 `computer` 工具同一思路——粗粒度，减少 LLM 工具选择复杂度）。

### Action 清单

| 分类 | Action | 功能 | CDP 需求 |
|------|--------|------|---------|
| **观察 (7)** | `get_text` | 提取页面正文（30000 char 上限，分页） | 不需要 |
| | `get_metadata` | 轻量元数据（title/url/author/date） | 不需要 |
| | `find` | 页面内文本搜索（返回 excerpt + position） | 不需要 |
| | `get_selection` | 获取用户选中文本 | 不需要 |
| | `screenshot` | 页面截图 | 必须（后台截图不抢焦点） |
| | `read_network` | 读取网络请求 | 必须 |
| | `read_console` | 读取控制台日志 | 必须 |
| **交互 (6)** | `click` | 点击元素（CSS selector 或 NL description） | CDP 更好 |
| | `type` | 输入文本 | CDP 更好 |
| | `key` | 按键/快捷键 | CDP 更好 |
| | `scroll` | 滚动页面 | 不需要 |
| | `drag` | 拖拽元素 | 必须 |
| | `fill_form` | 设置表单字段值 | CDP 更好 |
| **控制 (4)** | `navigate` | 导航到 URL / back / forward | 不需要 |
| | `tab` | 标签页操作（switch/create/close/list） | 不需要 |
| | `wait` | 等待时间或元素出现 | 不需要 |
| | `execute_js` | 执行 JS（最后表达式作为返回值） | 不需要 |

**统计**：4 个必须 CDP，4 个 CDP 更好，9 个不需要。

观察 action 中的 `get_text` / `get_metadata` 复用 `src/lib/page-capture/` 统一抓取层（与 Web Clip / Spark 共享）。

### 元素定位

`click` / `fill_form` / `drag` 支持两种定位方式（二选一）：
- `selector`：CSS 选择器（精确，如 `button.submit`）
- `elementDescription`：自然语言描述（如 "the login button"），系统用页面结构匹配

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

> 完整参数 schema 见 `tool-definitions.md`。这里只列实现要点。

```typescript
const browserTool: AgentTool = {
  name: 'browser',
  description: '...', // 见 tool-definitions.md — CiC 质量标准
  parameters: Type.Object({
    action: StringEnum([
      // observation
      'get_text', 'get_metadata', 'find', 'get_selection', 'screenshot',
      'read_network', 'read_console',
      // interaction
      'click', 'type', 'key', 'scroll', 'drag', 'fill_form',
      // control
      'navigate', 'tab', 'wait', 'execute_js',
    ]),
    // observation params
    maxChars: Type.Optional(Type.Number()),
    textOffset: Type.Optional(Type.Number()),
    query: Type.Optional(Type.String()),
    // interaction params
    selector: Type.Optional(Type.String()),
    elementDescription: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    // ... 其余 action-specific params 见 tool-definitions.md
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 路由到具体实现：
    // 观察 action: get_text/get_metadata 通过 page-capture orchestrator
    // L0/L1 action: find/get_selection/scroll/navigate/execute_js 通过 Content Script
    // L2 action: screenshot/click/type/key/drag/read_network/read_console 通过 CDP
  }
}
```

---

## 分步实施建议

按价值和复杂度分批：

### Batch 1: 观察（最高价值，最低风险）

- `get_text` — 页面正文（复用 page-capture orchestrator）
- `get_metadata` — 轻量元数据
- `find` — 页面内搜索
- `get_selection` — 用户选中文本

只需 Content Script + page-capture 基础设施。**可以在 Phase 0 完成后立即开始**。

### Batch 2: 截图 + 基础交互

- `screenshot` — CDP 后台截图
- `click` — 点击元素（selector 或 NL description）
- `type` — 输入文本
- `scroll` — 滚动
- `navigate` — 导航
- `tab` — 标签页操作

需要 CDP attach/detach 生命周期管理。

### Batch 3: 深度交互

- `key` — 按键/快捷键
- `fill_form` — 批量表单填写
- `drag` — 拖拽
- `wait` — 等待条件
- `execute_js` — JS 执行

### Batch 4: 调试

- `read_network` — 网络请求读取
- `read_console` — 控制台日志

---

## 文件变更

| Action | File | Scope |
|--------|------|-------|
| **Create** | `src/lib/ai-tools/browser-tool.ts` | browser tool 定义 + 17 action 路由 (~200 行) |
| **Create** | `src/lib/ai-tools/browser-actions/screenshot.ts` | CDP screenshot |
| **Create** | `src/lib/ai-tools/browser-actions/click.ts` | click (CS + CDP) |
| **Create** | `src/lib/ai-tools/browser-actions/type.ts` | type (CS + CDP) |
| **Create** | `src/lib/ai-tools/browser-actions/...` | 其余 actions |
| **Create** | `src/lib/ai-tools/cdp-manager.ts` | CDP attach/detach 生命周期 (~100 行) |
| **Modify** | `src/entrypoints/background/index.ts` | CDP 消息处理 + attach/detach |
| **Modify** | `src/entrypoints/content/index.ts` | browser tool 消息处理 |
| **Modify** | `wxt.config.ts` | 声明 `debugger` 权限 |
| **Modify** | `src/lib/ai-service.ts` | 注册 browser tool |
| **Create** | `tests/vitest/browser-tool.test.ts` | browser tool 测试 |

---

## Exact Behavior

### page.get_text（Batch 1 核心）

```
GIVEN 用户在浏览某个网页
  AND Chat 已打开
WHEN 用户输入 "读取当前页面的内容"
THEN agent 先调用 page.get_metadata（轻量，了解页面类型）
  AND agent 调用 page.get_text（提取正文，30000 char 上限）
  AND page-capture orchestrator 提取结构化文本
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

1. Chat 中输入"读取当前页面" → `page.get_metadata` + `page.get_text` 返回页面内容
2. `page.find` 搜索页面文本 → 返回匹配 excerpt + position
3. `screenshot` 返回可用的 base64 图片
4. CDP attach/detach 生命周期正确（任务完成后 detach）
5. 用户切换标签页后 agent 仍能操作目标页面（CDP 后台）
6. `npm run typecheck && npm run test:run && npm run build` 全过

---

## 提交策略

1. `feat: browser tool — get_text + get_metadata + find + get_selection (Content Script + page-capture)`
2. `feat: CDP manager — attach/detach lifecycle for debugger API`
3. `feat: browser tool — screenshot + click + type + scroll + navigate + tab (CDP)`
4. `feat: browser tool — key + fill_form + drag + wait + execute_js`
5. `feat: browser tool — read_network + read_console (CDP debug)`
6. `test: browser tool unit tests`

---

## Out of Scope

- ReAct 自动化工作流编排 → Phase 4 (subagent)
- CDP Clip 增强（动态页面内容提取）→ Phase 2 可选依赖
- 跨标签页操作编排 → Phase 4
- 页面操作录制/回放 → 未排期

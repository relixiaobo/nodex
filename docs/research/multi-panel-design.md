# 多面板架构设计

> 日期：2026-03-10
> 状态：设计稿，待排期
> 关联：`ai-strategy.md` §6 共享画板、§10 Chat 交互形态

---

## 一、背景

### 现状

soma 当前是**单面板栈**导航：

```
ui-store.ts:
  panelHistory: string[]    // 线性节点 ID 列表
  panelIndex: number        // 当前位置指针
  navigateTo() → 截断前进历史 + push
  goBack() / goForward() → 移动指针
```

PanelStack.tsx 只渲染 `panelHistory[panelIndex]` 对应的一个面板。

### 为什么需要多面板

1. **AI Chat 需要独立面板** — ai-strategy.md v5 确定了"输入分离"模型：Node 输入在 outliner 上，AI 指令通过 Chat。Chat 需要一个独立区域
2. **跨节点操作** — 用户经常需要同时看两个节点（如从 A 拖字段到 B、对比两个 schema）
3. **宽屏利用** — Side Panel 可以拉到 700px+，甚至未来独立窗口/Web 版，单面板浪费空间

### Tana 参考

Tana 的多面板有以下关键行为（实测）：

- **Back/Forward 是全局的**，不是 per-panel — "打开新面板"本身是一个导航事件，Back 可以关闭它
- **Cmd+Z / Cmd+Shift+Z 是全局的** — 数据操作历史不分面板
- 顶部 tab 栏可以切换/关闭面板
- 面板宽度可拖拽调整

---

## 二、设计

### 核心概念

```
PanelLayout
  ├── panels: Panel[]           // 当前打开的面板列表（有序）
  │     ├── Panel { id, type: 'node', nodeId }
  │     ├── Panel { id, type: 'chat' }
  │     └── Panel { id, type: 'node', nodeId }
  ├── activePanelId: string     // 当前活跃面板（接收键盘事件）
  └── widths: number[]          // 各面板宽度比例
```

```
NavigationEvent（全局导航栈的条目）
  ├── { action: 'navigate', panelId, fromNodeId, toNodeId }
  ├── { action: 'open-panel', panelId, nodeId, position }
  ├── { action: 'close-panel', panelId, snapshot }
  └── { action: 'open-chat' }   // AI Chat 面板
```

Back/Forward 操作全局导航栈，自动处理面板的打开/关闭。

### 响应式布局

**核心原则：面板不销毁，只变形态。宽=并排，窄=Tab。**

```
宽屏（>900px）: 多面板并排
┌────────┬────────┬────────┐
│ Node A │ Node B │  Chat  │
└────────┴────────┴────────┘

中屏（500-900px）: 双面板并排
┌─────────┬─────────┐
│  Node   │  Chat   │  ← 或两个 Node 面板
└─────────┴─────────┘

窄屏（≤500px）: Tab 模式 + Chat 抽屉
┌──────────────────────┐
│ [Node A] [Node B]    │  ← tab 栏，点击切换
├──────────────────────┤
│                      │
│   Node A (active)    │  ← 只显示活跃面板
│                      │
├──────────────────────┤
│ 💬 Chat drawer       │  ← 底部抽屉（可与 tab 共存）
└──────────────────────┘
```

### 宽→窄降级策略

当用户从宽拉窄，面板数超出当前宽度能容纳的上限时：

```
状态：3 个面板并排（Node A / Node B / Chat）
用户拉窄到 500px → 最多容纳 2 个面板

降级行为：
  1. Chat 面板 → 变为底部抽屉（Chat 的形态始终特殊）
  2. 多余的 Node 面板 → 折叠为 tab
  3. 活跃面板保持显示，其余面板变为 tab 栏中的标签
  4. 面板状态（展开、滚动位置）保留，切换回来时恢复

继续拉窄到 400px → 只能容纳 1 个面板
  1. 所有 Node 面板变为 tab
  2. 只显示活跃面板
  3. Chat 保持底部抽屉
```

**拉宽恢复**：反向操作——tab 自动变回并排面板，按之前的宽度比例恢复。

**关键约束**：
- 降级时**不关闭面板**（不产生 close-panel 导航事件）—— 这是布局变形，不是用户操作
- Tab 切换**不产生导航事件**—— 这是在已有面板间切换焦点，不是导航
- 只有用户主动关闭 tab（点 × 按钮）才产生 close-panel 导航事件

### Tab 栏设计

```
窄屏 tab 栏:
┌──────────────────────────────┐
│ [📄 Node A ×] [📄 Node B ×] │
└──────────────────────────────┘
  ↑ 活跃 tab 有下划线/高亮
  ↑ × 按钮关闭面板（产生导航事件）
  ↑ 点击非活跃 tab → 切换活跃面板
```

Tab 栏只在面板被折叠为 tab 时出现。宽屏所有面板并排时，不需要 tab 栏（面板自身的 header/breadcrumb 已经提供标识）。

**断点判断**：ResizeObserver 监听容器宽度，动态决定布局模式。

### Chat 面板的特殊性

Chat 面板和 Node 面板有几个区别：

| | Node 面板 | Chat 面板 |
|---|---|---|
| 数量 | 可以有多个 | 最多 1 个 |
| 内容 | 渲染节点树 | 对话式 UI |
| 持久化 | 记录在导航栈 | 可选（对话历史单独存储） |
| 位置 | 任意 | 窄屏 = 底部抽屉，宽屏 = 最右侧面板 |
| 触发 | 点击节点 / 导航 | ⌘K + 自然语言 / 点击 Chat 按钮 |

Chat 面板的结果（AI 创建/修改的节点）直接出现在 Node 面板的 outliner 上——Chat 是指令通道，Node 面板是画板。

### 触发方式与快捷键

**打开面板**：

| 触发方式 | 行为 | 快捷键 |
|---------|------|--------|
| 右键菜单 "Open in new panel" | 在新面板中打开该节点 | — |
| Alt+Click 节点 bullet/name | 在新面板中打开（快捷方式） | `⌥ Click` |
| 键盘快捷键 | 将当前选中/聚焦的节点在新面板中打开 | `⌘\` |
| 拖拽到面板边缘 | 拖节点到最右侧 → 创建新面板显示该节点 | — |

**关闭面板**：

| 触发方式 | 行为 | 快捷键 |
|---------|------|--------|
| 面板 header 的 × 按钮 | 关闭当前面板 | — |
| Tab 栏的 × 按钮（窄屏） | 同上 | — |
| 键盘快捷键 | 关闭当前活跃面板（不关闭最后一个） | `⌘W` |
| Back 导航 | 如果上一个导航事件是 open-panel → 关闭面板 | `⌘[` |

**面板切换**：

| 触发方式 | 行为 | 快捷键 |
|---------|------|--------|
| 点击面板区域 | 该面板变为活跃面板 | — |
| 点击 tab（窄屏） | 切换到该面板 | — |
| 键盘快捷键 | 切换到左/右面板 | `⌘⌥←` / `⌘⌥→` |

**Chat 面板**：

| 触发方式 | 行为 | 快捷键 |
|---------|------|--------|
| ⌘K → AI 指令 | 打开 Chat + 发送指令 | `⌘K` |
| 专用快捷键 | 切换 Chat 面板显示/隐藏 | `⌘L`（首选）或 `⌘⇧L`（备选） |

> `⌘L` 是 Cursor / Windsurf 等 AI 产品的事实标准。但 Chrome 会用 `⌘L` 聚焦地址栏——需实测 Side Panel 有焦点时能否拦截。如果被 Chrome 吃掉，退到 `⌘⇧L`。

### 已有代码触发点

`NodeContextMenu.tsx` 是 "Open in new panel" 的自然位置。当前菜单结构（行 383-436）：

```
View section       → Sort / Filter / Group
Link               → Copy node link
Clipboard          → Copy / Cut / Duplicate / Move to
Node attributes    → Add tag / Checkbox / Description
Danger             → Delete
```

"Open in new panel" 应加在**最顶部**（View section 之前），因为它是面板级操作，优先级高于节点内操作：

```
Panel              → Open in new panel     ⌘\       ← 新增
View section       → Sort / Filter / Group
...
```

同时，bullet/name 区域的点击行为需要扩展：
- 现有：Click → 聚焦/编辑，Cmd+Click → 导航进入
- 新增：**Alt+Click → 在新面板中打开**

---

## 三、分阶段实施

### Phase 1：Chat 抽屉（v0.2，AI 上线时）

**目标**：最小化改动，给 AI Chat 一个家。

**改动范围**：

```
新增：
  src/components/chat/
    ChatDrawer.tsx          // 底部抽屉容器（窄屏覆盖，宽屏并排）
    ChatInput.tsx           // 输入框 + 发送
    ChatMessages.tsx        // 对话消息列表
    ChatBubble.tsx          // 单条消息（user / agent）

修改：
  src/entrypoints/sidepanel/App.tsx
    — 在 PanelStack 旁边加 ChatDrawer
    — ResizeObserver 判断宽度 → 抽屉模式 or 并排模式

  src/stores/ui-store.ts
    — 新增 chatOpen: boolean
    — 新增 toggleChat() / openChat() / closeChat()
    — ⌘K 中加 "Ask AI" 命令 → openChat()

不改：
  PanelStack.tsx           // 保持单面板栈不变
  panelHistory             // 不改导航模型
```

**交互**：
- 窄屏：Chat 是底部抽屉，高度可拖拽（1/3 到 2/3 屏幕），点击外部或下拉关闭
- 宽屏（>500px）：Chat 固定在右侧，占 40% 宽度，Node 面板占 60%
- ⌘K 输入自然语言时，如果匹配到 AI 指令模式，自动打开 Chat 并发送

**这一步不改导航模型**——Chat 不进入 panelHistory，它是一个独立的 overlay/sidebar。

### Phase 2：多面板导航（v0.3）

**目标**：支持 N 个 Node 面板并排，全局 Back/Forward。

**改动范围**：

```
重构：
  src/stores/ui-store.ts
    — panelHistory: string[] → navHistory: NavigationEvent[]
    — navIndex: number
    — panels: Panel[]（当前打开的面板列表）
    — activePanelId: string
    — navigateTo(nodeId, panelId?) → 在指定面板内导航
    — openPanel(nodeId, position?) → 打开新面板（记录到 navHistory）
    — closePanel(panelId) → 关闭面板（记录到 navHistory）
    — goBack() → 回退导航事件（可能关闭面板/导航回上一节点）
    — goForward() → 前进

  src/components/panel/PanelStack.tsx → PanelLayout.tsx
    — 渲染 panels 数组（flex 布局）
    — 每个面板独立的 header（breadcrumb + 关闭按钮）
    — 面板间拖拽分隔线调整宽度

新增：
  src/components/panel/PanelTab.tsx     // 顶部 tab 条（面板切换/关闭）
  src/components/panel/PanelDivider.tsx // 面板间拖拽分隔线

修改：
  src/components/outliner/NodeContextMenu.tsx
    — 菜单顶部新增 "Open in new panel"（⌘\）
    — 调用 ui-store.openPanel(nodeId)

  src/components/outliner/OutlinerItem.tsx
    — Alt+Click bullet/name → openPanel(nodeId)

  src/stores/ui-store.ts
    — expandedNodes: Set<string>
      键从 "parentId:nodeId" 扩展为 "panelId:parentId:nodeId"（per-panel 展开状态）
    — focusedNodeId / selectedNodeId
      加 panelId 上下文（焦点/选中是 per-panel 的）
    — 拖拽（dragNodeId / dropTargetId）
      支持跨面板拖拽

  全局键盘监听（use-keyboard.ts 或 App.tsx）
    — ⌘\ → openPanel（当前选中节点）
    — ⌘W → closePanel（当前活跃面板）
    — ⌘⌥← / ⌘⌥→ → 切换活跃面板
    — ⌘L（或 ⌘⇧L）→ toggleChat
```

**导航栈数据结构**：

```typescript
type NavigationEvent =
  | { action: 'navigate'; panelId: string; fromNodeId: string; toNodeId: string }
  | { action: 'open-panel'; panelId: string; nodeId: string; insertIndex: number }
  | { action: 'close-panel'; panelId: string; snapshot: PanelSnapshot }
  | { action: 'open-chat' }
  | { action: 'close-chat' };

interface PanelSnapshot {
  nodeId: string;
  // 关闭面板时保存快照，Back 时恢复
}
```

**goBack() 逻辑**：

```
读取 navHistory[navIndex]:
  如果是 'navigate' → 将该面板导航回 fromNodeId
  如果是 'open-panel' → 关闭该面板（恢复到打开前的状态）
  如果是 'close-panel' → 重新打开面板（从 snapshot 恢复）
  如果是 'open-chat' → 关闭 Chat
navIndex--
```

### Phase 3：宽屏/独立窗口优化（v1.0+）

- Tab 栏（类似 Tana 截图中的顶部 tab）
- 面板可拖拽排序
- 面板可最大化/最小化
- 保存面板布局到 chrome.storage（恢复上次布局）

---

## 四、状态管理影响

### Per-panel 状态 vs 全局状态

| 状态 | 现在 | Phase 2 后 | 理由 |
|------|------|-----------|------|
| panelHistory / navIndex | 全局 | 全局（改为 NavigationEvent[]） | Tana 实测：全局 Back/Forward |
| expandedNodes | 全局 Set | per-panel（key 加 panelId 前缀） | 同一节点在两个面板可以不同展开状态 |
| focusedNodeId | 全局 | per-panel（activePanelId 决定谁有焦点） | 只有活跃面板接收键盘事件 |
| selectedNodeId | 全局 | per-panel | 选中是面板内的概念 |
| selectedNodeIds（多选） | 全局 | per-panel | 多选不跨面板 |
| dragNodeId | 全局 | 全局 | 拖拽跨面板 |
| dropTargetId | 全局 | 全局 | 拖拽跨面板 |
| searchOpen / searchQuery | 全局 | 全局 | ⌘K 是全局的 |
| Cmd+Z / Cmd+Shift+Z | 全局（Loro） | 全局（Loro） | Tana 实测：全局 undo |

### expandedNodes key 格式演变

```
Phase 0（现在）: "parentId:nodeId"
Phase 2（多面板）: "panelId:parentId:nodeId"

迁移：读取旧格式时，默认 panelId = "main"
```

---

## 五、关键约束

### Chrome Side Panel 约束

- 用户可以拖拽 Side Panel 宽度（300-700px+），但**代码无法控制宽度**
- 需要 ResizeObserver 监听实际宽度，响应式切换布局模式
- Side Panel 可能被用户突然收窄 → 多面板降级为 tab 模式（面板不销毁，只变形态）

### 面板数量 vs 并排显示数

面板的"存在"和"并排显示"是两个概念：

- 用户可以打开 5 个面板——它们始终存在
- 容器宽度决定有几个**并排显示**，其余折叠为 tab
- 窄屏（≤500px）：并排 1 个，其余为 tab + Chat 底部抽屉
- 中屏（500-900px）：并排 2 个
- 宽屏（>900px）：并排 3 个
- 超宽/独立窗口：不限制

### 跨面板拖拽

- 从 A 面板拖一个节点到 B 面板的某个位置 = `moveNode(nodeId, newParentId)`
- 拖拽进行时两个面板都需要高亮 drop target
- 现有的 `dragNodeId` / `dropTargetId` / `dropPosition` 已经是全局的，天然支持

---

## 六、与 AI Chat 的关系

Phase 1 的 Chat 抽屉是 AI 上线的前提——没有 Chat 面板，ai-strategy.md v5 的"Chat 指令驱动"就没有载体。

```
用户按 ⌘K → 输入 "帮我整理今天的笔记"
  → 检测到 AI 指令（非普通搜索/导航）
  → 打开 Chat 面板 / 聚焦 Chat 抽屉
  → 发送指令，Chat 中显示对话
  → AI 在 Node 面板的 outliner 上执行操作
  → 用户在 Node 面板看到结果
```

Chat 面板不需要 outliner 渲染能力——它是纯对话 UI。AI 的输出通过 node-store 操作直接反映在 Node 面板上。

---

## 七、测试要点

- 窄屏下 Chat 抽屉的打开/关闭/拖拽高度
- 宽屏下 Chat 面板与 Node 面板的并排布局
- 用户突然收窄 Side Panel 时的降级行为
- Back/Forward 正确处理面板打开/关闭事件
- 跨面板拖拽节点
- per-panel expandedNodes 独立性
- Cmd+Z 跨面板操作的全局 undo
- Chat 指令的结果实时反映在 Node 面板

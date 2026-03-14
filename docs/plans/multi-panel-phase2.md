# Multi-Panel Phase 2: 实施计划

> 日期：2026-03-14
> 状态：已确认
> 基础：`docs/research/multi-panel-design.md`（设计稿）
> 前置：Desk/Card Z 轴布局（已完成，commit `d8cdd92`）

---

## 目标

支持 N 个 Node 面板并排，全局 Back/Forward，窄屏自动降级为 Tab 模式。

## 设计决策

| 决策 | 结论 | 原因 |
|------|------|------|
| 导航模型 | 全局 `navHistory` 事件栈 | 单一时间线撤销符合直觉：Back 依次回退所有操作 |
| Back 跨面板 | 自动切换 activePanelId 到受影响面板 | 用户按 Back 必须看到变化，不能静默改非活跃面板 |
| Chat 事件 | 不进 `navHistory` | Chat 是桌面层工具，混入面板导航会导致 Back 时意外开关 Chat |
| Per-panel 展开 | v1 就做 | 同节点在不同面板独立展开更符合直觉 |
| persist 迁移 | 一次 v3→v4 | 避免中间版本，expandedNodes key 变化一起做 |
| 切换面板时 focus | 旧面板 blur（保存内容、清光标、清选区） | 同一时间只有一个编辑焦点 |
| ⌘Z | 全局数据撤销（Loro） | 不受面板影响 |
| 方向键/编辑键 | 作用于 activePanelId 面板 | 键盘事件跟随焦点面板 |
| 面板数量 | 不设上限 | 用户觉得太窄会自行关闭，无需强制限制 |
| 全局工具位置 | Back/Forward/Search 保持桌面层 | 全局工具不属于任何面板，桌面层是正确的 Z 层级 |
| 关闭面板快捷键 | 不用 ⌘W（会被 Chrome 拦截关闭标签页） | 需要选择不与 Chrome 冲突的快捷键 |

## 当前状态

```
ui-store.ts:
  panelHistory: string[]        // 线性节点 ID 列表
  panelIndex: number            // 当前位置指针
  expandedNodes: Set<string>    // key = "parentId:nodeId"
  focusedNodeId / selectedNodeId  // 全局单一

PanelStack.tsx:
  渲染 panelHistory[panelIndex] 对应的一个面板

DeskLayout.tsx:
  NodePanel card (PanelStack) + Chat desk surface
```

## 目标状态

```
ui-store.ts:
  panels: Panel[]               // 当前打开的面板列表
  activePanelId: string         // 接收键盘事件的面板
  navHistory: NavigationEvent[] // 全局导航事件栈（不含 Chat）
  navIndex: number              // 全局导航指针
  expandedNodes: Set<string>    // key = "panelId:parentId:nodeId"
  focusedNodeId / selectedNodeId  // 切换面板时自动清除

PanelLayout.tsx:
  渲染 panels 数组，每个面板独立 header + close 按钮
  面板间 resize handle

DeskLayout.tsx:
  PanelLayout card(s) + Chat desk surface
  窄屏：Tab 栏 + 单面板显示
```

---

## 分步实施

### Step 1: 数据模型 + 迁移（ui-store）

**目标**：替换 panelHistory → panels + navHistory + per-panel expandedNodes，保持现有 UI 不变。

**修改文件**：
- `src/stores/ui-store.ts` — 核心数据模型
- `src/types/index.ts` — 新增 Panel / NavigationEvent 类型

**新增类型**：
```typescript
interface Panel {
  id: string;           // nanoid
  type: 'node';
  nodeId: string;       // 当前显示的节点
  history: string[];    // 面板内导航历史（用于 NavigationEvent 记录 fromNodeId）
  historyIndex: number; // 面板内历史指针
}

type NavigationEvent =
  | { action: 'navigate'; panelId: string; fromNodeId: string; toNodeId: string }
  | { action: 'open-panel'; panelId: string; nodeId: string; insertIndex: number }
  | { action: 'close-panel'; panelId: string; snapshot: Panel };
```

**新增 state**：
```typescript
panels: Panel[];
activePanelId: string;
navHistory: NavigationEvent[];
navIndex: number;
```

**expandedNodes key 格式变化**：
```
旧：  "parentId:nodeId"
新：  "panelId:parentId:nodeId"
```

**persist v3 → v4 迁移**：
- 读取旧 `panelHistory[panelIndex]` → 生成单个 Panel `{ id: 'main', nodeId, history: panelHistory, historyIndex: panelIndex }`
- 旧 expandedNodes key 加 `main:` 前缀
- `selectCurrentNodeId` 改为读 `panels.find(p => p.id === activePanelId)?.nodeId`
- 旧 `navigateTo(nodeId)` 内部改为操作 active panel 的 history + push NavigationEvent
- `goBack()` / `goForward()` 改为操作 `navHistory` + `navIndex`

**focus/selection 切换规则**：
- `setActivePanel(panelId)` 时自动清除 `focusedNodeId`、`selectedNodeId`、`selectedNodeIds`
- 保证同一时间只有一个面板有编辑焦点

**兼容性**：
- 外部调用 `navigateTo(nodeId)` 签名不变（默认操作 active panel）
- `selectCurrentNodeId` 返回值不变
- 整个 Step 1 完成后，UI 看起来跟之前一模一样（单面板）

**清理**：
- 移除旧 `navUndoStack` / `navRedoStack`（被 `navHistory` + `navIndex` 替代）

**验证**：typecheck → test-sync → test → build → 浏览器验证导航/back/forward 正常

---

### Step 2: PanelLayout 多面板渲染

**目标**：DeskLayout 中的 PanelStack 替换为 PanelLayout，支持渲染 N 个面板。

**修改文件**：
- `src/components/panel/PanelLayout.tsx` — 新建，替代 PanelStack
- `src/components/panel/PanelHeader.tsx` — 新建，每面板的 header（breadcrumb + close）
- `src/components/layout/DeskLayout.tsx` — 引用 PanelLayout 替代 PanelStack
- `src/components/toolbar/TopToolbar.tsx` — PanelTab 适配多面板
- `src/components/panel/NodePanel.tsx` — 接收 panelId prop
- `src/components/panel/AppPanel.tsx` — 接收 panelId prop
- `src/components/outliner/OutlinerView.tsx` — 接收 panelId prop
- `src/components/outliner/OutlinerItem.tsx` — 接收 panelId prop，构建 `panelId:parentId:nodeId` expandKey

**PanelLayout 结构**：
```tsx
<div className="flex flex-1 overflow-hidden">
  {panels.map((panel, i) => (
    <Fragment key={panel.id}>
      {i > 0 && <PanelDivider onPointerDown={...} />}
      <div className="flex flex-col flex-1 min-w-0" onClick={() => setActivePanel(panel.id)}>
        <PanelHeader panel={panel} isActive={panel.id === activePanelId} onClose={...} />
        {panel.type === 'node' ? <NodePanel nodeId={panel.nodeId} panelId={panel.id} /> : <AppPanel panelId={panel.nodeId} />}
      </div>
    </Fragment>
  ))}
</div>
```

**PanelHeader**：
- Breadcrumb（复用现有 Breadcrumb 组件）
- Close 按钮（×，面板数 > 1 时显示）
- Active 面板指示器（底部 2px primary 色线）

**panelId 传递链**：
```
PanelLayout → NodePanel(panelId) → OutlinerView(panelId) → OutlinerItem(panelId)
  → expandKey = `${panelId}:${parentId}:${nodeId}`
```

**面板间 resize**：
- 复用 `useChatResize` 的 pointer 事件模式
- 新建 `usePanelResize` hook，管理 `panelWidths: number[]` 百分比数组

**DeskLayout 变化**：
- 宽屏：`<PanelLayout />` 替换 `<PanelStack />`，整个 PanelLayout 在 card 内
- 窄屏：PanelLayout 渲染单个 active panel（其余隐藏），加 Tab 栏

**验证**：typecheck → test → build → 浏览器验证单面板渲染不变

---

### Step 3: 导航 actions + 触发方式

**目标**：支持打开和关闭面板，用户可通过多种方式触发。

**修改文件**：
- `src/stores/ui-store.ts` — 新增 actions
- `src/components/outliner/OutlinerItem.tsx` — Alt+Click
- `src/components/outliner/NodeContextMenu.tsx` — 右键菜单
- `src/lib/shortcut-registry.ts` — 注册新快捷键
- `src/hooks/use-panel-keyboard.ts` — 新建，Cmd+\ / Cmd+Shift+W / Cmd+Option+←/→

**新增 actions**：
```typescript
openPanel(nodeId: string, insertIndex?: number): void
  // 1. 创建新 Panel { id: nanoid(), nodeId, history: [nodeId], historyIndex: 0 }
  // 2. 插入到 panels 数组的 insertIndex（默认末尾）
  // 3. 清除旧面板 focus/selection
  // 4. 设 activePanelId = 新面板
  // 5. push NavigationEvent { action: 'open-panel', ... } 到 navHistory

closePanel(panelId: string): void
  // 1. 不允许关闭最后一个面板
  // 2. 保存 snapshot（完整 Panel 对象）
  // 3. 从 panels 移除
  // 4. activePanelId 转移到相邻面板
  // 5. push NavigationEvent { action: 'close-panel', ... }

setActivePanel(panelId: string): void
  // 1. 清除 focusedNodeId / selectedNodeId / selectedNodeIds
  // 2. 设 activePanelId（不产生导航事件）
```

**goBack() / goForward() 改造**：
```
读取 navHistory[navIndex]:
  'navigate'    → 将该面板导航回 fromNodeId（更新 panel.nodeId）
  'open-panel'  → 关闭该面板（从 panels 移除，恢复 activePanelId）
  'close-panel' → 从 snapshot 恢复面板（重新插入 panels）
navIndex-- / navIndex++

关键：如果事件涉及的面板不是当前 activePanelId，
自动切换 activePanelId 到该面板（让用户看到变化）
```

**触发方式**：

| 触发 | 行为 | 实现位置 |
|------|------|----------|
| Alt+Click bullet | 在新面板打开 | OutlinerItem `handleBulletClick` 检测 `e.altKey` |
| 右键 → "Open in new panel" | 在新面板打开 | NodeContextMenu 顶部新增菜单项 |
| `⌘\` | 将选中/聚焦节点在新面板打开 | use-panel-keyboard hook |
| `⌘⇧W` | 关闭当前活跃面板（不关最后一个） | use-panel-keyboard hook（⌘W 被 Chrome 拦截） |
| `⌘⌥←` / `⌘⌥→` | 切换活跃面板 | use-panel-keyboard hook |
| 点击面板区域 | 该面板变为活跃 | PanelLayout onClick |

**验证**：typecheck → test → build → 浏览器验证每种触发方式

---

### Step 4: 窄屏 Tab 栏

**目标**：窄屏时面板折叠为 Tab，只显示活跃面板。

**修改文件**：
- `src/components/panel/PanelTabBar.tsx` — 新建
- `src/components/layout/DeskLayout.tsx` — 窄屏时渲染 Tab 栏

**Tab 栏设计**：
```
┌──────────────────────────────────────┐
│ [Today ×] [Schema ×]                │ ← Tab 栏（1 个面板时不显示）
├──────────────────────────────────────┤
│ Active panel content                 │
└──────────────────────────────────────┘
```

- 复用 Chrome-tab 样式（`tab-connector-right`、`bg-background rounded-t-xl`）
- Active tab 白底（card 色），非 active tab 桌面色 + hover
- × 按钮关闭面板（产生导航事件）
- Tab 宽度自适应（`max-w-[180px]`，多 tab 时收缩）

**响应式降级**：
- 宽屏 (>900px)：面板并排显示
- 中屏 (500-900px)：面板并排显示（用户自行决定数量）
- 窄屏 (≤500px)：Tab 模式，只显示活跃面板
- 降级时不关闭面板，只变形态
- 不设面板数量上限，用户觉得太窄会自行关闭

**验证**：typecheck → test → build → 浏览器验证窄屏/宽屏切换

---

## 文件清单总览

| 类别 | 文件 | 操作 | Step |
|------|------|------|------|
| 类型 | `src/types/index.ts` | 修改（新增 Panel / NavigationEvent） | 1 |
| Store | `src/stores/ui-store.ts` | 重构（核心，最大改动） | 1, 3 |
| 布局 | `src/components/layout/DeskLayout.tsx` | 修改 | 2, 4 |
| 面板 | `src/components/panel/PanelLayout.tsx` | 新建 | 2 |
| 面板 | `src/components/panel/PanelHeader.tsx` | 新建 | 2 |
| 面板 | `src/components/panel/PanelTabBar.tsx` | 新建 | 4 |
| 面板 | `src/components/panel/PanelStack.tsx` | 删除（被 PanelLayout 替代） | 2 |
| Hook | `src/hooks/use-panel-resize.ts` | 新建 | 2 |
| Hook | `src/hooks/use-panel-keyboard.ts` | 新建 | 3 |
| 工具栏 | `src/components/toolbar/TopToolbar.tsx` | 修改 | 2 |
| 大纲 | `src/components/outliner/OutlinerItem.tsx` | 修改（panelId prop + Alt+Click） | 2, 3 |
| 大纲 | `src/components/outliner/OutlinerView.tsx` | 修改（panelId prop） | 2 |
| 面板 | `src/components/panel/NodePanel.tsx` | 修改（panelId prop） | 2 |
| 面板 | `src/components/panel/AppPanel.tsx` | 修改（panelId prop） | 2 |
| 菜单 | `src/components/outliner/NodeContextMenu.tsx` | 修改 | 3 |
| 快捷键 | `src/lib/shortcut-registry.ts` | 修改 | 3 |
| 命令面板 | `src/lib/palette-commands.ts` | 修改（navigateTo 适配） | 1 |

## 风险与注意事项

1. **ui-store 是高风险文件** — 改动最大，需要格外小心 persist 迁移
2. **expandedNodes 迁移** — 用户可能有大量展开状态，旧 key 加 `main:` 前缀需无损
3. **OutlinerItem panelId 传递** — 深层递归组件树，逐层传递 prop（不用 context，保持显式）
4. **Loro undo/redo 不受面板影响** — ⌘Z 始终是全局数据撤销，不是面板导航撤销
5. **navHistory 边界情况** — goBack 时目标面板已被关闭？目标节点已被删除？需要 graceful fallback
6. **44 个文件引用 selectCurrentNodeId** — 大部分不需要改（它们只关心"当前看的节点"），但 `ai-context.ts`、`ai-spark.ts` 等可能需要感知多面板

## 建议执行方式

Step 1-2 紧耦合（数据模型 + 渲染 + panelId 穿透），由 **Claude dev** 整体执行。
Step 3（actions + triggers）可由 **Codex dev** 执行。
Step 4（Tab 栏）由 **Claude dev** 或 **Gemini dev** 执行。

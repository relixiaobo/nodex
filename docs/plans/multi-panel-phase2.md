# Multi-Panel Phase 2: 实施计划

> 日期：2026-03-14
> 状态：待确认
> 基础：`docs/research/multi-panel-design.md`（设计稿）
> 前置：Desk/Card Z 轴布局（已完成，commit `d8cdd92`）

---

## 目标

支持 N 个 Node 面板并排，全局 Back/Forward，窄屏自动降级为 Tab 模式。

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
  navHistory: NavigationEvent[] // 全局导航事件栈
  navIndex: number              // 全局导航指针
  expandedNodes: Set<string>    // key = "panelId:parentId:nodeId"
  focusedNodeId / selectedNodeId  // 配合 activePanelId 使用

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

**目标**：替换 panelHistory → panels + navHistory，保持现有 UI 不变。

**修改文件**：
- `src/stores/ui-store.ts` — 核心数据模型
- `src/types/index.ts` — 新增 Panel / NavigationEvent 类型

**新增类型**：
```typescript
interface Panel {
  id: string;           // nanoid
  type: 'node';
  nodeId: string;       // 当前显示的节点
  history: string[];    // 面板内导航历史
  historyIndex: number; // 面板内历史指针
}

type NavigationEvent =
  | { action: 'navigate'; panelId: string; fromNodeId: string; toNodeId: string }
  | { action: 'open-panel'; panelId: string; nodeId: string; insertIndex: number }
  | { action: 'close-panel'; panelId: string; snapshot: { nodeId: string; history: string[]; historyIndex: number } }
  | { action: 'open-chat' }
  | { action: 'close-chat' };
```

**新增 state**：
```typescript
panels: Panel[];
activePanelId: string;
navHistory: NavigationEvent[];
navIndex: number;
```

**迁移策略**：
- persist v3 → v4：读取旧 `panelHistory[panelIndex]` → 生成单个 Panel `{ id: 'main', nodeId: currentNodeId, history: panelHistory, historyIndex: panelIndex }`
- `selectCurrentNodeId` 改为读 `panels.find(p => p.id === activePanelId)?.nodeId`
- 旧 `navigateTo(nodeId)` 内部改为操作 `activePanelId` 对应面板的 history
- `goBack()` / `goForward()` 改为操作 `navHistory` + `navIndex`

**兼容性**：
- 外部调用 `navigateTo(nodeId)` 签名不变（默认操作 active panel）
- `selectCurrentNodeId` 返回值不变
- 整个 Step 1 完成后，UI 看起来跟之前一模一样（单面板）

**验证**：typecheck → test-sync → test → build → 浏览器验证导航/back/forward 正常

---

### Step 2: PanelLayout 多面板渲染

**目标**：DeskLayout 中的 PanelStack 替换为 PanelLayout，支持渲染 N 个面板。

**修改文件**：
- `src/components/panel/PanelLayout.tsx` — 新建，替代 PanelStack
- `src/components/panel/PanelHeader.tsx` — 新建，每面板的 header（breadcrumb + close）
- `src/components/layout/DeskLayout.tsx` — 引用 PanelLayout 替代 PanelStack
- `src/components/toolbar/TopToolbar.tsx` — PanelTab 适配多面板

**PanelLayout 结构**：
```tsx
<div className="flex flex-1 overflow-hidden">
  {panels.map((panel, i) => (
    <Fragment key={panel.id}>
      {i > 0 && <PanelDivider onPointerDown={...} />}
      <div className="flex flex-col flex-1 min-w-0" onClick={() => setActivePanel(panel.id)}>
        <PanelHeader panel={panel} isActive={panel.id === activePanelId} onClose={...} />
        {panel.type === 'node' ? <NodePanel nodeId={panel.nodeId} /> : <AppPanel panelId={panel.nodeId} />}
      </div>
    </Fragment>
  ))}
</div>
```

**PanelHeader**：
- Breadcrumb（复用现有 Breadcrumb 组件）
- Close 按钮（×，面板数 > 1 时显示）
- Active 面板指示器（底部 2px primary 色线）

**面板间 resize**：
- 复用 `useChatResize` 的 pointer 事件模式
- 新建 `usePanelResize` hook，管理 `panelWidths: number[]` 百分比数组

**DeskLayout 变化**：
- 宽屏：`<PanelLayout />` 替换 `<PanelStack />`，整个 PanelLayout 在 card 内
- 窄屏：PanelLayout 渲染单个 active panel（其余隐藏），加 Tab 栏

**验证**：typecheck → test → build → 浏览器验证单面板渲染不变

---

### Step 3: 导航 actions（openPanel / closePanel）

**目标**：支持打开和关闭面板，全局 back/forward 处理面板事件。

**修改文件**：
- `src/stores/ui-store.ts` — 新增 actions

**新增 actions**：
```typescript
openPanel(nodeId: string, insertIndex?: number): void
  // 1. 创建新 Panel { id: nanoid(), nodeId, history: [nodeId], historyIndex: 0 }
  // 2. 插入到 panels 数组的 insertIndex（默认末尾）
  // 3. 设 activePanelId = 新面板
  // 4. push NavigationEvent { action: 'open-panel', ... } 到 navHistory

closePanel(panelId: string): void
  // 1. 不允许关闭最后一个面板
  // 2. 保存 snapshot（nodeId + history + historyIndex）
  // 3. 从 panels 移除
  // 4. activePanelId 转移到相邻面板
  // 5. push NavigationEvent { action: 'close-panel', ... }

setActivePanel(panelId: string): void
  // 切换活跃面板（不产生导航事件）
```

**goBack() / goForward() 改造**：
```
读取 navHistory[navIndex]:
  'navigate'    → 将该面板导航回 fromNodeId
  'open-panel'  → 关闭该面板（从 panels 移除，恢复 activePanelId）
  'close-panel' → 从 snapshot 恢复面板（重新插入 panels）
  'open-chat'   → 关闭 Chat
  'close-chat'  → 打开 Chat
navIndex-- / navIndex++
```

**验证**：typecheck → test → build → 控制台手动调用 `__uiStore.openPanel('someNodeId')` 验证

---

### Step 4: 触发方式

**目标**：用户可以通过多种方式打开新面板。

**修改文件**：
- `src/components/outliner/OutlinerItem.tsx` — Alt+Click
- `src/components/outliner/NodeContextMenu.tsx` — 右键菜单
- `src/lib/shortcut-registry.ts` — 注册新快捷键
- `src/hooks/use-panel-keyboard.ts` — 新建，Cmd+\ / Cmd+W / Cmd+Option+←/→

**触发方式**：

| 触发 | 行为 | 实现位置 |
|------|------|----------|
| Alt+Click bullet | 在新面板打开 | OutlinerItem `handleBulletClick` 检测 `e.altKey` |
| 右键 → "Open in new panel" | 在新面板打开 | NodeContextMenu 顶部新增菜单项 |
| `⌘\` | 将选中/聚焦节点在新面板打开 | use-panel-keyboard hook |
| `⌘W` | 关闭当前活跃面板（不关最后一个） | use-panel-keyboard hook |
| `⌘⌥←` / `⌘⌥→` | 切换活跃面板 | use-panel-keyboard hook |
| 点击面板区域 | 该面板变为活跃 | PanelLayout onClick |

**验证**：typecheck → test → build → 浏览器验证每种触发方式

---

### Step 5: 窄屏 Tab 栏

**目标**：窄屏时面板折叠为 Tab，只显示活跃面板。

**修改文件**：
- `src/components/panel/PanelTabBar.tsx` — 新建
- `src/components/layout/DeskLayout.tsx` — 窄屏时渲染 Tab 栏

**Tab 栏设计**：
```
┌──────────────────────────────────────┐
│ [📄 Today ×] [📄 Schema ×]          │ ← Tab 栏（cards 1 个时不显示）
├──────────────────────────────────────┤
│ Active panel content                 │
└──────────────────────────────────────┘
```

- 复用 Chrome-tab 样式（`tab-connector-right`、`bg-background rounded-t-xl`）
- Active tab 白底（card 色），非 active tab 桌面色 + hover
- × 按钮关闭面板（产生导航事件）
- Tab 宽度自适应（`max-w-[180px]`，多 tab 时收缩）

**响应式降级**：
- 宽屏 (>900px)：最多 3 面板并排
- 中屏 (500-900px)：最多 2 面板并排
- 窄屏 (≤500px)：Tab 模式，只显示 1 个
- 降级时不关闭面板，只变形态

**验证**：typecheck → test → build → 浏览器验证窄屏/宽屏切换

---

### Step 6: Per-panel 展开状态

**目标**：同一节点在不同面板可以有独立的展开/折叠状态。

**修改文件**：
- `src/stores/ui-store.ts` — expandedNodes key 格式变化
- `src/components/outliner/OutlinerItem.tsx` — 传入 panelId 构建 expandKey
- `src/components/outliner/OutlinerView.tsx` — 传入 panelId
- `src/components/panel/NodePanel.tsx` — 传入 panelId

**Key 格式迁移**：
```
旧：  "parentId:nodeId"
新：  "panelId:parentId:nodeId"
```

**迁移**：persist v4 → v5，旧 key 默认 panelId = 首个面板 ID。

**传递 panelId**：
```
NodePanel(panelId) → OutlinerView(panelId) → OutlinerItem(panelId)
  → expandKey = `${panelId}:${parentId}:${nodeId}`
```

**验证**：typecheck → test → build → 浏览器验证两个面板打开同一节点，独立展开

---

## 文件清单总览

| 类别 | 文件 | 操作 |
|------|------|------|
| 类型 | `src/types/index.ts` | 修改（新增 Panel / NavigationEvent） |
| Store | `src/stores/ui-store.ts` | 重构（核心，最大改动） |
| 布局 | `src/components/layout/DeskLayout.tsx` | 修改 |
| 面板 | `src/components/panel/PanelLayout.tsx` | 新建 |
| 面板 | `src/components/panel/PanelHeader.tsx` | 新建 |
| 面板 | `src/components/panel/PanelTabBar.tsx` | 新建 |
| 面板 | `src/components/panel/PanelStack.tsx` | 删除（被 PanelLayout 替代） |
| Hook | `src/hooks/use-panel-resize.ts` | 新建 |
| Hook | `src/hooks/use-panel-keyboard.ts` | 新建 |
| 工具栏 | `src/components/toolbar/TopToolbar.tsx` | 修改 |
| 大纲 | `src/components/outliner/OutlinerItem.tsx` | 修改（panelId prop + Alt+Click） |
| 大纲 | `src/components/outliner/OutlinerView.tsx` | 修改（panelId prop） |
| 面板 | `src/components/panel/NodePanel.tsx` | 修改（panelId prop） |
| 面板 | `src/components/panel/AppPanel.tsx` | 修改（panelId prop） |
| 菜单 | `src/components/outliner/NodeContextMenu.tsx` | 修改 |
| 快捷键 | `src/lib/shortcut-registry.ts` | 修改 |
| 命令面板 | `src/lib/palette-commands.ts` | 修改（navigateTo 适配） |

## 风险与注意事项

1. **ui-store 是高风险文件** — 改动最大，需要格外小心 persist 迁移
2. **expandedNodes 迁移** — 用户可能有大量展开状态，迁移要无损
3. **OutlinerItem panelId 传递** — 深层组件树，需要逐层传递或用 context
4. **Loro undo/redo 不受面板影响** — Cmd+Z 始终是全局数据撤销，不是面板导航撤销
5. **Back/Forward 语义变化** — 从"面板内历史回退"变为"全局导航事件回退"，用户需要适应
6. **persist 版本** — v3 → v4（Step 1）→ v5（Step 6），两次迁移

## 建议执行方式

- Step 1-2 由 **Claude dev** 执行（数据模型 + 渲染是紧耦合的核心逻辑）
- Step 3-4 可由 **Codex dev** 执行（actions + triggers 相对独立）
- Step 5-6 由 **Claude dev** 执行（响应式 + 状态迁移需要细致处理）

或者全部由一个 Agent 按顺序执行，每步一个 commit。

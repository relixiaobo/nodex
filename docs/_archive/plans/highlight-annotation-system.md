# 高亮 & 批注系统技术方案

> 2026-02-28 | nodex
>
> 基于 `docs/research/highlight-comment-design.md` 研究成果，结合产品讨论定稿。

---

## 1. 核心设计决策

### 1.1 架构定位

| 决策 | 选择 | 理由 |
|------|------|------|
| `#highlight` / `#comment` | **内置系统标签**（同 `#web_clip`） | 固定 ID 便于系统级识别、索引和 UI 特殊渲染 |
| 高亮存储位置 | **Library 容器** | 统一入口，clip page 内只保留 inline reference |
| 创建路径 | **两条并行路径** | A) soma 编辑器内 `# Tag` 浮动工具栏；B) Content Script 网页选中 |
| 批注模型 | highlight 节点的 **children** | 标准大纲层级，无需额外数据结构 |

### 1.2 数据流概览

```
                        ┌─────────────────────────────────────┐
                        │            LIBRARY 容器              │
                        │                                     │
                        │  Highlight Node (#highlight)        │
                        │  ├─ Source: ref → Clip Node          │
                        │  ├─ Anchor: JSON (锚点数据)          │
                        │  ├─ Color: yellow/green/blue/...    │
                        │  └─ children:                       │
                        │     └─ Comment Node (#comment)      │
                        │        └─ 批注文字                   │
                        └──────────────┬──────────────────────┘
                                       │
                            inline ref (⌇FFFC)
                                       │
                        ┌──────────────▼──────────────────────┐
                        │     Clip Node (#web_clip)            │
                        │     ├─ Source URL: https://...       │
                        │     ├─ 剪藏正文 children              │
                        │     └─ "...选中文本⌇..." ← inline ref │
                        └─────────────────────────────────────┘
```

**关键理解**：Highlight 的「主体」在 Library，Clip Page 中通过 inline reference 关联。两条创建路径产出相同的数据结构。

---

## 2. 系统标签定义

### 2.1 新增 SYS_T 常量

```typescript
// system-nodes.ts — SYS_T 新增
export const SYS_T = {
  // ... 现有 ...
  HIGHLIGHT: 'SYS_T200',   // #highlight 内置标签
  COMMENT: 'SYS_T201',     // #comment 内置标签
} as const;
```

ID 选择 `SYS_T200+`，与 Tana 原版 `SYS_T01-T157` 拉开间距，避免冲突。

### 2.2 #highlight Supertag 模板字段

| 字段名 | fieldType | 说明 |
|--------|-----------|------|
| Source | `plain` (node ref) | 指向 Clip Node 的引用（存 nodeId） |
| Anchor | `plain` | JSON 序列化的锚点定位数据 |
| Color | `options` | yellow / green / blue / pink / purple |
| Page URL | `url` | 来源页面 URL（冗余存储，方便查询） |

**为什么 Source 字段用 plain 存 nodeId 而非 `options_from_supertag`**：
- 引用关系是 1:1 的（一个 highlight 对应一个 clip page）
- 不需要下拉选择 UI，Source 字段对用户隐藏（`hideField: always`）
- 简化实现，避免引入 reference 字段类型的复杂度

**Anchor JSON 格式**（沿用研究文档设计）：

```typescript
interface HighlightAnchor {
  version: 1;
  exact: string;           // 高亮文本精确内容
  prefix: string;          // 前缀上下文（~32 字符）
  suffix: string;          // 后缀上下文（~32 字符）
  cssSelector?: string;    // CSS 选择器（快速定位容器）
  range?: {                // XPath 范围（精确 DOM 定位）
    startXPath: string;
    startOffset: number;
    endXPath: string;
    endOffset: number;
  };
  textPosition?: {         // 字符偏移（body.textContent 基准）
    start: number;
    end: number;
  };
}
```

### 2.3 #comment Supertag

`#comment` 标签极简——无模板字段。Comment 就是 highlight 的 child node，标上 `#comment` 以便系统识别和查询。

### 2.4 系统标签初始化

在 `initSystemTags()` 中（类似 `sys:day/week/year` 的初始化方式）：

```typescript
function ensureHighlightTagDef(store: WebClipNodeStore) {
  // 检查 SCHEMA 容器中是否已有 SYS_T200 节点
  // 没有则创建 tagDef + 4 个 fieldDef（Source, Anchor, Color, Page URL）
  // Color 字段需创建 5 个 option 子节点
}

function ensureCommentTagDef(store: WebClipNodeStore) {
  // 检查 SCHEMA 容器中是否已有 SYS_T201 节点
  // 没有则创建 tagDef（无模板字段）
}
```

---

## 3. 路径 A：`# Tag` 浮动工具栏（soma 编辑器内）

### 3.1 交互流程

```
用户在 clip page 内选中一段文本
  → FloatingToolbar 显示（现有 6 按钮 + 新增 # Tag 按钮）
  → 用户点击 # Tag
  → 弹出 tag 选择器（输入 "highlight" 或从常用标签列表选择）
  → 选中 #highlight 后：
    1. 在 LIBRARY 容器创建 Highlight Node
    2. 对 Highlight Node 应用 #highlight tag
    3. 填入 Source 字段 = 当前 clip page nodeId
    4. 填入 Color 字段 = 默认 yellow
    5. 将选中文本替换为 inline reference（指向 Highlight Node）
    6. Highlight Node 的 name = 选中的文本内容
```

### 3.2 FloatingToolbar 扩展

现有 6 个按钮：Bold / Italic / Strikethrough / Code / Highlight(mark) / Heading

新增分隔线 + 2 个按钮：

```
[B] [I] [S] [E] [H] [H1] │ [# Tag] [@ Ref]
```

- **# Tag**：选中文本 → 提取为 Library 节点 + 应用标签 + 替换为 inline ref
- **@ Ref**：选中文本 → 搜索已有节点 → 替换为 inline ref（Phase 2+）

### 3.3 # Tag 按钮的通用性

`# Tag` 不是 highlight 专用功能——它是**通用的「文本提取 + 标记」操作**：

- 选中文本 → `# highlight` → 创建 Library 节点 + `#highlight` tag
- 选中文本 → `# task` → 创建 Library 节点 + `#task` tag
- 选中文本 → `# person` → 创建 Library 节点 + `#person` tag

`#highlight` 的特殊性仅在于：系统自动填入 Anchor / Source / Color 等模板字段。

### 3.4 ProseMirror 操作

```typescript
function extractToTaggedNode(
  view: EditorView,
  tagDefId: string,
  nodeId: string,  // 当前编辑的节点 ID
) {
  const { from, to } = view.state.selection;
  const selectedText = view.state.doc.textBetween(from, to);

  // 1. 在 LIBRARY 创建新节点
  const highlightNode = store.createChild(CONTAINER_IDS.LIBRARY, undefined, {
    name: selectedText,
  });

  // 2. 应用标签
  store.applyTag(highlightNode.id, tagDefId);

  // 3. 如果是 #highlight，填入系统字段
  if (tagDefId === SYS_T.HIGHLIGHT) {
    // Source = 当前节点所属 clip page 的 ID
    store.setFieldValue(highlightNode.id, sourceFieldDefId, [clipPageId]);
    // Color = yellow (默认)
    store.setFieldValue(highlightNode.id, colorFieldDefId, [yellowOptionId]);
  }

  // 4. ProseMirror: 替换选区为 inline reference
  //    选中文本 → \uFFFC + inlineRef entry
  const tr = view.state.tr;
  tr.replaceWith(from, to, pmSchema.text('\uFFFC'));
  // 更新节点的 inlineRefs 数组
  addInlineRef(nodeId, {
    offset: from,
    targetNodeId: highlightNode.id,
    displayName: selectedText,
  });
  view.dispatch(tr);
}
```

### 3.5 Inline Reference 显示

Clip page 中的 inline ref 渲染为带颜色标记的文本：

```
剪藏正文... [the most powerful way to extend Chrome] ...正文继续
                    ↑ 黄色高亮底色 + 点击跳转到 Library 中的 highlight 节点
```

---

## 4. 路径 B：Content Script 网页高亮

### 4.1 交互流程

```
用户在网页上选中文本
  → Content Script 检测到选区
  → 显示网页浮动工具栏（Shadow DOM 隔离）
    [Highlight] [Note] [Clip]
  → 用户点击 Highlight：
    1. 计算锚点数据（HighlightAnchor）
    2. 包裹选中文本为 <soma-hl> 元素（即时视觉反馈）
    3. 发消息到 Side Panel：创建 highlight 节点
  → Side Panel 收到消息：
    1. 查找 URL 对应的 Clip Node（dedup lookup）
    2. 没有则自动创建轻量 Clip Node（只有 URL + Title）
    3. 在 LIBRARY 创建 Highlight Node
    4. 应用 #highlight tag + 填入全部字段
    5. 在 Clip Node 对应位置插入 inline ref（如果 clip 有正文）
```

### 4.2 URL-based Clip Node 查找（去重）

```typescript
/**
 * 在 CLIPS + INBOX + LIBRARY 容器及 JOURNAL 日节点中查找已有的 #source 节点。
 * 匹配规则：Source URL 字段值 = 给定 URL（规范化后比较）。
 * 注：新创建的 clip 默认存入 today 日节点（非 INBOX）。
 */
function findClipNodeByUrl(url: string): string | null {
  const normalizedUrl = normalizeUrl(url);  // 去 fragment, 去 trailing slash, etc.

  // 搜索 flat 容器 + JOURNAL 日节点（Year → Week → Day → clip）
  for (const containerId of [CONTAINER_IDS.CLIPS, CONTAINER_IDS.INBOX, CONTAINER_IDS.LIBRARY]) {
    const children = loroDoc.getChildren(containerId);
    for (const childId of children) {
      const node = loroDoc.toNodexNode(childId);
      if (!node || !hasTag(node, webClipTagDefId)) continue;
      const sourceUrl = getFieldValue(node.id, sourceUrlFieldDefId);
      if (sourceUrl && normalizeUrl(sourceUrl) === normalizedUrl) {
        return node.id;
      }
    }
  }
  return null;
}
```

**URL 规范化规则**：
- 去掉 `#fragment`
- 去掉 trailing `/`
- 统一 `http` → `https`
- 去掉 `www.` 前缀
- 排序 query parameters（可选，Phase 2）

### 4.3 Content Script 架构变更

当前 Content Script 是按需注入、一次性执行的。高亮功能需要：

**Phase 1（保持按需注入）**：
- 用户点击扩展图标 / Side Panel 触发时注入
- 注入后持续监听 `mouseup`（不自动卸载）
- 通过 `chrome.runtime.onMessage` 接收回显指令

**Phase 2（声明式注入）**：
- `wxt.config.ts` 中注册为 `matches: ['<all_urls>']`
- 页面加载时自动检查 URL 是否有关联高亮 → 自动回显
- 可通过用户设置控制启用/禁用

### 4.4 网页浮动工具栏（Shadow DOM）

```html
<soma-toolbar>
  #shadow-root (closed)
    <style>/* 完全隔离的样式 */</style>
    <div class="soma-floating-bar">
      <button data-action="highlight">🖍 Highlight</button>
      <button data-action="note">💬 Note</button>
      <button data-action="clip">📋 Clip</button>
    </div>
</soma-toolbar>
```

- 使用 Closed Shadow DOM 防止页面样式泄露
- 自定义元素 `<soma-toolbar>` 避免命名冲突
- 位置跟随 `Range.getBoundingClientRect()`

### 4.5 高亮 DOM 渲染

```html
<!-- 渲染后的高亮元素 -->
<soma-hl data-id="nodeId" style="background: rgba(255,235,59,0.35); cursor: pointer;">
  被高亮的文本
</soma-hl>
```

- 自定义元素 `<soma-hl>` 不继承页面样式
- 跨元素选区：逐文本节点拆分包裹（不用 `surroundContents`）
- 点击高亮 → 发消息到 Side Panel → 导航到对应节点

### 4.6 消息协议扩展

在 `webclip-messaging.ts` 基础上新增：

```typescript
// ── 消息类型 ──
export const MSG = {
  // 现有
  WEBCLIP_CAPTURE_ACTIVE_TAB: 'webclip:capture-active-tab',

  // 新增 — 高亮
  HIGHLIGHT_CREATE:     'highlight:create',      // CS → SP: 创建高亮
  HIGHLIGHT_RESTORE:    'highlight:restore',     // SP → CS: 回显高亮列表
  HIGHLIGHT_REMOVE:     'highlight:remove',      // SP → CS: 移除高亮渲染
  HIGHLIGHT_SCROLL_TO:  'highlight:scroll-to',   // SP → CS: 滚动到高亮
  HIGHLIGHT_CLICK:      'highlight:click',       // CS → SP: 用户点击了网页高亮
  HIGHLIGHT_CHECK_URL:  'highlight:check-url',   // BG → SP: 当前 URL 是否有高亮数据
} as const;

// ── Payload 类型 ──
export interface HighlightCreatePayload {
  anchor: HighlightAnchor;
  selectedText: string;
  pageUrl: string;
  pageTitle: string;
  color?: string;
  withNote?: boolean;
}

export interface HighlightRestorePayload {
  highlights: Array<{
    id: string;
    anchor: HighlightAnchor;
    color: string;
  }>;
}
```

---

## 5. 回显机制（Revisit Rendering）

### 5.1 触发流程

```
用户访问某 URL
  → Background: chrome.tabs.onUpdated (status === 'complete')
  → Background: 发 HIGHLIGHT_CHECK_URL 到 Side Panel
  → Side Panel: findClipNodeByUrl(url)
  → 如果有 clip node:
    → 查找其下所有 #highlight 节点（通过 Source 字段 = clipNodeId）
    → 收集每个 highlight 的 Anchor + Color
    → 发 HIGHLIGHT_RESTORE 到 Content Script
  → Content Script: 逐个 anchor 执行四步回退还原
```

### 5.2 查找 Clip 下的所有 Highlight

```typescript
function findHighlightsForClip(clipNodeId: string): HighlightRestorePayload {
  // 遍历 LIBRARY 容器
  // 找到所有 tags 包含 SYS_T.HIGHLIGHT 且 Source 字段 = clipNodeId 的节点
  // 提取 Anchor 和 Color 字段值
}
```

### 5.3 四步回退锚点还原

1. **XPath Range** — `anchor.range` → 构建 DOM Range → 验证 `range.toString() === anchor.exact`
2. **Text Position** — `anchor.textPosition` → 字符偏移切片 → 验证 `=== exact`
3. **CSS + 精确搜索** — `anchor.cssSelector` → 容器内 `textContent.indexOf(exact)`
4. **Fuzzy 搜索** — `prefix + exact + suffix` → 全文模糊匹配（Levenshtein / 滑动窗口）

### 5.4 无法定位的高亮

- Side Panel 中标记为「无法定位」（灰色虚线样式）
- 不删除数据（页面可能 A/B test 或动态加载）
- 提供「重新锚定」：用户手动选中文本 → 更新 Anchor 字段

---

## 6. 实现分 Phase

### Phase 1：内置标签 + `# Tag` 浮动工具栏（soma 编辑器内）

**目标**：用户可以在 clip page 内选中文本，通过 `# Tag` 提取为 `#highlight` 节点存入 Library。

- [ ] `system-nodes.ts` 新增 `SYS_T.HIGHLIGHT` / `SYS_T.COMMENT`
- [ ] 系统标签初始化：`ensureHighlightTagDef()` / `ensureCommentTagDef()`
- [ ] `highlight-service.ts`：创建 highlight 节点（LIBRARY + #highlight tag + Source/Anchor/Color 字段）
- [ ] `FloatingToolbar.tsx` 新增 `# Tag` 按钮（分隔线 + 按钮 UI）
- [ ] Tag 选择器弹窗（小型 fuzzy search，选择标签后执行提取）
- [ ] ProseMirror 操作：选区 → 替换为 inline reference + `\uFFFC`
- [ ] Inline ref 渲染：highlight ref 带颜色底色
- [ ] 测试：highlight-service.test.ts

**不包含**：Content Script 网页高亮、回显、批注

### Phase 2：Content Script 网页高亮

**目标**：用户可以在任意网页上选中文本创建高亮，高亮存入 soma。

- [ ] `content/highlight.ts`：选中监听 + 锚点计算 + DOM 渲染
- [ ] `content/highlight-toolbar.ts`：Shadow DOM 网页浮动工具栏
- [ ] `content/anchor-utils.ts`：XPath 生成、CSS 选择器生成、文本偏移计算
- [ ] `highlight-messaging.ts`：消息协议（Content Script ↔ Background ↔ Side Panel）
- [ ] `background/index.ts`：高亮消息路由
- [ ] URL clip node 查找 + 自动创建轻量 clip node
- [ ] Clip page 正文中插入 inline ref（如果有对应位置）
- [ ] 测试：anchor-utils.test.ts、highlight-messaging.test.ts

### Phase 3：回显 + 批注

**目标**：再次访问已高亮页面时自动回显；支持在高亮下添加批注。

- [ ] `chrome.tabs.onUpdated` URL 变更检测
- [ ] 回显流程：URL → 查 clip → 查 highlights → 发 restore → 四步锚点还原
- [ ] 无法定位的高亮标记 + 重新锚定 UI
- [ ] `#comment` 标签应用：在 highlight 的 child 上应用
- [ ] 网页浮动工具栏 Note 按钮：highlight + 立即聚焦批注输入
- [ ] Side Panel ↔ Content Script 双向滚动联动
- [ ] 测试：anchor-restore.test.ts

### Phase 4：增强（可延后）

- [ ] 多色高亮选择面板
- [ ] 高亮边界拖拽调整
- [ ] 键盘快捷键（H / N / T）
- [ ] 高亮数量 badge（扩展图标）
- [ ] 渐进式渲染（IntersectionObserver）
- [ ] 高亮冲突处理（重叠高亮合并/分层）
- [ ] `@ Ref` 浮动工具栏按钮

---

## 7. 文件清单

### 新增文件

| 文件 | Phase | 说明 |
|------|-------|------|
| `src/lib/highlight-service.ts` | 1 | Highlight 节点 CRUD（创建、查询、删除） |
| `src/lib/highlight-anchor.ts` | 2 | HighlightAnchor 类型 + 序列化/反序列化 |
| `src/lib/highlight-messaging.ts` | 2 | 高亮消息类型和 payload 定义 |
| `src/entrypoints/content/highlight.ts` | 2 | Content Script 高亮核心（选中监听、锚点计算、DOM 渲染） |
| `src/entrypoints/content/highlight-toolbar.ts` | 2 | 网页浮动工具栏（Shadow DOM 隔离） |
| `src/entrypoints/content/anchor-utils.ts` | 2 | XPath / CSS 选择器 / 文本偏移工具 |
| `tests/vitest/highlight-service.test.ts` | 1 | Highlight 节点 CRUD 测试 |
| `tests/vitest/anchor-utils.test.ts` | 2 | 锚点计算测试 |

### 修改文件

| 文件 | Phase | 修改内容 |
|------|-------|----------|
| `src/types/system-nodes.ts` | 1 | 新增 `SYS_T.HIGHLIGHT` / `SYS_T.COMMENT` |
| `src/components/editor/FloatingToolbar.tsx` | 1 | 新增 `# Tag` 按钮 + 分隔线 |
| `src/components/editor/RichTextEditor.tsx` | 1 | 集成 `# Tag` 操作（ProseMirror 选区替换） |
| `src/lib/webclip-service.ts` | 2 | 新增 `findClipNodeByUrl()`、轻量 clip 创建 |
| `src/entrypoints/content/index.ts` | 2 | 集成高亮模块 |
| `src/entrypoints/background/index.ts` | 2 | 高亮消息路由 + URL 变更监听 |
| `src/components/outliner/OutlinerItem.tsx` | 3 | Highlight 节点特殊 bullet 颜色渲染 |

---

## 8. 风险与缓解

### 高风险

| 风险 | 缓解 |
|------|------|
| 第三方网页 DOM 不可控（SPA / 懒加载 / 虚拟滚动） | 多选择器冗余 + 四步回退 + TextQuoteSelector 保底 |
| Content Script 样式冲突 | Shadow DOM + 自定义元素 `<soma-hl>` + `!important` |
| Content Script 生命周期（SW 终止 / CS 卸载） | 高亮数据存 Side Panel（不依赖 CS 内存）+ 重注入机制 |
| 跨元素选区包裹 | 逐文本节点拆分包裹（非 `surroundContents`） |

### 中风险

| 风险 | 缓解 |
|------|------|
| iframe 内高亮 | Phase 1-2 不支持，Phase 4 按需扩展 |
| SPA 路由变化（DOM 重建） | 监听 `popstate` + MutationObserver |
| 大量高亮（100+）回显性能 | IntersectionObserver 渐进式渲染（Phase 4） |

---

## 9. 与研究文档的差异

原 `docs/research/highlight-comment-design.md` 的方案 vs 本方案：

| 维度 | 研究文档 | 本方案 |
|------|----------|--------|
| 高亮存储位置 | Clip Node 的 children | **Library 容器**，clip 内是 inline ref |
| 标签类型 | 普通 tagDef（`findTagDefByName`） | **内置系统标签**（`SYS_T.HIGHLIGHT`） |
| 创建路径 | 仅 Content Script | **双路径**：编辑器 `# Tag` + Content Script |
| `# Tag` 工具栏 | 未涉及 | **核心基础设施**（通用的文本提取 + 标记） |
| Source 字段 | Source URL (url 类型) | **Source (node ref)** 指向 clip node |
| 批注标签 | 无专属标签 | **#comment 内置标签** |

本方案保留了研究文档中经过验证的技术设计（锚点格式、四步回退、消息协议、DOM 渲染策略），在产品架构层面做了调整以匹配"Library 为中心 + inline ref 关联"的统一模型。

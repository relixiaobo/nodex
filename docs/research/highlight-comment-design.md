# 网页高亮 & 批注设计方案（Highlight + Comment）

> 2026-02-27 | research agent
>
> 状态：研究完成，待评审。本文档是 `docs/TASKS.md` 中「网页高亮 & 批注」任务的研究产出。

---

## 1. 竞品分析

### 1.1 Readwise Reader（主要参考）

**交互流程**

| 步骤 | 操作 | 说明 |
|------|------|------|
| 选中文本 | 鼠标拖选 / 触摸拖选 | 选区即刻变为高亮（auto-highlight 模式），或手动点击弹出工具栏的高亮按钮 |
| 段落高亮 | 键盘 `H` | 在键盘阅读模式下，按 H 高亮当前焦点段落 |
| 添加批注 | 键盘 `N` | 高亮选中后按 N 打开批注输入，Enter 保存，Shift+Enter 换行 |
| 添加标签 | 键盘 `T` | 高亮选中后按 T 打开标签对话框，Cmd+Enter 保持对话框打开以连续添加 |
| 调整边界 | 拖拽手柄 | 高亮两端出现拖拽手柄，可扩缩范围，甚至合并相邻高亮 |
| 回显同步 | 双向同步 | 浏览器扩展在原网页上的高亮 <-> Reader 干净阅读视图中的高亮，双向同步 |

**数据组织**

- 高亮属于文档（parent_id = document_id）
- 高亮和文档标签独立：文档标签不继承到高亮，反之亦然
- 宽屏时批注和标签显示在右侧 margin
- Notebook 标签页汇集文档所有高亮和批注，支持按标签筛选
- 目前不支持多色高亮，建议用标签替代颜色工作流
- API 数据结构：text, note, highlighted_at, highlight_url, tags, parent_id(document)

**与笔记系统的整合**

- 高亮自动进入 Readwise 间隔重复系统
- 支持导出到 Obsidian / Notion / Roam / Tana 等，模板可用 Jinja2 自定义
- 导出到 Tana 时，高亮变为文档节点的子节点，批注作为高亮的子节点

**对 soma 的启发**

1. auto-highlight 模式（选中即高亮）适合深度阅读场景，但在浏览模式可能过于激进——soma 可提供可选开关
2. 高亮与文档标签分离是好设计——对应 soma 中高亮节点和 clip 节点各自独立的 tags
3. Notebook 汇总视图 = soma 的 NodePanel 渲染 clip 节点的 children（高亮节点列表）
4. 键盘快捷键体系值得直接借鉴（H/N/T）

### 1.2 Hypothesis（技术参考）

**核心贡献：多选择器冗余锚定**

Hypothesis 是 W3C Web Annotation 模型的主要实践者，其锚定策略直接影响了本方案的技术设计。

三种选择器同时存储，标识同一段文本：

| 选择器 | 存储内容 | 速度 | 可靠性 |
|--------|----------|------|--------|
| RangeSelector | XPath + offset 对（start, end） | 最快 | 低（DOM 变化即失效） |
| TextPositionSelector | 文档 textContent 的 start/end 字符偏移 | 快 | 低（任何文本增删即偏移） |
| TextQuoteSelector | prefix + exact + suffix | 慢（全文模糊搜索） | 最高（文本存在即可定位） |

**四步回退策略**

1. **RangeSelector 精确匹配** — 将 XPath 应用到当前 DOM，验证取到的文本 = TextQuoteSelector.exact
2. **TextPositionSelector 快速定位** — 用字符偏移取文本，验证 = exact
3. **TextQuoteSelector 精确搜索** — 在文档全文中搜索 exact 字符串
4. **TextQuoteSelector 模糊搜索** — 用 prefix/exact/suffix 做模糊匹配，容忍小范围编辑

**对 soma 的启发**

soma 作为 Chrome 扩展标注第三方网页，页面 DOM 完全不可控。必须采用多选择器冗余策略。建议至少存储 TextQuoteSelector（prefix/exact/suffix）+ CssSelector/XPath 路径两种。

### 1.3 其他参考产品

**Liner**
- 支持多色高亮（5 色 + 自定义），颜色即工作流
- 跨平台（Chrome / iOS / Android），YouTube 视频也可高亮
- 高亮自动 AI 摘要
- 问题：近年稳定性下降，用户流失

**Diigo**
- 老牌标注工具（300k+ 用户），功能稳定
- 支持高亮 + 便签（Sticky Note）+ 书签
- 便签可固定在页面特定位置
- 设计陈旧，无现代 UI

**Web Highlights**
- 现代 UI 设计，Shadow DOM 隔离样式
- 高亮 + 笔记 + 标签
- 本地存储 + 云同步
- 开发者博客有大量技术文章

**共性模式总结**

| 维度 | 共性做法 |
|------|----------|
| 触发方式 | 选中文本 → 弹出浮动工具栏（3-5 个按钮） |
| 高亮颜色 | 黄色为默认，多数支持 3-5 色 |
| 批注入口 | 工具栏按钮 / 高亮后二次点击 |
| 存储关联 | 高亮 → 属于某个页面/文档 |
| 回显方式 | Content Script 注入 → 匹配锚点 → 包裹 `<mark>` / `<span>` |
| 样式隔离 | Shadow DOM 或 `!important` 覆盖 |

---

## 2. soma 数据模型设计

### 2.1 设计原则

遵循 soma 的"一切皆节点"守则：

- 高亮是节点，不是 JSON blob
- 批注是高亮节点的 children，不是独立属性
- 锚点信息通过 supertag 字段存储，不加 NodexNode 顶层属性
- 颜色通过标签或字段表达，不加硬编码属性

### 2.2 节点层级结构

```
Clip Node (web_clip)                    ← 已有，网页剪藏节点
├── [剪藏的正文 children]                ← 已有，Defuddle 解析的内容
├── Highlight Node (#highlight)         ← 新增，一个高亮 = 一个节点
│   ├── Comment Node                    ← 普通子节点，作为批注
│   ├── Comment Node                    ← 可以有多条批注
│   └── ...
├── Highlight Node (#highlight)
│   └── Comment Node
└── ...
```

**关键关系**

| 关系 | 实现方式 |
|------|----------|
| Highlight → Clip Page | 父子关系（highlight 是 clip node 的 child） |
| Highlight → 原文定位 | #highlight supertag 的字段存储锚点数据 |
| Comment → Highlight | 父子关系（comment 是 highlight 的 child） |
| Highlight → 来源 URL | 继承自父 clip node 的 Source URL 字段，或通过 Highlight 自身的 Source URL 字段冗余存储 |

### 2.3 新增 Supertag：#highlight

```
tagDef: "highlight"                      ← type = 'tagDef'
├── fieldDef: "Source URL"               ← type = 'fieldDef', fieldType = 'url'
├── fieldDef: "Anchor"                   ← type = 'fieldDef', fieldType = 'plain'
│                                           值 = JSON 序列化的锚点数据
├── fieldDef: "Highlight Color"          ← type = 'fieldDef', fieldType = 'options'
│   ├── option: "yellow"
│   ├── option: "green"
│   ├── option: "blue"
│   ├── option: "pink"
│   └── option: "purple"
└── fieldDef: "Page Title"              ← type = 'fieldDef', fieldType = 'plain'
```

**为什么 Anchor 字段用 plain text 存 JSON？**

理想情况下锚点数据应该是结构化的 Tuple 树，但锚点数据（XPath、CSS 选择器、文本偏移等）是**机器消费的中间数据**，不需要用户编辑或查询过滤。用 plain text 存 JSON 是务实选择：

1. 避免为每个锚点创建 5-10 个 Tuple 节点（性能开销大）
2. 锚点数据的读写是原子的（要么全部有效，要么全部无效）
3. 用户从不直接看到或编辑这个字段（可通过 hideField 条件隐藏）
4. 未来如果需要按锚点数据查询（如"所有第3段的高亮"），可以加索引而不改数据模型

### 2.4 Anchor 数据格式

```typescript
/**
 * 高亮锚点数据，JSON 序列化后存入 Anchor 字段。
 * 采用 W3C Web Annotation 多选择器冗余策略。
 */
interface HighlightAnchor {
  /** 版本号，用于未来迁移 */
  version: 1;

  /** 高亮文本的精确内容 */
  exact: string;

  /** exact 前面的上下文文本（约 32 字符） */
  prefix: string;

  /** exact 后面的上下文文本（约 32 字符） */
  suffix: string;

  /** CSS 选择器路径（用于快速定位容器元素） */
  cssSelector?: string;

  /** XPath 范围（用于精确 DOM 定位） */
  range?: {
    startXPath: string;
    startOffset: number;
    endXPath: string;
    endOffset: number;
  };

  /** 字符偏移（基于页面 body.textContent） */
  textPosition?: {
    start: number;
    end: number;
  };
}
```

**选择器优先级（回退策略）**

1. **range (XPath)** — 最快，直接还原 DOM Range，验证文本 = exact
2. **textPosition** — 次快，字符偏移定位，验证文本 = exact
3. **cssSelector + 全文搜索** — 在 CSS 选择器定位的容器内搜索 exact
4. **prefix + exact + suffix 模糊搜索** — 最慢但最可靠，在全文中模糊匹配

### 2.5 不需要新增的 SYS_A* / SYS_T* 常量

本方案完全复用现有 supertag / field 体系：

| 需求 | 实现方式 | 是否新增常量 |
|------|----------|:---:|
| 高亮标签 | 普通 tagDef "highlight" | 否，用 findTagDefByName |
| 锚点数据 | fieldDef "Anchor"（plain text） | 否 |
| 高亮颜色 | fieldDef "Highlight Color"（options） | 否 |
| 来源 URL | fieldDef "Source URL"（url），复用 web_clip 的同名字段定义 | 否 |
| 页面标题 | fieldDef "Page Title"（plain） | 否 |

如果后续需要系统级优化（如高亮索引查询），可以考虑注册固定 ID 的系统 tagDef（类似 `sys:day`），但 MVP 阶段没有必要。

### 2.6 与现有 web_clip 的关系

两种场景：

**场景 A：先有 Clip，再加高亮**
```
用户先 Clip Page → 产生 web_clip 节点 → 再次访问该页面 → 选中文本高亮
→ 高亮节点作为 clip node 的 child 追加
```

**场景 B：先高亮，后自动创建 Clip**
```
用户直接在网页上选中高亮（没有先 Clip）
→ 自动创建 web_clip 节点（轻量版：只有 URL + Title）
→ 高亮节点作为新 clip node 的 child
```

**查找关联 Clip Node 的逻辑**

```typescript
function findClipNodeForUrl(url: string): string | null {
  // 遍历 CLIPS 和 INBOX 容器的子节点
  // 找到 tags 包含 web_clip tagDefId 且 Source URL 字段值 = url 的节点
  // 返回 node.id 或 null
}
```

---

## 3. 技术方案

### 3.1 系统架构总览

```
┌─────────────────┐     chrome.runtime       ┌─────────────────┐
│   Side Panel    │ ◄──── .sendMessage ────► │   Background    │
│   (React UI)    │                          │ (Service Worker) │
│                 │                          │                 │
│ - 高亮列表展示   │     chrome.tabs          │ - 消息路由       │
│ - 批注编辑      │ ◄──── .sendMessage ────► │ - Content Script │
│ - 节点 CRUD     │                          │   注入管理       │
└─────────────────┘                          └────────┬────────┘
                                                      │
                                              chrome.scripting
                                              .executeScript
                                                      │
                                             ┌────────▼────────┐
                                             │  Content Script  │
                                             │  (注入到网页)     │
                                             │                  │
                                             │ - 文本选中监听    │
                                             │ - 浮动工具栏      │
                                             │ - 高亮渲染/回显   │
                                             │ - 锚点计算        │
                                             └──────────────────┘
```

### 3.2 Content Script 层

#### 3.2.1 文本选中 → 创建高亮

**触发流程**

```
mouseup / touchend
  → window.getSelection()
  → 验证选区有效（非空、非 collapsed、不在 soma 注入的 UI 内）
  → 显示浮动工具栏（Highlight / Note / Copy）
  → 用户点击 Highlight 按钮
  → 计算锚点数据（多选择器）
  → 包裹选中文本为 <soma-highlight> 元素
  → 发送消息到 Side Panel 创建节点
```

**浮动工具栏设计**

```html
<!-- Shadow DOM 隔离，避免页面样式冲突 -->
<soma-highlight-toolbar>
  #shadow-root
    <div class="toolbar">
      <button data-action="highlight" title="Highlight (H)">
        <svg>...</svg>  <!-- 荧光笔图标 -->
      </button>
      <button data-action="note" title="Highlight + Note (N)">
        <svg>...</svg>  <!-- 批注图标 -->
      </button>
      <button data-action="copy" title="Copy">
        <svg>...</svg>  <!-- 复制图标 -->
      </button>
      <!-- 颜色选择器（Phase 2） -->
    </div>
</soma-highlight-toolbar>
```

**位置计算**

- 工具栏出现在选区上方（或下方，如果上方空间不足）
- 使用 `Range.getBoundingClientRect()` 获取选区位置
- 通过 `position: fixed` + scroll 偏移定位

#### 3.2.2 锚点计算

```typescript
function computeAnchor(range: Range): HighlightAnchor {
  const exact = range.toString();

  // 1. TextQuoteSelector: prefix + exact + suffix
  const textContent = document.body.textContent ?? '';
  const exactStart = textContent.indexOf(exact); // 简化，实际需更精确
  const prefix = textContent.slice(Math.max(0, exactStart - 32), exactStart);
  const suffix = textContent.slice(exactStart + exact.length, exactStart + exact.length + 32);

  // 2. RangeSelector: XPath + offset
  const rangeData = {
    startXPath: getXPath(range.startContainer),
    startOffset: range.startOffset,
    endXPath: getXPath(range.endContainer),
    endOffset: range.endOffset,
  };

  // 3. TextPositionSelector: 字符偏移
  const textPosition = {
    start: getTextOffset(document.body, range.startContainer, range.startOffset),
    end: getTextOffset(document.body, range.endContainer, range.endOffset),
  };

  // 4. CssSelector: 最近的可选择祖先
  const commonAncestor = range.commonAncestorContainer;
  const element = commonAncestor.nodeType === Node.ELEMENT_NODE
    ? commonAncestor as Element
    : commonAncestor.parentElement;
  const cssSelector = element ? getCssSelector(element) : undefined;

  return {
    version: 1,
    exact,
    prefix,
    suffix,
    cssSelector,
    range: rangeData,
    textPosition,
  };
}
```

**XPath 生成策略**

- 优先使用元素 ID：`//*[@id="content"]/p[3]/text()[1]`
- 无 ID 时使用标签名 + 索引：`/html/body/div[2]/article/p[5]/text()[1]`
- 使用 `dom-xpath-toolkit` 或自行实现（约 50 行代码）

#### 3.2.3 高亮渲染

**DOM 操作**

```typescript
function renderHighlight(range: Range, highlightId: string, color: string): void {
  // 处理跨元素选区：可能跨越多个 DOM 节点
  // 策略：逐文本节点包裹
  const textNodes = getTextNodesInRange(range);

  for (const { node, startOffset, endOffset } of textNodes) {
    const highlightEl = document.createElement('soma-hl');
    highlightEl.setAttribute('data-highlight-id', highlightId);
    highlightEl.style.backgroundColor = highlightColorMap[color] ?? 'rgba(255, 235, 59, 0.4)';
    highlightEl.style.cursor = 'pointer';

    // 分割文本节点并包裹
    const wrappedRange = document.createRange();
    wrappedRange.setStart(node, startOffset);
    wrappedRange.setEnd(node, endOffset);
    wrappedRange.surroundContents(highlightEl);
  }
}
```

**使用自定义元素 `<soma-hl>`**

- 自定义元素名称避免与页面样式冲突
- 通过 `data-highlight-id` 关联到 soma 节点
- 点击高亮 → 滚动 Side Panel 到对应高亮节点 / 显示批注弹窗

**颜色映射**

```typescript
const highlightColorMap: Record<string, string> = {
  yellow:  'rgba(255, 235, 59, 0.35)',
  green:   'rgba(129, 199, 132, 0.35)',
  blue:    'rgba(100, 181, 246, 0.35)',
  pink:    'rgba(244, 143, 177, 0.35)',
  purple:  'rgba(186, 104, 200, 0.35)',
};
```

### 3.3 Side Panel 层

#### 3.3.1 高亮列表展示

高亮节点是 clip node 的 children，在 NodePanel 中自然渲染为大纲项：

```
Clip Node: "How to Build a Chrome Extension"
├── #web_clip  Source URL: https://example.com/article
├── H1 节点: "Introduction"        ← 剪藏正文
├── P 节点: "Chrome extensions..." ← 剪藏正文
├── 🟡 "the most powerful way..."  ← 高亮节点（#highlight 标签显示为黄色圆点）
│   └── "This is exactly what...   ← 批注
├── 🟢 "content scripts run..."    ← 另一个高亮
└── ...
```

**高亮节点的 OutlinerItem 渲染增强**

- bullet 替换为高亮颜色圆点（类似 supertag 颜色 bullet）
- name 显示高亮文本（截断显示，完整内容在展开后可见）
- 点击高亮节点 → 发送消息到 Content Script → 滚动到对应高亮位置并闪烁

#### 3.3.2 批注编辑

批注是高亮节点的普通 children，使用现有的 OutlinerItem + NodeEditor 组件即可编辑。无需额外开发。

**快捷操作**

- 在高亮节点上按 Enter → 创建子节点（= 添加批注）
- 高亮节点右键菜单增加：
  - "Navigate to Highlight"（跳转到网页对应位置）
  - "Change Color"（修改高亮颜色）
  - "Remove Highlight"（删除高亮节点 + Content Script 移除高亮渲染）

### 3.4 回显机制（Revisit Rendering）

#### 3.4.1 触发时机

```
用户访问某个 URL
  → Background Script 检测到 tab URL 变更（chrome.tabs.onUpdated）
  → 查询 node store：是否有 web_clip 节点的 Source URL = 当前 URL
  → 如果有：
    → 注入 Content Script
    → 发送该 clip node 下所有 #highlight 子节点的锚点数据
    → Content Script 逐个还原高亮
```

#### 3.4.2 锚点还原（四步回退）

```typescript
async function restoreHighlight(anchor: HighlightAnchor): Promise<Range | null> {
  // Step 1: XPath Range 精确匹配
  if (anchor.range) {
    const range = tryRangeSelector(anchor.range);
    if (range && range.toString() === anchor.exact) return range;
  }

  // Step 2: 字符偏移定位
  if (anchor.textPosition) {
    const range = tryTextPositionSelector(anchor.textPosition);
    if (range && range.toString() === anchor.exact) return range;
  }

  // Step 3: CSS 容器内精确搜索
  if (anchor.cssSelector) {
    const container = document.querySelector(anchor.cssSelector);
    if (container) {
      const range = findExactTextInElement(container, anchor.exact);
      if (range) return range;
    }
  }

  // Step 4: 全文模糊搜索（prefix + exact + suffix）
  return fuzzyTextSearch(anchor.prefix, anchor.exact, anchor.suffix);
}
```

#### 3.4.3 处理无法定位的高亮

- 如果所有选择器都无法匹配 → 在 Side Panel 中标记该高亮为"无法定位"（灰色/虚线样式）
- 不删除节点数据，因为原文可能只是临时变化（A/B test、动态加载等）
- 提供"重新锚定"操作：用户手动选中当前页面文本 → 更新锚点数据

#### 3.4.4 性能优化

- 高亮回显是 **异步、渐进式** 的：先加载可见区域的高亮，滚动时加载更多
- 使用 `IntersectionObserver` 检测高亮区域进入视口
- 锚点还原的全文搜索可以 Web Worker 化（如果文本量很大）
- 缓存已成功还原的锚点（当前 XPath），加速后续访问

### 3.5 消息协议

在现有 `webclip-messaging.ts` 基础上扩展：

```typescript
// ── 高亮消息类型 ──

/** Side Panel → Background → Content Script: 请求还原已有高亮 */
export const HIGHLIGHT_RESTORE = 'highlight:restore' as const;

/** Content Script → Background → Side Panel: 用户创建了新高亮 */
export const HIGHLIGHT_CREATED = 'highlight:created' as const;

/** Side Panel → Background → Content Script: 删除网页上的高亮渲染 */
export const HIGHLIGHT_REMOVE = 'highlight:remove' as const;

/** Side Panel → Background → Content Script: 滚动到指定高亮 */
export const HIGHLIGHT_SCROLL_TO = 'highlight:scroll-to' as const;

/** Background → Side Panel: 当前标签页有关联的高亮数据 */
export const HIGHLIGHT_PAGE_HAS_DATA = 'highlight:page-has-data' as const;

// ── 数据类型 ──

export interface HighlightCreatePayload {
  anchor: HighlightAnchor;
  selectedText: string;
  pageUrl: string;
  pageTitle: string;
  color?: string;
  withNote?: boolean;  // 如果 true，创建后 Side Panel 聚焦到批注输入
}

export interface HighlightRestorePayload {
  highlights: Array<{
    id: string;       // soma 节点 ID
    anchor: HighlightAnchor;
    color: string;
  }>;
}
```

### 3.6 与现有 Clip Page 功能的整合点

| 现有功能 | 整合方式 |
|----------|----------|
| `webclip-service.ts` | 扩展 `saveWebClip` 支持"轻量版"（只有 URL + Title，用于自动创建 clip） |
| `webclip-messaging.ts` | 新增高亮相关消息类型 |
| `content/index.ts` | 从纯捕获脚本升级为常驻脚本（高亮渲染需要持续存在） |
| `background/index.ts` | 增加高亮消息路由 + URL 变更监听 |
| `html-to-nodes.ts` | 高亮节点创建可复用 `createContentNodes` 的模式 |
| `OutlinerItem.tsx` | 高亮节点的特殊 bullet 渲染 |
| `#web_clip` tagDef | `#highlight` 的 Source URL 字段可复用同一个 fieldDef |

**Content Script 架构变更**

当前 Content Script 是按需注入的（`registration: 'runtime'`），仅在用户触发 Clip Page 时注入。高亮功能需要更持久的存在：

- **Phase 1**: 仍按需注入，但注入后持续监听（不自动卸载）
- **Phase 2**: 改为声明式注入（`registration: 'manifest'`），页面加载时自动注入（可通过用户设置控制哪些站点启用）
- **Phase 3**: 使用 `chrome.tabs.onUpdated` 监听 URL 变更，主动检查并注入

---

## 4. 实现建议

### 4.1 分 Phase 实现

#### Phase 1: 基础高亮（MVP）

**目标**：用户可以在网页上选中文本创建高亮，高亮以节点形式存入 soma，再次访问时回显。

- [ ] 定义 `HighlightAnchor` 类型和消息协议
- [ ] Content Script 增强：文本选中监听 + 浮动工具栏（仅 Highlight 按钮）
- [ ] 锚点计算（三种选择器）
- [ ] 高亮 DOM 渲染（`<soma-hl>` 自定义元素）
- [ ] Background 消息路由（Content Script <-> Side Panel）
- [ ] Side Panel 节点创建：创建 #highlight 节点为 clip node 的 child
- [ ] 自动创建轻量 web_clip（如果当前页面没有对应 clip node）
- [ ] 回显：URL 匹配 → 注入 Content Script → 还原高亮（四步回退）
- [ ] 高亮节点 bullet 颜色标识

**不包含**：批注、多色高亮、模糊搜索、高亮编辑

#### Phase 2: 批注 + 颜色

**目标**：高亮可以附带批注，支持多色高亮。

- [ ] 浮动工具栏增加 Note 按钮
- [ ] 创建高亮时可选择颜色（5 色面板）
- [ ] Side Panel 中高亮节点 Enter 添加批注（children）
- [ ] Content Script 点击高亮 → Side Panel 导航到对应节点
- [ ] 高亮右键菜单（Change Color / Remove / Navigate）
- [ ] #highlight supertag 的 Highlight Color 字段

#### Phase 3: 回显增强 + 生产力

**目标**：更可靠的回显、更好的浏览体验。

- [ ] 全文模糊搜索回退（prefix/exact/suffix）
- [ ] 无法定位的高亮标记 + 重新锚定 UI
- [ ] 高亮数量 badge 显示在扩展图标上
- [ ] 渐进式高亮渲染（IntersectionObserver）
- [ ] 高亮边界调整（拖拽手柄扩缩高亮范围）
- [ ] 键盘快捷键（H 高亮段落、N 批注、T 标签）
- [ ] Side Panel ↔ Content Script 双向滚动联动
- [ ] 高亮冲突处理（重叠高亮的合并/分层）

### 4.2 风险点和技术难点

#### 高风险

| 风险 | 说明 | 缓解策略 |
|------|------|----------|
| **DOM 不可控** | 第三方网页的 DOM 结构千差万别，SPA 动态加载、懒加载、虚拟滚动都会影响锚点 | 多选择器冗余 + 四步回退 + TextQuoteSelector 作为最终保底 |
| **样式冲突** | 注入的高亮元素可能被页面 CSS 覆盖或破坏布局 | `<soma-hl>` 自定义元素 + Shadow DOM（工具栏）+ `!important`（高亮底色） + `all: initial` 重置 |
| **Content Script 生命周期** | Service Worker 可能被终止，Content Script 可能被卸载 | 重新注入机制 + 高亮数据在 Side Panel 存储（不依赖 Content Script 内存状态） |
| **跨元素选区** | 用户选中的文本可能跨越多个 DOM 元素（`<p>`, `<span>`, `<a>` 等） | 逐文本节点包裹策略（非 `surroundContents` 单次调用） |

#### 中风险

| 风险 | 说明 | 缓解策略 |
|------|------|----------|
| **CSP 限制** | 部分网站的 Content Security Policy 可能阻止 CSS 注入 | Chrome 扩展的 Content Script 不受页面 CSP 约束（MV3 特性） |
| **iframe 嵌套** | 高亮文本可能在 iframe 内 | Phase 1 不支持 iframe 内高亮，后续按需扩展 |
| **性能** | 大量高亮（100+）的页面回显可能卡顿 | 渐进式渲染 + IntersectionObserver + 虚拟化 |
| **SPA 路由变化** | 单页应用 URL 变化但 DOM 可能完全重建 | 监听 `popstate` + `MutationObserver` 检测主内容区域变化 |

#### 低风险（但需注意）

| 风险 | 说明 |
|------|------|
| **Loro CRDT 性能** | 每个高亮创建约 3-5 个节点（highlight + fieldEntry 若干），高频高亮场景下需关注 commitDoc 频率 |
| **同步体积** | 高亮数据（尤其是 Anchor JSON）可能较大（每条约 500 bytes），大量高亮时同步增量需关注 |
| **用户预期** | 页面更新后高亮消失是已知的体验风险，需在 UI 上正确传达"高亮可能因页面变化而无法定位" |

### 4.3 依赖关系

```
Phase 1 依赖：
  ├── 现有 web_clip 基础设施（已完成）
  ├── Content Script 注入机制（已有，需增强）
  ├── Background 消息路由（已有，需扩展）
  └── supertag / field 系统（已完成）

Phase 2 依赖：
  ├── Phase 1（基础高亮）
  └── Options 字段类型（已完成）

Phase 3 依赖：
  ├── Phase 2（批注 + 颜色）
  └── 模糊文本搜索算法（可复用 uFuzzy 或自行实现简化版）
```

### 4.4 文件清单预估（Phase 1）

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/lib/highlight-anchor.ts` | 新增 | HighlightAnchor 类型 + 序列化/反序列化 |
| `src/lib/highlight-messaging.ts` | 新增 | 高亮消息类型和数据接口 |
| `src/lib/highlight-service.ts` | 新增 | 高亮节点 CRUD（创建 #highlight 节点、查找 clip node、关联锚点） |
| `src/entrypoints/content/highlight.ts` | 新增 | Content Script 高亮模块（选中监听、锚点计算、DOM 渲染、回显还原） |
| `src/entrypoints/content/highlight-toolbar.ts` | 新增 | 浮动工具栏（Shadow DOM 隔离） |
| `src/entrypoints/content/anchor-utils.ts` | 新增 | XPath 生成、CSS 选择器生成、文本偏移计算 |
| `src/entrypoints/content/index.ts` | 修改 | 集成高亮模块 |
| `src/entrypoints/background/index.ts` | 修改 | 增加高亮消息路由 + URL 变更监听 |
| `src/components/outliner/OutlinerItem.tsx` | 修改 | 高亮节点特殊 bullet 渲染 |
| `src/lib/webclip-service.ts` | 修改 | 支持"轻量版" clip 创建 |
| `tests/vitest/highlight-anchor.test.ts` | 新增 | 锚点序列化/反序列化测试 |
| `tests/vitest/highlight-service.test.ts` | 新增 | 高亮节点 CRUD 测试 |

---

## 5. 附录

### 5.1 W3C Web Annotation Data Model 参考

本方案的锚点设计基于 W3C Web Annotation Data Model（https://www.w3.org/TR/annotation-model/），核心概念：

- **Annotation** = Body + Target（高亮节点 = 批注内容 + 锚点目标）
- **Target** 通过 **Selector** 描述在资源中的位置
- 多个 Selector 指向同一内容，消费者选择能处理的那个（fallback 语义）
- **TextQuoteSelector** 是最可靠的（只要文本还在就能找到），**RangeSelector** 是最快的

### 5.2 Hypothesis 多选择器策略参考

Hypothesis 的开源实现验证了多选择器冗余策略的有效性：

- 三种选择器覆盖了"快但脆弱 → 慢但可靠"的完整频谱
- 四步回退保证了在绝大多数场景下都能成功还原高亮
- TextQuoteSelector 的 prefix/suffix 上下文（约 32 字符）足以在全文中唯一定位
- 对于极端场景（完全相同的文本出现多次），结合 textPosition 偏移可进一步消歧

### 5.3 与 Tana 的差异

Tana 是纯笔记工具，没有网页高亮功能。这是 soma 作为浏览器扩展的独有能力。但 soma 的高亮设计完全遵循 Tana 的"一切皆节点"原则：

- 高亮 = 节点（可以有 children、tags、fields）
- 批注 = 高亮的 children（标准大纲编辑）
- 颜色 = options field（可查询、可过滤）
- 锚点 = plain text field（机器数据）
- 高亮列表 = clip node 的大纲视图（无需额外 UI）

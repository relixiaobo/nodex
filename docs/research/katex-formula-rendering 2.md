# KaTeX 数学公式渲染调研

> 2026-03-19 | Dev Agent (claude)
>
> 目标：调研在 soma 大纲编辑器中支持数学公式渲染的最佳方案。
> 约束前提：Chrome Side Panel (300-700px)、ProseMirror (非 TipTap 封装)、Loro CRDT 存储、已有 KaTeX 依赖 (Chat MarkdownRenderer)。

## 1. 技术方案调研

### 1.1 KaTeX vs MathJax

| 维度 | KaTeX 0.16.x | MathJax 3.x |
|------|:---:|:---:|
| **JS 体积 (min)** | ~264 KB | ~480 KB (core + TeX input + HTML output) |
| **CSS** | ~24 KB | 无独立 CSS (样式内嵌 JS) |
| **字体 (woff2)** | ~296 KB (20 文件) | ~1.1 MB (60+ 文件) |
| **总磁盘** | ~4.4 MB (含所有格式) | ~8+ MB |
| **渲染速度** | 同步渲染，极快 | MathJax 3 已大幅改善，部分场景可比 |
| **LaTeX 覆盖率** | 覆盖常用子集，少量高级命令缺失 | 最全面，支持 AMS 全集 |
| **输入格式** | 仅 LaTeX | LaTeX + MathML + AsciiMath |
| **输出格式** | HTML + hidden MathML | HTML / SVG / MathML |
| **SSR 支持** | 原生支持 `renderToString` | 支持但配置复杂 |
| **无障碍** | hidden MathML (基本) | 深度无障碍支持 (SRE 集成) |
| **维护状态** | 活跃 (Khan Academy 维护) | 活跃 (NumFOCUS 赞助) |
| **npm 周下载** | ~1.4M | ~450K |

**结论：选 KaTeX。**

理由：
1. **已是项目依赖** — `katex@0.16.38` + `rehype-katex` + `remark-math` 已在 `package.json` 中，Chat 的 `MarkdownRenderer` 已在使用。零新增依赖成本。
2. **体积优势** — Chrome 扩展对包体积敏感，KaTeX 体积约为 MathJax 的 1/2。
3. **同步渲染** — Side Panel 中不希望出现异步渲染导致的布局跳动。KaTeX 的同步 `renderToString()` 天然适合 ProseMirror NodeView 的 `update()` 回调。
4. **LaTeX 覆盖率足够** — soma 用户以知识管理为主，非学术排版工具。KaTeX 覆盖的 LaTeX 子集（上下标、分数、矩阵、积分、求和、希腊字母等）完全满足需求。

### 1.2 ProseMirror / TipTap 中的数学公式集成方案

| 方案 | 架构 | 优点 | 缺点 | 适用性 |
|------|------|------|------|--------|
| **@benrbray/prosemirror-math** | 原生 ProseMirror plugin + NodeView | 专为 ProseMirror 设计；inline + display 双节点；cursor 可进入公式内部编辑 | 维护频率低（最后发布 ~1 年前）；~2K 周下载；需适配自定义 schema | 高 |
| **@tiptap/extension-mathematics** | TipTap Pro 扩展 | 官方维护；配置简单 | 依赖 TipTap 框架（soma 直接用 ProseMirror，不用 TipTap） | 低 — 不适用 |
| **@aarkue/tiptap-math-extension** | TipTap 社区扩展 | 支持 `$...$` 自动转换 | 同上，依赖 TipTap | 低 — 不适用 |
| **自建 NodeView + KaTeX** | 自行实现 ProseMirror NodeSpec + NodeView | 完全控制行为；与现有 pmSchema 无缝集成；无外部依赖 | 开发工作量中等 | **推荐** |

**结论：自建 NodeView。**

理由：
- soma 使用原生 ProseMirror（`prosemirror-state/view/model/keymap/commands`），**不使用 TipTap**。TipTap 系列扩展不直接可用。
- `@benrbray/prosemirror-math` 可参考其架构和交互设计（cursor 进入公式内部的 inline editing 模式），但不直接依赖，因为：
  - 其 schema 要求 `content: "text*"` + `group: "inline math"`，与 soma 的 `pmSchema` 结构不完全兼容。
  - 维护状态不活跃。
  - 自建方案更轻量，且能精确匹配 soma 的数据序列化需求（Loro LoroText marks）。

### 1.3 行内公式 `$...$` 与块级公式 `$$...$$` 的解析策略

#### 方案 A：InputRule 自动转换（推荐）

使用 ProseMirror 的 `InputRule` 机制，在用户输入闭合 `$` 或 `$$` 时自动将文本转换为公式节点。

```
行内：用户输入 "$E=mc^2$" → InputRule 匹配 → 替换为 mathInline 节点
块级：用户输入 "$$\n" → InputRule 匹配 → 替换为 mathDisplay 节点
```

参考正则（来自 prosemirror-math）：
- 行内：`/\$([^$]+)\$/` — 匹配 `$...$` 包围的非空内容
- 块级：`/^\$\$\s*$/` — 行首 `$$` 后跟空白

#### 方案 B：Slash Command 插入

在现有 `/` 命令菜单中增加 "Math" 或 "Equation" 选项，插入一个空的公式节点供用户编辑。

#### 推荐：A + B 并行

- `$...$` InputRule 覆盖已知公式的快速输入场景
- `/math` Slash Command 覆盖"先创建空容器再填写"的场景
- 块级公式在大纲编辑器中意义有限（每行已是独立节点），可降低优先级或作为 Phase 2

### 1.4 与现有 RichTextEditor 的兼容性

#### Node Type 还是 Mark？

**必须用 Node Type，不能用 Mark。**

| 维度 | Mark (inline decoration) | Node Type (inline atom) |
|------|:---:|:---:|
| 内容模型 | 标记文本范围，文本本身仍存在 | 独立节点，包含 LaTeX 源码 |
| 编辑行为 | 无法阻止文本编辑（mark 范围内仍可输入文字） | atom 节点可控制编辑入口 |
| 渲染 | 只能对文本施加样式 | NodeView 可渲染任意 DOM（KaTeX 输出） |
| 与现有 inlineReference 的一致性 | 不一致 | 一致 — 均为 inline atom node |
| 光标行为 | 无法实现"点击进入公式编辑" | NodeView 可实现 cursor 进入 |

soma 现有的 `inlineReference` 已证明 inline atom node 模式可行。数学公式节点应采用完全相同的模式。

#### 与现有 Schema 的集成

当前 `pm-schema.ts` 定义：

```typescript
nodes: {
  doc: { content: 'paragraph' },
  paragraph: { content: 'inline*' },
  text: { group: 'inline' },
  inlineReference: { group: 'inline', inline: true, atom: true, ... },
}
```

新增数学节点：

```typescript
mathInline: {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { latex: { default: '' } },
  // toDOM / parseDOM 定义
}
```

因为 `paragraph` 的 content 规则是 `'inline*'`，任何 `group: 'inline'` 的节点自动被允许，**无需修改 content 表达式**。

## 2. 数据模型

### 2.1 公式在 LoroDoc 中的存储

**推荐方案：参照 inlineReference 的模式 — 占位符 + mark 编码。**

当前 `inlineReference` 的存储方式：
- 在 `name` 文本中使用 `\uFFFC` (Object Replacement Character) 作为占位符
- 在 `LoroText` 的 mark 系统中，使用 `link` mark 编码引用信息（`nodex-ref:targetId|displayName`）

数学公式可以采用类似方案：
- 在 `name` 文本中使用 `\uFFFC` 作为占位符
- 在 `LoroText` 的 mark 系统中，使用自定义 mark 编码 LaTeX 源码

#### 方案 A：复用 link mark + 自定义 href 前缀（推荐）

```
mark key: "link"
mark value: "nodex-math:base64(latex_source)"
```

优点：
- 不需要修改 Loro 的 mark 系统
- 与 inlineReference 的序列化/反序列化管线完全复用
- `loro-text-bridge.ts` 的 `readRichTextFromLoroText` / `writeRichTextToLoroText` 只需增加一个 href 前缀的分支

缺点：
- 滥用 "link" 语义
- Base64 编码增加存储开销（约 33%）

#### 方案 B：新增专用 mark key

```
mark key: "math"
mark value: "E=mc^2"  (直接存 LaTeX 源码)
```

优点：
- 语义清晰
- 无编码开销

缺点：
- 需要在 `MARK_KEYS` 数组和序列化管线中新增一个类型
- 需要在 `TextMark.type` union 中新增 `'math'`

**推荐方案 B。** 虽然需要扩展序列化管线，但改动量小且语义正确。避免把所有特殊内容都塞进 "link" mark 的做法。

### 2.2 TextMark 扩展

```typescript
// src/types/node.ts
export interface TextMark {
  start: number;
  end: number;
  type: 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'headingMark' | 'link' | 'math';
  attrs?: Record<string, string>;  // math 类型: { latex: "E=mc^2" }
}
```

序列化链路变更：

```
编辑器 (ProseMirror) ←→ docToMarks/marksToDoc ←→ TextMark[] ←→ writeRichTextToLoroText ←→ LoroText
```

- `pm-doc-utils.ts`：`docToMarks()` 中识别 `mathInline` 节点 → 生成 `\uFFFC` + `TextMark { type: 'math', attrs: { latex } }`
- `pm-doc-utils.ts`：`marksToDoc()` 中识别 `math` mark → 生成 `mathInline` ProseMirror 节点
- `loro-text-bridge.ts`：`writeRichTextToLoroText()` 中处理 `math` mark → `loroText.mark({ start, end }, 'math', latexString)`
- `loro-text-bridge.ts`：`readRichTextFromLoroText()` 中处理 `math` attribute → 生成 `TextMark { type: 'math' }`

### 2.3 与 Tana 数据模型的兼容性

Tana **不支持数学公式**（截至 2026-03，LaTeX 支持仍在 Ideas Board 阶段，尚未实现）。因此：

- **导入**：Tana JSON 中不存在数学公式数据，无需处理。
- **导出**：如果未来实现导出，公式可序列化为 `$latex$` 文本形式，保持可读性。
- **兼容性风险为零**。

### 2.4 导入/导出处理

- **Markdown 导入**：可复用现有 `remark-math` 解析 `$...$` / `$$...$$` 语法
- **Markdown 导出**：将 `math` TextMark 还原为 `$latex$` 文本
- **纯文本导出**：展示 LaTeX 源码（`$E=mc^2$`），而非渲染结果
- **HTML 导出**：调用 `katex.renderToString()` 生成静态 HTML

## 3. 渲染方案

### 3.1 编辑态

三种交互模式对比：

| 模式 | 体验 | 复杂度 | 参考 |
|------|------|--------|------|
| **A. Inline Editing (cursor 进入)** | 光标可直接进入公式节点内部编辑源码，左侧/上方实时预览渲染结果 | 高 — 需要 ProseMirror 嵌套编辑 + 自定义 cursor 管理 | prosemirror-math |
| **B. Click-to-Edit Overlay** | 点击公式弹出浮层/弹窗编辑 LaTeX 源码，确认后更新节点 | 中 — 类似 Notion 的 equation block | Notion |
| **C. 分离输入框 (Split View)** | 公式节点下方/旁边显示固定输入区域 | 低 — 但占空间大 | Overleaf |

**推荐：B (Click-to-Edit Overlay)。**

理由：
1. **Side Panel 宽度有限 (300-700px)**：Inline Editing 的实时预览会在窄面板中挤压空间。
2. **与现有编辑模式一致**：soma 的 `inlineReference` 也是 atom 节点，点击后通过 popover 交互。
3. **实现复杂度可控**：不需要嵌套 ProseMirror 实例或自定义 cursor 管理。
4. **交互清晰**：用户看到渲染结果 → 点击 → 弹出编辑面板 → 修改 → 实时预览 → 关闭。

具体交互设计：

```
展示态：  文本 [rendered_formula] 文本
           ↓ 点击公式
编辑态：  ┌─────────────────────────┐
          │  E = mc^2               │  ← LaTeX 输入框 (textarea/input)
          │  ─────────────────────  │
          │  E = mc²                │  ← KaTeX 实时预览
          └─────────────────────────┘
```

- 浮层使用 Portal 渲染（参考现有 `TagSelectorPopover` 模式）
- 输入框支持 Enter 确认、Escape 取消
- 实时预览使用 `katex.renderToString()` + `dangerouslySetInnerHTML`
- 错误处理：`throwOnError: false` + 显示错误提示文本

### 3.2 展示态

KaTeX 渲染时机：

| 方案 | 触发时机 | 优点 | 缺点 |
|------|----------|------|------|
| **NodeView.update()** | ProseMirror 事务更新时 | 自然集成、始终最新 | 无 — 推荐 |
| Lazy (IntersectionObserver) | 进入视口时 | 节省首屏渲染 | 布局跳动、复杂度高 |
| 预计算 HTML 缓存 | 节点创建/修改时 | 避免重复渲染 | 缓存失效管理、存储开销 |

**推荐：NodeView.update() 直接渲染。**

KaTeX 的 `renderToString()` 是同步的且极快（单个公式 < 1ms），不需要额外优化。渲染在 NodeView 的 `update()` 方法中执行：

```typescript
class MathInlineView {
  dom: HTMLElement;
  private latex: string;

  constructor(node: PMNode) {
    this.dom = document.createElement('span');
    this.dom.className = 'math-inline-node';
    this.latex = node.attrs.latex;
    this.renderKatex();
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'mathInline') return false;
    if (node.attrs.latex !== this.latex) {
      this.latex = node.attrs.latex;
      this.renderKatex();
    }
    return true;
  }

  private renderKatex() {
    try {
      this.dom.innerHTML = katex.renderToString(this.latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      this.dom.textContent = this.latex;
    }
  }
}
```

### 3.3 性能考虑

#### 大量公式节点的页面性能

| 场景 | 预估 | 影响 | 应对 |
|------|------|------|------|
| 单个公式渲染 | < 1ms | 无 | 无需优化 |
| 页面含 50 个公式 | < 50ms | 可接受 | 无需优化 |
| 页面含 500+ 个公式 | 可能达 200-500ms | 首屏可感知延迟 | 大纲懒加载已解决（子节点按需展开） |

soma 的大纲天然具有懒加载特性（`OutlinerItem` 的子节点在展开时才渲染），因此同时出现在视口中的公式数量有限。无需额外的虚拟化或 lazy rendering 策略。

#### KaTeX 字体加载

- 字体总大小 ~296 KB (woff2)，共 20 个文件
- Chrome 扩展的字体文件打包在扩展包内，从本地加载，无网络延迟
- 首次渲染可能触发字体加载（font-display: block），但由于是本地文件，延迟 < 10ms
- WXT 构建自动处理 CSS 中的字体引用路径

#### CSP (Content Security Policy) 兼容性

当前 CSP 配置：
```
extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' https: data:"
```

KaTeX 使用 inline style（`style` 属性）进行定位和尺寸计算。MV3 扩展默认允许 inline style（`style-src` 未被限制），因此 **无需修改 CSP**。

KaTeX 字体通过 CSS `@font-face` 引用本地 woff2 文件，同样无 CSP 问题。

## 4. 推荐方案

### 4.1 总体方案

采用 **自建 ProseMirror inline atom NodeView + KaTeX 渲染 + Click-to-Edit 浮层** 方案。

- 公式存储为 `\uFFFC` 占位符 + `math` mark (值为 LaTeX 源码)
- 公式渲染为 inline atom 节点，NodeView 调用 KaTeX `renderToString()`
- 编辑通过点击公式弹出浮层（LaTeX 输入 + 实时预览）
- 创建通过 `$...$` InputRule 自动转换 + `/math` Slash Command

### 4.2 实施阶段

#### Phase 1：基础渲染 + 创建（核心体验）

1. `pm-schema.ts` 新增 `mathInline` 节点定义
2. `RichTextEditor.tsx` 新增 MathInlineView NodeView
3. `pm-doc-utils.ts` 扩展 `docToMarks` / `marksToDoc` 支持 math 节点
4. `loro-text-bridge.ts` 扩展 `writeRichTextToLoroText` / `readRichTextFromLoroText` 支持 `math` mark
5. `types/node.ts` 的 `TextMark.type` 新增 `'math'`
6. InputRule 支持 `$...$` 自动转换
7. Slash Command 新增 `/math` 或 `/equation`

#### Phase 2：编辑浮层（完整编辑体验）

8. `MathEditOverlay.tsx` 浮层组件（LaTeX 输入 + 实时预览）
9. NodeView 点击事件 → 打开浮层
10. 浮层 Enter/Escape 处理

#### Phase 3：增强（可选）

11. 块级公式 `mathDisplay`（如有需求）
12. 公式模板库/常用符号面板
13. 搜索命令面板中搜索公式内容

### 4.3 需要改动的文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/components/editor/pm-schema.ts` | 修改 | 新增 `mathInline` 节点定义 |
| `src/components/editor/RichTextEditor.tsx` | 修改 | 注册 MathInlineView NodeView + InputRule + 浮层状态 |
| `src/lib/pm-doc-utils.ts` | 修改 | `docToMarks` / `marksToDoc` 支持 math 节点 ↔ TextMark |
| `src/lib/loro-text-bridge.ts` | 修改 | `MARK_KEYS` 新增 `'math'`，读写 math mark |
| `src/types/node.ts` | 修改 | `TextMark.type` union 新增 `'math'` |
| `src/lib/slash-commands.ts` | 修改 | 新增 `/math` 命令 |
| `src/components/editor/SlashCommandMenu.tsx` | 修改 | 新增 math icon |
| `src/components/editor/MathEditOverlay.tsx` | **新增** | 公式编辑浮层组件 |
| `src/assets/main.css` | 修改 | math 节点样式（已有 katex CSS 导入） |
| `tests/vitest/pm-doc-utils.test.ts` | 修改 | math 序列化/反序列化测试 |
| `tests/vitest/loro-text-bridge.test.ts` | 修改 | math mark 读写测试 |

预估工作量：Phase 1 约 1-2 天，Phase 2 约 1 天，Phase 3 视需求。

### 4.4 风险点和不确定性

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `\uFFFC` 占位符 + math mark 方案可能与 inlineReference 的占位符冲突（同一个位置既是 ref 又是 math） | 低 — 同一字符位置只会是一种类型 | 在 `readRichTextFromLoroText` 中按 mark key 区分：先检查 `math`，再检查 `link` |
| KaTeX 渲染错误（用户输入非法 LaTeX）可能导致空白或报错 | 中 | `throwOnError: false` + fallback 显示源码 + 错误提示 |
| 公式编辑浮层在窄 Side Panel 中的定位 | 中 | 参考现有 `TagSelectorPopover` 的自适应定位逻辑 |
| KaTeX CSS 中的字体路径在 WXT 构建后可能错误 | 低 — 当前 Chat MarkdownRenderer 已正常工作 | 已验证：`@import "katex/dist/katex.min.css"` 在 `main.css` 中，WXT/Vite 自动处理 |
| `TextMark.type` 新增 `'math'` 需要同步更新所有使用该 union 的位置 | 低 | grep 全部引用点一次改完 |
| 旧版本数据中不存在 `math` mark，读取时需要兼容 | 无风险 | `readRichTextFromLoroText` 的 mark 解析是 additive 的，未知 mark 自动忽略 |

### 4.5 不推荐的替代方案

| 方案 | 原因 |
|------|------|
| MathJax 替代 KaTeX | 体积翻倍、已有 KaTeX 依赖、同步渲染优势消失 |
| TipTap 数学扩展 | soma 不使用 TipTap 框架 |
| Mark 而非 Node | 无法控制渲染（mark 只能装饰文本）、无法实现编辑浮层 |
| 独立 "math" NodeType (非 inline) | 破坏大纲的行内编辑体验，每个公式变成独立大纲节点 |
| 在 NodexNode 上新增 `mathFormula` 顶层属性 | 违反"一切皆节点"原则 — 公式是行内富文本的一部分，不是节点级属性 |

## 参考资源

- [KaTeX 官方文档](https://katex.org/)
- [KaTeX GitHub](https://github.com/KaTeX/KaTeX)
- [prosemirror-math (benrbray)](https://github.com/benrbray/prosemirror-math) — 架构参考
- [Tiptap Mathematics Extension](https://tiptap.dev/docs/editor/extensions/nodes/mathematics)
- [ProseMirror 讨论: Replicating Typora's Math Editing](https://discuss.prosemirror.net/t/replicating-typoras-inline-display-math-editing/2906)
- [Notion Math Equations](https://www.notion.com/help/math-equations) — 交互参考
- [KaTeX vs MathJax Comparison](https://biggo.com/news/202511040733_KaTeX_MathJax_Web_Rendering_Comparison)
- [KaTeX Bundlephobia](https://bundlephobia.com/package/katex)
- [prosemirror-math npm](https://www.npmjs.com/package/@benrbray/prosemirror-math)

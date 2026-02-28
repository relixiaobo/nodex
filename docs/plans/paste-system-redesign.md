# 粘贴系统重做

## 背景

当前粘贴只读 `text/plain`，不认 HTML 格式，不认 Markdown 层级。用户从 Notion、网页、Markdown 编辑器复制内容粘贴进来，丢失所有格式和结构。现有实现分三处（RichTextEditor、TrailingInput、OutlinerItem），逻辑散落，每次加功能都在多处打补丁。

## 现状

- `RichTextEditor.tsx:740-798` — paste handler，只读 `text/plain`，单行 URL→link mark，多行→`onPasteMultiLine(lines: string[])`
- `OutlinerItem.tsx:1649-1654` — `handlePasteMultiLine` 调用 store 的 `createSiblingNodesFromPaste`
- `TrailingInput.tsx:484-519` — 独立 paste handler，也只读 `text/plain`，手动拆行创建节点
- `node-store.ts:655-673` — `createSiblingNodesFromPaste(afterNodeId, lines: string[])` 只接受纯文本行

已有可复用的基础设施：
- `htmlToMarks()` (`editor-marks.ts:120-193`) — HTML 片段 → text + marks，已支持 bold/italic/strike/code/link
- `ParsedContentNode` (`html-to-nodes.ts:20-29`) — 中间树类型 `{ name, marks, inlineRefs, children }`
- `createContentNodes()` (`html-to-nodes.ts:371-410`) — 递归创建 Loro 节点（带 marks + children），单次 commitDoc
- `loroDoc.setNodeRichTextContent()` (`loro-doc.ts:438`) — 已支持 marks + inlineRefs 参数

## 设计

### 核心思路

把变化的部分（解析剪贴板）和不变的部分（创建节点）分开。

解析：新增 `paste-parser.ts`，纯函数，输入剪贴板文本，输出 `ParsedContentNode[]`。
创建：复用已有的 `createContentNodes()` 的递归模式，扩展 store action 支持树结构 + marks。

### 类型复用

直接复用 `html-to-nodes.ts` 的 `ParsedContentNode`：

```ts
interface ParsedContentNode {
  name: string
  marks: TextMark[]
  inlineRefs: InlineRefEntry[]
  children: ParsedContentNode[]
}
```

不新增类型。

### `paste-parser.ts`（新文件，纯函数）

```ts
// 入口：解析多行粘贴内容
function parseMultiLinePaste(plain: string, html?: string): ParsedContentNode[]

// 内部：Markdown 列表解析
function parseMarkdownList(lines: string[]): ParsedContentNode[] | null

// 内部：HTML 块级拆分 + marks 提取
function parseHtmlBlocks(html: string): ParsedContentNode[]
```

`parseMultiLinePaste` 的逻辑：
1. 有 `html` 且含块级标签（`<p>`/`<li>`/`<br>`）→ `parseHtmlBlocks(html)`
2. `plain` 匹配 Markdown 列表模式（≥2 行有 `- `/`* `/`1. ` 前缀）→ `parseMarkdownList(lines)`
3. 都不是 → 按行拆分，每行一个 `{ name: line, marks: [], inlineRefs: [], children: [] }`

**Markdown 解析规则**：
- 识别 `- ` / `* ` / `+ ` / `1. ` 等列表标记，去掉标记前缀
- 通过前导空格/tab 计算缩进层级（2 空格或 1 tab = 1 级）
- 缩进差 → 父子关系：缩进更深的行成为上一行的 children
- 非列表行按前导空格推断层级，无空格为顶层
- 纯文本内容（不含标记）保持 flat，不强行建层级

**Tag & Field 识别规则**（参考 Tana 行为）：
- 行内 `#tag-name` → 解析后对该节点应用同名 supertag（已有则绑定，不存在则创建 tagDef）
- 行内 `field-name:: value` → 解析后为该节点创建 field tuple（field name 匹配已有 attrDef，不存在则创建）
- 多个 tag 和 field 可共存于同一行，如 `Buy milk #task priority:: high`
- Tag/field 文本从节点 name 中移除，只保留纯内容部分
- 解析结果扩展 `ParsedContentNode`：

```ts
interface ParsedContentNode {
  name: string
  marks: TextMark[]
  inlineRefs: InlineRefEntry[]
  children: ParsedContentNode[]
  // 粘贴解析扩展（可选）
  tags?: string[]                        // tag 名称列表
  fields?: { name: string; value: string }[]  // field name-value 对
}
```

注意：tag/field 的**解析**在 `paste-parser.ts`（纯函数，不依赖 store），**应用**（查找/创建 tagDef + attrDef + 绑定 tuple）在 store 的节点创建阶段。

**HTML 解析规则**：
- `<p>` / `<div>` → 独立节点
- `<br>` → 节点分隔
- `<ul>/<ol>` 内 `<li>` → 带 children 的层级结构
- 每个块内的 inline 格式 → 调用已有 `htmlToMarks()` 提取 marks
- 空块跳过

### Store 改动

扩展 `createSiblingNodesFromPaste`，新增重载或替换为：

```ts
createSiblingNodesFromPaste(
  afterNodeId: string,
  nodes: ParsedContentNode[]
): string | null
```

内部递归创建：顶层节点插为 afterNodeId 的后续兄弟，children 递归创建为子节点。marks 和 inlineRefs 通过 `setNodeRichTextContent` 写入。若 `tags`/`fields` 存在，查找或创建对应 tagDef/attrDef 并绑定 tuple。单次 `commitDoc()`。

旧的 `string[]` 签名不再保留 — 调用方全部改为传 `ParsedContentNode[]`。

### Paste handler 改动

**RichTextEditor.tsx** paste handler（740-798 行）：

```
⌘⇧V → 不变（flatten 为单行纯文本）
⌘V 单行 URL → 不变（link mark）
⌘V 多行 → 改为：
  1. 读 text/html 和 text/plain
  2. 调用 parseMultiLinePaste(plain, html)
  3. 第一个节点的 text+marks 插入当前编辑器
  4. 剩余节点通过 onPasteMultiLine 回调传出
```

`onPasteMultiLine` 签名从 `(lines: string[])` 改为 `(nodes: ParsedContentNode[])`。

**TrailingInput.tsx** paste handler（484-519 行）：
同样改为读 html + plain → `parseMultiLinePaste` → `createSiblingNodesFromPaste`。

**OutlinerItem.tsx** `handlePasteMultiLine`（1649-1654 行）：
签名跟着改，直接传 `ParsedContentNode[]` 给 store。

### 第一行插入当前编辑器（带 marks）

当前 `insertText(firstLine)` 只插纯文本。改为：如果第一个 ParsedContentNode 有 marks，用 ProseMirror transaction 插入 text + marks。

具体实现：遍历 `node.marks`，对每个 mark 调用 `tr.addMark(from + mark.start, from + mark.end, pmSchema.marks[mark.type].create(mark.attrs))`。

## 文件清单

| 文件 | 变动 |
|------|------|
| `src/lib/paste-parser.ts` | **新增** — 纯函数解析器 |
| `src/stores/node-store.ts` | 改 `createSiblingNodesFromPaste` 签名 + 递归创建 |
| `src/components/editor/RichTextEditor.tsx` | paste handler 读 html + 调用 parseMultiLinePaste + 带 marks 插入 |
| `src/components/editor/TrailingInput.tsx` | paste handler 同步改用 parseMultiLinePaste |
| `src/components/outliner/OutlinerItem.tsx` | `handlePasteMultiLine` 签名改 + `onPasteMultiLine` prop 类型改 |
| `tests/vitest/paste-parser.test.ts` | **新增** — 纯函数测试 |
| `tests/vitest/paste-multi-line.test.ts` | 适配新签名 |

## 执行步骤

### Step 1: paste-parser.ts + 测试

写 `parseMultiLinePaste`、`parseMarkdownList`、`parseHtmlBlocks`，全部纯函数。同步写 vitest 测试覆盖：

- 纯文本多行 → flat 节点列表
- Markdown 无序列表 → 正确层级
- Markdown 有序列表 → 去掉数字前缀
- Markdown 混合缩进 → 父子关系
- 非列表文本（有缩进但无标记）→ flat
- HTML `<p>` 多段 → 独立节点 + marks
- HTML `<ul><li>` → 层级 + marks
- HTML 单行 `<strong>` → 单节点带 bold mark
- `#tag` 识别 → tags 数组 + name 中移除 tag 文本
- `field:: value` 识别 → fields 数组 + name 中移除 field 文本
- 混合场景 `Buy milk #task priority:: high` → name="Buy milk", tags=["task"], fields=[{name:"priority", value:"high"}]
- 空行过滤
- 边界情况（空字符串、纯空格、单行）

跑 `typecheck` + `test:run`。

### Step 2: Store 改动

改 `createSiblingNodesFromPaste` 接受 `ParsedContentNode[]`，递归创建子节点。
改现有测试 `paste-multi-line.test.ts` 适配新签名。
新增测试：粘贴带 marks 的节点 → 验证 marks 写入；粘贴带 children 的树 → 验证层级。

跑 `typecheck` + `test:run`。

### Step 3: 接入 paste handler

改 RichTextEditor + TrailingInput + OutlinerItem 的粘贴流程。
第一行带 marks 插入当前编辑器。
剩余节点走新的 store action。

跑 `typecheck` + `check:test-sync` + `test:run` + `build`。

## 验证

1. `npm run typecheck` 通过
2. `npm run test:run` 全部通过（含新增 + 适配后的旧测试）
3. `npm run build` 通过
4. 视觉验证（由 nodex 通过 Chrome 扩展完成）：
   - 从 Notion 复制带格式文本 → 粘贴保留 bold/italic/link
   - 复制 Markdown 列表 → 粘贴生成层级节点，无 `- ` 前缀
   - 粘贴含 `#tag` 的文本 → 节点自动应用对应 supertag
   - 粘贴含 `field:: value` 的文本 → 节点自动创建 field tuple
   - 复制纯文本多行 → 行为不变（每行一个节点）
   - ⌘⇧V → 行为不变（压成一行纯文本）
   - 单行 URL → 行为不变（link mark）

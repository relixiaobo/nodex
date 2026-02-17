# Editor 迁移方案：TipTap → 直接 ProseMirror + Marks 数组数据模型

> **目标读者**: 负责实现迁移的 Dev Agent
> **核心目标**: 去掉 TipTap 封装层，直接使用 ProseMirror API；引入文本+marks 分离的数据模型
> **UI 约束**: 所有 UI 组件（FloatingToolbar、TagSelector、ReferenceSelector、SlashCommandMenu 等）保持现有视觉和交互不变

---

## 目录

1. [架构总览](#1-架构总览)
2. [数据模型迁移](#2-数据模型迁移)
3. [ProseMirror Schema 定义](#3-prosemirror-schema-定义)
4. [EditorView 集成](#4-editorview-集成)
5. [富文本 Marks 双向转换](#5-富文本-marks-双向转换)
6. [光标与焦点管理](#6-光标与焦点管理)
7. [键盘快捷键体系](#7-键盘快捷键体系)
8. [触发器系统统一化](#8-触发器系统统一化)
9. [浮动格式工具栏](#9-浮动格式工具栏)
10. [撤销/重做双栈架构](#10-撤销重做双栈架构)
11. [节点拆分与合并](#11-节点拆分与合并)
12. [外部值同步](#12-外部值同步)
13. [TrailingInput 迁移](#13-trailinginput-迁移)
14. [文件变更清单](#14-文件变更清单)
15. [分阶段实施计划](#15-分阶段实施计划)
16. [关键避坑清单](#16-关键避坑清单)
17. [测试策略](#17-测试策略)
18. [依赖变更](#18-依赖变更)

---

## 1. 架构总览

### 当前架构（TipTap）

```
OutlinerItem
  └─ NodeEditor (TipTap useEditor)
       ├─ StarterKit (配置大量 disable)
       ├─ 4 个 TipTap Extension (HashTag/Reference/Slash/FieldTrigger)
       ├─ 2 个自定义 Node/Mark (InlineRefNode/HeadingMark)
       ├─ outlinerKeymap Extension (15 个快捷键)
       ├─ FloatingToolbar (依赖 TipTap Editor API)
       └─ callbacksRef 桥接 30+ 回调到 Extension 闭包
```

**问题**: TipTap Extension 生命周期固化闭包；`wrapInP`/`stripWrappingP` 归一化层；触发器分散在 4 个独立 Plugin 中。

### 目标架构（直接 ProseMirror）

```
OutlinerItem
  └─ RichTextEditor (直接 new EditorView)
       ├─ ProseMirror Schema (单段落, bold/italic/code/strike/highlight/heading/link marks, inlineReference atom)
       ├─ ProseMirror keymap plugin (15+ 快捷键，直接读 propsRef)
       ├─ ProseMirror history plugin (文本级 undo)
       ├─ 触发器检测 (统一在 dispatchTransaction 中，不再是独立 plugin)
       ├─ FloatingToolbar (改用 PM state/view API)
       └─ propsRef 模式 (一个 ref 存所有 props，PM 闭包读 ref.current)
```

**核心改进**:
- 去掉 TipTap 层 → 消除 Extension 生命周期问题
- marks 数组数据模型 → 消除 HTML 解析/归一化
- 统一 `dispatchTransaction` → 4 个独立触发器合并为一处
- `propsRef` 模式统一 → 与当前 `callbacksRef` 类似但更简洁
- 双栈 undo → PM history 处理文字，UndoStore 处理结构

---

## 2. 数据模型迁移

### 当前数据模型

```typescript
// NodeProps.name 是 HTML 字符串
node.props.name = '<strong>Bold</strong> and <span data-inlineref-node="abc">Ref</span>'
```

### 目标数据模型

```typescript
// 纯文本 + 格式标记分离
interface TextMark {
  start: number;   // 字符偏移，包含
  end: number;     // 字符偏移，不包含
  type: 'bold' | 'italic' | 'strike' | 'code' | 'highlight' | 'headingMark' | 'link';
  attrs?: Record<string, string>;  // link 需要 { href: '...' }
}

interface InlineRefEntry {
  offset: number;          // \uFFFC 在纯文本中的偏移
  targetNodeId: string;
  displayName?: string;    // 缓存的显示名
}

// 新增到 NodeProps:
node.props.name = 'Bold and \uFFFC';  // 纯文本，引用位置用 \uFFFC 占位
node.props._marks = [{ start: 0, end: 4, type: 'bold' }];
node.props._inlineRefs = [{ offset: 9, targetNodeId: 'abc', displayName: 'Ref' }];
```

### 迁移策略：直接切换到 marks 模型

**产品尚未上线，无需兼容现有数据。** 一步到位：

- `props.name` 改为存储纯文本（引用位置用 `\uFFFC` 占位）
- 新增 `props._marks: TextMark[]` 和 `props._inlineRefs: InlineRefEntry[]`
- 测试数据如有问题直接准备新的种子数据
- Tana 导入流程同步更新：导入时将 HTML 转换为 marks 模型（保留 `htmlToMarks` 给导入用）
- 数据库 `nodes` 表新增 `marks JSONB` 和 `inline_refs JSONB` 列（或复用现有 JSONB 列）
- `node-service.ts` 的 `rowToNode`/`nodeToRow` 同步更新

**需要同步修改的文件**:
- `src/types/node.ts` — NodeProps 新增字段
- `src/stores/node-store.ts` — `setNodeNameLocal` 改为同时更新 name/marks/inlineRefs
- `src/services/node-service.ts` — 读写映射
- `src/entrypoints/test/seed-data.ts` — 种子数据改用 marks 格式
- `src/services/tana-import.ts` — 导入时 HTML → marks 转换
- `supabase/migrations/` — 新增列

### HTML ↔ Marks 转换函数

需要新建 `src/lib/editor-marks.ts`：

```typescript
// ─── htmlToMarks：HTML 字符串 → { text, marks, inlineRefs } ───

export function htmlToMarks(html: string): {
  text: string;
  marks: TextMark[];
  inlineRefs: InlineRefEntry[];
} {
  // 1. 创建 DOM 容器解析 HTML
  // 2. 深度优先遍历 DOM 节点
  // 3. 文本节点 → 追加到 text，记录当前活跃的 marks（从祖先标签继承）
  // 4. <span data-inlineref-node="..."> → 追加 \uFFFC 到 text，记录 InlineRefEntry
  // 5. <strong> → push bold mark 到栈；</strong> → pop
  // 6. 同理处理 <em>=italic, <code>=code, <s>/<strike>=strike, <mark>=highlight
  // 7. <span data-heading-mark> → headingMark
  // 8. <a href="..."> → link mark with attrs: { href }
  // 9. 返回 { text, marks: mergeAdjacentMarks(rawMarks), inlineRefs }
}

// ─── marksToHtml：纯文本 + marks → HTML 字符串 ───

export function marksToHtml(
  text: string,
  marks: TextMark[],
  inlineRefs: InlineRefEntry[],
): string {
  // 逆操作：将 marks 应用到纯文本上生成 HTML
  // 注意：\uFFFC 位置替换为 <span data-inlineref-node="..." class="inline-ref">displayName</span>
}

// ─── mergeAdjacentMarks：合并相邻同类型 marks ───

export function mergeAdjacentMarks(marks: TextMark[]): TextMark[] {
  // 排序 → 相邻 same type + touching end/start → 合并
}
```

这两个函数是迁移的**基础设施**，必须先实现并充分测试。

### 关键测试用例

```typescript
// 纯文本
htmlToMarks('Hello world')
  → { text: 'Hello world', marks: [], inlineRefs: [] }

// 基础 mark
htmlToMarks('<strong>Bold</strong> text')
  → { text: 'Bold text', marks: [{ start: 0, end: 4, type: 'bold' }], inlineRefs: [] }

// 嵌套 marks
htmlToMarks('<strong><em>BoldItalic</em></strong>')
  → { text: 'BoldItalic', marks: [
       { start: 0, end: 10, type: 'bold' },
       { start: 0, end: 10, type: 'italic' }
     ], inlineRefs: [] }

// 内联引用
htmlToMarks('See <span data-inlineref-node="abc">Ref</span> here')
  → { text: 'See \uFFFC here', marks: [], inlineRefs: [{ offset: 4, targetNodeId: 'abc', displayName: 'Ref' }] }

// Link
htmlToMarks('<a href="https://x.com">link</a>')
  → { text: 'link', marks: [{ start: 0, end: 4, type: 'link', attrs: { href: 'https://x.com' } }], inlineRefs: [] }

// 往返一致性
marksToHtml(...htmlToMarks(originalHtml)) === originalHtml  // 对所有已知格式
```

---

## 3. ProseMirror Schema 定义

新建 `src/components/editor/pm-schema.ts`：

```typescript
import { Schema } from 'prosemirror-model';

export const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph' },           // 只允许一个段落
    paragraph: { content: 'inline*' },
    text: { group: 'inline' },

    // Atom 节点：不可编辑的行内引用
    inlineReference: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        targetNodeId: { default: '' },
        displayName: { default: '' },
      },
      toDOM(node) {
        return ['span', {
          class: 'inline-ref',
          'data-inlineref-node': node.attrs.targetNodeId,
          contenteditable: 'false',
        }, node.attrs.displayName || '...'];
      },
      parseDOM: [{
        tag: 'span[data-inlineref-node]',
        getAttrs(dom: HTMLElement) {
          return {
            targetNodeId: dom.getAttribute('data-inlineref-node') || '',
            displayName: dom.textContent || '',
          };
        },
      }],
    },
  },

  marks: {
    bold: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b', getAttrs: (node: HTMLElement) => node.style.fontWeight !== 'normal' && null },
      ],
      toDOM() { return ['strong', 0]; },
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM() { return ['em', 0]; },
    },
    strike: {
      parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
      toDOM() { return ['s', 0]; },
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() { return ['code', { class: 'pm-code' }, 0]; },
    },
    highlight: {
      parseDOM: [{ tag: 'mark' }],
      toDOM() { return ['mark', 0]; },
    },
    headingMark: {
      parseDOM: [{ tag: 'span[data-heading-mark]' }],
      toDOM() { return ['span', { 'data-heading-mark': 'true' }, 0]; },
    },
    link: {
      attrs: { href: { default: '' } },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs(dom: HTMLElement) {
          return { href: dom.getAttribute('href') || '' };
        },
      }],
      toDOM(mark) { return ['a', { href: mark.attrs.href, target: '_blank', rel: 'noopener' }, 0]; },
    },
  },
});
```

### Schema 设计要点

- **单段落约束** (`doc: { content: 'paragraph' }`)：每个节点只有一行，不允许换行
- **inlineReference 是 atom**：不可编辑，光标在其前后跳转，ProseMirror 自动处理边界导航
- **headingMark 是 mark 不是 node**：保持与现有实现一致（inline mark，不是 block heading）
- **link.inclusive = false**：在链接末尾继续输入不会自动带上链接格式

---

## 4. EditorView 集成

新建 `src/components/editor/RichTextEditor.tsx`，替代当前 `NodeEditor.tsx`。

### 组件结构

```typescript
interface RichTextEditorProps {
  // 与当前 NodeEditorProps 完全一致（保持 API 兼容）
  nodeId: string;
  parentId: string;
  initialContent: string;  // HTML 字符串（阶段 A 不改存储格式）
  onBlur: () => void;
  onEnter: (afterContent?: string) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onDelete: () => boolean;
  onArrowUp: () => void;
  onArrowDown: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  // ... 所有 trigger/selection/description 回调保持不变
  editorRef?: MutableRefObject<EditorView | null>;  // 类型从 TipTap Editor 变为 PM EditorView
}

// ⚠️ 重要区分：以下值不是 props，是组件内部状态/store 派生值
// - savedRef: useRef<boolean>(false) — 组件内部标志位，防止重复保存
// - saveContent: useCallback — 组件内部函数，调用 updateNodeName 持久化到 Supabase
// - setNodeNameLocal: 从 useNodeStore 取得的 store action（本地乐观更新，不涉及网络）
// - updateNodeName: 从 useNodeStore 取得的 store action（写入 Supabase）
// - userId: 从 useWorkspaceStore 取得
```

### EditorView 挂载（mount 一次）

```typescript
export function RichTextEditor(props: RichTextEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;  // 每次 render 更新 ref

  // ── 组件内部状态（不是 props，但 PM 闭包需要读取）──
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const setNodeNameLocal = useNodeStore((s) => s.setNodeNameLocal);
  const userId = useWorkspaceStore((s) => s.userId);
  const savedRef = useRef(false);  // 防止重复保存

  // 将 store 派生值也存入 ref，供 PM 闭包读取
  const storeRef = useRef({ updateNodeName, setNodeNameLocal, userId });
  storeRef.current = { updateNodeName, setNodeNameLocal, userId };

  // saveContent：组件内部函数，调用 updateNodeName 持久化到 Supabase
  const saveContent = useCallback((html: string) => {
    if (savedRef.current) return;
    savedRef.current = true;
    const cleaned = stripWrappingP(html);  // 阶段 A 仍用 HTML；阶段 B 后直接取 text
    if (cleaned !== props.initialContent && storeRef.current.userId) {
      storeRef.current.updateNodeName(props.nodeId, cleaned, storeRef.current.userId);
    }
  }, [props.nodeId, props.initialContent]);

  // 阻止外部同步时触发 onChange
  const isExternalUpdate = useRef(false);
  // 阻止 PM undo 时进入 undoStore 循环（阶段 B）
  const isPMUndoRedo = useRef(false);
  // > field trigger fire-once 状态（等价于当前 FieldTriggerExtension 的 `let fired`）
  const fieldFiredRef = useRef(false);

  useEffect(() => {
    // ── 1. 解析初始内容 ──
    const { text, marks, inlineRefs } = htmlToMarks(propsRef.current.initialContent);
    const doc = marksToDoc(text, marks, inlineRefs);

    // ── 2. 创建 EditorState ──
    const state = EditorState.create({
      doc,
      plugins: [
        customKeymap(propsRef, storeRef, savedRef),  // 键盘快捷键
        history({ depth: 100 }),                      // PM 内置 undo/redo
        // 不再需要独立的触发器 plugin
      ],
    });

    // ── 3. 创建 EditorView ──
    const view = new EditorView(mountRef.current!, {
      state,

      editable: () => true,

      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        // ── 触发器检测（统一在此处）──
        if (tr.docChanged && !isExternalUpdate.current) {
          detectTriggers(view, newState, propsRef, fieldFiredRef);
        }

        // ── 通知父组件内容变化（live update）──
        if (tr.docChanged && !isExternalUpdate.current) {
          const result = docToMarks(newState.doc);
          const html = marksToHtml(result.text, result.marks, result.inlineRefs);
          storeRef.current.setNodeNameLocal(propsRef.current.nodeId, html);
        }

        // ── 浮动工具栏同步（通过 event 或 state 驱动）──
        // 由 FloatingToolbar 组件自行监听
      },

      // ⚠️ blur 事件处理（PM EditorView 没有 TipTap 的 onBlur 回调）
      // 必须通过 handleDOMEvents 注册
      handleDOMEvents: {
        blur(view, event) {
          if (!savedRef.current) {
            const result = docToMarks(view.state.doc);
            const html = marksToHtml(result.text, result.marks, result.inlineRefs);
            saveContent(html);  // 注意：saveContent 通过闭包捕获，但它是 useCallback 且依赖稳定
          }
          propsRef.current.onBlur();
          return false;  // 不阻止默认行为
        },
      },

      handlePaste(view, event) {
        // 粘贴纯文本，去掉换行（单行节点）
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') || '';
        const cleaned = text.replace(/[\r\n]+/g, ' ');
        view.dispatch(view.state.tr.insertText(cleaned));
        return true;
      },
    });

    viewRef.current = view;

    return () => {
      // 卸载前保存（如果 blur 没有触发保存）
      if (!savedRef.current) {
        const result = docToMarks(view.state.doc);
        const html = marksToHtml(result.text, result.marks, result.inlineRefs);
        saveContent(html);
      }
      view.destroy();
    };
  }, []);  // 仅挂载一次，不随 props 变化重建

  // ... focus 管理、render
}
```

### 关键模式：`propsRef` + `storeRef` + `savedRef`

```typescript
// ── 三个 ref 各司其职，替代当前 NodeEditor 的 callbacksRef + 4 个 trigger ref ──

// 1. propsRef：存储所有 props（回调 + 状态），PM 闭包读 propsRef.current
const propsRef = useRef(props);
propsRef.current = props;  // 每次 render 更新

// 2. storeRef：存储从 Zustand store 取得的 action/值
//    - setNodeNameLocal: 本地乐观更新（不涉及网络）
//    - updateNodeName: 持久化到 Supabase
//    - userId: 当前用户 ID
const storeRef = useRef({ updateNodeName, setNodeNameLocal, userId });
storeRef.current = { updateNodeName, setNodeNameLocal, userId };

// 3. savedRef：防重复保存标志（组件内部状态）
const savedRef = useRef(false);

// 在 keymap 中同时使用三个 ref：
function customKeymap(
  propsRef: MutableRefObject<Props>,
  storeRef: MutableRefObject<StoreValues>,
  savedRef: MutableRefObject<boolean>,
) {
  return keymap({
    'Enter': (state, dispatch, view) => {
      // 总是读 propsRef.current，不会闭包过期
      if (propsRef.current.hashTagActive) {
        propsRef.current.onHashTagConfirm();
        return true;
      }
      // ...
    },
    'Backspace': (state, dispatch, view) => {
      // savedRef 和 storeRef 也通过参数传入
      // ...
    },
  });
}
```

**为什么比当前 callbacksRef 更好**: 当前 NodeEditor 维护了 `callbacksRef`（30+ 字段，混合了 props 回调和 store 值）加 4 个独立 trigger ref（`hashTagRef`/`referenceRef`/`slashRef`/`fieldTriggerRef`），每个 render 都要更新所有 ref。新方案用 `propsRef` 存 props、`storeRef` 存 store 值、`savedRef` 存内部标志，职责清晰。

**⚠️ 不要把 `savedRef`/`saveContent`/`setNodeNameLocal` 放进 propsRef**: 这些不是外部 props，而是组件内部状态或 store 派生值。混在 props 里会导致类型混乱和逻辑不清。

---

## 5. 富文本 Marks 双向转换

新建 `src/lib/editor-marks.ts`（与 §2 中描述的一致），同时新建 `src/lib/pm-doc-utils.ts`：

### marksToDoc：纯文本 + marks → PM 文档

```typescript
import { schema } from '../components/editor/pm-schema';
import type { Node as PMNode } from 'prosemirror-model';

export function marksToDoc(
  text: string,
  marks: TextMark[],
  inlineRefs: InlineRefEntry[],
): PMNode {
  if (!text && inlineRefs.length === 0) {
    return schema.node('doc', null, [schema.node('paragraph', null)]);
  }

  // 1. 构建引用偏移 Map
  const refByOffset = new Map<number, InlineRefEntry>();
  for (const ref of inlineRefs) {
    refByOffset.set(ref.offset, ref);
  }

  // 2. 收集所有边界点
  const boundaries = new Set([0, text.length]);
  for (const mark of marks) {
    boundaries.add(mark.start);
    boundaries.add(mark.end);
  }
  for (const ref of inlineRefs) {
    boundaries.add(ref.offset);
    boundaries.add(ref.offset + 1);
  }

  // 3. 排序边界点
  const sorted = [...boundaries].sort((a, b) => a - b);

  // 4. 按边界拆分生成 PM inline 节点
  const inlineNodes: PMNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    const segText = text.slice(segStart, segEnd);

    if (segText === '\uFFFC' && refByOffset.has(segStart)) {
      // 行内引用 → atom 节点
      const ref = refByOffset.get(segStart)!;
      inlineNodes.push(schema.nodes.inlineReference.create({
        targetNodeId: ref.targetNodeId,
        displayName: ref.displayName || '',
      }));
    } else if (segText) {
      // 普通文本 → 带 marks 的 text 节点
      const activeMarks = marks
        .filter(m => m.start <= segStart && segEnd <= m.end)
        .map(m => {
          if (m.type === 'link' && m.attrs) {
            return schema.marks.link.create(m.attrs);
          }
          return schema.marks[m.type].create();
        });
      inlineNodes.push(schema.text(segText, activeMarks));
    }
  }

  const paragraph = inlineNodes.length > 0
    ? schema.node('paragraph', null, inlineNodes)
    : schema.node('paragraph', null);

  return schema.node('doc', null, [paragraph]);
}
```

### docToMarks：PM 文档 → 纯文本 + marks

```typescript
export function docToMarks(doc: PMNode): {
  text: string;
  marks: TextMark[];
  inlineRefs: InlineRefEntry[];
} {
  let text = '';
  const rawMarks: TextMark[] = [];
  const inlineRefs: InlineRefEntry[] = [];

  doc.firstChild?.forEach((node) => {
    if (node.type.name === 'inlineReference') {
      inlineRefs.push({
        offset: text.length,
        targetNodeId: node.attrs.targetNodeId,
        displayName: node.attrs.displayName,
      });
      text += '\uFFFC';
    } else if (node.isText) {
      const start = text.length;
      text += node.text!;
      for (const mark of node.marks) {
        const entry: TextMark = {
          start,
          end: start + node.text!.length,
          type: mark.type.name as TextMark['type'],
        };
        if (mark.type.name === 'link') {
          entry.attrs = { href: mark.attrs.href };
        }
        rawMarks.push(entry);
      }
    }
  });

  return {
    text,
    marks: mergeAdjacentMarks(rawMarks),
    inlineRefs,
  };
}
```

### 拆分/合并 Marks（供 Enter/Backspace 使用）

```typescript
// 在 cursorPos 处切开 marks
export function splitMarks(
  marks: TextMark[],
  splitPos: number,
): [TextMark[], TextMark[]] {
  const before: TextMark[] = [];
  const after: TextMark[] = [];

  for (const mark of marks) {
    if (mark.end <= splitPos) {
      before.push(mark);
    } else if (mark.start >= splitPos) {
      after.push({
        ...mark,
        start: mark.start - splitPos,
        end: mark.end - splitPos,
      });
    } else {
      // mark 跨越拆分点
      before.push({ ...mark, end: splitPos });
      after.push({
        ...mark,
        start: 0,
        end: mark.end - splitPos,
      });
    }
  }

  return [before, after];
}

// 合并两段 marks
export function combineMarks(
  firstMarks: TextMark[],
  secondMarks: TextMark[],
  firstTextLength: number,
): TextMark[] {
  return mergeAdjacentMarks([
    ...firstMarks,
    ...secondMarks.map(m => ({
      ...m,
      start: m.start + firstTextLength,
      end: m.end + firstTextLength,
    })),
  ]);
}
```

---

## 6. 光标与焦点管理

### PM 光标位置公式

```
PM position = charOffset + 1  （单段落 schema，position 0 是 doc 开头之前）
charOffset = pmPos - 1
```

### 焦点/失焦同步

```typescript
// 在 RichTextEditor 中
useLayoutEffect(() => {
  const view = viewRef.current;
  if (!view) return;

  // 两步聚焦（与当前 NodeEditor 逻辑一致，但用 PM API）
  requestAnimationFrame(() => {
    // Step 1: 先聚焦到编辑器
    view.focus();

    // Step 2: 如果有 click 坐标，设置光标位置
    const clickInfo = useUIStore.getState().focusClickCoords;
    if (clickInfo && clickInfo.nodeId === props.nodeId && clickInfo.parentId === props.parentId) {
      try {
        const maxPos = view.state.doc.content.size - 1;
        const pmPos = Math.max(1, Math.min(clickInfo.textOffset + 1, maxPos));
        const tr = view.state.tr.setSelection(
          TextSelection.create(view.state.doc, pmPos)
        );
        tr.setMeta('addToHistory', false);  // 不污染 PM 撤销历史
        view.dispatch(tr);
      } catch { /* fallback: 光标保持默认位置 */ }
      useUIStore.getState().setFocusClickCoords(null);
    } else {
      // 无 click 信息 → 光标放末尾
      const endPos = view.state.doc.content.size - 1;
      const tr = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, endPos)
      );
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    }

    // Step 3: 消费 pendingInputChar
    const pendingChar = useUIStore.getState().pendingInputChar;
    if (pendingChar) {
      useUIStore.getState().setPendingInputChar(null);
      view.dispatch(view.state.tr.insertText(pendingChar));
    }

    // Step 4: 暴露 editorRef
    if (props.editorRef) props.editorRef.current = view;
  });

  return () => {
    if (props.editorRef) props.editorRef.current = null;
  };
}, []);
```

**为什么用 `requestAnimationFrame`**: PM + React 需要一帧来稳定 DOM 状态。直接设置可能因 React 渲染尚未完成而失败。这与参考架构的建议一致。

### 关键规则

| 场景 | `cursorPosition` | 说明 |
|------|-------------------|------|
| 鼠标点击 | clickOffset | 从 `focusClickCoords` 获取 |
| ArrowUp 到达 | `text.length` | 从上方来 → 光标放末尾 |
| ArrowDown 到达 | `0` | 从下方来 → 光标放开头 |
| 新建节点 | `0` | 空节点光标在开头 |
| 拆分后（前半） | 不变 | 光标留在原位 |
| 拆分后（后半） | `0` | 新节点光标在开头 |

---

## 7. 键盘快捷键体系

### 三层处理器架构

```
┌──────────────────────────┐
│ ProseMirror Keymap        │ 最先执行（有 DOM focus 时）
│  格式: Cmd+B/I/U/E        │
│  Undo/Redo: Cmd+Z/Y       │
│  菜单拦截: Enter/Esc/Arrow │
│  结构键: 委托到外部回调     │
└────────────┬─────────────┘
             ↓ (return false 时)
┌──────────────────────────┐
│ Global Handler            │ document 级别事件监听（已有）
│  Esc (模式切换)            │
│  Shift+Arrow (扩展选择)    │
│  Cmd+A (全选)              │
│  批量操作 (选中模式)        │
└──────────────────────────┘
```

### keymap 实现

新建 `src/components/editor/pm-keymap.ts`：

```typescript
import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import { toggleMark } from 'prosemirror-commands';
import { TextSelection } from 'prosemirror-state';
import { schema } from './pm-schema';
import {
  resolveNodeEditorEnterIntent,
  resolveNodeEditorArrowIntent,
  resolveNodeEditorEscapeIntent,
  resolveNodeEditorForceCreateIntent,
} from '../../lib/node-editor-shortcuts.js';
import { getPrimaryShortcutKey, getShortcutKeys } from '../../lib/shortcut-registry';

// shortcut-registry 的键名映射到 PM keymap 格式（已兼容，无需转换）

export function createNodeEditorKeymap(
  propsRef: MutableRefObject<any>,
  storeRef: MutableRefObject<StoreValues>,
  savedRef: MutableRefObject<boolean>,
) {
  return keymap({
    // ── 格式快捷键（PM 直接处理）──
    'Mod-b': toggleMark(schema.marks.bold),
    'Mod-i': toggleMark(schema.marks.italic),
    'Mod-e': toggleMark(schema.marks.code),
    'Mod-Shift-s': toggleMark(schema.marks.strike),
    'Mod-Shift-h': toggleMark(schema.marks.highlight),

    // ── Undo/Redo ──
    'Mod-z': (state, dispatch) => {
      const didUndo = undo(state, dispatch);
      // 阶段 B: if (!didUndo) undoStore.undo();
      return true;  // 始终拦截，不让浏览器处理
    },
    'Mod-y': (state, dispatch) => {
      const didRedo = redo(state, dispatch);
      return true;
    },
    'Mod-Shift-z': (state, dispatch) => {
      const didRedo = redo(state, dispatch);
      return true;
    },

    // ── Enter：下拉确认 或 拆分/新建节点 ──
    'Enter': (state, dispatch, view) => {
      const p = propsRef.current;
      const intent = resolveNodeEditorEnterIntent({
        referenceActive: p.referenceActive ?? false,
        hashTagActive: p.hashTagActive ?? false,
        slashActive: p.slashActive ?? false,
      });

      if (intent === 'reference_confirm') { p.onReferenceConfirm?.(); return true; }
      if (intent === 'hashtag_confirm') { p.onHashTagConfirm?.(); return true; }
      if (intent === 'slash_confirm') { p.onSlashConfirm?.(); return true; }

      // 正常 Enter：拆分或新建
      handleEnterSplit(view!, propsRef, storeRef, savedRef);
      return true;
    },

    // ── Tab / Shift+Tab ──
    'Tab': () => { propsRef.current.onIndent(); return true; },
    'Shift-Tab': () => { propsRef.current.onOutdent(); return true; },

    // ── Backspace（空节点时拦截）──
    'Backspace': (state, dispatch, view) => {
      const textContent = state.doc.textContent;
      // ⚠️ 浏览器可能在空 contentEditable 中插入零宽字符 \u200B
      // 必须 strip 后再判断是否为空
      const stripped = textContent.replace(/\u200B/g, '').trim();
      const isEmpty = stripped.length === 0;
      if (isEmpty) {
        storeRef.current.setNodeNameLocal(propsRef.current.nodeId, '');
        flushSave(view!, storeRef, savedRef, propsRef);
        return propsRef.current.onDelete();
      }
      return false;  // 非空 → 让 PM 默认处理
    },

    // ── ArrowUp / ArrowDown ──
    'ArrowUp': (state) => {
      const p = propsRef.current;
      const intent = resolveNodeEditorArrowIntent({
        referenceActive: p.referenceActive ?? false,
        hashTagActive: p.hashTagActive ?? false,
        slashActive: p.slashActive ?? false,
        isAtBoundary: state.selection.from <= 1,
      });
      if (intent === 'reference_nav') { p.onReferenceNavUp?.(); return true; }
      if (intent === 'hashtag_nav') { p.onHashTagNavUp?.(); return true; }
      if (intent === 'slash_nav') { p.onSlashNavUp?.(); return true; }
      if (intent === 'navigate_outliner') { p.onArrowUp(); return true; }
      return false;
    },

    'ArrowDown': (state) => {
      const p = propsRef.current;
      const endPos = state.doc.content.size - 1;
      const intent = resolveNodeEditorArrowIntent({
        referenceActive: p.referenceActive ?? false,
        hashTagActive: p.hashTagActive ?? false,
        slashActive: p.slashActive ?? false,
        isAtBoundary: state.selection.to >= endPos,
      });
      if (intent === 'reference_nav') { p.onReferenceNavDown?.(); return true; }
      if (intent === 'hashtag_nav') { p.onHashTagNavDown?.(); return true; }
      if (intent === 'slash_nav') { p.onSlashNavDown?.(); return true; }
      if (intent === 'navigate_outliner') { p.onArrowDown(); return true; }
      return false;
    },

    // ── Escape ──
    'Escape': (state, dispatch, view) => {
      const p = propsRef.current;
      const intent = resolveNodeEditorEscapeIntent(
        p.referenceActive ?? false,
        p.hashTagActive ?? false,
        p.slashActive ?? false,
      );
      if (intent === 'reference_close') { p.onReferenceClose?.(); return true; }
      if (intent === 'hashtag_close') { p.onHashTagClose?.(); return true; }
      if (intent === 'slash_close') { p.onSlashClose?.(); return true; }
      if (intent === 'select_current') {
        flushSave(view!, storeRef, savedRef, propsRef);
        p.onEscapeSelect?.();
        return true;
      }
      return false;
    },

    // ── Shift+Arrow（选择扩展）──
    'Shift-ArrowUp': (state, dispatch, view) => {
      flushSave(view!, storeRef, savedRef, propsRef);
      propsRef.current.onShiftArrow?.('up');
      return true;
    },
    'Shift-ArrowDown': (state, dispatch, view) => {
      flushSave(view!, storeRef, savedRef, propsRef);
      propsRef.current.onShiftArrow?.('down');
      return true;
    },

    // ── Mod+A（双击全选）──
    'Mod-a': (state) => {
      const { from, to } = state.selection;
      const docEnd = state.doc.content.size - 1;
      if (from <= 1 && to >= docEnd) {
        propsRef.current.onSelectAll?.();
        return true;
      }
      return false;  // 让 PM 先选全文
    },

    // ── Mod+Enter（toggle checkbox 或 force create）──
    'Mod-Enter': () => {
      const p = propsRef.current;
      const intent = resolveNodeEditorForceCreateIntent(
        p.referenceActive ?? false,
        p.hashTagActive ?? false,
        p.slashActive ?? false,
      );
      if (intent === 'reference_create') { p.onReferenceCreate?.(); return true; }
      if (intent === 'hashtag_create') { p.onHashTagCreate?.(); return true; }
      if (intent === 'noop') return true;
      p.onToggleDone?.();
      return true;
    },

    // ── Mod+Shift+Arrow（移动节点）──
    'Mod-Shift-ArrowUp': () => { propsRef.current.onMoveUp(); return true; },
    'Mod-Shift-ArrowDown': () => { propsRef.current.onMoveDown(); return true; },

    // ── Ctrl+I（描述编辑，注意 Mac 上 Ctrl ≠ Cmd）──
    'Ctrl-i': () => { propsRef.current.onDescriptionEdit?.(); return true; },
  });
}
```

**保留现有 `shortcut-registry.ts`**: 继续使用 `getPrimaryShortcutKey`/`getShortcutKeys` 读取用户自定义键位。上面示例用硬编码只是为了清晰，实际实现应该使用 registry。

---

## 8. 触发器系统统一化

### 当前：4 个独立 TipTap Extension

```
HashTagExtension.ts      → ProseMirror Plugin → view.update() → 正则匹配 #
ReferenceExtension.ts    → ProseMirror Plugin → view.update() → 正则匹配 @
SlashCommandExtension.ts → ProseMirror Plugin → view.update() → 正则匹配 /
FieldTriggerExtension.ts → ProseMirror Plugin → view.update() → 匹配 >
```

### 目标：统一在 `dispatchTransaction` 中检测

```typescript
// 在 dispatchTransaction 内部调用
// fieldFiredRef: 组件级 useRef<boolean>(false)，跟踪 > 是否已触发
function detectTriggers(
  view: EditorView,
  newState: EditorState,
  propsRef: MutableRefObject<Props>,
  fieldFiredRef: MutableRefObject<boolean>,
) {
  const { from } = newState.selection;
  const $from = newState.doc.resolve(from);
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');

  const p = propsRef.current;

  // ── # HashTag ──
  const hashMatch = textBefore.match(/#(\w*)$/);
  if (hashMatch) {
    const query = hashMatch[1];
    const hashStart = from - hashMatch[0].length;
    p.onHashTag?.(query, hashStart, from);
  } else {
    p.onHashTagDeactivate?.();
  }

  // ── @ Reference ──
  const refMatch = textBefore.match(/@([^\s]*)$/);
  if (refMatch) {
    const query = refMatch[1];
    const atStart = from - refMatch[0].length;
    p.onReference?.(query, atStart, from);
  } else {
    p.onReferenceDeactivate?.();
  }

  // ── / Slash Command ──
  const slashMatch = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
  if (slashMatch) {
    const query = slashMatch[1];
    const slashStart = from - (query.length + 1);
    p.onSlashCommand?.(query, slashStart, from);
  } else {
    p.onSlashCommandDeactivate?.();
  }

  // ── > Field Trigger ──
  // fire-once 语义：只在 textBefore === '>' 且尚未触发时 fire
  // 需要外部传入 fired state ref（与当前 FieldTriggerExtension 的 `let fired = false` 等价）
  if (textBefore === '>' && !fieldFiredRef.current) {
    fieldFiredRef.current = true;
    p.onFieldTriggerFire?.();
  } else if (textBefore !== '>') {
    fieldFiredRef.current = false;  // 文本变化后重置，允许再次触发
  }
}
```

### 保留 `hasUserEdited` 守卫

当前 4 个 Extension 都有 `hasUserEdited` 守卫，防止挂载时误触发。迁移时需要保留：

```typescript
// 在 RichTextEditor 组件中
const hasUserEdited = useRef(false);

// 在 dispatchTransaction 中
if (tr.docChanged) hasUserEdited.current = true;

if (tr.docChanged && hasUserEdited.current) {
  detectTriggers(view, newState, propsRef);
}
```

### 触发器文本清除

当前由父组件通过 `editorRef` 操作编辑器删除触发文本（如 `#query`）。迁移后方式不变，只是 API 从 TipTap `editor.chain().deleteRange()` 变为 PM `view.dispatch(tr.delete(from, to))`：

```typescript
// OutlinerItem 中清除触发文本（伪代码，实际在父组件）
const view = editorRef.current;  // EditorView
if (view) {
  const tr = view.state.tr.delete(from, to);
  tr.setMeta('addToHistory', false);  // 不计入 undo
  view.dispatch(tr);
}
```

---

## 9. 浮动格式工具栏

### 改动范围

`FloatingToolbar.tsx` 的 UI 和交互逻辑保持不变。只需要将 TipTap Editor API 替换为 PM API：

| TipTap API | ProseMirror API |
|------------|-----------------|
| `editor.state.selection` | `view.state.selection` |
| `editor.view.coordsAtPos(pos)` | `view.coordsAtPos(pos)` |
| `editor.isActive('bold')` | `isMarkActive(view.state, schema.marks.bold)` |
| `editor.getAttributes('link').href` | `getLinkHref(view.state)` |
| `editor.chain().focus().toggleBold().run()` | `toggleMark(schema.marks.bold)(view.state, view.dispatch)` |
| `editor.chain().focus().extendMarkRange('link').setLink({href}).run()` | 自定义 `applyLink(view, href)` |
| `editor.on('selectionUpdate', fn)` | 在 `dispatchTransaction` 中触发，或用 PM Plugin |
| `editor.view.hasFocus()` | `view.hasFocus()` |

### Props 类型变化

```typescript
// 当前
interface FloatingToolbarProps {
  editor: Editor;  // TipTap Editor
}

// 迁移后
interface FloatingToolbarProps {
  view: EditorView;  // ProseMirror EditorView
}
```

### Mark 状态检测工具函数

```typescript
function isMarkActive(state: EditorState, markType: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return markType.isInSet(state.storedMarks || $from.marks()) !== undefined;
  }
  let allHave = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && !markType.isInSet(node.marks)) {
      allHave = false;
    }
  });
  return allHave;
}

function getLinkHref(state: EditorState): string {
  const { from, $from, empty } = state.selection;
  const marks = empty ? (state.storedMarks || $from.marks()) : [];
  // 也需检查选区内的 marks
  const linkMark = schema.marks.link.isInSet(marks);
  return linkMark?.attrs.href || '';
}
```

### 事件监听变化

当前 FloatingToolbar 通过 `editor.on('selectionUpdate', syncToolbar)` 监听。迁移后有两种方案：

**方案 A（推荐）**: 通过 React state 驱动，在 `dispatchTransaction` 中更新一个 `selectionTick` 让 FloatingToolbar re-render。

**方案 B**: 创建一个 PM Plugin 专门发射自定义事件。

方案 A 更简单：

```typescript
// RichTextEditor 中
const [selectionTick, setSelectionTick] = useState(0);

// 在 dispatchTransaction 中
setSelectionTick(t => t + 1);

// 传给 FloatingToolbar
<FloatingToolbar view={viewRef.current} tick={selectionTick} />
```

### 工具栏按钮交互不变

继续使用 `onMouseDown + e.preventDefault()` 阻止工具栏按钮抢焦点。这是 contentEditable 编辑器的标准做法。

---

## 10. 撤销/重做双栈架构

### 阶段 A（本次迁移）：仅 PM History

本次迁移使用 ProseMirror 内置的 `history()` 插件处理文字级 undo/redo。暂不实现结构化 UndoStore。

```typescript
import { history, undo, redo } from 'prosemirror-history';

// 在 EditorState.create 的 plugins 中
history({ depth: 100 })
```

### 阶段 B（后续任务）：结构化 UndoStore

新建 `src/stores/undo-store.ts`，参考架构提供了完整设计：

```typescript
interface UndoEntry {
  type: string;                    // 如 'split_node', 'delete_node'
  description: string;
  undo: () => Promise<void>;       // 逆操作 + 恢复焦点
  redo: () => Promise<void>;       // 重操作 + 恢复焦点
  timestamp: number;
  nodeId?: string;                 // 用于文本编辑合并
  beforeText?: string;
  afterText?: string;
}

// Cmd+Z → PM keymap 拦截 → 先尝试 PM undo → PM 历史空 → fallback 到 undoStore.undo()
// 文本编辑 500ms 内合并为一条 entry
// Promise chain 串行执行，防止快速连按并发
```

**阶段 B 不在本次迁移范围内**，但 PM keymap 中的 `Mod-z` handler 应预留扩展点。

---

## 11. 节点拆分与合并

### Enter 拆分（当前实现的直接迁移）

当前 NodeEditor 的 Enter handler 使用 TipTap API 拆分节点。迁移后用 PM API：

```typescript
function handleEnterSplit(
  view: EditorView,
  propsRef: MutableRefObject<Props>,
  storeRef: MutableRefObject<StoreValues>,
  savedRef: MutableRefObject<boolean>,
) {
  const { from } = view.state.selection;
  const doc = view.state.doc;
  const docEnd = doc.content.size - 1;
  const p = propsRef.current;

  if (from >= docEnd) {
    // 光标在末尾：保存 + 创建空兄弟
    flushSave(view, storeRef, savedRef, propsRef);
    p.onEnter();
  } else {
    // 光标在中间：拆分
    const para = doc.firstChild!;
    const paraOffset = from - 1;  // PM position 1 = paragraph content 开头

    // 获取拆分后的 after 部分
    const afterResult = docToMarks(
      schema.node('doc', null, [
        schema.node('paragraph', null, para.content.cut(paraOffset).content)
      ])
    );
    const afterHtml = marksToHtml(afterResult.text, afterResult.marks, afterResult.inlineRefs);

    // 从编辑器中删除 after 部分
    const tr = view.state.tr.delete(from, doc.content.size - 1);
    view.dispatch(tr);

    // 保存 before 部分
    flushSave(view, storeRef, savedRef, propsRef);

    // 创建新节点，传入 after 内容
    p.onEnter(afterHtml);
  }
}

// 辅助：立即保存当前内容
// ⚠️ saveContent 不在 propsRef 中（它是组件内部 useCallback），需要单独传入
// 或者通过 storeRef + savedRef 重建等价逻辑
function flushSave(
  view: EditorView,
  storeRef: MutableRefObject<StoreValues>,
  savedRef: MutableRefObject<boolean>,
  propsRef: MutableRefObject<Props>,
) {
  if (savedRef.current) return;
  savedRef.current = true;
  const result = docToMarks(view.state.doc);
  const html = marksToHtml(result.text, result.marks, result.inlineRefs);
  if (html !== propsRef.current.initialContent && storeRef.current.userId) {
    storeRef.current.updateNodeName(propsRef.current.nodeId, html, storeRef.current.userId);
  }
}
```

---

## 12. 外部值同步

当 store 中的值被外部修改（如 undo/redo、远端同步）时，需要更新 PM 编辑器：

```typescript
// 当 initialContent prop 变化时（通过 propsRef 检测）
useEffect(() => {
  const view = viewRef.current;
  if (!view || !propsRef.current.initialContent) return;

  const currentResult = docToMarks(view.state.doc);
  const currentHtml = marksToHtml(currentResult.text, currentResult.marks, currentResult.inlineRefs);

  if (currentHtml === propsRef.current.initialContent) return;  // 已是最新

  isExternalUpdate.current = true;
  try {
    const { text, marks, inlineRefs } = htmlToMarks(propsRef.current.initialContent);
    const newDoc = marksToDoc(text, marks, inlineRefs);
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
    tr.setMeta('addToHistory', false);  // 不计入 undo
    view.dispatch(tr);
  } finally {
    isExternalUpdate.current = false;
  }
}, [/* 监听 initialContent 变化的适当依赖 */]);
```

**`isExternalUpdate` 的重要性**: 防止外部同步 → dispatchTransaction → setNodeNameLocal → 又触发同步的循环。

---

## 13. TrailingInput 迁移

`TrailingInput.tsx` 当前也使用 TipTap `useEditor`。迁移方式与 NodeEditor 相同：

- 替换 `useEditor` → `new EditorView`
- 替换 TipTap `Extension.create` keymap → PM `keymap()`
- 替换 TipTap `Placeholder` → PM Plugin 或 CSS `:empty::before` 伪元素
- 保持 `resolveTrailingUpdateAction` 等 util 不变

### Placeholder 实现

当前用 `@tiptap/extension-placeholder`。迁移后用 CSS：

```css
/* 当 paragraph 为空时显示 placeholder */
.trailing-input .ProseMirror p:only-child:empty::before {
  content: attr(data-placeholder);
  color: var(--color-foreground-secondary);
  pointer-events: none;
  float: left;
  height: 0;
}
```

或者用 PM Decoration Plugin：

```typescript
function placeholderPlugin(text: string) {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc;
        if (doc.textContent.length === 0) {
          return DecorationSet.create(doc, [
            Decoration.widget(1, () => {
              const span = document.createElement('span');
              span.className = 'pm-placeholder';
              span.textContent = text;
              return span;
            }),
          ]);
        }
        return null;
      },
    },
  });
}
```

---

## 14. 文件变更清单

### 新建文件

| 文件 | 用途 |
|------|------|
| `src/components/editor/pm-schema.ts` | ProseMirror Schema 定义 |
| `src/components/editor/pm-keymap.ts` | 键盘快捷键（PM keymap plugin） |
| `src/components/editor/RichTextEditor.tsx` | 新编辑器组件（替代 NodeEditor） |
| `src/components/editor/pm-trigger-detect.ts` | 统一触发器检测函数 |
| `src/lib/editor-marks.ts` | TextMark/InlineRefEntry 类型 + htmlToMarks/marksToHtml |
| `src/lib/pm-doc-utils.ts` | marksToDoc/docToMarks/splitMarks/combineMarks |
| `tests/vitest/editor-marks.test.ts` | marks 转换测试 |
| `tests/vitest/pm-doc-utils.test.ts` | PM 文档转换测试 |
| `tests/vitest/pm-schema.test.ts` | Schema 解析测试 |

### 修改文件

| 文件 | 变更内容 |
|------|---------|
| `src/components/editor/FloatingToolbar.tsx` | props 从 TipTap `Editor` 改为 PM `EditorView`；替换所有 TipTap API 调用 |
| `src/components/editor/TrailingInput.tsx` | 从 TipTap useEditor 迁移到直接 PM EditorView |
| `src/components/outliner/OutlinerItem.tsx` | 导入 `RichTextEditor` 替代 `NodeEditor`；`editorRef` 类型从 `Editor` 改为 `EditorView` |
| `src/types/node.ts` | 新增 `TextMark` 和 `InlineRefEntry` 类型定义（为阶段 B 准备，阶段 A 仅定义类型） |
| `package.json` | 新增 PM 直接依赖，标记 TipTap 待删除 |

### 删除文件（最后清理阶段）

| 文件 | 说明 |
|------|------|
| `src/components/editor/NodeEditor.tsx` | 被 RichTextEditor 替代 |
| `src/components/editor/HashTagExtension.ts` | 功能合入 pm-trigger-detect |
| `src/components/editor/ReferenceExtension.ts` | 同上 |
| `src/components/editor/SlashCommandExtension.ts` | 同上 |
| `src/components/editor/FieldTriggerExtension.ts` | 同上 |
| `src/components/editor/InlineRefNode.ts` | 功能合入 pm-schema |
| `src/components/editor/HeadingMark.ts` | 功能合入 pm-schema |
| `src/lib/editor-html.ts` | `stripWrappingP`/`wrapInP` 不再需要 |
| `tests/vitest/editor-html.test.ts` | 对应测试删除 |

---

## 15. 分阶段实施计划

### Phase 1: 基础设施（无 UI 变更）

**目标**: 实现所有转换函数，充分测试

**交付物**:
1. `src/lib/editor-marks.ts` — 类型定义 + `htmlToMarks` + `marksToHtml` + `mergeAdjacentMarks`
2. `src/lib/pm-doc-utils.ts` — `marksToDoc` + `docToMarks` + `splitMarks` + `combineMarks`
3. `src/components/editor/pm-schema.ts` — ProseMirror Schema
4. 完整测试套件（往返一致性、edge case）

**验证方式**: `npm run typecheck && npm run test:run`

**不改动任何现有组件。**

### Phase 2: RichTextEditor 核心

**目标**: 实现新编辑器组件，可以 mount 和编辑文本

**交付物**:
1. `src/components/editor/pm-keymap.ts` — 键盘快捷键
2. `src/components/editor/pm-trigger-detect.ts` — 触发器检测
3. `src/components/editor/RichTextEditor.tsx` — 新编辑器（不含 FloatingToolbar）
4. 在 OutlinerItem 中用 feature flag 切换 `NodeEditor` / `RichTextEditor`

**验证方式**: `npm run dev:test` → standalone 模式下可编辑、创建、拆分、导航

### Phase 3: FloatingToolbar + TrailingInput

**目标**: 迁移剩余 TipTap 依赖组件

**交付物**:
1. `FloatingToolbar.tsx` 改用 PM API
2. `TrailingInput.tsx` 改用 PM API
3. 所有触发器（#/@//>）在新编辑器中工作

**验证方式**: 完整功能测试（格式化、链接编辑、触发器、新建节点）

### Phase 4: 切换 + 清理

**目标**: 移除 TipTap，清理代码

**步骤**:
1. 移除 feature flag，默认使用 RichTextEditor
2. 删除旧文件（NodeEditor.tsx、4 个 Extension、InlineRefNode.ts、HeadingMark.ts、editor-html.ts）
3. 移除 TipTap 依赖：`npm remove @tiptap/react @tiptap/starter-kit @tiptap/pm @tiptap/extension-highlight @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-bubble-menu`
4. 更新所有测试
5. `npm run typecheck && npm run test:run && npm run build`

---

## 16. 关键避坑清单

以下是参考架构总结的所有陷阱，**必须在实现时逐一检查**：

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| **PM keymap 闭包过期** | keymap 在创建时固定闭包 | 用 `propsRef.current` 始终读最新值 |
| **Zustand 闭包过期** | useCallback 捕获了初始 store 状态 | 在回调内调用 `store.getState()` 而非用闭包值 |
| **外部值同步循环** | 更新 PM → 触发 onChange → 又更新 PM | `isExternalUpdate` ref 标志跳过 onChange |
| **PM undo 触发 undoStore** | PM undo 改变文本 → onChange → push 到 undoStore | `isPMUndoRedo` ref 标志阻止 push（阶段 B） |
| **PM focus 竞态** | React setState + PM focus 需要一帧 | `requestAnimationFrame` 延迟 focus + 光标设置 |
| **macOS Shift+字母大写** | `Cmd+Shift+D` 时 `e.key` 是 `'D'` 不是 `'d'` | 总是用 `e.key.toLowerCase()` 比较 |
| **工具栏按钮抢焦点** | `onClick` 导致 PM 失焦 | 用 `onMouseDown` + `e.preventDefault()` |
| **atom 节点后多余空行** | PM 在 atom 后添加 trailingBreak | CSS: `br.ProseMirror-trailingBreak:not(:only-child) { display: none }` |
| **readOnly 切换不生效** | 改 `editable` 属性不会自动生效 | dispatch 空 transaction 触发 `editable()` 重新求值 |
| **粘贴换行** | 用户可能粘贴多行文本 | `handlePaste` 中 `text.replace(/[\r\n]+/g, ' ')` |
| **空操作进入 undo 栈** | 无实际变更但 push 了 entry | `beforeText === afterText` guard |
| **contenteditable 捕获鼠标** | 文本选择期间 React onMouseMove 不触发 | 用 document 级 native event listener |
| **触发器挂载误触发** | 节点内容已含 # 但不应打开下拉 | `hasUserEdited` flag，仅 docChanged 后允许触发 |
| **Immer 冻结 Map** | `getState().nodes` 被冻结 | `new Map(nodes)` 复制后再修改 |
| **零宽字符** | 浏览器在空 contentEditable 中插入 `\u200B` | 检查 isEmpty 时 strip `\u200B` |
| **快速连按 Cmd+Z** | 并发读同一栈条目导致重复 undo | Promise chain 串行执行队列（阶段 B） |

### ProseMirror CSS 全局样式（必须保留）

```css
/* 在 main.css 或 editor 局部样式中 */
.ProseMirror { outline: none; word-break: break-word; white-space: pre-wrap; }
.ProseMirror p { margin: 0; }

/* 修复 atom 节点后的多余空行 */
.ProseMirror br.ProseMirror-trailingBreak:not(:only-child) { display: none; }

/* 行内代码 */
.pm-code { background: rgba(135,131,120,0.15); color: #c7254e; border-radius: 4px; font-family: monospace; }

/* 高亮 */
mark { background: rgba(255,212,0,0.4); }

/* 行内引用 */
.inline-ref { cursor: pointer; color: #2563eb; user-select: none; }
.inline-ref.ProseMirror-selectednode { outline: 2px solid #2563eb; border-radius: 3px; }
```

---

## 17. 测试策略

### 必须的 Vitest 测试

| 测试文件 | 覆盖内容 |
|----------|---------|
| `editor-marks.test.ts` | `htmlToMarks` 全格式往返、edge case（空字符串、纯文本、嵌套 marks、多 inline ref） |
| `pm-doc-utils.test.ts` | `marksToDoc`/`docToMarks` 往返一致性、`splitMarks`/`combineMarks` 数学正确性 |
| `pm-schema.test.ts` | Schema parseDOM/toDOM 各节点类型 |
| `node-editor-shortcuts.test.ts` | 保持不变（intent 解析逻辑不依赖编辑器实现） |
| `floating-toolbar.test.ts` | 改用 PM API mock，验证 mark 状态检测和定位逻辑 |

### 回归验证检查点

每个 Phase 完成后执行：

```bash
npm run typecheck          # 类型检查
npm run check:test-sync    # 测试同步检查
npm run test:run           # 全量 Vitest
npm run build              # 生产构建
```

### 手动验证清单（Phase 3-4）

- [ ] 输入文本 + 基础格式化（Bold/Italic/Code/Highlight/Strike/Heading/Link）
- [ ] `#` 触发 → 标签选择器出现 → 选择后标签应用
- [ ] `@` 触发 → 引用选择器出现 → 选择后引用创建
- [ ] `/` 触发 → Slash 命令菜单出现
- [ ] `>` 触发 → 字段创建
- [ ] Enter 行尾 → 新建兄弟节点
- [ ] Enter 行中 → 拆分节点（格式保留）
- [ ] Backspace 空节点 → 删除
- [ ] Tab / Shift+Tab → 缩进/反缩进
- [ ] Arrow Up/Down → 节点导航
- [ ] Escape → 进入选择模式
- [ ] FloatingToolbar 出现/消失/定位正确
- [ ] 链接编辑（输入 URL、应用、移除）
- [ ] InlineRefNode 显示正确、光标可绕过
- [ ] 中文输入法（IME composition）正常工作
- [ ] 粘贴纯文本（换行被替换为空格）
- [ ] Cmd+Z / Cmd+Shift+Z（undo/redo）

---

## 18. 依赖变更

### 新增依赖

```bash
npm install prosemirror-model prosemirror-state prosemirror-view prosemirror-keymap prosemirror-history prosemirror-commands prosemirror-transform
```

> **注意**: 不需要 `prosemirror-schema-basic`，因为我们使用完全自定义的 Schema（见 §3）。

> 注意：当前通过 `@tiptap/pm` 间接使用了 ProseMirror。迁移后直接安装 PM 包，确保版本一致。

### 删除依赖（Phase 4）

```bash
npm remove @tiptap/react @tiptap/starter-kit @tiptap/pm @tiptap/extension-highlight @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-bubble-menu
```

### 不需要新增的

- **不需要 Lexical** — 直接使用 ProseMirror
- **不需要 prosemirror-dropcursor / prosemirror-gapcursor** — 单段落 atom 场景不需要
- **不需要 prosemirror-inputrules** — 触发器在 dispatchTransaction 中处理

---

## 附录 A: 当前文件完整清单（供迁移时对照）

```
src/components/editor/
├── NodeEditor.tsx          (639 行)  → 替换为 RichTextEditor.tsx
├── TrailingInput.tsx       (493 行)  → 重写内部 PM 集成
├── FloatingToolbar.tsx     (382 行)  → 改用 PM API
├── SlashCommandMenu.tsx    (129 行)  → 不变
├── HashTagExtension.ts     (80 行)   → 删除，合入 pm-trigger-detect
├── ReferenceExtension.ts   (83 行)   → 删除，合入 pm-trigger-detect
├── SlashCommandExtension.ts(75 行)   → 删除，合入 pm-trigger-detect
├── FieldTriggerExtension.ts(70 行)   → 删除，合入 pm-trigger-detect
├── InlineRefNode.ts        (53 行)   → 删除，合入 pm-schema
└── HeadingMark.ts          (32 行)   → 删除，合入 pm-schema
```

## 附录 B: Props 接口（保持不变）

`RichTextEditor` 的 props 接口与当前 `NodeEditor` **完全一致**，唯一差异是 `editorRef` 类型从 TipTap `Editor` 变为 PM `EditorView`。OutlinerItem 中使用 `editorRef` 的地方需要同步修改 API 调用（如 `editor.chain().deleteRange()` → `view.dispatch(tr.delete())`）。

完整 props 列表见 §4 的 `RichTextEditorProps` 定义。

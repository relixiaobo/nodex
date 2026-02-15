# Features 文档索引

> 本目录是功能行为规格层（实现时的权威参考）。

## 1. 核心与基础交互

| 文档 | 说明 |
|---|---|
| `docs/features/data-model.md` | 数据模型基础（节点结构、映射约束） |
| `docs/features/outliner-interactions.md` | Outliner 输入/导航交互模型 |
| `docs/features/keyboard-shortcuts.md` | 快捷键作用域与冲突规则 |
| `docs/features/editor-triggers.md` | `#` / `@` / `>` 触发矩阵与状态机 |
| `docs/features/drag-drop.md` | 拖拽排序语义与落点规则 |
| `docs/features/node-selection.md` | 节点选中、编辑态切换与范围选择 |
| `docs/features/undo-redo.md` | 撤销重做分层优先级与事件归并 |

## 2. 数据能力

| 文档 | 说明 |
|---|---|
| `docs/features/supertags.md` | 标签系统行为、模板继承与配置 |
| `docs/features/fields.md` | 字段创建、渲染、校验与配置 |
| `docs/features/references.md` | 引用节点/内联引用与关系维护 |
| `docs/features/date-nodes.md` | 日期节点和日记体系 |

## 3. 视图与检索

| 文档 | 说明 |
|---|---|
| `docs/features/search.md` | Search Nodes / Live Queries |
| `docs/features/views.md` | 视图系统（List/Table/Cards/Calendar 等） |

## 4. 扩展交互与入口

| 文档 | 说明 |
|---|---|
| `docs/features/slash-command.md` | Slash Command 菜单规则 |
| `docs/features/floating-toolbar.md` | 文本选区浮动工具栏 |
| `docs/features/web-clipping.md` | 网页剪藏能力与数据写入策略 |
| `docs/features/ai-chat-agent-gateway.md` | AI Chat / Agent 网关、双模式密钥与上下文分层 |

## 5. 使用建议

1. 开发前先读对应 feature 文档，再看 `docs/issues.md` 的当前状态。
2. 同一功能跨多个文档时，以“行为定义最具体”的文档为准。
3. 若新增复杂功能（跨 2+ 次迭代），新增单独 feature 文档并在本索引登记。

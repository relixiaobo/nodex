# “一切皆节点”重构：系统 Review（2026-02-18）

## 范围

本次 review 覆盖以下资料与实现：

- `docs/features/data-model.md`
- `docs/features/date-nodes.md`
- `docs/features/search.md`
- `docs/features/views.md`
- `docs/features/fields.md`
- `docs/TASKS.md`
- `CLAUDE.md`
- `src/services/search-service.ts`
- `src/components/fields/FieldValueOutliner.tsx`
- `src/stores/node-store.ts`
- `src/types/system-nodes.ts`
- `src/types/node.ts`
- `src/services/node-service.ts`

## 总结结论

“一切皆节点”方向本身是合理的，核心守则（ViewDef/Tuple、Search Tuple 树、日期节点化）也有清晰目标；但当前文档与实现之间存在 3 个 P0 级阻塞点，若不先收敛，会直接导致后续 #22/#23/#25 返工。

## 主要发现（按严重级别）

### P0-1：日期层级定义冲突（计划 vs 规格）

- 计划写法：`docs/TASKS.md:137` 为“年/月/周/日节点层级”。
- 规格写法：`docs/features/date-nodes.md:7` 明确“年 → 周 → 日（无月层级）”。

风险：

- #22 的验收口径不唯一，开发会在“是否建月节点”上出现分叉实现。
- 会影响 Calendar、自然语言日期和日期字段映射的一致性。

建议：

- 以 `docs/features/date-nodes.md` 为准，立即把 `docs/TASKS.md` 改为“年/周/日节点层级”。
- 在 date spec 增加一句：月仅作为 UI 聚合维度，不是持久化节点层级。

### P0-2：日期值模型目标与现状冲突（节点引用 vs 字符串）

- 目标模型：`docs/features/date-nodes.md:171-191` 与 `docs/features/data-model.md:736-747` 要求日期字段值为“日节点引用”。
- 当前字段文档：`docs/features/fields.md:97-112` 仍定义 Date 值为字符串格式（`YYYY-MM-DD` 等）。
- 当前实现：`src/components/fields/FieldValueOutliner.tsx:160-179` 和 `src/stores/node-store.ts:1227-1320` 都在读写 `valueNode.props.name = 字符串`。

风险：

- OVERDUE / CREATED LAST X DAYS 等查询逻辑会建立在“字符串解析”而非“节点关系”上，后续迁移成本高。
- “点击日期值跳转日节点”缺少稳定主键（只有文本）。

建议：

- 先落一份迁移契约（建议在 `docs/features/date-nodes.md` 补“迁移策略”小节）：
  1. 读路径：优先日节点引用，fallback 字符串。
  2. 写路径：双写（引用 + 字符串兼容）或一次性迁移后二选一。
  3. 回填脚本：历史字符串日期批量映射到 day node。
- 在 #22 完成前，冻结 Date 字段的“最终真值来源”（引用优先）并更新 `fields.md`。

### P0-3：Search 文档对“已实现”描述偏高

- `docs/features/search.md:16` 写“服务层核心查询引擎已实现”。
- 但实现中 `src/services/search-service.ts:115-174` 仅做标签树匹配；`filters` 虽解析到 `SearchConfig`（`src/services/search-service.ts:307-312`），并未执行过滤。

风险：

- 任务拆解与实际能力不匹配，容易把“过滤器/逻辑组合”误判为 UI 问题，实则服务层未完成。

建议：

- 把 `docs/features/search.md` 状态拆成更细粒度：
  - 已实现：tag + tag inheritance。
  - 未实现：field filters、AND/OR/NOT 执行器、排序/分页、增量更新。
- 在文档里新增“Search Engine v1/v2 能力矩阵”，避免状态歧义。

### P1-1：View schema 尚未封板（Group 常量未分配 + 活跃视图选择规则缺失）

- `docs/features/views.md:56` 允许同一节点有多个 `SYS_A16` 视图 tuple。
- `docs/features/views.md:349` 明确 `NDX_A_GROUP_FIELD` 仍待分配。
- `src/types/system-nodes.ts:46-68` 目前无 Group 专用常量定义。

风险：

- #25 实现时会临时发明常量或字段语义，产生兼容性问题。
- 多 viewDef 场景下“当前激活视图如何持久化”没有明确规则。

建议：

- 先定义并冻结常量（例如新增 `NDX_A09` 作为 Group key，具体编号以现有 NDX_A 空位为准）。
- 在 views spec 增补“active view 选择规则”（显式 tuple/属性/顺序，三选一并固定）。

### P2-1：日节点命名证据来源冲突（截图样式 vs 导出样式）

- `docs/features/date-nodes.md:55-62` 使用 `Sat, Feb 14` 风格。
- `docs/research/tana-data-model-specification.md:552-557` 示例是 `2026-02-09 - Sunday` 风格。

风险：

- 导入、去重、回填时若直接用 `props.name` 作为 key 会冲突。

建议：

- 统一规则：`props.name` 仅作展示，唯一性由 date ref（`SYS_A169`）决定。
- 明确展示格式与存储格式解耦，避免 name 参与业务主键。

### P2-2：`sourceUrl` 废弃状态未闭环

- 守则写法：`docs/features/data-model.md:751-766` 定义 sourceUrl 已废弃。
- 实际类型与持久化仍在：`src/types/node.ts:200-201`、`src/services/node-service.ts:41`、`src/services/node-service.ts:79`、`src/services/node-service.ts:112`。

风险：

- 新增功能可能继续误写顶层 `sourceUrl`，违反“一切皆节点”守则 5。

建议：

- 单开清理任务：移除类型字段、DB 列映射、迁移脚本与兼容读写。

## 建议执行顺序

1. 先做文档契约收敛（P0-1/P0-3）：统一任务板与 specs 状态口径。
2. 再做数据模型迁移设计（P0-2）：先定读写策略，再改实现。
3. 然后封板 View/Search schema（P1-1）：常量与 active-view 规则先行。
4. 最后进入 #22/#23/#25 的实际开发。

## 评估结论

可以继续推进“`一切皆节点`重构”，但必须先完成以上 P0 收敛。否则后续实现会在日期和值模型上出现双轨逻辑，最终增加迁移复杂度和回归成本。

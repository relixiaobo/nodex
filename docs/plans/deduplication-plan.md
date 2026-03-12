# 去重计划

## 目标

在**不改变现有交互行为**的前提下，优先收敛已经出现第二套或第三套实现的能力，降低后续功能继续“平行演化”的风险。

这次计划只覆盖高收益重复，不做“全仓统一风格”式重构。

## 扫描结论

当前最值得处理的重复带有四类：

1. **浮层列表 / 选择器**
   - 现状：`TagSelector`、`ReferenceSelector`、`SlashCommandMenu`、`BatchTagSelector`、`TagSelectorPopover` 各自维护定位、翻转、键盘高亮、滚动到选中项、空态与创建项逻辑。
   - 问题：交互细节容易漂移，新增第六个列表时大概率继续复制。

2. **mini outliner 容器**
   - 现状：`OutlinerView`、`FieldValueOutliner`、`ConfigOutliner` 都在做“构造 rows → drag select → sibling navigation → trailing input”。
   - 问题：行级交互已经统一到 `OutlinerRow`，但容器级逻辑仍然分叉。

3. **highlight note tree / message routing**
   - 现状：`highlight-service` 和 `highlight-sidepanel` 都有“按 depth 重建 note children 树”的实现；background 里多类 highlight 消息也在重复 temp/offline/转发分支。
   - 问题：后续高亮能力扩展时，行为修复容易漏改其中一处。

4. **小型工具重复**
   - 现状：`splitShortcut`、today/day label、`getSyncApiUrl`、`focusTrailingInputForParent`、全局 shortcut 焦点判断存在双份实现。
   - 问题：单点收益不高，但它们已经是低成本尾项，适合在主干重复收敛后一起清掉。

## 范围边界

### 本次纳入

- 浮层列表 primitive 与其调用方迁移
- mini outliner 容器层抽象
- highlight note tree helper 与 background message helper
- 少量确定无争议的小工具去重

### 本次不纳入

- 客户端/服务端协议镜像类型的统一
  - 原因：跨 runtime 共享会引入打包和边界成本，收益不如前三项直接
- 搜索系统重构
  - 原因：`useNodeSearch` 与 `search-engine` 目标不同，不属于纯重复
- TagBadge / NodeContextMenu 全面合并
  - 原因：共享样式和菜单 item 没问题，但视图状态和交互模式差异仍然较大

## 分阶段方案

### Phase 1: 浮层列表 primitive 收敛

**目标**

提取一个共享的“浮层列表”基础层，统一：

- fixed 定位 + 上下翻转
- scroll / resize 重定位
- highlighted item 自动滚动到视口
- 非聚焦列表点击保持编辑器焦点
- 空态、分隔线、创建项的通用布局

**建议新增**

- `src/components/ui/FloatingListPanel.tsx`
- `src/hooks/use-floating-anchor.ts` 或等价 hook

**首批迁移文件**

- `src/components/tags/TagSelector.tsx`
- `src/components/references/ReferenceSelector.tsx`
- `src/components/editor/SlashCommandMenu.tsx`
- `src/components/tags/BatchTagSelector.tsx`
- `src/components/editor/TagSelectorPopover.tsx`

**迁移原则**

- 先抽定位和列表骨架，再迁键盘导航辅助，最后迁各自业务 item 渲染
- `ReferenceSelector` 的日期快捷项、禁用态、breadcrumb 保持专有逻辑，不强行抽平
- `BatchTagSelector` 保留 modal/backdrop 形态，只复用内部列表体

**风险**

- 编辑器触发型列表对 `mousedown.preventDefault()` 很敏感
- `TagSelectorPopover` 与 toolbar 锚点坐标模型不同，需要明确 primitive 支持“元素锚点”和“绝对坐标锚点”两类输入

### Phase 2: mini outliner 容器层收敛

**目标**

提取容器级共享能力，统一：

- rows 构建后的 drag-select 挂载
- sibling navigation 的 `navToField` / `navToContent`
- trailing input 是否显示与越界导航
- “field 开头/结尾” 的容器 padding 规则

**建议新增**

- `src/components/outliner/RowScope.tsx` 或等价容器抽象
- 或 `src/lib/row-scope.ts` + `src/hooks/use-row-scope-navigation.ts`

**首批迁移文件**

- `src/components/outliner/OutlinerView.tsx`
- `src/components/fields/FieldValueOutliner.tsx`
- `src/components/fields/ConfigOutliner.tsx`
- 必要时配套调整：
  - `src/components/outliner/row-model.ts`
  - `src/components/fields/FieldRow.tsx`
  - `src/components/outliner/OutlinerItem.tsx`

**迁移原则**

- 不动 `OutlinerRow` 的职责边界；它继续只负责“单行交互”
- 不追求三种容器完全同构，只抽已经完全一致的骨架
- `ConfigOutliner` 的 inherited items / `OutlinerView` 的 hidden field reveal / `FieldValueOutliner` 的特化控件继续各自保留

**风险**

- 当前 `OutlinerView` 与 `FieldValueOutliner` 的 `navToContent` 已经几乎同构，但 `ConfigOutliner` 没有 text offset 需求；抽象接口要兼容这点，不能靠 if/else 污染调用方

### Phase 3: highlight helper 收敛

**目标**

把已确定重复的高亮辅助逻辑收敛到 helper，降低笔记树重建与消息转发分叉。

**建议新增**

- `src/lib/highlight-note-tree.ts`
- `src/lib/highlight-routing.ts` 或 background 内局部 helper

**首批迁移文件**

- `src/lib/highlight-service.ts`
- `src/lib/highlight-sidepanel.ts`
- `src/entrypoints/background/index.ts`

**具体收敛点**

- “flat entries by depth → node tree” 的 parentStack 构建
- `HIGHLIGHT_DELETE` / `HIGHLIGHT_NOTE_GET` / `HIGHLIGHT_NOTES_SAVE` 的 temp-id 判断 + sidepanel 转发模板

**风险**

- background 路由是 MV3 消息链路，helper 抽取不能破坏 `sendResponse` / `return true` 的异步契约

### Phase 4: 小型工具尾项

**目标**

清理低争议双份工具，不单独开重构。

**候选**

- `splitShortcut`
  - `src/components/ui/Kbd.tsx`
  - `src/components/ui/Tooltip.tsx`
- today/day label
  - `src/components/panel/Breadcrumb.tsx`
  - `src/components/search/CommandPalette.tsx`
- `getSyncApiUrl`
  - `src/lib/auth.ts`
  - `src/lib/ai-service.ts`
- `focusTrailingInputForParent`
  - `src/components/outliner/OutlinerItem.tsx`
  - `src/components/fields/FieldRow.tsx`
- 全局 shortcut 焦点判断
  - `src/hooks/use-chat-shortcut.ts`
  - `src/hooks/use-today-shortcut.ts`

**原则**

- 只抽纯函数或 DOM helper
- 不为“只有两处、且明显属于不同 runtime”的代码强行共用

## 实施顺序

按风险和收益排序：

1. 浮层列表 primitive
2. mini outliner 容器
3. highlight helper
4. 小型工具尾项

原因：

- 前两项是继续长重复代码的主干；
- 第三项逻辑清晰、范围小，适合作为中段收尾；
- 第四项收益稳定但不应抢前两项优先级。

## 验证要求

每个 phase 独立提交，且都经过同一套验证：

1. `npm run typecheck`
2. `npm run check:test-sync`
3. `npm run test:run`
4. `npm run build`

此外需要补充对应回归测试：

- 浮层列表：键盘导航、创建项、定位/关闭行为
- mini outliner：上下逃逸、trailing input、drag select 不回退
- highlight：note tree 重建、temp-id 分支、sidepanel 转发

## Review 关注点

nodex review 时请重点看四件事：

1. 抽象是不是只覆盖“已经同构”的部分，而不是提前设计未来变化点
2. `OutlinerRow`、`FieldRow`、`OutlinerItem` 的职责边界有没有变糊
3. 浮层列表 primitive 是否同时兼容编辑器触发型和 toolbar/modal 触发型
4. 是否应该把 Phase 4 从主计划里拆掉，避免尾项拖长主线

## 执行门槛

这份计划 PR 合并前，不开始生产代码去重。

执行条件：

- nodex review 明确通过
- 若 review 要求缩 scope，则先改计划，再按新范围实施

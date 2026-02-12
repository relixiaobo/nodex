# Feature: Fields 全类型

> Phase 1.3 | 基础已完成，全类型扩展待实现

## 行为规格

### 字段创建

- 节点编辑器中输入 `>` 触发字段创建
- 弹出字段名搜索面板（自动完成已有 attrDef）
- 选择已有字段或创建新字段名
- 创建后在节点 children 中插入 field Tuple：`[attrDefId, valueNodeId?]`
- 同时创建 associatedData 并建立 associationMap 映射

### 字段渲染

- 字段和内容节点在 children 中**交错显示**（保持原始顺序，不分离）
- 字段行布局：`[icon] [字段名 130px] [字段值区域]`
- 字段名可编辑（点击进入编辑模式，自动完成已有 attrDef 名）
- 字段名为空时自动聚焦到字段名编辑器
- 字段值区域根据数据类型渲染不同的编辑器

### 字段配置页（AttrDef Config）

- 点击字段名 → navigateTo attrDef 节点（进入配置页）
- 配置页是标准 NodePanel 渲染被 SYS_T02 (FIELD_DEFINITION) 标记的节点
- 配置项（所有类型通用）：
  - **Field type**: 下拉选择数据类型（Plain / Options / Date / Number / URL / Email / Checkbox）
  - **Required**: 开关，空值时视觉警告
  - **Hide field**: 下拉选择（Never / When empty / Always）
- 配置项（特定类型）：
  - **Auto-collect values**: Options 类型，自动收集使用过的值
  - **Auto-initialize**: Options/Date 类型，自动从祖先继承值
  - **Pre-determined options**: Options 类型，预设选项列表（outliner 编辑）
  - **Minimum value / Maximum value**: Number 类型，数值范围校验
  - **Options from Supertag**: Options 类型，用特定标签的节点作为选项源

### Plain 类型（默认）

- 值区域渲染为标准 OutlinerView（子节点列表）
- 支持添加子节点、编辑、拖拽等所有大纲操作
- 这是默认类型，不选择其他类型时就是 Plain

### Options 类型 — 未实现

- 值区域渲染为下拉选择器（NodePicker）
- 选项来源：
  1. Pre-determined options（attrDef 配置的固定选项列表）
  2. Auto-collected（历史使用过的值）
  3. Options from Supertag（特定标签的节点）
- 选中选项后，Tuple.children[1] = selectedNodeId
- 支持多选（值为多个子节点）

### Date 类型 — 未实现

- 值区域渲染为日期选择器
- 选择日期后链接到对应日节点（年/月/日层级）
- 支持自然语言输入（@today / @next Monday）
- 日期节点自动创建（如果不存在）

### Number 类型 — 未实现

- 值区域渲染为数字输入框
- 支持 min/max 校验（来自 attrDef 配置）
- 无效输入时显示红色边框 + 错误提示

### URL 类型 — 未实现

- 值区域渲染为 URL 输入框
- 输入完成后显示为可点击链接
- 链接在新标签页打开

### Email 类型 — 未实现

- 值区域渲染为 Email 输入框
- 输入完成后显示为 `mailto:` 可点击链接

### Checkbox 类型 — 未实现

- 值区域渲染为复选框（check/uncheck）
- 数据模型：Tuple.children[1] = SYS_V03 (Yes) 或 SYS_V04 (No)
- 注意区分：这是字段值的 checkbox，与 Supertag 的 "Show as Checkbox" 是不同功能

### 字段隐藏规则 — 未实现

- 根据 attrDef "Hide field" 配置 + 当前值状态：
  - **Never**: 始终显示
  - **When empty**: 值为空时隐藏（hover 区域时短暂显示）
  - **Always**: 始终隐藏（仅在配置页可见）

### Required 字段 — 未实现

- attrDef "Required" = true 时：
  - 字段值为空 → 字段名显示红色星号 `*`
  - 不阻止操作，只是视觉提示

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-08 | 字段和内容交错渲染（非分离） | 保持 children 原始顺序，与 Tana 一致 |
| 2026-02-08 | addUnnamedFieldToNode 需要 applyTag(SYS_T02) | 确保新字段有完整配置项 |
| 2026-02-06 | 所有类型通用配置 + 特定配置分离 | ATTRDEF_CONFIG_MAP 用 appliesTo 控制可见性 |
| 2026-02-06 | Options/Checkbox 使用 SYS_V03/V04 布尔值 | 与 Tana 数据模型一致 |
| 2026-02-06 | Unified NodePicker 设计模式 | Options、Config Select 等统一为"从列表选节点"组件 |

## 当前状态

- [x] `>` 触发字段创建
- [x] 字段名编辑 + 自动完成
- [x] 字段/内容交错渲染
- [x] 字段值编辑器（Plain 类型 = OutlinerView）
- [x] AttrDef 配置页（Field type / Required / Hide / Auto-collect / Auto-initialize）
- [x] 新字段自动应用 SYS_T02 标签
- [ ] Options 下拉选择
- [ ] Options from Supertag
- [ ] Date 日期选择器
- [ ] Number 数字输入
- [ ] URL 链接输入
- [ ] Email 邮箱输入
- [ ] Checkbox 复选框
- [ ] 字段隐藏规则运行时
- [ ] Required 字段视觉提示
- [ ] Number Min/Max 配置
- [ ] 系统字段（Created time / Modified time / Owner）

## 与 Tana 的已知差异

- Tana 的 Options 支持更丰富的 UI（彩色 pill、多列选择器），Nodex 先做基础下拉
- Tana 字段隐藏时 hover 有动画过渡，Nodex 先做简单显示/隐藏
- Tana 的 "Used in" 计算字段显示所有使用该字段的 supertag，Nodex 延后

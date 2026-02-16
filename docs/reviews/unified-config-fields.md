# Unified Config Field Architecture — Review Guide

> PR 分支: `cc2/unified-config-fields` (18 commits, ref #20)
> 作者: nodex-cc-2 agent
> 日期: 2026-02-16

## 1. 变更概述

本次重构将 tagDef/attrDef 上的**系统配置字段**（如 Field type、Show checkbox、Color 等）与**普通用户字段**（如 Status、Priority 等）在数据结构、存储路径和渲染逻辑三个层面完全统一。

类比：这像是把 Vim/Emacs 的配置从专用 config format 迁移到与普通文件完全一致的数据格式 —— 配置就是数据，数据就是配置。

### 变更前 (Before)

| 维度 | 普通用户字段 | 系统配置字段 |
|------|-------------|-------------|
| Tuple key | attrDef 实体 ID | SYS_A* 常量字符串（非实体） |
| Tuple value | valueNodeId (内容节点引用) | 直接枚举值 (如 `SYS_V03`) |
| AssociatedData | 有 | 无 |
| associationMap | 有 | 无 |
| 渲染路径 | FieldRow → FieldValueOutliner | 9 种专用控件 (ConfigToggle, ConfigSelect, ConfigTagPicker 等) |
| 数据读写 | resolveDataType + assocData children | resolveConfigValue + tuple.children[1] |

### 变更后 (After)

| 维度 | 所有字段（统一） |
|------|------------------|
| Tuple key | attrDef 实体 ID（系统 attrDef 也是真实实体） |
| Tuple value | valueNodeId（引用 SYS_V* 等值节点） |
| AssociatedData | 有（所有字段统一） |
| associationMap | 有（所有字段统一） |
| 渲染路径 | FieldRow → FieldValueOutliner（根据 dataType 选择控件） |
| 数据读写 | 统一 resolveDataType + assocData children |

## 2. 核心数据模型变化

### 2.1 系统 AttrDef 成为真实实体

**关键决策**: 每个系统配置项（SYS_A02, SYS_A11, SYS_A55, NDX_A05 等）都创建为真实的 `attrDef` 实体节点，与用户自定义字段的 attrDef 完全一致。

示例 — "Show as checkbox" (SYS_A55):

```
之前:
  tuple.children = ['SYS_A55', 'SYS_V03']  // key 是常量字符串
  无 AssociatedData

之后:
  entities['SYS_A55'] = {
    id: 'SYS_A55',
    props: { _docType: 'attrDef', name: 'Show as checkbox' },
    children: ['SYS_A55_type']  // 包含类型定义 tuple
  }
  entities['SYS_A55_type'] = {
    props: { _docType: 'tuple' },
    children: ['SYS_A02', 'NDX_D01']  // [TYPE_CHOICE, BOOLEAN]
  }

  tagDef 上的实例:
    tuple.children = ['SYS_A55', 'SYS_V03']  // key 是实体引用
    associationMap[tupleId] = assocDataId
    assocData.children = ['SYS_V03']          // 值也在 AssocData 中
```

### 2.2 新增 BOOLEAN 数据类型 (NDX_D01)

**决策理由**: 系统配置中大量 Yes/No 二选一字段（Show checkbox、Done state mapping、Auto-collect、Auto-initialize、Required），用 OPTIONS 类型需要渲染下拉列表过于重，toggle switch 更直觉。

- 常量: `SYS_D.BOOLEAN = 'NDX_D01'`
- 渲染: FieldValueOutliner 中的 toggle switch（带 BulletChevron 对齐）
- 值存储: AssociatedData.children[0] = SYS_V.YES 或 SYS_V.NO
- 写入: `setConfigValue(tupleId, newValue, userId)` 同时更新 tuple 和 AssocData

### 2.3 系统值节点

以下值节点在 seed-data 中创建，作为 OPTIONS/BOOLEAN 类型的选项:

| 值节点 | name | 用途 |
|--------|------|------|
| SYS_V.YES | Yes | Boolean/Toggle 的 true |
| SYS_V.NO | No | Boolean/Toggle 的 false |
| SYS_D.PLAIN | Plain | Field type 选项 |
| SYS_D.OPTIONS | Options | Field type 选项 |
| SYS_D.DATE | Date | Field type 选项 |
| ... | ... | 其他数据类型选项 |

### 2.4 setConfigValue 双写

`node-store.ts` 中的 `setConfigValue` 现在同时更新两个位置：

```typescript
// 1. 更新 tuple.children[1]（向后兼容的快速访问）
tuple.children[1] = newValue;

// 2. 更新 AssociatedData.children[0]（统一数据模型）
const assocId = parent.associationMap[tupleId];
assoc.children = [newValue];
```

**为什么双写**: `resolveConfigValue` 优先从 AssociatedData 读取，但 tuple.children[1] 作为 fallback 保留，确保渐进式迁移兼容。

## 3. 渲染架构变化

### 3.1 FieldRow 三条渲染路径

1. **Path 1 — System metadata** (`__system_date__`, `__system_text__`, `__system_node__`): 只读元数据（创建日期、修改者等），不变
2. **Path 2 — System config** (`isSystemConfig=true`): 只读名称 + 描述文本 + 统一值渲染 (FieldValueOutliner)
3. **Path 3 — Regular fields**: 可编辑名称 + 统一值渲染 (FieldValueOutliner)

**关键**: Path 2 和 Path 3 的值区域完全一致 — 都使用 FieldValueOutliner。区别仅在名称列（只读 vs 可编辑）和是否可删除。

### 3.2 FieldValueOutliner 特化控件

FieldValueOutliner 根据 `fieldDataType` 决定渲染方式:

| dataType | 渲染控件 | 场景 |
|----------|---------|------|
| BOOLEAN (NDX_D01) | Toggle switch | Show checkbox、Done mapping、Required 等 |
| OPTIONS_FROM_SUPERTAG (SYS_D05) | SupertagPickerField (NodePicker) | Extend from、Default child supertag |
| CHECKBOX (SYS_D04) | HTML checkbox | Checkbox 字段值 |
| DATE (SYS_D02) | DatePickerField | 日期字段值 |
| 其他 (PLAIN/OPTIONS/...) | OutlinerItem + TrailingInput | 默认路径 |

### 3.3 已删除的组件

以下专用 config 控件已删除（功能由 FieldValueOutliner 统一接管）:

| 删除的文件 | 原角色 | 替代方案 |
|-----------|--------|---------|
| ConfigTagPicker.tsx | Supertag 选择器 | SupertagPickerField (NodePicker) |
| ConfigSelect.tsx | 下拉选择器 | FieldValueOutliner (OPTIONS) |
| ConfigNumberInput.tsx | 数字输入 | FieldValueOutliner (NUMBER/PLAIN) |
| FieldTypePicker.tsx | Field type 选择器 | FieldValueOutliner (OPTIONS) |
| ConfigToggle.tsx | Yes/No 开关 | FieldValueOutliner (BOOLEAN toggle) |

### 3.4 保留的组件

| 文件 | 原因 |
|------|------|
| ConfigOutliner.tsx | "Default content" 和 "Pre-determined options" — 渲染 tagDef/attrDef 的普通 children |
| AutoCollectSection.tsx | Auto-collect values 的附加信息展示 |
| NodePicker.tsx | 通用 combobox，被 OptionsPicker 和新的 SupertagPickerField 复用 |

## 4. 关键设计决策记录

### 4.1 DoneMappingEntries 改为标准 PLAIN

**用户决策**: 用户认为 Done mapping 不需要专用 UI（field+option pair picker），因为用户可能想定义任意映射（如 "Priority=Medium → checked"），所以改为标准 PLAIN 文本输入。

- 删除了 `__done_map_entries__` dataType 覆盖
- NDX_A07/A08 的值现在通过标准 OutlinerItem 编辑
- DoneMappingEntries.tsx 组件目前未使用（可在未来清理中删除）

### 4.2 Config 字段图标统一为 getFieldTypeIcon(dataType)

**用户决策**: 所有字段的图标应该由数据类型决定，不应该有 per-config-key 的独立图标。

- 之前: `configDef?.icon ?? getFieldTypeIcon(dataType)` — config 字段有独立图标
- 之后: `getFieldTypeIcon(dataType)` — 统一按数据类型选图标

### 4.3 "Extends" 重命名为 "Extend from"

更清晰地表达语义：从另一个 tag 继承字段和内容。

### 4.4 Bullet 对齐标准

所有 FieldValueOutliner 的特化控件（BOOLEAN、CHECKBOX、DATE）使用 `paddingLeft: 25`，等于 `6(base) + 15(ChevronButton space) + 4(gap)` = 与 OutlinerItem depth=0 的 BulletChevron 对齐。

### 4.5 OPTIONS_FROM_SUPERTAG 读取 assocData.children 而非 contentChildIds

TagDef 引用节点有 `_docType: 'tagDef'`，会被 `visibleChildren` 过滤逻辑排除。因此 SupertagPickerField 直接从 `assocData.children[0]` 读取选中值，不通过 contentChildIds。

### 4.6 visibleWhen 条件检查

Config 字段支持条件可见性。例如 "Done state mapping" 只在 "Show checkbox = Yes" 时显示。

检查逻辑在 `use-node-fields.ts` 的 `computeFields` 中:
```typescript
if (configDef.visibleWhen && !isVisibleWhenSatisfied(configDef.visibleWhen, node, entities)) {
  continue; // 跳过不可见的 config 字段
}
```

`isVisibleWhenSatisfied` 通过 `resolveConfigValue` 读取 sibling tuple 的值（统一从 AssociatedData 读取）。

## 5. 文件变更清单

### 核心变更

| 文件 | 行数 | 变更类型 | 说明 |
|------|------|---------|------|
| `src/entrypoints/test/seed-data.ts` | 834 | **重写** | 系统 attrDef 实体、值节点、统一 config tuple + AssocData |
| `src/stores/node-store.ts` | 2043 | 修改 | setConfigValue 双写、applyTag 统一路径 |
| `src/hooks/use-node-fields.ts` | 183 | 简化 | 移除 CONFIG_MAP 分支，单一 attrDef 路径 |
| `src/components/fields/FieldRow.tsx` | 328 | 简化 | 3 条路径（metadata/config/regular），删除 9 种 config 控件 |
| `src/components/fields/FieldValueOutliner.tsx` | 310 | 扩展 | 新增 BOOLEAN toggle、SupertagPickerField |
| `src/lib/field-utils.ts` | 628 | 修改 | resolveConfigValue 优先读 AssocData、BOOLEAN 图标、重命名 |
| `src/types/system-nodes.ts` | 403 | 新增 | SYS_D.BOOLEAN (NDX_D01) |

### 删除的文件

| 文件 | 原行数 | 原角色 |
|------|--------|--------|
| `src/components/fields/ConfigTagPicker.tsx` | ~50 | Supertag 选择器 |
| `src/components/fields/ConfigSelect.tsx` | ~60 | 下拉选择器 |
| `src/components/fields/ConfigNumberInput.tsx` | ~45 | 数字输入 |
| `src/components/fields/FieldTypePicker.tsx` | ~55 | Field type 选择器 |
| `src/components/fields/ConfigToggle.tsx` | ~35 | Yes/No 开关 |

### 文档变更

| 文件 | 说明 |
|------|------|
| `docs/features/supertags.md` | 更新架构描述 |
| `docs/TESTING.md` | 更新覆盖映射 |

## 6. Commit 历史（从旧到新）

| # | Commit | 说明 |
|---|--------|------|
| 1 | `fdfa4fc` | 初始 Done State Mapping 实现 |
| 2 | `66ddb02` | 修复反向 done-state mapping |
| 3 | `29758a8` | 升级 Done mapping 为多值模型 (NDX_A07/A08) |
| 4 | `afba0e3` | NDX_A07/A08 嵌套在 NDX_A06 toggle tuple 下 |
| 5 | `3685979` | 重新排序 tagDef config fields |
| 6 | `db19a0a` | React 19 infinite loop 修复 (JSON.stringify selector) |
| 7 | `013ab6b` | **核心**: 统一 config field 数据模型 — 系统 attrDef 实体 + AssociatedData |
| 8 | `29d78e6` | **核心**: 统一 config field 渲染 + applyTag 路径 |
| 9 | `86f7720` | DoneMappingEntries 从 AssociatedData 读取 |
| 10 | `fb5555e` | seed-data 系统节点修复 + 测试更新 |
| 11 | `88d47bc` | 删除 5 个废弃 config 组件 |
| 12 | `d1a0479` | ConfigOutliner 用 isSystemConfig 标志过滤 |
| 13 | `fad87db` | 文档更新 |
| 14 | `9e64d3b` | **新增**: BOOLEAN dataType + toggle switch |
| 15 | `07cb41c` | BOOLEAN bullet 对齐 |
| 16 | `e39bbd0` | 移除 DoneMappingEntries 特化渲染 |
| 17 | `3d68638` | 统一 config field 图标 |
| 18 | `c0e31a2` | **新增**: OPTIONS_FROM_SUPERTAG supertag picker |

## 7. 已知问题与后续事项

### 7.1 需要合并时解决的冲突

`origin/main` 上有 node selection 功能（#51）在 `OutlinerItem.tsx` 中的改动与本分支冲突。rebase 时需要手动合并 OutlinerItem.tsx 中的 keyDown handler（约 2 处冲突点）。

冲突区域:
- OutlinerItem.tsx ~L538: selection 批量删除 vs options picker 快捷键
- OutlinerItem.tsx ~L731: 可能的其他 handler 冲突

### 7.2 可清理的残留

- `DoneMappingEntries.tsx`: 目前未被导入，可删除
- `field-utils.ts` 中的 `ConfigFieldDef.control` 字段: 部分 control 类型已无实际用途，可简化
- `node-store.ts` 中的 `addDoneMappingEntry`/`removeDoneMappingEntry`: 不再使用

### 7.3 未来扩展点

- **COLOR 类型**: 颜色选择器尚未实现（当前 Color 字段用 OPTIONS 类型 + 颜色值节点，但无颜色色块预览）
- **attrDef 配置页中的 Source supertag**: 也是 OPTIONS_FROM_SUPERTAG，可复用 SupertagPickerField
- **防删除守卫**: `removeField` 中应阻止删除 `isSystemConfigField(keyId)` 的字段（当前无保护）

## 8. 验证方法

```bash
npm run typecheck        # TypeScript 编译通过
npm run check:test-sync  # 测试同步检查通过
npm run test:run         # 224/224 测试通过
npm run build            # 生产构建通过
```

视觉验证（http://localhost:5202）:
1. 导航到 Task tagDef 配置页
2. 所有 config 字段显示为标准 FieldRow（名称 | 值）
3. BOOLEAN 字段显示 toggle switch（Show checkbox、Done state mapping 等）
4. "Extend from" 显示 supertag picker — 点击可搜索选择、Backspace 可清除
5. "Default child supertag" 同上
6. Done mapping 的 visibleWhen 条件正常（关闭 Show checkbox 后隐藏）
7. Default content / Pre-determined options 仍正常渲染

## 9. 架构图

```
统一后的字段渲染栈:

  NodePanel
    └── OutlinerItem (content node)
          └── FieldRow (per field)
                ├── Name column: readonly (config) | editable (user)
                └── Value column: FieldValueOutliner
                      ├── BOOLEAN → toggle switch
                      ├── OPTIONS_FROM_SUPERTAG → SupertagPickerField (NodePicker)
                      ├── CHECKBOX → <input type="checkbox">
                      ├── DATE → DatePickerField
                      └── default → OutlinerItem[] + TrailingInput

统一后的数据模型:

  tagDef / attrDef / content node
    ├── children: [..., tupleId, ...]
    ├── associationMap: { tupleId: assocDataId }
    │
    ├── Tuple (tupleId)
    │     └── children: [attrDefId, valueNodeId]
    │
    └── AssociatedData (assocDataId)
          └── children: [valueNodeId]   ← 字段值

  attrDef (系统或用户)
    ├── props: { _docType: 'attrDef', name: '...' }
    └── children: [typeTuple, ...optionNodes]
          └── typeTuple.children: [SYS_A02, dataType]
```

# Feature: 网页剪藏

> Phase 3 | 未实现 | 设计阶段

## 概述

Chrome Side Panel 的核心场景：用户浏览网页时，将内容剪藏为 Nodex 节点。剪藏结果是一个普通节点，通过 Supertag + Field 携带来源元数据。

## 核心设计决策

### 来源 URL 用 Supertag 字段，不用节点属性

**背景**：早期设计在 `NodexNode` 上预留了 `sourceUrl` 顶层属性和 DB `source_url` 列。但这违反了"一切皆节点"的数据模型原则。

**决策**：剪藏 = 创建节点 + 打标签 `#Web Clip`，来源 URL 作为标签的字段值存储。

**理由**：
- `sourceUrl` 不是每个节点的通用属性（不像 `name`/`description`），只有剪藏节点才有
- 用 Supertag + Field 完全复用现有体系（渲染、编辑、验证、搜索、配置页全免费）
- 不需要在 DB 加专栏，不需要特殊 UI 组件
- 未来可在 `#Web Clip` 标签上自由扩展更多元数据字段

**对比 `description`**：`description` 是 Tana 原始设计的节点属性（`SYS_A22`），每个节点都可以有，所以作为 `props.description` 是合理的。`sourceUrl` 不属于这个级别。

**待办**：实现时删除 `NodexNode.sourceUrl` 属性和 DB `source_url` 列（当前无代码使用，仅预留）。

## 数据模型

### `#Web Clip` Supertag（系统标签）

```
tagDef_webclip
  props: { name: 'Web Clip', _docType: 'tagDef' }
  children:
    - tuple [SYS_A13, tagDef_webclip]     ← 标签绑定（自身）
    - tuple [attrDef_source_url]           ← 模板字段：Source URL
    - tuple [attrDef_clip_date]            ← 模板字段：Clip Date（可选）
```

### 字段定义

| 字段 | attrDef | 数据类型 | 说明 |
|------|---------|----------|------|
| Source URL | `attrDef_source_url` | `SYS_D.URL` | 原始网页地址，必填 |
| Clip Date | `attrDef_clip_date` | `SYS_D.DATE` | 剪藏时间，auto-initialize = current date |
| Description | — | `props.description` | 页面摘要，节点自身属性（非字段） |

### 剪藏后的节点结构

```
clip_node
  props: { name: '页面标题', description: '页面摘要（可选）' }
  _metaNodeId → metanode
    children:
      - tuple [SYS_A13, tagDef_webclip]    ← 标记为 Web Clip
  children:
    - tuple [attrDef_source_url]           ← Source URL 字段
    - '剪藏的内容节点...'                    ← 正文内容
  associationMap:
    { sourceUrlTupleId: assocData_url }    ← URL 值
```

## 剪藏流程（草案）

1. 用户在网页上触发剪藏（Side Panel 按钮 / 右键菜单 / 快捷键）
2. Content Script 提取页面信息（标题、URL、选中文本/全文）
3. 发送到 Side Panel（via `chrome.runtime.sendMessage`）
4. Side Panel 创建节点：
   - `name` = 页面标题
   - `description` = 页面摘要（可选，取 meta description 或 AI 生成）
   - `applyTag(tagDef_webclip)` → 自动创建 Source URL 字段
   - 设置 Source URL 字段值 = 当前页面 URL
   - 正文内容作为子节点
5. 节点出现在 Inbox 或当前位置

## 待定事项

- 剪藏内容格式：纯文本 / HTML → 多节点树 / Markdown 转换
- 剪藏模式：全页 / 选中文本 / 简化阅读模式
- AI 摘要：自动生成 `description`（需 AI Chat 能力）
- 去重：相同 URL 再次剪藏时合并还是新建
- 离线队列：无网络时暂存，上线后同步

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-13 | 来源 URL 用 Supertag 字段，不用 `NodexNode.sourceUrl` | 遵循"一切皆节点"，复用 Field 体系，避免 DB 专栏 |
| 2026-02-13 | 实现时删除 `sourceUrl` 属性和 `source_url` 列 | 当前无使用，预留设计已被更好方案替代 |

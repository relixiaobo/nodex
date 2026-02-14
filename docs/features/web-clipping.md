# Feature: 网页剪藏

> Phase 3 | 未实现 | 设计阶段

## 概述

Chrome Side Panel 的核心场景：用户浏览网页时，将内容剪藏为 Nodex 节点。剪藏结果是一个普通节点，通过 Supertag + Field 携带来源元数据，并支持 Read Later（正文大纲化）。

## 前因后果（决策演进）

1. 初版想法：在 `NodexNode` 顶层增加 `sourceUrl`，并在数据库使用 `source_url` 列，快速打通剪藏能力。
2. 讨论后发现：`sourceUrl` 不是通用节点属性，更接近“剪藏类型的结构化元数据”，放顶层会弱化 Supertag/Field 的统一性。
3. 因此调整为：URL 等元数据通过 `#web_clip` 的字段承载，剪藏结果仍是普通内容节点。
4. 随着类型讨论深入（`#article/#video/#tweet`），进一步收敛为：`#web_clip` 作为基类语义，子类型标签继承它。
5. 受当前实现约束：Supertag Extend 尚未落地，V1 先采用“双标签”过渡，保证可交付。

## 核心设计决策

### 来源 URL 用 Supertag 字段，不用节点属性

**背景**：早期设计在 `NodexNode` 上预留了 `sourceUrl` 顶层属性和 DB `source_url` 列。但这不属于通用节点属性语义。

**决策**：剪藏 = 创建节点 + 打标签 `#web_clip`，来源 URL 作为标签字段 `Source URL` 存储。

**理由**：
- `sourceUrl` 只对剪藏节点有意义，不是所有节点的通用属性
- 用 Supertag + Field 可完全复用现有体系（渲染、编辑、验证、搜索、配置页）
- 后续新增剪藏元数据时，不需要改 Node 顶层 Schema

**兼容策略**：`NodexNode.sourceUrl` 和 DB `source_url` 先保留，避免一次性迁移风险；V1 剪藏逻辑不再写入，后续单独清理。

### 标签体系：`#web_clip` 作为系统预置 Base Type（目标）

**目标模型**：
- `#web_clip`：系统预置 base type，承载剪藏通用字段（如 Source URL）
- `#article` / `#video` / `#tweet` ...：作为子类型标签，`extend #web_clip`

**现阶段过渡方案（Extend 尚未实现）**：
- V1 剪藏时同时打两个标签：`#web_clip + #article|#video|#tweet...`
- 等 Supertag Extend 落地后，收敛为只打子类型标签

### 去重策略：不去重

- 每次剪藏都新建节点
- 相同 URL 的多次剪藏视为独立记录

### 快照策略：成功不存原始快照，失败样本入池

- 正常剪藏成功：不存完整原始 HTML 快照
- 解析失败/质量过低：统一记录失败样本，用于后续提取优化

## 数据模型

### `#web_clip` Supertag（基类标签）

```
tagDef_webclip
  props: { name: 'web_clip', _docType: 'tagDef' }
  children:
    - tuple [SYS_A13, tagDef_webclip]      ← 标签绑定（自身）
    - tuple [attrDef_source_url]            ← 模板字段：Source URL（必填）
```

### 子类型标签（继承目标）

```
tagDef_article    extends #web_clip
tagDef_video      extends #web_clip
tagDef_tweet      extends #web_clip
...
```

> V1：Extend 未实现，剪藏时通过双标签模拟继承效果。

### 字段定义（V1 极简）

| 字段 | attrDef | 数据类型 | 说明 |
|------|---------|----------|------|
| Source URL | `attrDef_source_url` | `SYS_D.URL` | 原始网页地址，必填 |
| Author | `attrDef_author` | `SYS_D.PLAIN` | 作者（可选） |
| Published At | `attrDef_published_at` | `SYS_D.DATE` | 发布时间（可选） |

### 剪藏后的节点结构（V1）

```
clip_node
  props: { name: '页面标题', description: '页面摘要（可选）' }
  _metaNodeId → metanode
    children:
      - tuple [SYS_A13, tagDef_webclip]
      - tuple [SYS_A13, tagDef_article]     ← 示例：按页面类型自动选择
  children:
    - tuple [attrDef_source_url]            ← Source URL 字段
    - tuple [attrDef_author]                ← 可选
    - tuple [attrDef_published_at]          ← 可选
    - '剪藏正文内容节点...'                  ← Read Later 大纲
```

## 剪藏流程（V1 草案）

1. 用户在网页上触发剪藏（Side Panel 按钮 / 右键菜单 / 快捷键）
2. Content Script 提取页面信息（标题、URL、选中文本/全文）
3. Content Script 发送消息到 Background（`chrome.runtime.sendMessage`）
4. Background 统一编排创建节点：
   - `name` = 页面标题
   - `description` = 页面摘要（可选）
   - 自动判别类型并打标签：`#web_clip + #article|#video|#tweet...`
   - `applyTag(tagDef_webclip)` 后设置 `Source URL` 字段值
   - 设置 `Author` / `Published At`（可选）
   - 正文内容转为子节点
5. Background 通知 Side Panel 刷新并定位新节点
6. 节点默认出现在 Inbox（或用户配置的目标位置）

## 失败样本池（解析优化）

记录条件：
- 正文提取失败
- 或提取结果质量低（例如正文为空、过短、噪声过高）

建议记录字段：
- `url`
- `title`
- `errorCode`
- `parserName`
- `parserVersion`
- `capturedAt`
- `sampleHtml`（可选，截断片段）

## 待定事项

- 正文解析实现：`defuddle` / `Readability` / fallback 组合
- 剪藏模式：全页 / 选中文本 / 简化阅读模式
- 正文落地格式：纯文本块 / HTML 清洗后分块 / Markdown 转换
- AI 摘要：是否自动写入 `description`
- 离线队列：无网络时暂存，上线后同步
- Extend 实现后的迁移策略（双标签 -> 继承）

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-13 | 来源 URL 用 Supertag 字段，不用 `NodexNode.sourceUrl` | 遵循"一切皆节点"，复用 Field 体系 |
| 2026-02-14 | `#web_clip` 定位为系统预置 base type（目标） | 与 Tana Base type 思路一致，便于子类型扩展 |
| 2026-02-13 | `#web_clip` 作为基类标签，子类型标签继承它 | 语义清晰，便于扩展不同网页类型 |
| 2026-02-13 | V1 采用双标签方案（`#web_clip + 子类型`） | 当前 Extend 尚未实现，需要可落地过渡方案 |
| 2026-02-13 | 不做 URL 去重，每次剪藏新建节点 | 保持用户行为可预期，降低实现复杂度 |
| 2026-02-13 | 成功不存完整原始快照；失败样本统一记录 | 降低存储成本，并为提取优化保留诊断数据 |

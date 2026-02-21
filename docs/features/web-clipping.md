# Feature: 网页剪藏

> Phase 4 | V1 落库 + Toast + URL 链接 | 提取→落库→反馈→导航 全链路可用

## 概述

Chrome Side Panel 的核心场景：用户浏览网页时，将内容剪藏为 Nodex 节点。剪藏结果是一个普通节点，通过 Supertag + Field 携带来源元数据，并支持 Read Later（正文大纲化）。

## 当前实现状态（2026-02-21）

- ✅ Side Panel -> Background -> Content Script 消息链路已打通
- ✅ Content Script 已切换为 `defuddle` 提取，提取 title/url/content/author/published/description/siteName
- ✅ `/clip` 斜杠命令完成全链路：提取 → 将**当前节点**就地转为 clip 节点（改名 + 打标签 + 写字段），不切换页面
- ✅ `/clip` 后编辑器立即同步页面标题（`editor.setContent()`），无需移开焦点
- ✅ `saveWebClip()` 支持自定义 `parentId` 参数（默认 Inbox）
- ✅ `#web_clip` tagDef + `Source URL` attrDef 首次剪藏时 find-or-create（惰性创建）
- ✅ `setFieldValue` 同时写入 `tuple.children[1]` 和 `assocData.children`，UI 正确渲染
- ✅ 字段值节点 `_ownerId` 指向 `assocDataId`（非内容节点），避免 reference 误判
- ✅ `createAttrDef` 创建完整配置 tuples（Field type / Auto-initialize / Required / Hide field）
- ✅ 页面 description（如有）写入节点 description
- ✅ 种子数据包含 `#web_clip` tagDef + 示例剪藏节点
- ✅ Vitest 测试覆盖 `findTagDefByName`/`findTemplateAttrDef`/`saveWebClip`/`applyWebClipToNode`（22 cases）
- ✅ Sidebar "Clip Page" 按钮已移除，入口迁移至 slash command
- ✅ sonner toast 反馈：成功 `toast.success('Page clipped')`、失败 `toast.error('Clip failed')`
- ✅ URL 字段值渲染为蓝色可点击链接（`<a target="_blank">`），Email 字段值渲染为 `mailto:` 链接

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

### 标签体系：`#web_clip` 单标签（V1）

**V1 设计**：
- 仅打 `#web_clip` 单标签，不做子类型 auto-detect
- Supertag Extend 已就绪，但无子类型标签需求时不引入

**目标模型（V2+）**：
- `#web_clip`：系统预置 base type，承载剪藏通用字段（如 Source URL）
- `#article` / `#video` / `#tweet` ...：作为子类型标签，`extend #web_clip`

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

> V1：仅使用 `#web_clip` 单标签。子类型标签留 V2。

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
  meta: [tagTupleId]
    └── Tuple [SYS_A13, tagDef_web_clip]
  children:
    - tuple [attrDef_source_url, valueNode]  ← Source URL 字段（含值）
    - (V2: 正文内容子节点)
```

## 剪藏流程（V1 实现）

1. 用户在编辑器中输入 `/clip`，从 slash command 菜单选择 "Clip Page"
2. Side Panel → Background → Content Script 消息链路提取页面元数据
3. `applyWebClipToNode()` 就地转换当前节点：
   - Find-or-create `#web_clip` tagDef + `Source URL` attrDef
   - `updateNodeName(nodeId, title)` 将当前节点改名为页面标题
   - `applyTag(tagDef_web_clip)` 打标签（创建 meta Tuple + 实例化模板字段）
   - `setFieldValue(sourceUrlAttrDefId, url)` 写 Source URL 值
   - 如有 description，`updateNodeDescription()` 写入
4. 保持当前页面状态不变（不导航、不创建新节点）

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

## 设计原则

> **所有剪藏元数据 = Supertag 字段，不是节点属性。**

V1 已确立此原则（Source URL = attrDef 字段）。V2 新增的元数据**必须**继续走字段路线：

| 元数据 | attrDef | 数据类型 | 阶段 |
|--------|---------|----------|------|
| Source URL | `attrDef_source_url` | `SYS_D.URL` | V1 ✅ |
| Author | `attrDef_author` | `SYS_D.PLAIN` | V2 |
| Published At | `attrDef_published_at` | `SYS_D.DATE` | V2 |
| Site Name | `attrDef_site_name` | `SYS_D.PLAIN` | V2 |
| Favicon | `attrDef_favicon` | `SYS_D.URL` | V2 |
| Excerpt | `attrDef_excerpt` | `SYS_D.PLAIN` | V2 |

**用户可定制**：因为元数据全部是 supertag 字段，用户可以为 `#web_clip` 添加自定义字段（如 "Rating"、"Category"），无需代码变更。

**待清理**：`NodexNode.sourceUrl` 属性和 DB `source_url` 列已废弃（V1 不再写入）。应在后续清理迭代中移除，避免新代码误用。

详见 `docs/features/data-model.md` § 设计守则 5。

## 待定事项

- 正文 → 子节点（V2）：提取正文内容转为 outliner 子节点树
- 子类型标签（V2）：`#article`/`#video`/`#tweet` extend `#web_clip`，auto-detect
- Author/Published At/SiteName/Favicon 字段（V2）：payload 已提取，待创建 attrDef 并加入 tagDef 模板
- 正文提取优化：`defuddle` 参数调优、站点特化提取规则、失败样本池策略
- 剪藏模式：全页 / 选中文本 / 简化阅读模式
- AI 摘要：是否自动写入 `description`
- 离线队列：无网络时暂存，上线后同步
- **清理 `sourceUrl` 废弃代码**：移除 `NodexNode.sourceUrl` 属性、DB `source_url` 列、`nodeToRow`/`rowToNode` 中的映射

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-13 | 来源 URL 用 Supertag 字段，不用 `NodexNode.sourceUrl` | 遵循"一切皆节点"，复用 Field 体系 |
| 2026-02-14 | `#web_clip` 定位为系统预置 base type（目标） | 与 Tana Base type 思路一致，便于子类型扩展 |
| 2026-02-13 | `#web_clip` 作为基类标签，子类型标签继承它 | 语义清晰，便于扩展不同网页类型 |
| 2026-02-13 | V1 采用双标签方案（`#web_clip + 子类型`） | 当前 Extend 尚未实现，需要可落地过渡方案 |
| 2026-02-13 | 不做 URL 去重，每次剪藏新建节点 | 保持用户行为可预期，降低实现复杂度 |
| 2026-02-13 | 成功不存完整原始快照；失败样本统一记录 | 降低存储成本，并为提取优化保留诊断数据 |
| 2026-02-14 | 提取器统一为 `defuddle`，不再保留 `innerText` fallback | 避免双路径行为差异，先聚焦提取质量基线 |
| 2026-02-14 | 当前验收路径为“复制 `defuddle` 原始 content 到剪贴板” | 在落库前先观察真实提取结果，减少后续返工 |
| 2026-02-14 | 网页剪藏落库阶段暂缓，等待 Supertag Extend 完成 | 避免在双标签过渡方案上过早固化实现 |
| 2026-02-15 | V1 落库：单标签 `#web_clip` + `Source URL` 字段，惰性创建 tagDef | Extend 已就绪但无子类型需求，单标签最简可用 |
| 2026-02-15 | 编排逻辑抽取为 `webclip-service.ts`（纯函数 + store 接口） | 可测试、可复用，不依赖 Chrome API |
| 2026-02-15 | 内容暂不转子节点，仅保存 title+URL+description | V1 最小交付，正文子节点留 V2 |
| 2026-02-15 | 入口从 Sidebar 按钮迁移到 `/clip` slash command | 减少 Sidebar 按钮堆积，就地操作更自然 |
| 2026-02-15 | `/clip` 就地转换当前节点（改名+打标签+写字段），不创建新节点 | 最简交互：当前节点即 clip 节点 |
| 2026-02-15 | `saveWebClip` 新增可选 `parentId` 参数（默认 Inbox） | 支持 slash command 从任意节点触发剪藏 |
| 2026-02-15 | `setFieldValue` 同时写入 `tuple.children` 和 `assocData.children` | `FieldValueOutliner` 从 assocData.children 读取值节点，两处必须同步 |
| 2026-02-15 | 字段值节点 `_ownerId` 指向 `assocDataId`（非内容节点） | 避免 `OutlinerItem.isReference` 误判为 reference 样式 |
| 2026-02-15 | `createAttrDef` 创建完整 4 个配置 tuples | 确保字段配置页显示所有配置项（Field type / Auto-init / Required / Hide） |
| 2026-02-21 | Toast 反馈用 sonner（~3KB gzipped, 零依赖） | 替代 console.error，给用户可见反馈 |
| 2026-02-21 | URL/Email 字段值渲染为可点击 `<a>` 链接 | Source URL 可直接点击在新标签页打开，与 Date 字段一致的 Empty 占位符 |

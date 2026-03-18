# Image Node Support — 完整方案

> 状态: v3 — 已整合 nodex review + codex review 反馈
> 作者: Claude (nodex-claude)
> 日期: 2026-03-18

## 目录

1. [产品动机](#1-产品动机)
2. [调研发现](#2-调研发现)
3. [设计决策](#3-设计决策)
4. [架构方案](#4-架构方案)
5. [AI 工具改动](#5-ai-工具改动)
6. [实施计划](#6-实施计划)
7. [验证要点](#7-验证要点)
8. [附录：决策讨论记录](#附录决策讨论记录)

---

## 1. 产品动机

### 从第一性原理出发

soma 的核心场景是**在浏览器中边读边想边记**。用户遇到图片的时刻：

| 场景 | 动机 | 频率 |
|------|------|------|
| **剪藏文章含图** | 图是内容的一部分，没图文章断裂 | 每次剪藏 |
| **截图/粘贴思考片段** | 图表、UI 设计、数据截图——文字无法替代 | 高频 |
| **从网页拖图到笔记** | 只要这张图，不要整篇文章 | 中频 |
| **AI 对话中引用图片** | 让 Agent 看到、分析用户提供的图 | 未来高频 |

加入 Agent 后，场景变成**边读边想边记边问**。图片在 Agent 链路中的角色：

- **Agent 需要"看"图**：用户剪藏含图表文章让 Agent 总结，Agent 必须看到图才能完整理解
- **截图需要沉淀**：Agent 的 browser screenshot 当前是 ephemeral（保留 3 张后变 placeholder），视觉观察无法变成持久知识
- **用户想给 Agent 看图**：在 Chat 中粘贴截图问"这个布局有什么问题"

核心洞察：**图片不是附件，是节点**。在 soma 的树结构中，图片和文字节点平级——可以有 children、可以被标签标记、可以被拖拽排序。数据模型已经如此设计（`type: 'image'`），缺的是"用户/Agent 主动创建"的路径和 AI 感知能力。

---

## 2. 调研发现

### 2.1 行业图片定位光谱

我们调研了 7 个知识管理工具对图片的处理方式：

```
附件/嵌入 ◄─────────────────────────────────────────► 一等实体

Obsidian     Logseq     Notion     Tana      Heptabase    Capacities
(Markdown    (block内    (block     (node,    (card类型,   (object,
 引用文件)    嵌入)       类型)      有children  可连接)     有tags/
                                   /tags)                 properties/
                                                          notes area)
```

**与 soma 最相关的两个模型：**

- **Capacities**：图片 = 一等对象（object），可被标签标记、有属性、有 notes 区域、可被多处引用、有 gallery/wall 视图。**执行最完整**——本地预处理（提取元数据）+ 后台上传管线。
- **Tana**：图片 = 节点，可以有 name、tags、children。**哲学最接近** soma。但图片体验被自己用户评为"需要改进"，且导出不含图片（只有下载链接）。

**关键教训：**
- **Notion 的 1 小时签名 URL 过期**是开发者和用户抱怨最多的图片问题。soma 必须避免。
- **Tana 导出不含图片**是数据可移植性的警示。soma 的图片存 R2，导出时应可下载。
- **AI 图片理解在知识工具中仍是蓝海**。大多数工具（Obsidian/Logseq/Heptabase/Reflect/Tana）无 AI 图片理解。Notion 最近才加。这是 soma 的差异化机会。

### 2.2 AI × 图片：三层表示模型

调研 Notion AI、Obsidian Copilot、ChatGPT、Claude Desktop、NotebookLM 等工具后，发现一个新兴共识——图片应有三层表示：

| 层 | 内容 | Token 成本 | 用途 |
|---|---|---|---|
| **Layer 3: 原始字节** | base64 image data | ~1300 tokens/百万像素 | Agent 需要"看"具体视觉细节 |
| **Layer 2: 文本描述** | AI-generated description | ~100-200 tokens | 默认 Agent 上下文、搜索、检索 |
| **Layer 1: 元数据** | url, dimensions, alt | ~20 tokens | 节点列表、结构感知 |

### 2.3 R2 上传模式

**结论：Worker 代理在 v1 足够。** 图片压缩后通常 < 500KB，远低于 Worker 100MB 限制。

**成本**：R2 ~$0.56/月 @ 1000 用户（vs Cloudflare Images ~$7.50+），免费出口流量是关键优势。

**客户端压缩**：Canvas API（零依赖），`createImageBitmap` + `OffscreenCanvas` + `convertToBlob`。

**去重**：SHA-256 内容 hash，per-workspace 隔离。

### 2.4 Chrome Side Panel 限制

| 约束 | 影响 | 应对 |
|------|------|------|
| **拖拽跨上下文不可靠** | 从网页拖图到 Side Panel 的 DataTransfer 可能只含 URL | 需 content script 中继，优先级降低 |
| **Service Worker 无 DOM** | 不能用 `Image()` 或 `HTMLCanvasElement` | 可用 `OffscreenCanvas` + `createImageBitmap()` |
| **Blob URL 不自动回收** | Side Panel 文档持久存在 | 必须在 React useEffect cleanup 中 revokeObjectURL |
| **chrome.storage 不适合二进制** | JSON-only，base64 编码开销 33% | 用 IndexedDB 做本地缓存 |
| **粘贴正常工作** | Side Panel 有完整 DOM 和 Clipboard API | ProseMirror handlePaste 是天然集成点 |

### 2.5 soma 现有基础

| 层 | 状态 | 详情 |
|---|---|---|
| **数据模型** | ✅ 完备 | `type: 'image'`, `mediaUrl`, `mediaAlt`, `imageWidth`, `imageHeight` |
| **渲染** | ✅ 可用 | `ImageNodeRenderer.tsx` — 懒加载、aspect ratio、错误兜底 |
| **剪藏提取** | ✅ 可用 | `html-to-nodes.ts`（纯 parser）处理 `<img>`, `<picture>`, `<figure>` |
| **Outliner 集成** | ✅ 可用 | `OutlinerItem.tsx` 对 media node 禁用文本 trigger |
| **字段可见性系统** | ✅ 已有 | `hideField` 支持 NEVER/ALWAYS/WHEN_EMPTY/WHEN_NOT_EMPTY |
| **隐藏字段先例** | ✅ 已有 | `NDX_F.HIGHLIGHT_ANCHOR`, `NDX_F.SOURCE_HIGHLIGHTS` 均用 `hideField: ALWAYS` |

---

## 3. 设计决策

### 决策 1：图片是 block-level 节点，不是 inline

**选择 block-level。** 所有竞品都是 block，soma 数据模型天然适合，inline 改 ProseMirror schema 改动大。

### 决策 2：Worker 代理上传

图片压缩后 < 500KB，Worker 100MB 限制绰绰有余。简单，可服务端校验。

### 决策 3：Workspace 媒体 token 鉴权读取

**选项 A：fetch + blob URL**（每张图先 fetch 带 auth header，转 blob URL 给 `<img>`）
**选项 B：Workspace 媒体 token**（`<img src="{mediaUrl}?t={token}">` 原生加载）
**选项 C：Cookie-based 媒体域**

**选择 B。**

> **Codex review 发现**：当前扩展用 Bearer token 鉴权，`<img src>` 原生请求无法带 Authorization header。如果用 Worker 代理 + Authorization，所有新图片在 UI 里会直接加载失败。

方案 B 的机制：
- `mediaUrl` 在 LoroDoc 中存储**稳定逻辑 URL**：`https://api.soma.app/api/images/{wsId}/{hash}.{ext}`（不含 token）
- 渲染时客户端拼接 workspace 级媒体 token：`<img src="{mediaUrl}?t={mediaToken}" />`
- **一个 token 管一个 workspace 所有图片**（不是 per-image 签名），有效期 7 天
- Worker 校验 token → 从 R2 取图 → 返回，设 `Cache-Control: public, max-age=86400`
- 浏览器自动缓存 URL+token 组合，后续访问不经 Worker
- Token 过期 → `<img onError>` 触发 → 静默刷新 token → 重新加载（用户几乎无感）
- **与 Notion 的本质区别**：Notion 是 per-block 签名 + 1 小时过期 + 内容可变；soma 是 per-workspace token + 7 天过期 + 内容不变（hash key）

选择 B 而非 A 的理由：浏览器原生 `<img>` 加载更流畅（并发加载、缓存、渐进渲染），避免 fetch → blob → render 的跳动感。

### 决策 4：智能压缩，不强制所有格式转 WebP

- **GIF**：保留原格式（保留动画）
- **SVG**：**V1 拒绝上传**（SVG 可执行脚本，安全清洗复杂，用户截图/文章配图极少是 SVG）
- **已压缩的 WebP/JPEG < 500KB**：直传，不重编码
- **大尺寸 PNG/BMP 等**：Canvas → WebP 0.85，resize ≤ 2048px

### 决策 5：Per-workspace 去重

R2 key = `{wsId}/images/{hash}.{ext}`，天然隔离。存储成本极低，不值得全局去重的复杂性。

### 决策 6：node_read 直接带图

Agent 选择 `node_read(imageNodeId)` 已经是明确意图——图片就是 image 节点的"内容"。不加参数、不加新工具。Agent 通过 children summary 的 `type` 字段决定是否读取。

### 决策 7：node_create 内部处理上传

扩展 node_create 支持 `data.imageData`。内部用 `uploadAndCreateImageNode()` 封装为原子操作。工具描述明确标注"需要网络上传，可能较慢"。

### 决策 8：先上传后创建节点（不创建空 mediaUrl 节点）

> **Codex review 发现**：如果先创建 `mediaUrl` 为空的节点再上传，空节点会同步到其他设备；Side Panel 关闭后无法恢复 nodeId → blob 的绑定。

**修正为"先上传，后创建"：**
- 粘贴图片 → 本地 **UI placeholder**（不写 LoroDoc）→ blob 暂存 IndexedDB
- 上传成功 → 创建 node（mediaUrl 有值）→ 清除 IndexedDB
- 上传失败 → placeholder 显示 retry → blob 保留在 IndexedDB
- Side Panel 关闭重开 → 检查 IndexedDB pending blobs → 恢复 placeholder → 重试

LoroDoc 中永远不会出现空 mediaUrl 的 image 节点。

### 决策 9：Layer 2 描述由客户端异步生成

> **Codex review 发现**：Worker 不知道 nodeId，不能写 LoroDoc，同一 hash 可对应多个 node。"谁往哪个 node 写哪个 fieldEntry"没有答案。

**修正为客户端生成：**
- 节点创建成功后 → 客户端 fire-and-forget：
  1. 用 mediaUrl fetch 图片（已有 auth token）
  2. 调 vision API 生成文本描述
  3. 写入 `NDX_F.IMAGE_DESCRIPTION` fieldEntry 到 LoroDoc
- 与 Spark 一致——AI 调用在客户端发起，结果写入 LoroDoc
- Worker 完全不参与描述生成

### 决策 10：imageDescription 走 fieldDef + hideField: ALWAYS

复用已有 `hideField` 机制，与 `NDX_F.HIGHLIGHT_ANCHOR` 同一模式。遵守"一切皆节点"铁律。

### 决策 11：mediaUrl 语义定死

> **Codex review 发现**：文档里 mediaUrl 一会儿是"R2 key"一会儿是"Worker URL"，前后不一致。

**Contract：`mediaUrl` = 完整的 Worker 代理 URL。**

```
mediaUrl = "https://api.soma.app/api/images/{wsId}/{hash}.{ext}"
```

- 永远是完整 URL，不是 R2 key 或相对路径
- 所有消费者（ImageNodeRenderer、node_read、导出）用同一个 URL
- 旧数据（外部 URL，如 Tana CDN）照样工作——`mediaUrl` 已经是完整 URL
- 渲染时拼接 `?t={mediaToken}` 是客户端运行时行为，不改 LoroDoc 中的值

### 决策 12：V1 quota 只增不减，暂不回收

> **Codex review 发现**：image node 删除/进 trash 后怎么回收 blob、更新 quota？

- **V1 显式声明：quota 只增不减。** 500MB + hash 去重足够用很长时间
- 回收需要 reachability scan（扫描 LoroDoc 所有 image 节点），复杂度高
- **V2 添加**：周期性孤儿扫描（无 node 引用的 hash → 标记可回收 → 延迟删除 R2 + 更新 quota）

### 决策 13：不做 URL 粘贴变图片

理由不变。Agent 可通过 screenshot 捕获 URL 内容，剪藏重存覆盖下载需求。

### 决策 14：网页拖图优先级最低

Chrome Side Panel 跨上下文拖拽不可靠。替代方案：右键菜单"保存图片到 soma"。

---

## 4. 架构方案

### 4.1 总览

```
                         创建路径
                         ════════
         Editor Paste    Agent Screenshot    Chat Paste    Web Clip
              │               │                 │             │
              ▼               ▼                 │             ▼
         ┌──────────────────────────┐           │    bg fetch + download
         │  Client Upload Pipeline  │           │    (webclip-service.ts)
         │  智能压缩(见决策4)        │           │             │
         │  → SHA-256 hash         │ ◄─────────┘─────────────┘
         │  → IndexedDB 暂存       │
         │  → POST /api/images     │
         └───────────┬─────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │  Worker (CF)             │
         │  Auth + workspace 校验   │
         │  Magic bytes + 大小校验  │
         │  D1 hash 查重            │
         │  Quota 检查(500MB/ws)    │
         │  → R2 存储               │
         └───────────┬─────────────┘
                     │ 返回 { url, hash, width, height }
                     ▼
         ┌──────────────────────────┐
         │ Client: 创建 Image Node  │
         │ mediaUrl = 完整 Worker URL│
         │ → 写入 LoroDoc           │
         │ → 异步生成描述           │
         │   (vision API →          │
         │    NDX_F.IMAGE_DESCRIPTION│
         │    fieldEntry)           │
         └───────────┬─────────────┘
                     │
              ┌──────┴───────┐
              │  Image Node  │
              │  (Loro CRDT) │
              └──────┬───────┘
                ↗         ↘
    Outliner 渲染          Agent 读取
    <img src=              node_read →
    "{mediaUrl}            fetch with auth →
    ?t={wsToken}">         ImageContent
    (浏览器原生加载+缓存)
```

### 4.2 数据模型

**NodexNode：不新增顶层属性。** 已有字段完全够用：

```typescript
// 已有，不改
type?: 'image'
mediaUrl?: string        // 完整 Worker 代理 URL（见决策 11）
mediaAlt?: string        // 用户可编辑的 alt text
imageWidth?: number
imageHeight?: number
```

**新增 fieldDef（系统内部，用户不可见）：**

```typescript
// NDX_F.IMAGE_DESCRIPTION — AI 生成的图片文本描述
// fieldType: 'plain'
// hideField: SYS_V.ALWAYS
// 与 NDX_F.HIGHLIGHT_ANCHOR 同一模式
```

**后端 D1 新增 images 表：**

```sql
CREATE TABLE images (
  hash         TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  r2_key       TEXT NOT NULL,           -- {wsId}/images/{hash}.{ext}
  mime_type    TEXT NOT NULL,            -- image/webp, image/gif 等
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (workspace_id, hash)
);
```

### 4.3 后端 API

**路由 1：`POST /api/images`（上传）**

```
Request:
  Headers: Authorization (Bearer token)
  Body: multipart/form-data
    - file: 图片 blob (WebP/JPEG/PNG/GIF，不接受 SVG)
    - hash: SHA-256 hex string
    - workspaceId: string
    - width / height: number (可选)

Response 200: { url, hash, width, height, created: true|false }
Response 400: file > 10MB / 非图片 / hash 不匹配
Response 401: unauthorized
Response 413: workspace quota exceeded
Response 429: rate limit exceeded
```

**路由 2：`GET /api/images/{wsId}/{hash}?t={mediaToken}`（读取）**

```
校验 mediaToken（workspace 级，有效期 7 天）
→ 从 R2 取图
→ 返回图片 + Cache-Control: public, max-age=86400
```

**路由 3：`POST /api/images/token`（获取/刷新媒体 token）**

```
Request:
  Headers: Authorization (Bearer token)
  Body: { workspaceId }

Response 200: { mediaToken, expiresAt }
```

客户端在 workspace 初始化时获取 mediaToken，缓存到内存，7 天后静默刷新。

### 4.4 客户端上传管线

**新文件：`src/lib/image-upload.ts`**

```
输入: File | Blob

Pipeline:
  1. 格式校验（image/* 且非 SVG）
  2. 智能压缩
     - GIF → 保留原格式
     - WebP/JPEG < 500KB → 直传
     - 其他 → Canvas → WebP 0.85, ≤2048px
  3. IndexedDB 暂存（pendingUploads store，key = 临时 ID）
  4. SHA-256 hash
  5. POST /api/images
  6. 成功 → 返回 { url, hash, width, height } → 清除 IndexedDB
  7. 失败 → 保留 IndexedDB → 抛出可重试错误
```

**新文件：`src/lib/image-media-token.ts`**

```
- getMediaToken(workspaceId): string  // 返回缓存的 token 或请求新 token
- resolveImageSrc(mediaUrl): string   // 拼接 ?t={token}；外部 URL 原样返回
- refreshToken(): void                // 静默刷新，img onError 时调用
```

### 4.5 创建路径集成

**路径 1：Editor 粘贴（P0）**

ProseMirror `handlePaste` 在文本处理之前检查图片：

```
handlePaste(view, event) {
  const imageFile = getImageFromClipboard(event.clipboardData)
  if (imageFile) {
    event.preventDefault()
    // 1. 显示本地 UI placeholder（不写 LoroDoc）
    // 2. IndexedDB 暂存 blob
    // 3. 上传 R2
    // 4. 成功 → 创建 image node（mediaUrl 有值）
    // 5. 失败 → placeholder 显示 retry
    return true
  }
  // ...现有文本 paste 逻辑不变
}
```

**路径 2：Agent 截图保存（P0）**

在 `create-tool.ts`（注意：不是 node-tool.ts）中：

```
if (data.type === 'image' && data.imageData) {
  // 原子操作：upload → create node
  // 失败 → 返回错误，不创建节点
}
```

**路径 3：Chat 输入粘贴（P1）**

Chat 中粘贴的图片 → 缩略图预览 → 发送为 `UserMessage.ImageContent`。**不创建 node**。

**路径 4：剪藏图片重存（P1）**

> **Codex review 修正**：不在 `html-to-nodes.ts`（纯 parser）中做，放在 `webclip-service.ts` 的 materialization 阶段。

在 `webclip-service.ts` / `createContentNodes` 阶段：
1. 遍历 parsed image nodes 的外部 mediaUrl
2. Background script fetch 图片（bypass CORS）
3. 走 image-upload 管线 → 获得 R2 URL
4. 替换 mediaUrl 后再写入 LoroDoc

---

## 5. AI 工具改动

### 5.1 node_read

**改动 1：children summary 增加 `type` 字段**

```json
// 仅对 type 有值的节点输出，普通文本节点不输出
{ "id": "img1", "name": "chart", "type": "image", "hasChildren": false, "childCount": 0, "tags": [] }
```

**改动 2：读 image 节点时，结果直接包含 ImageContent**

```typescript
if (node.type === 'image' && node.mediaUrl) {
  // 文本部分
  result.content.push({
    type: 'text',
    text: JSON.stringify({
      id: node.id, type: 'image', name: node.name,
      imageInfo: {
        url: node.mediaUrl,
        width: node.imageWidth, height: node.imageHeight,
        alt: node.mediaAlt,
        description: resolveImageDescription(node) ?? null
      },
      // ...tags, fields, parent, breadcrumb
    })
  })
  // 图片部分（用 auth token fetch）
  const imageData = await fetchImageAsBase64(node.mediaUrl)
  result.content.push({ type: 'image', data: imageData, mimeType: 'image/webp' })
}
```

### 5.2 node_create (create-tool.ts)

```typescript
if (data.type === 'image' && data.imageData) {
  const result = await uploadAndCreateImageNode(parentId, data.imageData, data.mediaAlt)
  // 上传失败 → 返回错误，不创建节点
  // 成功 → 返回 { id, mediaUrl }
  // 异步触发描述生成（客户端 fire-and-forget）
}
```

### 5.3 Chat UI 渲染

> **Codex open question**：node_read 返回 image block 后，ToolCallBlock 应能渲染图片。

`ToolCallBlock.tsx` 需增加对 `{ type: 'image' }` content block 的渲染支持。

---

## 6. 实施计划

### Phase 1a: 后端基础设施

**目标：** R2 图片存储 + 上传/读取/token API 可独立验证。

| 文件 | 动作 | 内容 |
|------|------|------|
| `server/src/routes/images.ts` | 新建 | POST 上传 + GET 读取(token 校验) + POST token 生成 |
| `server/src/lib/db.ts` | 修改 | 新增 images 表 |
| `server/src/types.ts` | 修改 | R2 binding |
| `server/wrangler.toml` | 修改 | R2 桶配置（不公开） |
| `server/src/index.ts` | 修改 | 注册 images 路由 |

**验收：** curl 上传 → R2 存储 → token 获取 → GET ?t=token → 返回图片 → 重复上传 → hash 去重

### Phase 1b: 客户端管线 + Editor 粘贴

**目标：** 用户粘贴图片 → 上传 R2 → 显示在大纲中。

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/image-upload.ts` | 新建 | 上传管线（压缩 + hash + IndexedDB + upload + 重试） |
| `src/lib/image-media-token.ts` | 新建 | 媒体 token 管理（获取 + 缓存 + resolveImageSrc） |
| `src/components/editor/RichTextEditor.tsx` | 修改 | handlePaste 图片检测 |
| `src/components/editor/TrailingInput.tsx` | 修改 | handlePaste 图片检测 |
| `src/components/outliner/ImageNodeRenderer.tsx` | 修改 | 用 resolveImageSrc 拼接 token + loading/error/retry + onError 刷新 token |
| `src/stores/node-store.ts` | 修改 | createImageNode action |

### Phase 1c: Slash command + 容量控制

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/slash-commands.ts` | 修改 | 启用 image_file，绑定文件选择器 |
| `server/src/routes/images.ts` | 修改 | quota (500MB) + rate limit (10/min) |

### Phase 2: AI Integration

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/ai-tools/read-tool.ts` | 修改 | children type + image → ImageContent |
| `src/lib/ai-tools/create-tool.ts` | 修改 | imageData → upload → create |
| `src/types/system-nodes.ts` | 修改 | NDX_F.IMAGE_DESCRIPTION fieldDef |
| `src/lib/field-utils.ts` | 修改 | IMAGE_DESCRIPTION 解析 |
| `src/lib/image-description.ts` | 新建 | 客户端描述生成（vision API → fieldEntry） |
| `src/components/chat/ToolCallBlock.tsx` | 修改 | 渲染 image content block |

### Phase 3: Ecosystem

| 任务 | 文件 | 说明 |
|------|------|------|
| Chat 输入图片粘贴 | `src/components/chat/` | paste + 预览 + ImageContent |
| 剪藏图片重存 | `src/lib/webclip-service.ts` | materialization 阶段 fetch + upload + 替换 URL |
| Tana 存量迁移 | 迁移脚本 | 扫描外部 mediaUrl → 批量 re-upload |
| 离线队列完善 | `src/lib/image-upload.ts` | IndexedDB 完整队列 + 联网自动上传 |
| 图片 lightbox | `ImageNodeRenderer.tsx` | 点击放大 |

---

## 7. 验证要点

### Phase 1a

- [ ] POST /api/images → R2 存储 + D1 记录
- [ ] GET /api/images/{wsId}/{hash}?t=valid → 200 + 图片
- [ ] GET ?t=expired → 403
- [ ] GET 无 token → 401
- [ ] POST /api/images/token → 返回 mediaToken + expiresAt
- [ ] 重复 hash → 不重复存储
- [ ] 非图片 / > 10MB / SVG → 400

### Phase 1b

- [ ] Cmd+V 粘贴截图 → UI placeholder → 上传 → 显示图片
- [ ] GIF 保留动画
- [ ] 小 JPEG 不重编码
- [ ] hash 去重
- [ ] 上传失败 → retry 按钮
- [ ] 关闭 Side Panel → 重开 → pending blob 恢复 → 重试
- [ ] Token 过期 → onError 静默刷新 → 图片重新加载

### Phase 2

- [ ] Agent node_read image → ImageContent → Agent 描述图片
- [ ] children summary 有 type: "image"
- [ ] Agent node_create imageData → 上传 + 持久化
- [ ] 描述异步生成 → NDX_F.IMAGE_DESCRIPTION 有值
- [ ] ToolCallBlock 渲染 image content

### Phase 3

- [ ] Chat 粘贴图片 → Agent 可见
- [ ] 新剪藏图片 → R2 URL
- [ ] Tana 旧图片 → 批量迁移
- [ ] 离线粘贴 → 联网自动上传

---

## 附录：决策讨论记录

### Round 1: 初始方案 (v1)

**用户需求**：支持 image node，图片存 R2，支持粘贴上传和剪藏。

**初始调研**：启动 5 个并行研究 agent——竞品分析、R2 上传模式、AI 多模态、Chrome 扩展限制、代码库审计。

**用户反馈**："还需要考虑 image node 也是要给 AI/agent 使用的"。补充 AI 维度后，识别出 Agent 与图片之间的三个断点（读不到、截图不能沉淀、用户无法给 Agent 看图）。

**用户反馈**："系统地思考和调研，不要着急下结论"。扩大调研范围，增加外部研究。

**用户反馈**："TipTap 已经从项目中移除了"。修正集成点：从 TipTap handlePaste 改为 ProseMirror EditorView handlePaste。

### Round 2: 工具设计讨论

**用户反馈**："node_read 都是读 node 的详细内容了，如果需要读的 node 是图片，就应该直接带图片"

→ 取消 `includeImages` 参数方案和 `view_image` 工具。node_read 直接返回 ImageContent。

**用户反馈**："Agent 将截图保存为 image node，应该就是 node_create 的基础能力"

→ 取消 `save_image` 工具。扩展 node_create 支持 `data.imageData`。

**用户反馈**："工具设计需要谨慎，尽量不要添加新的工具"

→ 确认不新增任何 AI 工具。

### Round 3: nodex Review (10 条)

1. **imageDescription 顶层属性** → 走 fieldDef + `hideField: ALWAYS`（发现代码库已有此机制）
2. **node_create 上传逻辑** → `uploadAndCreateImageNode()` 原子封装 + 描述明确标注"可能较慢"
3. **公开桶安全** → 不开公开桶，Worker 代理读取
4. **node_read 成本** → 维持直接带图（用户："大纲产品图片不多"）
5. **描述生成模糊** → 上传时异步生成
6. **WebP 强制转换** → 智能压缩（GIF 保留、小文件跳过）
7. **容量控制** → 500MB/workspace + 10/min rate limit
8. **离线 UX** → Phase 1 加 IndexedDB 暂存
9. **Tana 存量** → Phase 3 迁移任务
10. **Phase 拆分** → 1a/1b/1c

### Round 4: codex Review (7 findings + 3 open questions)

**Finding 1 (P0): `<img src>` 不能带 Authorization header**

原方案 Worker 代理 + Authorization header 无法工作。三种替代方案比较：
- A: fetch + blob URL — 安全但加载有跳动感、无浏览器缓存
- B: workspace 媒体 token（`?t={token}`）— 浏览器原生加载、缓存友好
- C: cookie 媒体域 — 最透明但基础设施复杂

用户选择 B：体验最好，7 天 token 过期风险可通过 onError 静默刷新化解。

**Finding 2 (P0): 描述生成写回链路断**

Worker 不知道 nodeId，不能写 LoroDoc。修正为客户端生成：节点创建后 fire-and-forget vision API → 写 fieldEntry。与 Spark 模式一致。

**Finding 3 (P1): 上传态持久化身份**

"先创建空 mediaUrl 节点"会同步垃圾数据到其他设备。修正为"先上传后创建"：UI placeholder 不写 LoroDoc，blob 暂存 IndexedDB，上传成功才创建节点。

**Finding 4 (P1): 剪藏重存放错层**

`html-to-nodes.ts` 是纯 parser，不应有网络副作用。移到 `webclip-service.ts` materialization 阶段。

**Finding 5 (P2): mediaUrl 语义不一致**

定死 contract：`mediaUrl` = 完整 Worker 代理 URL，永远不是 R2 key。

**Finding 6 (P2): quota 生命周期**

V1 显式声明 quota 只增不减。V2 添加孤儿扫描 + 回收。

**Finding 7 (P3): 文件路径过时**

`node-tool.ts` → `create-tool.ts`。

**Open questions 决议：**
- workspace members → V1 只做 owner-only（当前模型）
- SVG → V1 拒绝上传（安全清洗复杂，用户极少需要）
- Chat UI image block → ToolCallBlock 增加 image content 渲染

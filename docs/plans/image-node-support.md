# Image Node Support — 完整方案

> 状态: Draft — 待 nodex review
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
- **Notion 的 1 小时签名 URL 过期**是开发者和用户抱怨最多的图片问题。soma 必须避免——应使用内容寻址 key + 公开桶，URL 永不过期。
- **Tana 导出不含图片**是数据可移植性的警示。soma 的图片存 R2，导出时应可下载。
- **AI 图片理解在知识工具中仍是蓝海**。大多数工具（Obsidian/Logseq/Heptabase/Reflect/Tana）无 AI 图片理解。Notion 最近才加。这是 soma 的差异化机会。

### 2.2 AI × 图片：三层表示模型

调研 Notion AI、Obsidian Copilot、ChatGPT、Claude Desktop、NotebookLM 等工具后，发现一个新兴共识——图片应有三层表示：

| 层 | 内容 | Token 成本 | 用途 |
|---|---|---|---|
| **Layer 3: 原始字节** | base64 image data | ~1300 tokens/百万像素 | Agent 需要"看"具体视觉细节 |
| **Layer 2: 文本描述** | AI-generated description | ~100-200 tokens | 默认 Agent 上下文、搜索、检索 |
| **Layer 1: 元数据** | url, dimensions, alt | ~20 tokens | 节点列表、结构感知 |

**行业共识：按需加载**。没有工具把所有图片默认发给 LLM：
- Notion AI：用户主动 ask about image
- Obsidian Copilot：opt-in 设置，默认关闭
- ChatGPT/Claude：图片是 per-conversation，不自动从历史/记忆中加载

**描述缓存模式**（Capacities 验证过）：
- AI 自动生成图片描述存为对象属性
- 图片可搜索、可被 AI 在不"看"图的情况下理解上下文
- 代价是每张图多一次 vision model 调用

### 2.3 R2 上传模式

调研了三种上传模式：

| 模式 | 优点 | 缺点 |
|------|------|------|
| **Worker 代理** | 简单、可服务端校验、已有 R2 binding | Worker 处理全部字节、100MB 请求限制 |
| **Presigned URL 直传** | 不经 Worker、无内存压力 | 需 aws4fetch、CORS 配置、无服务端校验 |
| **混合** | 兼得 | 复杂 |

**结论：Worker 代理在 v1 足够。** soma 的图片（截图、文章配图）客户端压缩后通常 < 500KB，远低于 Worker 100MB 限制。

**成本模型**（1000 用户、50 图/用户/月）：

| 方案 | 月成本 |
|------|--------|
| **R2** | ~$0.56 |
| Cloudflare Images | ~$7.50+ |

R2 的免费出口流量是关键优势。

**客户端压缩方案比较：**
- `browser-image-compression`（~190KB）：功能全但额外依赖
- **Canvas API（零依赖）**：`createImageBitmap()` + `OffscreenCanvas` + `convertToBlob({ type: 'image/webp', quality: 0.85 })`，~20 行代码，Chrome 原生支持

**结论：用 Canvas API**，零依赖，足够。

**去重方案：**
- SHA-256 内容 hash（`crypto.subtle.digest`，1MB < 5ms）
- 先查后传（check-before-upload）
- Per-workspace 隔离（简单、无隐私风险）

### 2.4 Chrome Side Panel 限制

| 约束 | 影响 | 应对 |
|------|------|------|
| **拖拽跨上下文不可靠** | 从网页拖图到 Side Panel 的 DataTransfer 可能只含 URL | 需 content script 中继，优先级降低 |
| **Service Worker 无 DOM** | 不能用 `Image()` 或 `HTMLCanvasElement` | 可用 `OffscreenCanvas` + `createImageBitmap()` |
| **Blob URL 不自动回收** | Side Panel 文档持久存在 | 必须在 React useEffect cleanup 中 revokeObjectURL |
| **chrome.storage 不适合二进制** | JSON-only，base64 编码开销 33% | 用 IndexedDB 做本地缓存 |
| **粘贴正常工作** | Side Panel 有完整 DOM 和 Clipboard API | ProseMirror handlePaste 是天然集成点 |

### 2.5 soma 现有基础

代码库深度审计发现 image node 的**数据层已经完备**：

| 层 | 状态 | 详情 |
|---|---|---|
| **数据模型** | ✅ 完备 | `type: 'image'`, `mediaUrl`, `mediaAlt`, `imageWidth`, `imageHeight` |
| **渲染** | ✅ 可用 | `ImageNodeRenderer.tsx` — 懒加载、aspect ratio、错误兜底 |
| **剪藏提取** | ✅ 可用 | `html-to-nodes.ts` 处理 `<img>`, `<picture>`, `<figure>`, `<video>` |
| **Outliner 集成** | ✅ 可用 | `OutlinerItem.tsx` 对 media node 禁用文本 trigger |
| **Slash command** | ⚠️ 占位 | `image_file` 存在但 `enabled: false` |
| **R2 存储** | ⚠️ 仅 CRDT | 只存 Loro update/snapshot，无媒体文件桶 |
| **上传端点** | ❌ 无 | 无 multipart 或 presigned URL 端点 |
| **客户端上传** | ❌ 无 | 无 File → compress → upload 管线 |
| **编辑器图片粘贴** | ❌ 无 | ProseMirror handlePaste 不处理图片 |
| **AI 读取图片** | ❌ 无 | `node_read` 返回 `mediaUrl` 文本，不含图片数据；children summary 无 type 字段 |
| **AI 保存截图** | ❌ 无 | browser screenshot 是 ephemeral，3 条后变 placeholder |

---

## 3. 设计决策

### 决策 1：图片是 block-level 节点，不是 inline

**选项 A：Block-level**（每张图 = 独立节点）
**选项 B：Inline**（图片嵌在文本段落中间）

**选择 A。** 理由：
- 所有竞品都是 block-level（Notion block、Obsidian embed、Tana node、Capacities object）
- soma 数据模型天然适合（图片是普通节点，有 id、可有 children/tags）
- Inline 需要改 ProseMirror schema（加 image node type），改动大且需求不明确
- 未来如果需要 inline 小图标，可以通过 emoji 或 inline reference 解决

### 决策 2：Worker 代理上传，不用 Presigned URL

**选项 A：Worker 代理**（客户端 → Worker → R2）
**选项 B：Presigned URL 直传**（客户端 → R2，Worker 只发签名）
**选项 C：混合**

**选择 A。** 理由：
- 图片压缩后通常 < 500KB，Worker 100MB 限制绰绰有余
- 实现简单（已有 R2 binding `SYNC_BUCKET`，可复用或新建桶）
- 可做服务端校验（magic bytes、大小、auth）
- 无需 CORS 配置、无需 aws4fetch
- 可在 Worker 内做额外处理（如未来的 thumbnail 生成）
- 如果规模增长需要直传，届时再升级

### 决策 3：公开桶 + 自定义域名，不用签名 URL

**选项 A：公开桶 + 自定义域名**（`img.soma.app`）
**选项 B：签名 URL**（每次访问生成临时 URL）

**选择 A。** 理由：
- 内容寻址 key（SHA-256 hash）→ URL 永不变 → 可永久缓存
- 避免 Notion 的 1 小时 URL 过期问题
- Cloudflare CDN 自动缓存
- 图片内容不算高敏感数据（用户自己上传的截图/文章配图）
- 如果未来需要 workspace 级访问控制，可在 R2 前加 Worker 代理层

### 决策 4：Canvas API 压缩，不引入额外依赖

**选项 A：Canvas API**（`createImageBitmap` + `OffscreenCanvas` + `convertToBlob`）
**选项 B：browser-image-compression 库**（~190KB）

**选择 A。** 理由：
- 零依赖，Chrome 原生支持
- 做两件事就够：resize ≤ 2048px + WebP 0.85 quality
- ~20 行代码，不值得引入一个库
- Chrome 扩展对 bundle size 敏感

### 决策 5：Per-workspace 去重，不做全局

**选项 A：Per-workspace**（同一张图在不同 workspace 存两份）
**选项 B：全局去重**（一份图跨 workspace 共享）

**选择 A。** 理由：
- 简单：R2 key = `{wsId}/images/{hash}.webp`，天然隔离
- 无跨 workspace 隐私/安全风险
- 存储成本极低（$0.56/月 @ 1000 用户），省的不值得复杂化
- 删除 workspace 时可直接清理该前缀下所有对象

### 决策 6：node_read 直接带图，不要额外参数或工具

**选项 A：node_read 自动包含 ImageContent**（如果节点是 image 类型）
**选项 B：新增 `includeImages` 参数**
**选项 C：新增 `view_image` 独立工具**

**选择 A。** 理由：
- Agent 选择 `node_read(imageNodeId)` 已经是明确意图
- 图片是 image 节点的"内容"，就像文本是文本节点的内容——不需要额外开关
- Agent 控制 token 成本的方式是**选择读不读**，而非参数开关
- 前提：children summary 加 `type` 字段，让 Agent 能判断哪些子节点是图片
- 不增加新工具 = 不增加 Agent 认知负担

### 决策 7：node_create 内部处理上传，不加新工具

**选项 A：扩展 node_create 支持 `data.imageData`**
**选项 B：新增 `save_image` 独立工具**

**选择 A。** 理由：
- 创建图片节点本质上还是"创建节点"，只是内容是图片而非文本
- 工具内部检测 `imageData` 字段 → 压缩 → 上传 R2 → 创建节点
- 不增加工具数量，保持 Agent 工具集简洁
- 上传失败的错误处理可以在工具内部完成，返回清晰错误信息

### 决策 8：Layer 2 描述惰性生成，不在上传时

**选项 A：上传时自动生成**（每张图 1 次 vision API 调用）
**选项 B：Agent 首次读取时惰性生成**
**选项 C：手动触发**

**选择 B。** 理由：
- 不是所有图片都会被 Agent 读取，上传时全量生成浪费 API 调用
- 首次读取的延迟可接受（Agent 本身有思考时间）
- 生成后缓存到节点的 `imageDescription` 字段，后续读取直接返回
- 比手动触发更自然（用户不会主动为每张图生成描述）

### 决策 9：不做 URL 粘贴变图片

**不做。** 理由：
- 很难区分用户粘贴的是"想变成图片的 URL"还是"想记录这个链接"
- Agent 可以通过 `browser:screenshot` 捕获任何 URL 内容
- 用户可以截图粘贴，比输入 URL 更快
- "下载远程图片"的能力已在剪藏重存中覆盖

### 决策 10：网页拖图优先级最低

**降低优先级。** 理由：
- Chrome Side Panel 跨上下文拖拽不可靠（DataTransfer 可能只含 URL，不含二进制）
- 需要 content script 中继，实现复杂
- 替代方案：content script 提供右键菜单"保存图片到 soma"

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
         │  Client Upload Pipeline  │           │             │
         │  Canvas resize ≤2048px   │           │             │
         │  → WebP 0.85            │ ◄─────────┘─────────────┘
         │  → SHA-256 hash         │
         │  → IndexedDB 本地缓存    │
         └───────────┬─────────────┘
                     │ POST /api/images
                     ▼
         ┌──────────────────────────┐
         │  Worker (CF)             │
         │  Auth + 校验 magic bytes │
         │  D1 hash 查重            │
         │  → R2 存储               │
         └───────────┬─────────────┘
                     │
                     ▼
         R2: {wsId}/images/{hash}.webp
         CDN: https://img.soma.app/...
                     │
                     ▼
              ┌──────────────┐
              │  Image Node  │ ← mediaUrl = R2 公开 URL
              │  (Loro CRDT) │
              └──────┬───────┘
                ↗         ↘
    Outliner 渲染          Agent 读取
    ImageNodeRenderer      node_read → ImageContent
```

### 4.2 数据模型

**NodexNode 改动（最小）：**

```typescript
// 已有，不改
type?: 'image'
mediaUrl?: string        // → R2 公开 URL
mediaAlt?: string        // 用户可编辑的 alt text
imageWidth?: number
imageHeight?: number

// 新增
imageDescription?: string  // Layer 2: AI 生成的文本描述缓存
```

**后端 D1 新增 images 表：**

```sql
CREATE TABLE images (
  hash         TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  r2_key       TEXT NOT NULL,           -- {wsId}/images/{hash}.webp
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (workspace_id, hash)
);
```

### 4.3 后端 API

**新增路由：`POST /api/images`**

```
Request:
  Headers: Authorization (Better Auth session)
  Body: multipart/form-data
    - file: WebP image blob
    - hash: SHA-256 hex string (客户端预算)
    - workspaceId: string
    - width: number (可选)
    - height: number (可选)

Response (200 - 新上传):
  { url, hash, width, height, created: true }

Response (200 - 已存在，hash 去重):
  { url, hash, width, height, created: false }

Response (400): file > 10MB / 非图片 / hash 不匹配
Response (401): unauthorized
```

**校验流程：**
1. 验证 Better Auth session + workspace 成员资格
2. 检查 Content-Length ≤ 10MB
3. 读取文件前 12 字节，校验 WebP magic bytes（`RIFF....WEBP`）
4. 验证客户端提交的 hash 与实际文件内容 hash 一致
5. 查 D1：`SELECT * FROM images WHERE workspace_id = ? AND hash = ?`
   - 已存在 → 返回 existing URL（跳过上传）
6. `env.SYNC_BUCKET.put(r2Key, file)` 存入 R2
7. D1 INSERT 记录
8. 返回 `{ url: "https://img.soma.app/{wsId}/images/{hash}.webp", ... }`

### 4.4 客户端上传管线

**新文件：`src/lib/image-upload.ts`**

```
输入: File | Blob (来自 paste / screenshot base64 / fetch blob)

Pipeline:
  1. 格式校验 (仅接受 image/*)
  2. Canvas 压缩
     createImageBitmap(blob, { resizeWidth: 2048, resizeHeight: 2048 })
     OffscreenCanvas → convertToBlob({ type: 'image/webp', quality: 0.85 })
  3. SHA-256 hash
     crypto.subtle.digest('SHA-256', arrayBuffer) → hex string
  4. 构造 multipart/form-data，POST /api/images
  5. 返回 { url, hash, width, height }

错误处理:
  - 网络失败 → 抛出可重试错误
  - 服务端拒绝 → 抛出不可重试错误（文件太大、格式无效等）
```

### 4.5 创建路径集成

**路径 1：Editor 粘贴（P0）**

在 `RichTextEditor.tsx` 和 `TrailingInput.tsx` 的 ProseMirror `handlePaste` 中，在现有文本 paste 逻辑**之前**检查剪贴板是否包含图片：

```
handlePaste(view, event) {
  const imageFile = getImageFromClipboard(event.clipboardData)
  if (imageFile) {
    event.preventDefault()
    uploadAndCreateImageNode(currentNodeParentId, imageFile)
    return true  // 阻止 ProseMirror 默认处理
  }
  // ...现有文本 paste 逻辑不变
}
```

检测逻辑：遍历 `clipboardData.items`，找 `kind === 'file'` 且 `type.startsWith('image/')` 的项。

**上传态 UI：** image node 创建时 `mediaUrl` 为空 → `ImageNodeRenderer` 显示 loading 骨架屏。上传完成 → 更新 `mediaUrl` → 渲染图片。上传失败 → 显示错误态 + 重试。

**路径 2：Agent 截图保存（P0）**

在 `node-tool.ts` 的 node_create 逻辑中，检测 `data.imageData`：

```
if (data.type === 'image' && data.imageData) {
  // base64 → Blob → 走 image-upload 管线
  const blob = base64ToBlob(data.imageData)
  const { url, width, height } = await uploadImage(blob, workspaceId)
  // 创建节点
  createChild(parentId, {
    type: 'image',
    mediaUrl: url,
    imageWidth: width,
    imageHeight: height,
    mediaAlt: data.mediaAlt
  })
}
```

**路径 3：Chat 输入粘贴（P1）**

Chat 输入区域监听 paste 事件，检测图片 → 显示缩略图预览 → 发送时作为 `UserMessage` 的 `ImageContent`。

注意：Chat 中粘贴的图片**不自动创建 image node**——它是对话上下文，不是知识节点。

**路径 4：剪藏图片重存（P1）**

在 `html-to-nodes.ts` 中，对提取到的外部图片 URL：
1. Background script fetch 图片（bypass CORS）
2. 走 image-upload 管线 → 获得 R2 URL
3. 创建 image node 时用 R2 URL 替换外部 URL

渐进策略：新剪藏走 R2，旧数据保持外部 URL。

---

## 5. AI 工具改动

### 5.1 node_read

**改动 1：children summary 增加 `type` 字段**

当前 children summary 不包含 `type`，Agent 无法分辨哪些子节点是图片。

```json
// Before
{ "id": "img1", "name": "chart", "hasChildren": false, "childCount": 0, "tags": [] }

// After
{ "id": "img1", "name": "chart", "type": "image", "hasChildren": false, "childCount": 0, "tags": [] }
```

仅对 `type` 有值的节点（image、embed 等）才输出此字段。普通文本节点不输出 `type`（保持向后兼容，减少 token 消耗）。

**改动 2：读 image 节点时，结果直接包含 ImageContent**

```typescript
// buildToolResult 中
if (node.type === 'image' && node.mediaUrl) {
  // 文本部分：结构化元数据
  result.content.push({
    type: 'text',
    text: JSON.stringify({
      id: node.id,
      type: 'image',
      name: node.name,
      imageInfo: {
        url: node.mediaUrl,
        width: node.imageWidth,
        height: node.imageHeight,
        alt: node.mediaAlt,
        description: node.imageDescription ?? null  // Layer 2 缓存
      },
      // ...其他标准字段（tags, fields, parent, breadcrumb）
    })
  })

  // 图片部分：实际图片数据
  const imageData = await fetchImageAsBase64(node.mediaUrl)
  result.content.push({
    type: 'image',
    data: imageData,
    mimeType: 'image/webp'
  })
}
```

Agent 每次读 image 节点都能"看到"图片，无需额外参数。Agent 通过 children summary 的 `type` 字段决定是否读取——这就是成本控制机制。

**改动 3：Layer 2 描述惰性生成**

当 Agent 首次读取一个没有 `imageDescription` 的 image 节点时：
- 本次返回 `description: null` + 图片数据
- Agent 自然地在回复中会描述这张图片
- 可以在 Agent 处理完成后，将其对图片的描述存回 `imageDescription` 字段

或者更简单的方案：描述生成作为独立后台任务，不阻塞 node_read 流程。

### 5.2 node_create

**增加 imageData 处理分支：**

```typescript
// node_create handler
if (data.type === 'image' && data.imageData) {
  // 1. base64 → Blob
  // 2. 调用 image-upload 管线（compress → hash → upload）
  // 3. 创建节点（mediaUrl = R2 URL）
  // 4. 返回 { id, mediaUrl, ... }
}
```

**工具描述更新：** 在 node_create 的 tool description 中说明支持 `data.imageData`（base64 字符串）创建图片节点。Agent 手上的截图可以直接通过 `node_create` 持久化。

### 5.3 Agent 典型工作流

```
1. Agent 读一个节点
   → node_read 返回 children 列表
   → children 中某个 child 有 type: "image"

2. Agent 决定是否要看这张图
   → 如果不需要：跳过（节省 token）
   → 如果需要：node_read(imageNodeId)
   → 收到文本元数据 + ImageContent（图片字节）

3. Agent 需要保存截图为知识节点
   → node_create({ parentId, data: { type: 'image', imageData: '<base64>', mediaAlt: '...' } })
   → 工具内部处理上传，返回 { id, mediaUrl }

4. Agent 在 Chat 中收到用户粘贴的图片
   → 图片作为 UserMessage.ImageContent 直接发给 LLM
   → 不创建节点（对话上下文，不是知识）
```

---

## 6. 实施计划

### Phase 1: Foundation（R2 + Upload + Paste）

**目标：** 用户可以在编辑器中粘贴图片，图片上传到 R2 并持久化为 image node。

**后端改动：**

| 文件 | 动作 | 内容 |
|------|------|------|
| `server/src/routes/images.ts` | 新建 | POST /api/images 路由（auth + 校验 + 去重 + R2 存储） |
| `server/src/lib/db.ts` | 修改 | 新增 images 表 schema |
| `server/src/types.ts` | 修改 | 确认 R2 binding（或新增 IMAGE_BUCKET） |
| `server/wrangler.toml` | 修改 | R2 公开桶 + 自定义域名配置 |
| `server/src/index.ts` | 修改 | 注册 images 路由 |

**客户端改动：**

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/image-upload.ts` | 新建 | 客户端上传管线（compress + hash + upload） |
| `src/components/editor/RichTextEditor.tsx` | 修改 | handlePaste 增加图片检测分支 |
| `src/components/editor/TrailingInput.tsx` | 修改 | handlePaste 增加图片检测分支 |
| `src/components/outliner/ImageNodeRenderer.tsx` | 修改 | 增加 loading / error / retry 状态 |
| `src/lib/slash-commands.ts` | 修改 | 启用 image_file 命令 |
| `src/stores/node-store.ts` | 修改 | 新增 createImageNode action（或扩展 createChild） |

### Phase 2: AI Integration

**目标：** Agent 能"看到"图片节点内容，能将截图保存为持久节点。

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/ai-tools/read-tool.ts` | 修改 | children summary 加 type；image 节点返回 ImageContent |
| `src/lib/ai-tools/node-tool.ts` | 修改 | node_create 支持 imageData → upload → create |
| `src/types/node.ts` | 修改 | 新增 `imageDescription?: string` 可选字段 |

### Phase 3: Ecosystem

**目标：** 完善图片生态——Chat 输入、剪藏重存、离线支持。

| 任务 | 文件 | 说明 |
|------|------|------|
| Chat 输入图片粘贴 | `src/components/chat/ChatInput.tsx` 等 | paste 检测 + 缩略图预览 + 发送为 ImageContent |
| 剪藏图片重存 | `src/lib/html-to-nodes.ts`, background script | 外部 URL → bg fetch → upload R2 → 替换 mediaUrl |
| 离线队列 | `src/lib/image-upload.ts` | IndexedDB 缓存 + 联网后自动上传 |
| 图片 lightbox | `src/components/outliner/ImageNodeRenderer.tsx` | 点击放大查看 |

---

## 7. 验证要点

### Phase 1 验收标准

- [ ] 在编辑器中 Cmd+V 粘贴截图 → 出现 loading 态 → 上传完成后显示图片
- [ ] 同一张图粘贴两次 → R2 只存一份（SHA-256 hash 去重生效）
- [ ] 图片节点在大纲中正常渲染，可拖拽排序，可有 children
- [ ] 上传失败（网络断开）→ 显示错误态 + 可重试
- [ ] slash command `/image` 可触发文件选择器上传图片
- [ ] `npm run verify` 全通过

### Phase 2 验收标准

- [ ] Agent `node_read` 一个 image 节点 → 返回中包含 ImageContent → Agent 能描述图片内容
- [ ] Agent 读父节点 → children summary 中 image 子节点有 `type: "image"` 标识
- [ ] Agent `node_create({ data: { type: 'image', imageData: '...' } })` → 图片上传 R2 + 创建持久节点
- [ ] Agent 截图 → 保存为节点 → 后续读取能看到同一张图

### Phase 3 验收标准

- [ ] Chat 输入框粘贴图片 → 显示缩略图预览 → 发送后 Agent 能看到
- [ ] 新剪藏文章中的图片 → mediaUrl 指向 R2（不是外部 URL）
- [ ] 离线粘贴图片 → 本地缓存 → 联网后自动上传 → mediaUrl 更新为 R2 URL

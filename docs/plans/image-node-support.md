# Image Node Support — 完整方案

> 状态: v2 — 已整合 nodex review 反馈
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
| **字段可见性系统** | ✅ 已有 | `hideField` 属性支持 NEVER/ALWAYS/WHEN_EMPTY/WHEN_NOT_EMPTY 四种模式 |
| **Slash command** | ⚠️ 占位 | `image_file` 存在但 `enabled: false` |
| **R2 存储** | ⚠️ 仅 CRDT | 只存 Loro update/snapshot，无媒体文件桶 |
| **上传端点** | ❌ 无 | 无 multipart 或 presigned URL 端点 |
| **客户端上传** | ❌ 无 | 无 File → compress → upload 管线 |
| **编辑器图片粘贴** | ❌ 无 | ProseMirror handlePaste 不处理图片 |
| **AI 读取图片** | ❌ 无 | `node_read` 返回 `mediaUrl` 文本，不含图片数据；children summary 无 type 字段 |
| **AI 保存截图** | ❌ 无 | browser screenshot 是 ephemeral，3 条后变 placeholder |

### 2.6 已有的隐藏字段先例

代码库中已有 `hideField: SYS_V.ALWAYS` 的实践：

- **`NDX_F.HIGHLIGHT_ANCHOR`**：高亮锚点数据，存储 JSON 序列化的文本选区信息，对用户完全隐藏
- **`NDX_F.SOURCE_HIGHLIGHTS`**：来源高亮列表，同样 `hideField: ALWAYS`

这证明"系统内部字段走 fieldDef + hideField: ALWAYS"是 soma 的既定模式，image description 应该复用。

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

### 决策 3：Worker 代理读取，不用公开桶

**选项 A：公开桶 + 自定义域名**
**选项 B：Worker 代理读取**（GET /api/images/{wsId}/{hash}）

**选择 B。**

> **Review 反馈**：用户截图可能包含敏感信息（密码管理器、私信、合同、内部 dashboard）。SHA-256 key 虽不可枚举，但 URL 一旦泄露就永久可访问且无法吊销。

方案：
- 不开 R2 公开桶
- 通过 Worker 代理读取：`GET /api/images/{wsId}/{hash}` → 验证 auth + workspace 成员 → 返回图片
- 设置 `Cache-Control: public, max-age=31536000, immutable`（内容寻址 key 永不变）
- Cloudflare CDN 自动缓存，后续请求不经 Worker
- 天然带 auth 保护，无需签名 URL，无过期问题

### 决策 4：Canvas API 压缩，不引入额外依赖

**选项 A：Canvas API**（`createImageBitmap` + `OffscreenCanvas` + `convertToBlob`）
**选项 B：browser-image-compression 库**（~190KB）

**选择 A。** 理由：
- 零依赖，Chrome 原生支持
- 做两件事就够：resize ≤ 2048px + WebP 0.85 quality
- ~20 行代码，不值得引入一个库
- Chrome 扩展对 bundle size 敏感

### 决策 5：智能压缩，不强制所有格式转 WebP

> **Review 反馈**：GIF 动画丢失（Canvas 只取第一帧），SVG 矢量质量降级，已压缩的小文件被二次压缩。

**压缩策略：**
- **GIF**：保留原格式直传（保留动画）
- **SVG**：保留原格式直传（保留矢量）
- **已压缩的 WebP/JPEG < 500KB**：直传，不重编码
- **大尺寸 PNG/BMP 等**：Canvas → WebP 0.85，resize ≤ 2048px

### 决策 6：Per-workspace 去重，不做全局

**选项 A：Per-workspace**（同一张图在不同 workspace 存两份）
**选项 B：全局去重**（一份图跨 workspace 共享）

**选择 A。** 理由：
- 简单：R2 key = `{wsId}/images/{hash}.{ext}`，天然隔离
- 无跨 workspace 隐私/安全风险
- 存储成本极低（$0.56/月 @ 1000 用户），省的不值得复杂化
- 删除 workspace 时可直接清理该前缀下所有对象

### 决策 7：node_read 直接带图，不要额外参数或工具

**选项 A：node_read 自动包含 ImageContent**（如果节点是 image 类型）
**选项 B：新增 `includeImages` 参数**
**选项 C：新增 `view_image` 独立工具**

**选择 A。** 理由：
- Agent 选择 `node_read(imageNodeId)` 已经是明确意图
- 图片是 image 节点的"内容"，就像文本是文本节点的内容——不需要额外开关
- Agent 控制 token 成本的方式是**选择读不读**，而非参数开关
- 前提：children summary 加 `type` 字段，让 Agent 能判断哪些子节点是图片
- soma 是大纲产品，绝大多数节点是文本，image 节点是少数
- 不增加新工具 = 不增加 Agent 认知负担

### 决策 8：node_create 内部处理上传，不加新工具

**选项 A：扩展 node_create 支持 `data.imageData`**
**选项 B：新增 `save_image` 独立工具**

**选择 A。** 理由：
- 创建图片节点本质上还是"创建节点"，只是内容是图片而非文本
- 工具内部用 `uploadAndCreateImageNode()` 封装，保证原子性（上传失败不创建节点）
- 不增加工具数量，保持 Agent 工具集简洁
- 工具描述明确说明"创建图片节点需要网络上传，可能较慢"

> **Review 反馈**：原子性——上传成功但 LoroDoc 写入失败会产生 R2 孤儿对象。解决：内部封装为原子操作，上传失败 → 不创建节点，LoroDoc 失败 → 孤儿图片后续可由 cleanup 任务回收（成本可忽略）。

### 决策 9：Layer 2 描述上传时异步生成

**选项 A：上传时异步生成**（fire-and-forget vision API 调用）
**选项 B：Agent 首次读取时惰性生成**
**选项 C：手动触发**

**选择 A。**

> **Review 反馈**：惰性生成策略模糊——"Agent 自然地会描述"不是可靠路径，"谁来存回"未定义。

改为上传时异步生成：
- 上传完成 → 创建节点（mediaUrl 已有）→ fire-and-forget 调用 vision API
- 参考 Spark 的三态模式（pending → generating → done）
- 生成完成 → 写入 `NDX_F.IMAGE_DESCRIPTION` fieldEntry
- 成本可控（只在上传时调一次）
- 保证 Agent 后续读取时有描述可用

### 决策 10：imageDescription 走 fieldDef + hideField: ALWAYS

**选项 A：NodexNode 顶层属性**
**选项 B：fieldDef + hideField: SYS_V.ALWAYS**

**选择 B。**

> **Review 反馈**：顶层属性违反 CLAUDE.md "所有新增元数据走 attrDef" 守则。

复用已有的 `hideField` 机制，与 `NDX_F.HIGHLIGHT_ANCHOR` 同一模式：
- 定义 `NDX_F.IMAGE_DESCRIPTION` fieldDef
- `fieldType: 'plain'`
- `hideField: SYS_V.ALWAYS` → 永远不在 Outliner 中展示
- AI 和搜索可以正常读取（标准字段）
- 遵守"一切皆节点"铁律

### 决策 11：不做 URL 粘贴变图片

**不做。** 理由：
- 很难区分用户粘贴的是"想变成图片的 URL"还是"想记录这个链接"
- Agent 可以通过 `browser:screenshot` 捕获任何 URL 内容
- 用户可以截图粘贴，比输入 URL 更快
- "下载远程图片"的能力已在剪藏重存中覆盖

### 决策 12：网页拖图优先级最低

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
         │  智能压缩(见决策5)        │           │             │
         │  → SHA-256 hash         │ ◄─────────┘─────────────┘
         │  → IndexedDB 暂存(防丢失)│
         └───────────┬─────────────┘
                     │ POST /api/images
                     ▼
         ┌──────────────────────────┐
         │  Worker (CF)             │
         │  Auth + workspace 校验   │
         │  Magic bytes + 大小校验  │
         │  D1 hash 查重            │
         │  Quota 检查(500MB/ws)    │
         │  → R2 存储               │
         │  → 异步 vision API       │
         │    生成描述(fire&forget)  │
         └───────────┬─────────────┘
                     │
                     ▼
         R2: {wsId}/images/{hash}.{ext}
                     │
              ┌──────┴───────┐
              │  Image Node  │ ← mediaUrl = 内部 R2 key
              │  (Loro CRDT) │
              └──────┬───────┘
                ↗         ↘
    Outliner 渲染          Agent 读取
    GET /api/images/       node_read → fetch →
    {wsId}/{hash}          ImageContent
    (CDN 缓存)
```

### 4.2 数据模型

**NodexNode：不新增顶层属性。** 已有字段完全够用：

```typescript
// 已有，不改
type?: 'image'
mediaUrl?: string        // → R2 内部 key 或 Worker 代理 URL
mediaAlt?: string        // 用户可编辑的 alt text
imageWidth?: number
imageHeight?: number
```

**新增 fieldDef（系统内部，用户不可见）：**

```typescript
// NDX_F.IMAGE_DESCRIPTION — AI 生成的图片文本描述
// fieldType: 'plain'
// hideField: SYS_V.ALWAYS
// 挂在 image 类型节点上
// 与 NDX_F.HIGHLIGHT_ANCHOR 同一模式
```

**后端 D1 新增 images 表：**

```sql
CREATE TABLE images (
  hash         TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  r2_key       TEXT NOT NULL,           -- {wsId}/images/{hash}.{ext}
  mime_type    TEXT NOT NULL,            -- image/webp, image/gif, image/svg+xml 等
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (workspace_id, hash)
);
```

### 4.3 后端 API

**新增路由 1：`POST /api/images`（上传）**

```
Request:
  Headers: Authorization (Better Auth session)
  Body: multipart/form-data
    - file: 图片 blob (WebP/JPEG/PNG/GIF/SVG)
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
Response (413): workspace quota exceeded
Response (429): rate limit exceeded
```

**校验流程：**
1. 验证 Better Auth session + workspace 成员资格
2. Rate limit 检查（10 次/分钟/用户）
3. Workspace quota 检查（500MB 上限）
4. 检查 Content-Length ≤ 10MB
5. 读取文件头，校验 magic bytes（WebP/JPEG/PNG/GIF/SVG）
6. 验证客户端提交的 hash 与实际文件内容 hash 一致
7. 查 D1：`SELECT * FROM images WHERE workspace_id = ? AND hash = ?`
   - 已存在 → 返回 existing URL（跳过上传）
8. `env.SYNC_BUCKET.put(r2Key, file)` 存入 R2
9. D1 INSERT 记录
10. 返回 URL

**新增路由 2：`GET /api/images/{wsId}/{hash}`（读取，带 auth）**

```
Request:
  Headers: Authorization (Better Auth session)

Response (200):
  Headers:
    Content-Type: image/webp (或原始类型)
    Cache-Control: public, max-age=31536000, immutable
  Body: 图片二进制数据

Response (401): unauthorized
Response (404): image not found
```

Cloudflare CDN 自动缓存响应，后续请求命中缓存不经 Worker。

### 4.4 客户端上传管线

**新文件：`src/lib/image-upload.ts`**

```
输入: File | Blob (来自 paste / screenshot base64 / fetch blob)

Pipeline:
  1. 格式校验 (仅接受 image/*)
  2. 智能压缩（决策 5）
     - GIF/SVG → 保留原格式
     - WebP/JPEG < 500KB → 直传
     - 其他 → createImageBitmap + OffscreenCanvas → WebP 0.85, ≤2048px
  3. IndexedDB 暂存（防止上传中断丢失）
  4. SHA-256 hash
     crypto.subtle.digest('SHA-256', arrayBuffer) → hex string
  5. 构造 multipart/form-data，POST /api/images
  6. 上传成功 → 清除 IndexedDB 缓存
  7. 上传失败 → 保留 IndexedDB，节点显示重试按钮
  8. 返回 { url, hash, width, height }
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

**上传态 UI：** image node 创建时 `mediaUrl` 为空 → `ImageNodeRenderer` 显示 loading 骨架屏。上传完成 → 更新 `mediaUrl` → 渲染图片。上传失败 → 显示错误态 + 重试。图片 blob 暂存 IndexedDB，防止 Side Panel 关闭后丢失。

**路径 2：Agent 截图保存（P0）**

在 `node-tool.ts` 的 node_create 逻辑中，检测 `data.imageData`：

```
if (data.type === 'image' && data.imageData) {
  // base64 → Blob → 走 image-upload 管线（原子操作）
  // 上传失败 → 返回错误，不创建节点
  // 上传成功 → 创建节点（mediaUrl = Worker 代理 URL）
}
```

工具描述明确说明：创建图片节点需要网络上传，可能较慢。

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
        description: resolveImageDescription(node) ?? null  // 从 fieldEntry 读取
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

### 5.2 node_create

**增加 imageData 处理分支：**

```typescript
// node_create handler — 封装为原子操作
if (data.type === 'image' && data.imageData) {
  const result = await uploadAndCreateImageNode(parentId, data.imageData, data.mediaAlt)
  // 上传失败 → 返回明确错误信息，不创建节点
  // 成功 → 返回 { id, mediaUrl, ... }
}
```

**工具描述更新：** 说明支持 `data.imageData`（base64 字符串）创建图片节点。明确标注"需要网络上传，可能较慢"。

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

### Phase 1a: 后端基础设施

**目标：** R2 图片存储 + 上传/读取 API 可独立验证。

| 文件 | 动作 | 内容 |
|------|------|------|
| `server/src/routes/images.ts` | 新建 | POST /api/images (上传) + GET /api/images/{wsId}/{hash} (读取+auth) |
| `server/src/lib/db.ts` | 修改 | 新增 images 表 schema |
| `server/src/types.ts` | 修改 | 确认/新增 R2 binding |
| `server/wrangler.toml` | 修改 | R2 桶配置（不公开） |
| `server/src/index.ts` | 修改 | 注册 images 路由 |

**验收：** curl 上传图片 → R2 存储 → curl 读取 → 返回图片 → 重复上传 → hash 去重生效

### Phase 1b: 客户端管线 + Editor 粘贴

**目标：** 用户在编辑器中粘贴图片 → 上传 R2 → 显示在大纲中。

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/image-upload.ts` | 新建 | 客户端上传管线（智能压缩 + hash + IndexedDB 暂存 + upload + 重试） |
| `src/components/editor/RichTextEditor.tsx` | 修改 | handlePaste 增加图片检测分支 |
| `src/components/editor/TrailingInput.tsx` | 修改 | handlePaste 增加图片检测分支 |
| `src/components/outliner/ImageNodeRenderer.tsx` | 修改 | 增加 loading / error / retry 状态 |
| `src/stores/node-store.ts` | 修改 | 新增 createImageNode action（或扩展 createChild） |

**验收：** Cmd+V 粘贴截图 → loading → 显示图片 → 上传失败可重试

### Phase 1c: Slash command + 容量控制

**目标：** /image 命令 + workspace 配额 + rate limit。

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/slash-commands.ts` | 修改 | 启用 image_file 命令，绑定文件选择器 |
| `server/src/routes/images.ts` | 修改 | 添加 per-workspace quota (500MB) + rate limit (10/min) |

### Phase 2: AI Integration

**目标：** Agent 能"看到"图片节点内容，能将截图保存为持久节点。

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/ai-tools/read-tool.ts` | 修改 | children summary 加 type；image 节点返回 ImageContent |
| `src/lib/ai-tools/node-tool.ts` | 修改 | node_create 支持 imageData → upload → create |
| `src/types/system-nodes.ts` | 修改 | 新增 NDX_F.IMAGE_DESCRIPTION fieldDef 定义 |
| `src/lib/field-utils.ts` | 修改 | IMAGE_DESCRIPTION 字段解析支持 |
| 描述生成服务 | 新建 | 上传完成后 fire-and-forget vision API → 写入 fieldEntry |

### Phase 3: Ecosystem

**目标：** 完善图片生态——Chat 输入、剪藏重存、存量迁移、离线支持。

| 任务 | 文件 | 说明 |
|------|------|------|
| Chat 输入图片粘贴 | `src/components/chat/` | paste 检测 + 缩略图预览 + 发送为 ImageContent |
| 剪藏图片重存 | `src/lib/html-to-nodes.ts`, background script | 外部 URL → bg fetch → upload R2 → 替换 mediaUrl |
| Tana 存量图片迁移 | 迁移脚本 | 扫描 type:'image' 且 mediaUrl 非 R2 域名 → 批量 re-upload |
| 离线队列完善 | `src/lib/image-upload.ts` | IndexedDB 完整队列 + 联网后自动上传 |
| 图片 lightbox | `src/components/outliner/ImageNodeRenderer.tsx` | 点击放大查看 |

---

## 7. 验证要点

### Phase 1a 验收标准

- [ ] POST /api/images 上传图片 → 存入 R2 → D1 记录
- [ ] GET /api/images/{wsId}/{hash} → 验证 auth → 返回图片
- [ ] 未认证请求 → 401
- [ ] 非 workspace 成员 → 403
- [ ] 重复 hash → 返回已有 URL，不重复存储
- [ ] 文件 > 10MB → 400
- [ ] 非图片文件 → 400

### Phase 1b 验收标准

- [ ] 在编辑器中 Cmd+V 粘贴截图 → 出现 loading 态 → 上传完成后显示图片
- [ ] 粘贴 GIF → 保留动画（不转 WebP）
- [ ] 粘贴小 JPEG (< 500KB) → 不重编码，直传
- [ ] 同一张图粘贴两次 → R2 只存一份
- [ ] 图片节点可拖拽排序，可有 children
- [ ] 上传失败 → 显示错误态 + 重试按钮
- [ ] 上传中关闭 Side Panel → 重新打开后图片不丢失（IndexedDB 暂存）

### Phase 1c 验收标准

- [ ] slash command `/image` → 打开文件选择器 → 上传 → 创建图片节点
- [ ] workspace 图片总量 > 500MB → 上传拒绝 + 提示
- [ ] 短时间大量上传 → rate limit 生效

### Phase 2 验收标准

- [ ] Agent `node_read` image 节点 → 返回 ImageContent → Agent 能描述图片内容
- [ ] Agent 读父节点 → children summary 中 image 子节点有 `type: "image"` 标识
- [ ] Agent `node_create({ data: { type: 'image', imageData: '...' } })` → 上传 R2 + 创建持久节点
- [ ] Agent 截图 → 保存为节点 → 后续读取能看到同一张图
- [ ] 图片上传后异步生成描述 → 写入 NDX_F.IMAGE_DESCRIPTION fieldEntry
- [ ] Agent 读 image 节点 → imageInfo.description 有值

### Phase 3 验收标准

- [ ] Chat 输入框粘贴图片 → 显示缩略图预览 → 发送后 Agent 能看到
- [ ] 新剪藏文章中的图片 → mediaUrl 指向 R2（不是外部 URL）
- [ ] Tana 导入的旧图片 → 批量迁移到 R2
- [ ] 离线粘贴图片 → 本地缓存 → 联网后自动上传 → mediaUrl 更新

---

## 附录：决策讨论记录

### Round 1: 初始方案 (v1)

**用户需求**：支持 image node，图片存 R2，支持粘贴上传和剪藏。

**初始调研**：启动 5 个并行研究 agent——竞品分析、R2 上传模式、AI 多模态、Chrome 扩展限制、代码库审计。

**用户反馈**："还需要考虑 image node 也是要给 AI/agent 使用的"。补充 AI 维度后，识别出 Agent 与图片之间的三个断点（读不到、截图不能沉淀、用户无法给 Agent 看图）。

**用户反馈**："系统地思考和调研，不要着急下结论"。扩大调研范围，增加外部研究。

**用户反馈**："TipTap 已经从项目中移除了"。修正集成点：从 TipTap handlePaste 改为 ProseMirror EditorView handlePaste。

### Round 2: 工具设计讨论

**用户反馈**："node_read 都是读 node 的详细内容了，如果需要读的 node 是图片，就应该直接带图片，而不是还需要一个参数"

→ 取消 `includeImages` 参数方案。node_read 对 image 节点直接返回 ImageContent。

**用户反馈**："Agent 将截图保存为 image node，应该就是 node_create 的基础能力"

→ 取消独立 `save_image` 工具方案。扩展 node_create 支持 `data.imageData`。

**用户反馈**："工具设计需要谨慎，尽量不要添加新的工具，会增加工具调用的复杂性"

→ 确认不新增任何 AI 工具，仅扩展 node_read 和 node_create。

### Round 3: nodex Review (10 条反馈)

nodex 从数据模型、安全、实施、AI 集成、边界情况五个角度审视了 v1 方案：

**第 1 点：imageDescription 顶层属性违反"一切皆节点"**

- nodex 建议：走 fieldDef + supertag 模板
- 用户最初不同意："这些信息不是给用户看的，是给模型或搜索使用的"
- 后续讨论：用户提出"是不是可以有一些属性永远不展示，有些用户可以自己设置"
- 发现代码库已有 `hideField: SYS_V.ALWAYS` 机制，且 `NDX_F.HIGHLIGHT_ANCHOR` 已在使用
- **最终决策**：走 fieldDef + `hideField: SYS_V.ALWAYS`，复用现有机制。这既遵守铁律，又不给用户添噪音

**第 2 点：node_create 塞入上传逻辑，职责混乱**

- nodex 指出原子性、超时、API 形状误导问题
- **接受**：内部用 `uploadAndCreateImageNode()` 封装，工具描述明确标注"可能较慢"

**第 3 点：公开桶安全假设过于乐观**

- nodex 指出用户截图可能含敏感信息，URL 泄露后永久可访问
- **接受**：改为 Worker 代理读取（GET /api/images/{wsId}/{hash}），不开公开桶。CDN 缓存确保性能

**第 4 点：node_read 内联 fetch 图片字节，成本失控**

- nodex 建议增加 includeImage 参数或独立 view_image 工具
- 用户不同意："并不是每个 node 都有图片，我们是大纲产品，图片信息应该没那么多"
- **维持原设计**：node_read 对 image 节点直接带图。Agent 通过 children summary 的 type 字段决定是否读取，这就是成本控制机制

**第 5 点：Layer 2 描述生成策略模糊**

- nodex 指出"Agent 自然会描述"不是可靠路径，"谁来存回"未定义
- **接受**：改为上传时异步生成（fire-and-forget vision API），参考 Spark 三态模式

**第 6 点：WebP 强制转换丢失信息**

- nodex 指出 GIF 动画丢失、SVG 降级、小文件二次压缩
- **接受**：改为智能压缩——GIF/SVG 保留原格式，小文件跳过重编码

**第 7 点：缺少容量控制**

- nodex 建议 per-workspace 配额 + rate limit + trash 清理
- **接受**：Phase 1c 加入 500MB/workspace 配额 + 10次/分钟 rate limit

**第 8 点：离线与上传态 UX 空白**

- nodex 指出 Phase 1 就会遇到网络不稳定，不能把离线推到 Phase 3
- **接受**：Phase 1b 加入最小重试机制（IndexedDB 暂存 blob，防止粘贴后图片丢失）

**第 9 点：Tana 导入存量图片未提及**

- nodex 指出 Tana CDN URL 未来会失效
- **接受**：Phase 3 加迁移任务

**第 10 点：Phase 1 应该拆更细**

- nodex 建议拆为 1a(后端)/1b(editor paste)/1c(slash command)
- **接受**：每步可独立 typecheck + test + build + 浏览器验证

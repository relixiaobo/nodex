# Phase 2: 阅读环 — Clip & Spark

> 依赖：Phase 1 (node tool + Chat)
> 可并行：Phase 4 (编排)
> 来源：ai-strategy.md §10 "通道 3: Clip" + §3 "认知工作流" + §16 "Clip & Spark 节点结构"

---

## 目标

激活第一条认知工作流——**阅读环**：

```
浏览网页 → AI 提取结构（不是摘要）→ 碰撞已有笔记 → 用户捕捉灵感
                ↓
"AI 接管结构（干），用户被释放专注灵感（湿）"
```

**交付物**：用户 clip 网页 → #source 节点创建 → #spark 子节点自动生成（结构提取 + 条件性碰撞）

---

## 核心概念

### Clip 从"剪藏"重新定位为"认知触发"

来源：ai-strategy.md §10 Clip & Spark

> 旧定义：保存原文和摘要
> 新定义：提取思维结构 + 与已有笔记碰撞 + 邀请用户写自己的想法

### Spark 三轮认知压缩

来源：ai-strategy.md §10 "Spark 三轮认知压缩"

| 轮次 | 载体 | 时机 | 含义 |
|------|------|------|------|
| **Round 1 骨架** | #spark 顶层子节点 | clip 时自动 | 核心框架/取景框（不是摘要） |
| **Round 2 血肉** | 骨架的 children | clip 时自动 | 论证链、隐形假设、边界条件 |
| **Round 3 灵魂** | 碰撞结果 | 积累后渐进 | 跨域映射、与已有知识的连接 |

outliner 树状结构天然支持渐进式披露——不需要特殊 UI。

### 节点结构（扩展现有 #source）

**注意**：`#source` 标签和基础 clip 流程已在代码库中实现（`webclip-service.ts`）。Phase 2 不是"新增 #source 体系"，而是**扩展现有 #source family**——在已有的 clip 节点结构上增加 `#spark`、`#note` 子节点和 is/has/about 元数据字段。

来源：ai-strategy.md §10 "Clip & Spark 节点结构"

```
"Modular Architecture" #article #source
  ├── Highlights (field, 默认折叠)
  │     ├── "预制约束决定了组装的自由度…"
  │     └── "模块边界应由变化率决定…"
  ├── #spark（AI 认知触发，持久化节点树）
  │     ├── 核心框架：预制约束 → 组装自由         ← Round 1 骨架
  │     │     ├── 论证：模块边界由变化率决定       ← Round 2 血肉
  │     │     └── 隐形假设：假定变化率可预测
  │     └── 碰撞（置信度过阈值时）                 ← Round 3 灵魂
  │           └── 跟 <ref id="...">API 设计笔记</ref> 是同构
  ├── #note（用户笔记）
  │     └── 约束有两种：边界约束和时序约束…
  └── (URL / Author — field entries)
```

**关键**：
- `#source` 是顶层锚点（来源元数据）
- `#spark` 和 `#note` 是 `#source` 的**平级子节点**（AI 和用户自然共存，不做视觉区分）
- `#highlight` 是 `#source` 的 Highlights 字段（默认折叠）
- Spark 内容持久化为**真实节点树**（不是 JSON blob——一切皆节点铁律）
- highlight 通过 **reference** 嵌入 spark/note 中作为论据

---

## Spark 触发策略

来源：ai-strategy.md §10 "Spark 触发策略"

| 场景 | Spark 触发 | 理由 |
|------|-----------|------|
| 用户主动 clip | **自动** | 明确意图："帮我看看这个" |
| 用户先 highlight/note，被动创建 clip | **手动按钮** | 用户在思考中，不要打断 |
| 没有 API key | **灰显/提示设置** | 不阻塞其他功能 |

### 触发流程

```
用户 clip 网页
  → 创建 #source 节点（复用 webclip-service.ts）
  → 判断触发方式：
      主动 clip → 自动触发 Spark
      被动 clip → 显示 Spark 按钮，用户决定
  → Spark 流程（通过 agent tool call）：
      1. 读取页面内容（Shadow Cache 或原文）
      2. Round 1: 提取骨架 → 创建 #spark 顶层子节点
      3. Round 2: 提取血肉 → 创建骨架的 children
      4. Round 3: 碰撞（条件性）→ 搜索已有节点 → 判断关联
      5. is/has/about 元数据填充（field entries）
  → 结果写入 Loro CRDT → outliner 实时显示
```

---

## 碰撞策略

来源：ai-strategy.md §11 "检索策略" + §16 "冷启动"

**核心原则：碰撞是 pull 不是 push。宁可不碰，不硬碰。**

### Agent 驱动的检索流程

```
AI 提取当前内容的核心结构/主题
  → node.search（按 tags/fields/date_range 查找候选节点）
  → node.read（渐进式披露——逐级读取候选节点内容）
  → LLM 判断语义关联强度（是否真正同构/冲突/互补）
  → 置信度 > 阈值 → 展示碰撞结果
  → 置信度 ≤ 阈值 → 不展示
```

来源：ai-strategy.md §11

> 碰撞最有价值的是**跨域同构**（"代码重构和信息源管理底下藏着同一个模式"），这需要结构理解而非表面语义匹配。

**不做 embedding**——图结构 + Agent 检索比向量相似度更擅长发现跨域同构。

### 碰撞渐进增长（碰撞飞轮）

来源：ai-strategy.md §16 风险 #3 "冷启动"

```
Day 1:   Spark = 高质量结构提取 + 留白（不硬碰）
Week 2+: 碰撞零星出现（置信度过阈值时）
Month 2+: 碰撞质量提升——跨时间跨主题的同构浮现
Month 6+: 碰撞成为 clip 的主要价值
```

---

## #skill 节点参与提取

来源：ai-strategy.md §7 "#skill 节点结构"

Clip 的提取逻辑不是硬编码的 prompt，而是读取 `#skill` 节点的 Rules 子节点：

```
#skill: 从文章提取认知框架
  Type: extraction
  Output Schema: #spark → (ref to tagDef)
  Trigger: #source.type == 'article'
  ──────────────
  Rules（子节点，agent + 用户共同迭代）
    ├── 提取核心论证框架，不是列要点
    ├── 识别隐形假设和边界条件
    └── 碰撞时优先找跨域同构，不是主题相似
```

不同类型的内容（`#article` / `#video` / `#social`）可以有不同的提取 `#skill`。

**Phase 2 实现范围**：预置 1-2 个基础 `#skill`（如 article 提取、通用提取）。`#skill` 管理 UI 和 taste 学习在 Phase 5。

---

## is/has/about 元数据

来源：ai-strategy.md §10

Spark 提取时同时填充 supertag 字段（作为 field entries，不是 JSON blob）：

| 字段 | 含义 | 示例 |
|------|------|------|
| **is** | 这是什么类型的内容 | "方法论论述"、"技术教程"、"观点文章" |
| **has** | 包含哪些核心概念 | "模块化"、"约束与自由"、"变化率" |
| **about** | 关于什么主题 | "软件架构"、"设计哲学" |

这些通过 `#source` 的 supertag 模板字段填充——遵循"剪藏元数据 = Supertag 字段"守则（CLAUDE.md §数据模型）。

---

## Reference 在 Spark 中的应用

Agent 输出统一用 `<ref id="nodeId">text</ref>`（inline）和 `<cite id="nodeId">N</cite>`（角标）。

消费端各自物化：
- **node.create content** → `<ref>` 转为 ProseMirror `inlineReference`（真实图谱边）
- **node.create children** → `<ref>` 转为 Reference 节点 (`type: 'reference', targetId`)
- **Chat 展示** → `<ref>` 渲染为可点击导航链接（不创建图谱边）

示例：Spark 碰撞结果中 `"跟 <ref id="abc">API 设计笔记</ref> 是同构"` → 创建为节点时自动生成 inline reference。

**画板上的 reference = 真实图谱边（持久化）**——这强化图结构检索，加速碰撞冷启动。

---

## 离线 Spark（面板关闭时的 Clip）

来源：README.md 跨 Phase 决策 #8 "运行时宿主模型"

Agent 运行在 Side Panel 进程中。用户可能在面板关闭时通过 Content Script 工具栏 clip 网页——此时无法触发 Spark。

**解决方案：排队原始 payload**（与 `highlight-pending-queue.ts` 同一模式——只排队数据，不离线创建节点）：

```
面板关闭时 clip：
  Content Script → Background: "clip this page"
  Background: 将原始 clip payload { url, title, pageContent, highlights? }
              写入 chrome.storage.local 队列
  → 不创建 #source 节点（LoroDoc 只在 Side Panel 中初始化）
  → 不触发 Spark（无 Agent 可用）

下次面板打开时：
  Side Panel 启动 → 检查 chrome.storage.local 队列
  → 逐个消费：
    1. 从 payload 创建 #source 节点（通过 webclip-service + LoroDoc）
    2. 触发 Spark 流程
    3. 删除队列项
```

**为什么不在 Background 中创建节点**：当前架构下 `initLoroDoc()` 只在 Side Panel bootstrap 时执行，Background Service Worker 没有 LoroDoc 实例。`highlight-pending-queue.ts` 也是同一模式——离线时只暂存原始数据，下次开面板时消费。把 Loro 搬进 Background 是更大的架构改动，不在 Phase 2 范围内。

---

## 与 Shadow Cache 的关系

来源：ai-strategy.md §16 风险 #4 "Source 存储"

- AI 在内容进入时**一次性完成理解**
- 理解结果（#spark 节点树 + is/has/about 元数据）**永久存储为节点**
- 原文存入 Shadow Cache（IndexedDB + TTL 自动过期），可过期
- URL 作为回溯路径（用户可重访原文）

Phase 2 实现 Shadow Cache 的基础版本（IndexedDB 存储，TTL 清除）。

---

## 依赖 Phase 1 的能力

| 能力 | Phase 1 提供 | Phase 2 使用场景 |
|------|-------------|-----------------|
| `node.create` | 创建节点 | 创建 #source / #spark / #note 节点 |
| `node.read` | 渐进式读取 | 碰撞时读取候选节点内容 |
| `node.update` | 更新节点属性 | 填充 is/has/about 字段 |
| `node.search` | 搜索节点 | 碰撞时查找候选节点 |
| Reference 渲染 | Chat 中渲染引用 | Spark 中的 inline reference |
| Agent 全局单例 | 非 Chat 入口也能用 agent | Clip 触发 Spark 时调用 agent |

---

## 文件变更

| Action | File | Scope |
|--------|------|-------|
| **Create** | `src/lib/ai-spark.ts` | Spark 触发逻辑 + 提取流程编排 (~200 行) |
| **Create** | `src/lib/ai-shadow-cache.ts` | Shadow Cache (IndexedDB + TTL) (~80 行) |
| **Modify** | `src/lib/webclip-service.ts` | Clip 后触发 Spark 流程 |
| **Modify** | `src/lib/ai-service.ts` | Agent 注册提取相关 #skill |
| **Create** | `src/components/chat/SparkProgress.tsx` | Spark 进度渲染（提取中…） |
| **Modify** | `src/components/panel/NodePanel.tsx` 或 `NodePanelHeader.tsx` | Spark 手动触发按钮（被动 clip 场景） |
| **Create** | `src/lib/ai-skills/extraction-presets.ts` | 预置提取 #skill 模板 (~60 行) |
| **Modify** | `src/types/system-nodes.ts` | #source / #spark / #skill 系统标签定义 |
| **Create** | `src/lib/ai-spark-queue.ts` | 离线 Spark 队列（chrome.storage + 面板启动消费）(~60 行) |
| **Create** | `tests/vitest/ai-spark.test.ts` | Spark 流程测试 |

**高风险文件**：`system-nodes.ts`（与其他 Phase 协调）

---

## Exact Behavior

### 主动 Clip → 自动 Spark（面板已打开）

```
GIVEN 用户有有效的 API key
  AND Side Panel 已打开（Agent 可用）
  AND 用户在网页上主动点击 Clip 按钮
WHEN clip 完成，#source 节点创建成功
THEN 自动触发 Spark 流程
  AND ChatDrawer 不自动打开（Spark 作为并发任务执行）
  AND #source 节点下出现 #spark 子节点（流式创建，骨架先出现）
  AND #spark 的 children 是真实节点（不是文本块）
  AND 如果碰撞置信度过阈值，碰撞结果出现在 #spark 子节点中
  AND 如果碰撞置信度未过阈值，不显示碰撞（不硬碰）
```

### 主动 Clip → 延迟 Spark（面板关闭）

```
GIVEN 用户有有效的 API key
  AND Side Panel 未打开（Agent 不可用）
  AND 用户通过 Content Script 工具栏主动 clip 网页
WHEN clip 触发
THEN 原始 clip payload { url, title, pageContent } 写入 chrome.storage.local 队列
  AND 不创建 #source 节点（LoroDoc 只在 Side Panel 中初始化）
  AND 不触发 Spark
WHEN 用户下次打开 Side Panel
THEN 队列消费：逐个创建 #source 节点 + 触发 Spark 流程
  AND 队列项消费后删除
```

### 被动 Clip → 手动 Spark

```
GIVEN 用户先在网页上 highlight 或添加 note
  AND 系统被动创建了 #source 节点
WHEN 用户查看该 #source 节点
THEN 节点 header 显示 "Spark" 按钮
  AND 按钮状态：有 API key → 可点击；无 API key → 灰显 + tooltip "Set up API key"
WHEN 用户点击 Spark 按钮
THEN 触发 Spark 流程（同"面板已打开"场景）
```

### 无 API key

```
GIVEN 用户没有设置 API key
WHEN 用户 clip 网页
THEN #source 节点正常创建（clip 功能不受影响）
  AND Spark 不触发
  AND Spark 按钮灰显但可见
```

---

## 验证标准

1. Clip 一篇文章 → `#source` 节点创建 → `#spark` 子节点自动生成
2. `#spark` 内容是结构提取（框架/取景框），不是摘要/列要点
3. `#spark` 的 children 是真实节点（可展开、可编辑、可加标签）
4. 碰撞结果中有 reference 指向已有节点（如果触发）
5. 无 API key → clip 正常工作，Spark 按钮灰显
6. Shadow Cache 写入成功，TTL 过期后自动清除
7. `npm run typecheck && npm run test:run && npm run build` 全过

---

## 提交策略

1. `feat: Shadow Cache — IndexedDB storage with TTL for page content`
2. `feat: Spark extraction — AI structure extraction from clipped content`
3. `feat: Spark collision — graph-search based note collision with confidence threshold`
4. `test: Spark extraction + collision unit tests`

---

## Out of Scope

- `#skill` 管理 UI → Phase 5
- Taste 学习（从修正中更新 #skill rules）→ Phase 5
- CDP 增强 clip（动态页面内容提取）→ Phase 3
- Markdown 渲染（Spark 节点内容中）→ 独立排期

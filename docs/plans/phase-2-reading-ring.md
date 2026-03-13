# Track B: 阅读环 — Spark & 碰撞

> 更新：2026-03-13
> 依赖：Layer 0 ✅ + Layer 1 ✅（直接 LLM 调用）
> 来源：ai-strategy.md §10 "通道 3: Clip" + §3 "认知工作流"

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

## 当前状态

### 已完成

| 模块 | 文件 | 说明 |
|------|------|------|
| Spark 提取 | `src/lib/ai-spark.ts` | 直接 LLM 调用（`streamProxyWithApiKey`），不走 Agent |
| Spark #agent 节点 | `src/lib/ai-agent-node.ts` | 系统提示词 = 子节点，用户可编辑；model/temperature/maxTokens 字段配置 |
| #spark tagDef | `ensureSparkTagDef()` | 自动创建 |
| Shadow Cache | `src/lib/ai-shadow-cache.ts` | IndexedDB + TTL |
| Webclip 集成 | `src/lib/webclip-service.ts` | clip 后传入 pageText 触发 Spark |

### 待清理

1. **is/has/about 残留代码**：PR #130 review 已否决该设计，但代码仍存在：
   - `ensureSourceMetadataFieldDefs()` 创建 NDX_F17-19 fieldDefs
   - `NDX_F.SOURCE_IS` / `SOURCE_HAS` / `SOURCE_ABOUT` 常量

### 架构演进记录

Spark 经历了三次架构简化：

| 版本 | 方案 | 问题 |
|------|------|------|
| v1 | Agent + 7 tools | 不需要模型选工具，流程固定 |
| v2 | Agent + 1 tool | 仍走 createAgent()，API key 路径复杂 |
| **v3 (当前)** | **直接 LLM 调用 + #agent 节点** | 简单、可配置、用户可编辑提示词 |

---

## 核心概念

### Clip 从"剪藏"重新定位为"认知触发"

> 旧定义：保存原文和摘要
> 新定义：提取思维结构 + 与已有笔记碰撞 + 邀请用户写自己的想法

### Spark 认知压缩

| 轮次 | 载体 | 时机 | 含义 |
|------|------|------|------|
| **Round 1 骨架** | #spark 顶层子节点 | clip 时自动 | 核心框架/取景框（不是摘要） |
| **Round 2 血肉** | 骨架的 children | clip 时自动 | 论证链、隐形假设、边界条件 |
| **Round 3 灵魂** | 碰撞结果 | 积累后渐进 | 跨域映射、与已有知识的连接 |

### Spark 调用流程（当前实现）

```
triggerSpark(sourceNodeId, pageText)
  │
  ├── 1. ensureSparkTagDef() + ensureSparkAgentNode()  ← bootstrap
  ├── 2. readSparkAgentConfig()                         ← 读取 #agent 节点配置
  │       ├── readSystemPromptFromChildren()            ← 子节点 → system prompt
  │       ├── readOptionFieldName(MODEL_FIELD_ENTRY)    ← model 字段
  │       ├── readNumberField(TEMPERATURE_FIELD_ENTRY)  ← temperature 字段
  │       └── readNumberField(MAX_TOKENS_FIELD_ENTRY)   ← maxTokens 字段
  ├── 3. createSparkContainer(sourceNodeId)              ← 立即可见的 #spark 容器节点
  ├── 4. callSparkLLM(systemPrompt, content, ...)        ← 直接 streamProxyWithApiKey
  └── 5. parseSparkResponse() → buildInsightNodes()      ← JSON → 子节点树
```

### 节点结构

```
"Modular Architecture" #article #source
  ├── Highlights (field, 默认折叠)
  │     ├── "预制约束决定了组装的自由度…"
  │     └── "模块边界应由变化率决定…"
  ├── Spark #spark（AI 认知触发，持久化节点树）
  │     ├── 核心框架：预制约束 → 组装自由         ← Round 1 骨架
  │     │     ├── 论证：模块边界由变化率决定       ← Round 2 血肉
  │     │     └── 隐形假设：假定变化率可预测
  │     └── 碰撞（置信度过阈值时）                 ← Round 3 灵魂
  │           └── 跟 <ref id="...">API 设计笔记</ref> 是同构
  ├── #note（用户笔记）
  │     └── 约束有两种：边界约束和时序约束…
  └── (URL / Author — field entries)
```

### Spark #agent 节点结构

```
Spark  #agent                         ← SYSTEM_NODE_IDS.SPARK_AGENT
  ├── "You extract the cognitive structure..."  ← 子节点 = system prompt 行
  ├── "Return a JSON array of 3-5 insights."
  ├── "Each insight has name + children..."
  ├── ...（共 11 行默认提示词）
  ├── Model (field)      → claude-sonnet-4-5
  ├── Temperature (field) → 0.5
  └── Max Tokens (field)  → 4096
```

用户可在大纲中直接编辑提取规则（增删改子节点），无需改代码。

---

## 实施波次

### Wave 1: 清理 + 验证（当前优先）

#### 1.1 清理 is/has/about

| 操作 | 文件 | 说明 |
|------|------|------|
| 删除 | `ai-spark.ts` | `ensureSourceMetadataFieldDefs()` 函数（如果存在） |
| 删除 | `types/system-nodes.ts` | `NDX_F.SOURCE_IS` / `SOURCE_HAS` / `SOURCE_ABOUT` 常量 |
| 检查 | 全局 grep | 确认无其他引用这三个常量的代码 |

#### 1.2 验证

- clip 一篇文章 → #spark 子节点生成
- #spark 节点是结构提取（框架），不是摘要
- 不再创建 is/has/about fieldDefs

### Wave 3: Spark 质量 + 可见性

**目标**：提升提取质量和用户体验。

1. 优化 Spark #agent 节点默认提示词（更好的骨架/血肉分离）
2. Spark 进度 UI（NodePanelHeader 中的触发按钮、进度指示）
3. 离线 Spark 队列（`highlight-pending-queue.ts` 同一模式）
4. 手动触发按钮（被动 clip 场景）

### Wave 4: 碰撞策略（渐进式）

**核心原则：碰撞是 pull 不是 push。宁可不碰，不硬碰。**

#### v0: 手动碰撞

用户通过 Chat 主动请求："这篇文章和我之前的笔记有什么关联？"

Agent 执行 `node_search` + `node_read` 检索候选节点 → LLM 判断关联 → 在 Chat 中报告。

不需要额外代码——现有 Chat + 工具体系已支持。

#### v1: Spark 时自动检索

Spark 提取完成后，agent 额外执行一轮检索：

```
提取完骨架/血肉 → node_search（按 tags/date_range 查找候选）
→ node_read（逐级读取候选内容）
→ LLM 判断语义关联（是否同构/冲突/互补）
→ 置信度 > 阈值 → 创建碰撞 #spark 子节点
→ 置信度 ≤ 阈值 → 不展示
```

#### v2: #skill 学习碰撞规则

依赖 Layer 2 Step 2 (#skill 渐进式披露) + Track D (Taste 学习)。

Agent 从用户的碰撞反馈中学习——哪些碰撞有用、哪些是噪声，更新 #skill 规则。

---

## Spark 触发策略

| 场景 | Spark 触发 | 理由 |
|------|-----------|------|
| 用户主动 clip | **自动** | 明确意图："帮我看看这个" |
| 用户先 highlight/note，被动创建 clip | **手动按钮** | 用户在思考中，不要打断 |
| 没有 API key | **灰显/提示设置** | 不阻塞其他功能 |

---

## #skill 节点参与提取

依赖 Layer 2 Step 2 (Skill 渐进式披露)。详见 `ai-context-management.md` §Step 2 + `TASKS.md`「#skill 节点支持」。

未来方向：Spark 的提取逻辑从 #agent 节点的固定提示词，演进为动态加载 #skill 规则。不同类型的内容可以有不同的提取 #skill。

**实现范围**：预置 1-2 个基础 `#skill`（如通用提取）。`#skill` 管理 UI 和 taste 学习在 Track D。

---

## 离线 Spark（面板关闭时的 Clip）

Agent 运行在 Side Panel 进程中。用户可能在面板关闭时通过 Content Script 工具栏 clip 网页——此时无法触发 Spark。

**解决方案：排队原始 payload**（与 `highlight-pending-queue.ts` 同一模式）：

```
面板关闭时 clip：
  Content Script → Background: "clip this page"
  Background: 将原始 clip payload 写入 chrome.storage.local 队列
  → 不创建 #source 节点（LoroDoc 只在 Side Panel 中初始化）
  → 不触发 Spark（无 Agent 可用）

下次面板打开时：
  Side Panel 启动 → 检查队列 → 逐个消费（创建节点 + 触发 Spark）
```

---

## Reference 在 Spark 中的应用

Agent 输出统一用 `<ref id="nodeId">text</ref>`（inline）和 `<cite id="nodeId">N</cite>`（角标）。

消费端各自物化：
- **node_create content** → `<ref>` 转为 ProseMirror `inlineReference`（真实图谱边）
- **node_create children** → `<ref>` 转为 Reference 节点
- **Chat 展示** → `<ref>` 渲染为可点击导航链接

---

## Shadow Cache

- AI 在内容进入时**一次性完成理解**
- 理解结果（#spark 节点树）**永久存储为节点**
- 原文存入 Shadow Cache（IndexedDB + TTL 自动过期），可过期
- URL 作为回溯路径

---

## 验证标准

1. Clip 一篇文章 → `#source` 节点创建 → `#spark` 子节点自动生成
2. `#spark` 内容是结构提取（框架/取景框），不是摘要/列要点
3. `#spark` 的 children 是真实节点（可展开、可编辑、可加标签）
4. 碰撞结果中有 reference 指向已有节点（如果触发）
5. 无 API key → clip 正常工作，Spark 按钮灰显
6. `npm run verify` 全过

---

## Out of Scope

- `#skill` 管理 UI → Track D
- Taste 学习（从修正中更新 #skill rules）→ Track D
- CDP 增强 clip（动态页面内容提取）→ Track C ✅ 已支持
- Markdown 渲染（Spark 节点内容中）→ 独立排期

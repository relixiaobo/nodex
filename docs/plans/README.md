# soma AI 实施计划

> 更新：2026-03-13
> 性质：基础能力（Infrastructure Layers）× 功能轨道（Feature Tracks）的双维度计划

---

## 架构全景

### Infrastructure Layers（基础能力层）

基础能力是功能的前提。每层依赖下一层。

```
Layer 3: 编排层          AgentOrchestrator / Subagent / 后台任务
Layer 2: 上下文管线       Skill 渐进式披露 / 上下文压缩
Layer 1: 多 Agent 运行时  独立 agent 实例 + 直接 LLM 调用（Spark 等非 Chat 场景）
Layer 0: Agent 运行时     pi-ai proxy + pi-agent-core + Chat UI + 工具体系
```

### Feature Tracks（功能轨道）

功能轨道各自独立演进，依赖不同的基础能力层。

```
Track A: Chat         对话体验 — 持久化 / 同步 / UI 打磨
Track B: Reading Ring  阅读环 — Spark 提取 / 碰撞 / #skill 学习
Track C: Browser       浏览器 — 页面观察 + CDP 交互 + 调试
Track D: Cognition     认知 — Taste 学习 + Review 引擎
```

---

## Infrastructure Layers 状态

### Layer 0: Agent 运行时 ✅

pi-mono proxy + agent loop + Chat UI + 工具体系。全部完成。

| 模块 | 状态 | 归档 |
|------|------|------|
| pi-ai server proxy | ✅ | `docs/_archive/plans/phase-0-foundation.md` |
| Chat 面板 (ChatDrawer) | ✅ | 同上 |
| Node tools (6 个独立工具) | ✅ | `docs/_archive/plans/phase-1.5-node-tool-gaps.md` |
| Data access layer | ✅ | `docs/_archive/plans/phase-1.5.1-data-access-layer.md` |
| Undo tool | ✅ | `docs/_archive/plans/phase-1-canvas.md` |
| #agent 配置 | ✅ | 同上 |
| Chat 持久化 (IndexedDB) | ✅ | 同上 |

### Layer 1: 多 Agent 运行时 ✅

非 Chat 的 AI 调用路径。Spark 已重构为 **直接 LLM 调用**（`streamProxyWithApiKey`），绕过 `createAgent()`，通过 Spark #agent 节点读取 system prompt + model 配置。

| 模块 | 状态 | 说明 |
|------|------|------|
| 直接 LLM 调用（Spark） | ✅ | `ai-spark.ts` → `streamProxyWithApiKey` |
| Spark #agent 节点 | ✅ | 系统提示词存为子节点，model/temperature/maxTokens 字段配置 |
| API key 解析 | ✅ | 通过 `getApiKey()` 统一路径 |

### Layer 2: 上下文管线 ⬜（部分完成）

详细设计：`ai-context-management.md`

| Step | 内容 | 状态 | 说明 |
|------|------|------|------|
| Step 1 | `transformContext` + `convertToLlm` + `getApiKey` | ✅ | #132 |
| Step 2 | #skill 节点 + 渐进式披露 | ⬜ | 见 TASKS.md「#skill 节点支持」|
| Step 3 | Context 自动压缩 | ⬜ | Bridge Message + Handoff Memo + token 追踪 |

**Step 2 是 #skill 节点的基础能力**——提取模式学习（Track B）和 Taste 学习（Track D）都依赖它。

### Layer 3: 编排层 ⬜

AgentOrchestrator / Subagent / 后台任务。设计详见 `phase-4-orchestration.md`。

依赖 Layer 1 ✅ + 稳定的工具体系 (Layer 0 ✅)。

---

## Feature Tracks 状态

### Track A: Chat

| 功能 | 状态 | 说明 |
|------|------|------|
| 基础对话 + 流式回复 | ✅ | Phase 0 |
| 持久化 (IndexedDB) | ✅ | Phase 1 |
| 历史恢复 (StrictMode fix) | ✅ | 2026-03-13 fix |
| 会话同步 (跨设备) | ⬜ | 需设计方案 |
| UI 打磨 | ⬜ | `ui-chat-panel-redesign.md` |

### Track B: Reading Ring（阅读环）

详细设计：`phase-2-reading-ring.md`

| 功能 | 状态 | 说明 |
|------|------|------|
| Spark 基础提取 | ✅ | 直接 LLM 调用，#agent 节点配置 |
| Spark #agent 节点 | ✅ | 系统提示词 = 子节点，用户可编辑 |
| Shadow Cache | ✅ | `ai-shadow-cache.ts` |
| Webclip 集成 | ✅ | `webclip-service.ts` 触发 Spark |
| #spark tagDef | ✅ | `ensureSparkTagDef()` 自动创建 |
| **清理 is/has/about** | ⬜ | 删除 `ensureSourceMetadataFieldDefs` + NDX_F17-19 |
| **验证 Spark 端到端** | ⬜ | clip 页面 → #spark 子节点生成 |
| Spark 质量提升 | ⬜ | 三轮认知压缩 + 提示词优化 |
| 碰撞策略 v0 | ⬜ | agent 驱动的图搜索，渐进式 |
| #skill 提取模式 | ⬜ | 依赖 Layer 2 Step 2 |

### Track C: Browser ✅

全部完成。详见 `docs/_archive/plans/phase-3-browser.md`。

| 功能 | 状态 |
|------|------|
| 页面观察 (get_text/metadata/find/selection) | ✅ |
| CDP 截图 + 交互 | ✅ |
| 调试 (network/console) | ✅ |

### Track D: Cognition

详细设计：`phase-5-cognition.md`

| 功能 | 状态 | 依赖 |
|------|------|------|
| Taste 学习 (Schema evolution) | ⬜ | Layer 2 Step 2 + Layer 3 |
| /review 命令 | ⬜ | Layer 0 ✅ (可先做简化版) |
| #skill 管理 UI | ⬜ | Layer 2 Step 2 |

---

## 执行波次

> 详细任务状态见 `docs/TASKS.md`，此处只列方向。

### Wave 1: 清理 + 验证（当前优先）

1. 清理 `ai-spark.ts` 中已否决的 is/has/about 代码
2. 验证 Spark 端到端：clip 页面 → #spark 子节点生成

### Wave 2: #skill + 上下文

1. #skill 节点 bootstrap + 渐进式披露（Layer 2 Step 2）
2. Context 自动压缩（Layer 2 Step 3）

### Wave 3: Spark 质量 + 可见性

1. 三轮认知压缩质量优化（skeleton → flesh → soul）
2. Spark 进度/结果的 UI 可见性
3. 离线 Spark 队列

### Wave 4: 连接发现（碰撞）

| 版本 | 内容 | 触发条件 |
|------|------|----------|
| v0 | agent 驱动 node_search，手动触发 | 用户主动请求 |
| v1 | Spark 提取时自动检索，置信度过阈值展示 | clip 时自动 |
| v2 | 跨域同构发现 + #skill 学习碰撞规则 | 积累数据后 |

### Wave 5+: 远期

- Chat UI 打磨（`ui-chat-panel-redesign.md`）
- Chat 会话同步
- Layer 3 编排（AgentOrchestrator + subagent）
- Track D 认知（Taste 学习 + /review）

---

## 依赖图

```
Layer 0 (Agent Runtime) ✅
  │
  ├──→ Layer 1 (多 Agent 运行时) ✅
  │      │
  │      └──→ Track B: Spark 基础提取 ✅
  │
  ├──→ Layer 2 Step 1 ✅ (transformContext)
  │      │
  │      ├──→ Layer 2 Step 2 ⬜ (#skill + 渐进式披露)
  │      │      │
  │      │      ├──→ Track B: #skill 提取模式
  │      │      └──→ Track D: Taste 学习
  │      │
  │      └──→ Layer 2 Step 3 ⬜ (Context 压缩)
  │
  ├──→ Layer 3 ⬜ (编排)
  │      │
  │      └──→ Track D: Taste 学习 (subagent)
  │
  ├──→ Track A: Chat 对话 (独立演进)
  ├──→ Track C: Browser ✅ (已完成)
  └──→ Track D: /review (简化版可直接做)
```

---

## 跨轨道决策

| # | 决策 | 说明 |
|---|------|------|
| 1 | Chat = ChatDrawer，不进 panelHistory | 独立于 PanelStack |
| 2 | Agent 运行在 Side Panel 进程 | 关闭面板 = 终止所有 AI |
| 3 | Chat 历史不存为节点 | IndexedDB 独立持久化 |
| 4 | Agent 是消息的单一事实来源 | 不引入 chat-store |
| 5 | page-capture 三方共用 | Clip + Spark + browser tool |
| 6 | Tool 设计：node 拆分，browser 合并 | 高频拆分，低频合并 |
| 7 | Reference 格式 `<ref>` + `<cite>` | 跨工具统一 |
| 8 | Spark 直接 LLM 调用，不走 Agent | 固定流程，不需要工具选择 |
| 9 | Spark 配置存为 #agent 节点 | 系统提示词 = 子节点，用户可编辑 |

---

## 高风险文件

同一时间只允许一个 Agent 修改：

- `src/stores/node-store.ts`
- `src/stores/ui-store.ts`
- `src/types/system-nodes.ts`
- `src/lib/ai-service.ts` — 跨轨道共享热点

---

## 验证标准（每个 Wave 统一）

```bash
npm run verify   # typecheck → check:test-sync → test:run → build
```

视觉验证由 nodex 完成（`npm run dev` + Chrome 扩展加载）。

---

## 计划文档索引

| 文档 | 内容 | 状态 |
|------|------|------|
| `ai-context-management.md` | 上下文管线三步走 (Layer 2) | Step 1 ✅，Step 2-3 设计完成 |
| `phase-2-reading-ring.md` | 阅读环 (Track B) | Wave 1-4 设计 |
| `phase-4-orchestration.md` | 编排层 (Layer 3) | 设计完成，待实施 |
| `phase-5-cognition.md` | 认知 (Track D) | 设计完成，待实施 |
| `ui-chat-panel-redesign.md` | Chat UI 打磨 (Track A) | 审计完成，待实施 |
| `tool-definitions.md` | 工具参数 schema | 参考文档 |
| `search-node-design.md` | Search Node 数据模型 | 设计完成，待排期 |

### 已归档

| 文档 | 内容 |
|------|------|
| `_archive/plans/phase-0-foundation.md` | Layer 0 基座 |
| `_archive/plans/phase-1-canvas.md` | Layer 0 画板 |
| `_archive/plans/phase-1-test-plan.md` | Phase 1 测试计划 |
| `_archive/plans/phase-1.5-node-tool-gaps.md` | Layer 0 工具重构 |
| `_archive/plans/phase-1.5.1-data-access-layer.md` | Layer 0 数据层 |
| `_archive/plans/phase-3-browser.md` | Track C 浏览器 |
| `_archive/plans/context-image-lifecycle.md` | 上下文图片生命周期 |

---

## 参考文档

| 文档 | 用途 |
|------|------|
| `docs/research/ai-strategy.md` | AI 战略全景 |
| `docs/research/multi-panel-design.md` | 多面板 + Chat 抽屉设计 |
| `docs/research/multi-agent-orchestration.md` | 编排架构调研 |
| `CLAUDE.md` | 代码约定 + 协作规则 |
| `docs/design-system.md` | UI 视觉标准 |

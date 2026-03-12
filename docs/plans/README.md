# soma AI 实施计划

> 日期：2026-03-11
> 依据：`docs/research/ai-strategy.md`（v6 架构简化）、`docs/research/multi-panel-design.md`、`docs/research/multi-agent-orchestration.md`
> 性质：分阶段实施计划，每个 Phase 一份独立文档，可由不同 Dev Agent 并行执行

---

## 全局架构

### 五层架构

```
Layer 4: 认知价值层    Review 引擎 / Taste 学习 / 碰撞飞轮
Layer 3: 编排层        AgentOrchestrator / Subagent / 后台任务
Layer 2: 能力层        node tool / browser tool / undo tool / #skill
Layer 1: 对话层        Chat 面板 / 消息渲染 / 流式 UI / 持久化
Layer 0: 基座层        pi-ai (server proxy) / pi-agent-core (client agent loop)
```

每层依赖下一层。所有 AI 功能建立在 pi-mono 基座之上（ai-strategy.md §15 "AI 调用架构"）。

### 运行时架构

```
Chrome 扩展 (Side Panel 进程)                Cloudflare Worker
┌──────────────────────────────┐          ┌───────────────────┐
│  AgentOrchestrator           │          │                   │
│  ├── Main Agent              │ fetch/SSE│  pi-ai            │
│  │   (pi-agent-core)  ←──────│──────────│──→ stream()       │
│  │   + Chat conversation     │          │  (统一 LLM API)   │
│  │   + node/browser/undo tool│          │                   │
│  ├── Subagent A              │          │  Provider SDK     │
│  │   (pi-agent-core)         │          │  + API key 管理   │
│  └── Subagent B              │          └─────┬─────────────┘
│        (pi-agent-core)       │                │
│                              │       ┌────────┼────────┐
│  Loro CRDT (共享画板)         │       ↓        ↓        ↓
│  ├── 所有 agent 读写节点      │  Anthropic  OpenAI   Google
│  └── CRDT subscription 通知  │
└──────────────────────────────┘
```

来源：ai-strategy.md §15 "pi-mono + Proxy 模式"、multi-agent-orchestration.md §7 架构图

---

## Phase 划分

| Phase | 名称 | 目标 | 文档 |
|-------|------|------|------|
| **0** | 基座 | pi-ai proxy + pi-agent-core + 最小 Chat | `phase-0-foundation.md` |
| **1** | 画板 | node tool → agent 能在 outliner 上行动 | `phase-1-canvas.md` |
| **1.5** | 工具重构 | 单 node tool → 6 个独立工具 + 搜索增强 | `phase-1.5-node-tool-gaps.md` |
| **2** | 阅读环 | Clip & Spark → AI 结构提取 + 碰撞 | `phase-2-reading-ring.md` |
| **3** | 浏览器 | browser tool + CDP → 深度页面操作 | `phase-3-browser.md` |
| **4** | 编排 | AgentOrchestrator → subagent 后台执行 | `phase-4-orchestration.md` |
| **5** | 认知 | Taste 学习 + Review 引擎 → 三条环闭合 | `phase-5-cognition.md` |

### 依赖图

```
Phase 0 (基座) ━━━ 所有 AI 功能的前提
  │
  ├──→ Phase 1 (node tool) ━━━ agent 在画板上行动
  │      │
  │      └──→ Phase 1.5 (工具重构) ━━━ 拆分为 6 个独立工具 + 搜索增强
  │             │
  │             ├──→ Phase 2 (Clip & Spark) ━━━ 需要 node_create/node_search 等
  │             │
  │             └──→ Phase 4 (编排) ━━━ 需要稳定的 agent + tool 体系
  │                    │
  │                    └──→ Phase 5 (认知) ━━━ 需要 orchestrator 管理后台 skill
  │
  └──→ Phase 3 (browser tool) ━━━ 独立于 node tool，只需基座
         │
         └──→ Phase 2 的 CDP 增强 clip ━━━ 可选依赖
```

### 执行顺序

```
时间轴 ──────────────────────────────────────────────→

Phase 0: ██████████  (nodex 自己做，验证基座)
                    │
                    └─ Phase 1: ████████████  (Dev Agent A)
                                           │
                                           └─ Phase 1.5: ████████  (Dev Agent A，工具重构)
                                                        │
                                                        ├─ Phase 2: ████████████  (Dev Agent A)
                                                        │
                                                        ├─ Phase 3: ████████████  (Dev Agent B)
                                                        │
                                                        └─ Phase 4: ████████████  (Dev Agent B)
                                                                               │
                                                                               └─ Phase 5: ██████
```

**Phase 0 由 nodex 执行**——核心风险是 pi-mono 协议对齐，需要读源码 + spike 验证。

**Phase 1.5 完成后再启动后续 Phase**——Phase 1.5 将 Phase 1 的单 node tool 拆分为 6 个独立工具并增强搜索能力。虽然 Phase 3 在功能上不依赖 node tools，但 `ai-service.ts` 是跨 Phase 共享热点文件（详见"高风险文件"章节），Phase 1.5 合入 main 后 Phase 3 才能基于最新代码开始。

**Phase 2 和 Phase 3 可并行**——Phase 2 (Dev A) 和 Phase 3 (Dev B) 修改的 `ai-service.ts` 部分不同（Phase 2 注册 #skill，Phase 3 注册 browser tool），可以在 Phase 1.5 合入后同时启动。

**Phase 4 在 Phase 1.5 后启动**——需要稳定的 agent + tool 体系。

**Phase 5 最后执行**——依赖 Phase 1.5 (node tools) + Phase 4 (orchestrator)。

---

## 跨 Phase 决策

### 1. Chat 面板形态：ChatDrawer，不是 AppPanel

来源：multi-panel-design.md §2 "Chat 面板的特殊性" + §3 Phase 1

Chat 不进入 `panelHistory`，不是 `app:chat` 路由。它是一个独立的 **ChatDrawer**，与 PanelStack 并列：

```
窄屏 (≤500px): Chat 是底部抽屉
┌──────────────────────┐
│  PanelStack (Node)   │
├──────────────────────┤
│  Chat drawer         │  ← 高度可拖拽 (1/3 到 2/3)
└──────────────────────┘

宽屏 (>500px): Chat 固定右侧
┌────────────┬─────────┐
│ PanelStack │  Chat   │  ← Node 60%, Chat 40%
│  (Node)    │  panel  │
└────────────┴─────────┘
```

UI Store 新增：
- `chatOpen: boolean`
- `toggleChat()` / `openChat()` / `closeChat()`

快捷键：`⌘L`（首选，需测试 Chrome Side Panel 能否拦截）或 `⌘⇧L`（备选）

### 2. Agent 实例生命周期

所有 Agent 运行在 Side Panel 进程中（跨 Phase 决策 #8）。关闭面板 = 所有 Agent 终止。

| Phase | Agent 生命周期 |
|-------|--------------|
| Phase 0 | ChatDrawer 内创建，关闭面板时销毁 |
| Phase 1 | 全局单例（⌘K、Clip 等非 Chat 入口也需要），面板关闭时销毁 + 持久化 |
| Phase 4 | 主 agent 全局 + subagent 按需创建/销毁（同一 JS 进程内并发 async） |

### 3. API Key & Agent 配置演进

| Phase | API Key 存储 | Agent 配置 |
|-------|-------------|-----------|
| Phase 0 | `chrome.storage.local`（临时） | 硬编码 |
| Phase 1 | Settings 节点字段（Loro，随工作区同步） | #agent 节点字段（model/temperature/max tokens） |

**"一切皆节点"原则**：API key 存为 Settings 节点的 password 类型字段（显示为 `sk-ant-••••`），agent 配置存为 #agent 节点字段。两者分开：Settings = 全局（provider + key），#agent = agent 自身（model + params）。

### 4. Chat 持久化演进

| Phase | 持久化方式 |
|-------|-----------|
| Phase 0 | Session-only（页面刷新丢失） |
| Phase 1 | IndexedDB 持久化 Agent messages |

**关键决策**：Chat 对话**不作为节点存储在图谱中**（ai-strategy.md v6 修订："Chat 独立持久化"）。

### 5. System Prompt 演进

| Phase | System Prompt 来源 |
|-------|-------------------|
| Phase 0 | 硬编码 |
| Phase 1 | 从 #agent 节点加载（用户可编辑） |
| Phase 2+ | 加载 #agent + 匹配的 #skill 节点 rules |

来源：ai-strategy.md §7 "#agent vs #skill"

### 6. React 状态管理：Agent 是消息的单一事实来源

不引入独立的 chat-store。pi-agent-core 的 Agent 实例已管理 messages 状态。React 通过 `agent.subscribe()` 订阅事件更新 UI。

理由：
- 避免双源同步（Agent state ↔ Zustand store）
- Agent 的 `steer()` / `followUp()` / `abort()` 直接操作 Agent state
- 持久化时序列化 `agent.state.messages` 到 IndexedDB

### 7. 工具架构

> 完整参数 schema + 返回值见 `tool-definitions.md`

**Phase 1.5 重构**：原 Phase 1 的单 `node` 工具（5 actions）拆分为 6 个独立工具，详见 `phase-1.5-node-tool-gaps.md`。

| Tool | 说明 | Phase |
|------|------|-------|
| **node_create** | 创建节点（支持 children 批量子树 + fields 便利参数） | Phase 1.5 |
| **node_read** | 渐进式读取（含 fields 增强 + isReference） | Phase 1.5 |
| **node_edit** | 修改已有节点（含 fields 便利参数） | Phase 1.5 |
| **node_delete** | 移至 Trash（支持 restore 恢复） | Phase 1.5 |
| **node_search** | 搜索（tags + fields 过滤 + linkedTo + sort） | Phase 1.5 |
| **undo** | AI 专用 UndoManager，与用户 ⌘Z 隔离 | Phase 1 |
| **browser** | 17 actions: 观察 7 + 交互 6 + 控制 4 | Phase 3 |

**设计模式差异**：node 工具拆分为 6 个独立工具（高频、主力工具，减少 action 路由开销）；browser 保持单工具多 action（低频、辅助工具，减少 LLM 工具选择复杂度，与 CiC 同一模式）。

**关键设计决策**：
- Tags 用显示名（不用 ID），execute 层自动解析/创建
- Reference 格式：`<ref id="nodeId">text</ref>`（inline）+ `<cite id="nodeId">N</cite>`（角标）
- AI 写操作用 origin `'ai:chat'` 隔离 undo scope
- 动态上下文用 `<system-reminder>` 标签注入

### 8. 运行时宿主模型：Sidepanel-Only（方案A）

**所有 AI 进程（主 agent + subagent）运行在 Side Panel JS 进程中。关闭 Side Panel = 所有 AI 任务终止。**

来源：MV3 架构约束分析 + Claude Code CLI 模型验证

MV3 Chrome 扩展有三个执行上下文：Side Panel、Service Worker、Content Script。Service Worker 有 30s 空闲超时限制，不适合承载长时间的 LLM 流式对话。分析了三种方案后选择 Sidepanel-Only：

| 约束 | 结论 |
|------|------|
| Agent 宿主 | Side Panel 进程（Agent 实例 + Loro CRDT + 所有 tools） |
| 关闭 Side Panel | 所有 AI 任务终止（符合用户心智模型：关抽屉 = 停止） |
| Service Worker | 只做消息路由 + CDP 转发，不承载 Agent |
| Subagent | 同一 JS 进程内的并发 async 任务，不是 Web Worker 或后台进程 |
| 离线 Clip | 已有 task queue 模式（`highlight-pending-queue.ts`）：clip → chrome.storage 暂存 → 下次开面板消费 |
| Schema evolution | 面板打开时检查（不是后台定时任务） |

**验证**：Claude Code CLI 采用相同模式——前台进程运行，关闭终端 = 会话结束，subagent 是逻辑概念而非独立进程。

**此决策影响 Phase 2（离线 Spark 用 task queue）、Phase 4（subagent 是进程内并发）、Phase 5（Schema evolution 触发方式）。**

### 9. page-capture 作为统一页面抓取层

`src/lib/page-capture/` 由三方共用：
- **Web Clip**（已实现）→ 剪藏页面内容
- **Spark**（Phase 2）→ 三轮认知压缩的输入
- **page tool + browser tool**（Phase 3）→ `get_text` / `get_metadata` 复用 orchestrator

### 10. 与多面板架构的关系

来源：multi-panel-design.md §3 分阶段实施

```
多面板 Phase 1 (Chat 抽屉)  ←→  AI Phase 0 (基座 + Chat UI)
多面板 Phase 2 (多面板导航)   ←   独立排期，不阻塞 AI
```

AI Phase 0 的 Chat 实现遵循多面板 Phase 1 的设计（ChatDrawer），但不依赖多面板 Phase 2（多 Node 面板并排）。

---

## 高风险文件

以下文件同一时间只允许一个 Agent 修改（来源：CLAUDE.md "多 Agent 协作规则"）：

- `src/stores/node-store.ts` — Phase 1 (node tool 需要调用 store actions)
- `src/stores/ui-store.ts` — Phase 0 (chatOpen 状态) + 多面板 Phase 2
- `src/types/system-nodes.ts` — Phase 1 (#agent) + Phase 2 (#source/#spark/#skill)
- `src/lib/ai-service.ts` — **跨 Phase 共享热点**（Phase 0 创建 → Phase 1/2/3/4/5 均 modify）

### Chat 组件边界

Phase 0 创建的根容器是 `src/components/chat/ChatDrawer.tsx`，后续 Phase 在此基础上扩展。**不存在 `ChatPanel.tsx`**——所有 Phase 的文件变更表中 Chat 根容器统一引用 `ChatDrawer.tsx`。

### `ai-service.ts` 的修改范围（按 Phase）

| Phase | 修改内容 |
|-------|---------|
| **Phase 0** | 创建：Agent 工厂 + API key 管理 + streamProxy 集成 |
| **Phase 1** | 加载 tools (node/undo) + #agent system prompt |
| **Phase 2** | 注册提取相关 #skill |
| **Phase 3** | 注册 browser tool |
| **Phase 4** | 主 agent 处理 clarification routing |
| **Phase 5** | 注册 /review 命令处理 |

**策略**：Phase 0 由 nodex 创建，之后每个 Phase 的修改通过 PR 合入 main 后再被下一个 Phase 基于。不要并行修改 ai-service.ts。

### Agent 分工建议

| Agent | Phase | 高风险文件锁 |
|-------|-------|-------------|
| nodex | Phase 0 | ui-store.ts (chatOpen), ai-service.ts (创建) |
| Dev A | Phase 1 → 1.5 → Phase 2 | node-store.ts, system-nodes.ts, ai-service.ts |
| Dev B | Phase 3 → Phase 4 | ai-service.ts（需等 Dev A 的 Phase 1.5 合入后再开始 Phase 3） |

**注意**：Dev B 的 Phase 3 虽然不依赖 node tools 的功能，但因为 `ai-service.ts` 共享，实际需要在 Phase 1.5 合入 main 后再基于最新 main 开始。Phase 4 同理需等 Phase 1.5 完成。

---

## 验证标准（每个 Phase 统一）

每个 Phase 完成时必须通过：

```bash
npm run typecheck          # 类型检查
npm run check:test-sync    # 测试同步检查
npm run test:run           # Vitest 测试
npm run build              # 构建
```

Server 侧（如有改动）：
```bash
cd server && npm run typecheck
```

视觉验证由 nodex 完成（`npm run dev` + Chrome 扩展加载）。

---

## 设计流程改进

> 来源：Phase 1.5 迭代暴露的系统性问题——计划 top-down 编写未审计已有代码，导致搜索基础设施（search-engine / filter-utils / backlinks / sort-utils）未接入、便利参数缺失、工具命名冲突。

### 设计前审计（每个 Phase 启动前）

1. **基础设施审计**：grep 相关模块，列出可复用的函数/类型/工具
2. **接口审计**：确认 Phase 依赖的上游工具 API 是否与 `tool-definitions.md` 一致
3. **命名审计**：新增工具/action 名称是否与其他 Phase 冲突

### 设计检查清单（写完计划后逐项过）

- [ ] 是否审计了相关已有代码？（不能只看计划文档）
- [ ] 每个新参数/能力是否映射到了具体的已有模块？
- [ ] 是否遵循"一切皆节点"铁律？（检查有无 JSON blob / DSL 字符串 / flat metadata）
- [ ] 工具命名是否加了领域前缀（`node_` / `browser_`）避免跨 Phase 冲突？

---

## 参考文档

| 文档 | 用途 |
|------|------|
| `docs/research/ai-strategy.md` | AI 战略全景（唯一权威） |
| `docs/research/multi-panel-design.md` | 多面板 + Chat 抽屉设计 |
| `docs/research/multi-agent-orchestration.md` | 编排架构调研 + 推荐方案 |
| `CLAUDE.md` | 代码约定 + 协作规则 |
| `docs/design-system.md` | UI 视觉标准 |

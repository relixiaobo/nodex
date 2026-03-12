# Phase 5: 认知 — Taste 学习 + Review 引擎

> 依赖：Phase 1.5 (node tools) + Phase 4 (AgentOrchestrator)
> 来源：ai-strategy.md §5 "Taste 学习" + §6 "Review" + §3 "回顾环" + §7 "#skill 节点"

---

## 目标

闭合三条认知工作流中的后两条环：

1. **Taste 学习**（基础设施）：AI 从修正模式中学习，让 agent 行动越来越准
2. **Review 引擎**（核心价值）：照亮用户认知演化——新结构、升级、矛盾、同构

来源：ai-strategy.md v5 内部审查修订

> **Taste 学习与 Review 分离**：taste = 系统层静默优化（AI 怎么工作）；Review = 用户发起的内容反思（照亮思考脉络），完全可选。

---

## Part 1: Taste 学习

### 信号模型

来源：ai-strategy.md §5 "信号模型 (v6 简化版)"

| 信号类型 | 含义 | 来源 | 强度 |
|---------|------|------|------|
| **Source** | 用户选择了这个内容 | clip、高亮、随手记 | 低 |
| **Correction** | 用户修正了 AI 的操作 | 改标签、删除、重组织 | **最高** |
| **Creation** | 用户主动创作 | 手写内容 | 高（但不用于 taste） |

**v6 简化**：砍掉 Usage 信号（搜索/重访/停留），taste 学习只依赖 Loro CRDT OpLog 中天然存在的三类信号。零额外采集。

### Schema Evolution Skill

来源：ai-strategy.md §5 "Taste 学习基于 CRDT OpLog"

```
CRDT OpLog（原始信号，零额外采集）
  │
  ├── agent 操作 + user 后续修正
  │     → Correction 信号（最强：用户改了 AI 做的事）
  │
  ├── user 自主操作
  │     → Creation 信号（不用于 taste，只作为上下文）
  │
  └── agent 操作 + user 未修正
        → 弱正向信号（默认接受）
```

**Schema evolution skill** 作为 subagent（通过 Phase 4 AgentOrchestrator 调度），在**面板打开时触发检查**（不是定时后台任务——参见 README.md 跨 Phase 决策 #8 "Sidepanel-Only 模型"）：

```
触发时机：Side Panel 打开 → 检查上次分析时间戳
  → 距上次 > 24h 且有新的 Correction 信号 → 触发 Schema evolution

执行流程：
1. 读取最近 N 天的 Loro OpLog
2. 筛选 Correction 信号（agent 操作后被用户修正的 op）
3. LLM 分析修正模式：
   - "用户总是把 #meeting → #1on1"
   - "用户删除了所有 AI 加的 Author 字段"
   - "用户总是把 AI 的3级结构扁平化为2级"
4. 派生规则存为 #skill 子节点
5. 下次同类任务加载新规则 → 更准确
```

### 规则存储

来源：ai-strategy.md §7 "#skill 节点结构"

派生规则存为 `#skill` 节点的 Rules 子节点（可审查可修正，不是隐式学习）：

```
#skill: Clip 结构提取
  Rules
    ├── 不要把 #meeting 标签用于1对1对话   ← 从修正中学到
    ├── Author 字段只在学术论文中填充       ← 从删除中学到
    └── 结构层级不超过2层                   ← 从扁平化修正中学到
```

**关键**：
- 需要**多次一致**的修正信号才调整（不过拟合单次修正）
- 用户可以直接编辑这些规则（agent 和用户权限一样）
- 规则是节点（"一切皆节点"）

### #skill 管理 UI

不需要定制 UI——`#skill` 节点在 outliner 中就是普通节点 + `#skill` 标签。用户通过标准的节点浏览/编辑界面查看和修改。

唯一需要的入口是：Settings 或 ⌘K 中添加 "AI Skills" 导航，指向 Schema 中的 `#skill` 节点列表。

---

## Part 2: Review 引擎

### Review 的定位

来源：ai-strategy.md §3 "回顾环" + §6 "Review 深化"

> Review 是**认知镜像**——发现新结构、升级、矛盾、同构。不是内容摘要。

```
内容积累 → /review → AI 分析认知结构变化
  ↓
看见自己看不见的东西：
  · 新结构浮现（"你开始用新框架思考问题了"）
  · 旧结构升级（"你对 X 的理解变深了"）
  · 未解决的矛盾（"这两个观点还在打架"）
  · 隐藏的同构（"A 和 B 底下是同一个模式"）
  ↓
用户产生新反思 → 改变下次阅读/思考方向
  ↓
回顾环闭合
```

### /review 命令

来源：ai-strategy.md §6

用户通过 Chat 输入 `/review` 触发：

```
/review today       → 今天记录的节点
/review this week   → 本周
/review this month  → 本月
/review #tag-name   → 特定标签下的节点
```

### Review 执行流程

```
1. 确定 review 范围（时间/标签/自定义）
2. node_search 查找范围内的节点
3. node_read 渐进式读取节点内容
4. 价值分层（AI 自动做，不是用户选择）：
   - #note 标签 → 高权重（用户亲手写）
   - #spark + 用户追加子笔记 → 高权重（用户响应了）
   - #spark + 无互动 → 低权重（用户没回应）
   - 高连接密度 → 深度回顾（可能是核心思维模式）
5. LLM 分析认知结构变化：
   - 寻找：新结构、升级、矛盾、同构
   - 输出附带 reference（每个发现引用具体节点）
6. 在 Chat 中展示 Review 结果
```

来源：ai-strategy.md §6 "Review 价值分层"

### Review 输出格式

使用统一的 `<ref>` + `<cite>` 格式（见 `tool-definitions.md`）：

```
## This Week's Review

### 新结构浮现
你开始频繁使用"干/湿"框架<cite id="n1">1</cite><cite id="n2">2</cite>——
AI 处理结构（干），用户专注灵感（湿）。这不只在笔记方法论中出现，
你在 <ref id="n3">代码重构笔记</ref> 中也在用类似思路。

### 未解决的矛盾
<ref id="n4">约束即自由</ref> 和 <ref id="n5">不要过早抽象</ref> 还在打架——
两种约束在什么条件下各自适用？

### 隐藏的同构
<ref id="n6">信息源管理</ref> 和 <ref id="n7">模块化架构</ref> 底下可能是
同一个模式：限制输入反而提升输出质量。
```

- `<ref>` = 正文中的 inline reference（作为回答的一部分）
- `<cite>` = 角标引用（作为证据，hover 显示摘要）
- Chat 渲染时：`<ref>` → 可点击导航链接，`<cite>` → 角标数字
- Review 不创建图谱边（只读分析），reference 仅用于导航验证

---

## 技术实现

### Taste 学习实现

**作为 subagent 执行**（通过 Phase 4 AgentOrchestrator），在面板启动时按需触发：

```typescript
// Schema evolution skill 注册
const schemaEvolutionTask: TaskDescriptor = {
  id: nanoid(),
  description: 'Analyze recent OpLog corrections and update #skill rules',
  skills: [],  // 不需要额外 skill
  tools: [nodeReadTool, nodeSearchTool, nodeEditTool],  // 6 个独立工具按需注册
}

// 面板启动时检查：距上次分析 > 24h 且有新的 Correction → 触发
if (shouldRunSchemaEvolution()) {
  orchestrator.delegate(schemaEvolutionTask)
}
```

**OpLog 读取**：通过 Loro CRDT 的 `doc.subscribe()` 或直接读取 OpLog。需要区分操作发起者（agent vs user）——Loro OpLog 中每个 op 可标记 peer ID。

### Review 引擎实现

**作为主 agent 的命令处理**（不需要 subagent，Review 是同步对话）：

```typescript
// /review 命令在 palette-commands.ts 中注册
// 用户输入 /review → agent 执行以下 tool call 序列：

1. node_search({ dateRange: { from: 'this-week' }, limit: 50 })
2. node_read({ nodeId: id1 })  // 逐个读取（Phase 1.5 定义的单节点 read API）
   node_read({ nodeId: id2 })  // agent 根据需要多次调用
   ...                          // 渐进式披露：先读摘要，再按需深入子节点
3. [LLM 分析 — 不需要 tool call]
4. 输出 Review 结果（带 reference）
```

**注意**：node_read 是单节点 API（`{ nodeId: string }` → 返回节点摘要 + children 摘要），不是批量 API。Agent 通过多次 tool call 渐进式探索节点树——这与 Phase 1.5 的 read 定义一致。

**价值分层逻辑**：在 node_search 结果上运行分层算法（基于标签类型 + 连接密度 + 互动信号），为 LLM 的 Review 分析提供加权上下文。

---

## 文件变更

| Action | File | Scope |
|--------|------|-------|
| **Create** | `src/lib/ai-skills/schema-evolution.ts` | OpLog 分析 + 规则派生 (~200 行) |
| **Create** | `src/lib/ai-skills/review-engine.ts` | Review 命令处理 + 价值分层 (~250 行) |
| **Create** | `src/lib/ai-skills/value-stratification.ts` | 节点价值分层算法 (~80 行) |
| **Modify** | `src/lib/ai-service.ts` | 注册 /review 命令处理 |
| **Modify** | `src/lib/palette-commands.ts` | ⌘K 中注册 /review 命令 |
| **Create** | `src/components/chat/ReviewMessage.tsx` | Review 结果渲染（带 citation 角标） |
| **Create** | `tests/vitest/schema-evolution.test.ts` | Schema evolution 测试 |
| **Create** | `tests/vitest/review-engine.test.ts` | Review 引擎测试 |
| **Create** | `tests/vitest/value-stratification.test.ts` | 价值分层测试 |

---

## Exact Behavior

### Taste 学习

```
GIVEN agent 之前给 3 条笔记加了 #meeting 标签
  AND 用户将其中 2 条改为 #1on1
WHEN 用户下次打开 Side Panel，Schema evolution 检查触发（距上次 >24h 且有新 Correction）
THEN 分析 OpLog 发现修正模式
  AND 在对应的 #skill 节点下创建规则子节点："1对1对话用 #1on1，不是 #meeting"
WHEN 用户下次请 agent 整理笔记
THEN agent 加载了新规则
  AND 正确使用 #1on1 标签
```

### Review

```
GIVEN 用户本周记录了 15 条笔记和 5 个 clip
WHEN 用户在 Chat 中输入 "/review this week"
THEN agent 搜索本周创建/修改的节点
  AND 执行价值分层（#note 高权重，无互动 #spark 低权重）
  AND 分析认知结构变化
  AND 在 Chat 中输出 Review 结果
  AND 每个发现附带 reference 角标（可点击跳转到具体节点）
  AND Review 不修改任何节点（只读分析）
```

---

## 验证标准

1. Agent 操作被修正 → 下次运行 Schema evolution → 对应 #skill 下出现新规则节点
2. 新规则影响后续 agent 行为（如正确使用 #1on1 而非 #meeting）
3. `/review this week` → 输出认知分析（不是内容摘要）
4. Review 输出中的 reference 可点击跳转
5. Review 不修改任何节点
6. `npm run typecheck && npm run test:run && npm run build` 全过

---

## 提交策略

1. `feat: value stratification — node weighting for Review analysis`
2. `feat: Review engine — /review command with cognitive mirroring`
3. `feat: Schema evolution skill — OpLog correction analysis + rule derivation`
4. `test: Review engine + Schema evolution unit tests`

---

## Out of Scope

- #skill 的自然语言编辑界面（用户直接在 outliner 中编辑节点即可）
- 跨工作区 taste 迁移 → 未排期
- Review 结果持久化为节点（当前只在 Chat 中展示）→ 需讨论是否有必要
- 自动触发 Review（当前只有 /review 手动触发）→ 未排期

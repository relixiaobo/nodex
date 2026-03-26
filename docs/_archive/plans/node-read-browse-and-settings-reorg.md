# node_read 浏览入口 + Settings AI 分组

> 让 AI 能从树顶开始探索知识图谱，同时整理 Settings 下的 AI 相关节点。
>
> **2026-03-20** — 产品讨论收敛

## 背景

### 问题：AI 不会"逛"知识图谱

当前 AI 使用 node 工具的模式是"搜索 → 直接回答"，缺少渐进式探索。对比 past_chats 的三层设计（sessions → messages → detail），node 工具没有浏览入口。

根本原因分析：

| 原因 | 说明 |
|------|------|
| **没有起点** | `node_read` 要求 `nodeId`（必填），AI 不知道任何 nodeId 就无法开始探索 |
| **node_search 返回太丰富** | 搜索结果包含 name + tags + snippet + fields，AI 拿到就够回答，没有动力深入 |
| **工具引导"搜索"而非"浏览"** | description 和 quick patterns 全是带 query 的用法 |

### 关键洞察：Outliner 的树结构天然适合渐进式披露

Outliner 是一棵树——天然支持"看一层 → 选感兴趣的 → 往下看"。`node_read` 已经完美支持这个模式（`depth` + `childOffset` + `childLimit`），但 AI 从不这样用，因为它没有起点。

### 解决思路

**不改 node_search**（它是搜索工具，保持专注）。让 `node_read` 支持无参数调用，从根节点开始探索。每个工具只做一件事：

| 职责 | 工具 |
|------|------|
| 被动感知 | system reminder（已有 panel/page/time 上下文） |
| 主动探索 | `node_read`（从根或快捷名称开始，逐层深入） |
| 精确搜索 | `node_search`（有关键词时直接找） |

### Settings 重组的背景

当前 Agent 和 Spark Agent 节点放在工作区根节点下。AI 从根节点浏览时会看到这些系统配置节点，与用户的知识内容混在一起。

设计决策：
- Agent 节点是 AI 配置，不是用户的知识内容，应该收纳到 Settings 下
- 系统预设的 Agent（Chat Agent、Spark Agent）放在 Settings > AI > Default Agents 下
- 用户创建的自定义 #agent 可以放在知识图谱的任何位置——功能由 #agent 标签决定，不由树位置决定
- 所有 agent 都是普通节点，可以通过 `node_search(searchTags: ["agent"])` 检索到

---

## 改动 1：node_read 无参数浏览

### 行为变更

`nodeId` 从必填变为可选。省略时返回工作区根节点的子节点列表。

```
node_read()                → 根节点的子节点（Journal, Schema, 用户顶层节点...）
node_read("journal")       → Journal 节点详情 + 子节点（日记条目）
node_read("schema")        → Schema 节点详情 + 子节点（标签/字段定义）
node_read(nodeId)           → 具体节点详情 + 子节点（现有行为，不变）
```

### 快捷名称

支持以下语义名称，自动解析为实际的系统节点 ID：

| 快捷名称 | 解析到 | 用途 |
|----------|--------|------|
| `"journal"` | `SYSTEM_NODE_IDS.JOURNAL` | 日记时间线 |
| `"schema"` | `SYSTEM_NODE_IDS.SCHEMA` | 标签/字段定义 |

不需要支持 Trash、Settings、Agent 等——AI 探索知识图谱不需要这些入口。

### 根节点子节点过滤

`node_read()` 无参数时，返回根节点的子节点列表，但**过滤掉系统配置节点**：

- ✅ 显示：Journal、Schema、用户创建的顶层节点
- ❌ 不显示：Trash、Settings、Agent、Spark Agent

过滤依据：使用 `isLockedNode()` + 排除特定的系统节点 ID（Trash、Settings 等）。Journal 和 Schema 虽然是系统节点，但对 AI 探索有意义，保留。

具体过滤逻辑：排除 `SYSTEM_NODE_IDS.TRASH` 和 `SYSTEM_NODE_IDS.SETTINGS`。其他节点（包括 Journal、Schema 和用户节点）全部保留。改动 2 完成后，Agent 和 Spark Agent 将移入 Settings 下，不再出现在根级别，无需额外过滤。

### 工具描述更新

description 新增浏览模式说明和 quick patterns：

```
Quick patterns:
- Browse from root: node_read()
- Browse journal: node_read("journal")
- Browse tags: node_read("schema")
- Read specific node: node_read(nodeId: "abc123")
- Read with children: node_read(nodeId: "abc123", depth: 2)
```

### 参数 schema 变更

```typescript
// Before
nodeId: Type.String({ description: 'ID of the node to read.' })

// After
nodeId: Type.Optional(Type.String({
  description: 'ID of the node to read. Omit to browse from the workspace root. '
    + 'Shortcuts: "journal" for the Journal node, "schema" for the Schema node.'
}))
```

### 返回值

无参数时返回格式与现有 `node_read(nodeId, depth=1)` 完全一致——根节点作为父节点，子节点列表在 `children` 中。不引入新的返回格式。

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-tools/read-tool.ts` | 修改 | `nodeId` 改为 optional；无参数时解析为工作区根节点 ID；支持 `"journal"` / `"schema"` 快捷名称；过滤根级系统节点 |
| `tests/vitest/read-tool.test.ts` 或相关测试 | 修改 | 新增：无参数返回根节点子节点、快捷名称解析、系统节点过滤 |

### 实现要点

- 工作区根节点 ID 通过 `loroDoc.getCurrentWorkspaceId()` 获取（已有模式，参考 `ensureAgentNode`）
- 快捷名称解析在 execute 函数入口处，将 `"journal"` 替换为 `SYSTEM_NODE_IDS.JOURNAL` 等
- 根级过滤只在 `nodeId` 为空（即浏览根节点）时生效。`node_read("journal")` 或 `node_read(具体ID)` 不做额外过滤
- `depth`、`childOffset`、`childLimit` 等分页参数在浏览模式下照常工作

---

## 改动 2：Settings AI 分组

### 目标结构

```
Settings
  ├── AI
  │   ├── Providers (API keys, base URLs...)
  │   └── Default Agents
  │       ├── Chat Agent (#agent, system prompt, model, temperature, skills...)
  │       └── Spark Agent (#agent, model, temperature, extraction config...)
  ├── Highlight & Comment
  └── ...其他设置项
```

### 设计决策

- **"AI" 是一个普通 header 节点**（locked），下面放 AI 相关配置
- **"Default Agents" 是一个普通 header 节点**（locked），收纳系统预设的 agent
- **"Providers" 是现有的 AI Provider 配置**（已有节点，移入 AI 分组下）
- **Agent 和 Spark Agent 从根节点移入 Default Agents 下**
- **用户创建的 #agent 节点不受影响**——它们可以在知识图谱的任何位置，功能由 #agent 标签决定
- **所有 agent 都可被检索**——`node_search(searchTags: ["agent"])` 返回系统预设 + 用户自建的全部 agent

### 迁移逻辑

在 `ensureAgentNode` / `ensureSparkAgentNode` 中：

1. 确保 Settings 下存在 "AI" 节点（固定 ID，`locked: true`）
2. 确保 AI 下存在 "Default Agents" 节点（固定 ID，`locked: true`）
3. 确保 AI 下存在 "Providers" 引用或移动现有 Provider 节点
4. 如果 Agent / Spark Agent 当前 parent 是根节点 → 移动到 Default Agents 下
5. 已经在 Default Agents 下的 → 不操作（幂等）

### 需要新增的系统节点 ID

```typescript
// 在 SYSTEM_NODE_IDS 或 AI_AGENT_NODE_IDS 中新增
AI_SETTINGS_GROUP: 'NDX_AI_SETTINGS',        // Settings > AI
DEFAULT_AGENTS_GROUP: 'NDX_DEFAULT_AGENTS',   // Settings > AI > Default Agents
```

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-agent-node.ts` | 修改 | 新增 AI / Default Agents 节点 bootstrap；Agent / Spark Agent 迁移逻辑 |
| `src/types/system-nodes.ts` 或 `node.ts` | 修改 | 新增系统节点 ID 常量 |
| `tests/vitest/ai-agent-node.test.ts` | 修改 | Agent bootstrap 后验证 parent 是 Default Agents |
| `tests/vitest/bootstrap-system-nodes.test.ts` | 修改 | 验证 AI / Default Agents 节点创建和迁移 |

### 实现要点

- bootstrap 顺序：先确保 AI 分组节点存在 → 再确保 Default Agents 存在 → 再确保 Agent / Spark Agent 在正确位置
- 幂等性：重复调用不会移动已经在正确位置的节点
- AI Provider 节点的处理需要检查当前代码中 Provider 配置节点的位置和引用方式，确保移动后功能不受影响
- `locked: true` 防止用户误删分组节点

---

## Checklist

### 改动 1：node_read 无参数浏览

- [ ] `read-tool.ts`: `nodeId` 参数改为 `Type.Optional`
- [ ] `read-tool.ts`: 无参数时解析为工作区根节点 ID
- [ ] `read-tool.ts`: 支持 `"journal"` / `"schema"` 快捷名称解析
- [ ] `read-tool.ts`: 根级浏览时过滤 Trash 和 Settings 节点
- [ ] `read-tool.ts`: 更新 description 和 quick patterns
- [ ] 测试: 无参数调用返回根节点子节点
- [ ] 测试: 快捷名称 `"journal"` 解析正确
- [ ] 测试: 快捷名称 `"schema"` 解析正确
- [ ] 测试: 根级浏览不显示 Trash 和 Settings
- [ ] 测试: 带 nodeId 的调用行为不变（回归）

### 改动 2：Settings AI 分组

- [ ] 新增 `AI_SETTINGS_GROUP` 和 `DEFAULT_AGENTS_GROUP` 系统节点 ID
- [ ] `ai-agent-node.ts`: bootstrap 时创建 AI 和 Default Agents 分组节点（locked）
- [ ] `ai-agent-node.ts`: Agent 和 Spark Agent 迁移到 Default Agents 下
- [ ] 验证 Provider 节点可以正常移入或关联到 AI 分组
- [ ] 测试: bootstrap 后 Agent parent 是 Default Agents
- [ ] 测试: 重复 bootstrap 幂等
- [ ] 测试: 根级浏览不再显示 Agent / Spark Agent

### 通用

- [ ] `npm run verify`（typecheck → test-sync → test → build）

## 注意事项

1. **不改 node_search** — 搜索工具保持专注，不混入浏览功能
2. **不改 system prompt** — 探索行为引导后续单独做
3. **node_read 返回格式不变** — 无参数模式使用与 `node_read(nodeId)` 完全相同的返回结构
4. **改动 2 依赖改动 1 的过滤** — Agent 移入 Settings 后，根级过滤只需排除 Trash 和 Settings 即可
5. **Provider 迁移需谨慎** — 检查 `ai-provider-config.ts` 中的引用路径，确保移动后 API key 读取正常
6. **参考 `ensureAgentNode` 的现有模式** — 节点创建、幂等性检查、`loroDoc.moveNode()` 等已有成熟实现

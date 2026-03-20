# node_create 工具收敛方案

> 让 `node_create` 从递归 JSON 树工具，收敛为稳定的 create 契约。
>
> **2026-03-20** — 产品讨论收敛

## 背景

### 当前问题

`node_create` 现在同时承担了太多职责：

- 创建单个普通节点
- 递归创建整棵子树（`children`）
- 创建 reference 节点
- duplicate 现有节点
- 直接设置 tags / fields / raw data

其中真正不稳定的部分不是“create”这个动作本身，而是**递归 `children` JSON**：

- 树越深，tool input 越容易在流式输出里出现括号、逗号、数组闭合错误
- `children` 递归让 schema 过大、过宽，模型边生成边补全时更容易失稳
- `reference` 如果按名字解析，会遇到同名节点歧义，协议本身不可靠

同时，产品里其实已经有一条成熟链路：**多行文本 / Markdown → 解析 → 真实节点树落地**。这条链路已经支持：

- 多行平铺节点
- Markdown 列表层级
- 标题 / 代码块
- `#tag`
- `field:: value`

因此，根本性解决方案不是继续给递归 JSON 打补丁，而是重做 `node_create` 的输入契约。

### 设计目标

- 保留一个统一的 `node_create` 工具，不额外拆出 `reference_create`
- 删除最脆弱的递归 `children` 参数
- 删除低频的 `duplicate`
- 复用现有文本解析能力做批量建树
- reference 节点只接受稳定的 `nodeId`
- 最终落地仍然是**真实节点树**，不引入字符串持久化或平铺 metadata 模型

---

## 核心决策

### 决策 1：保留一个 `node_create`，但显式区分 `mode`

不再让模型靠“哪些字段出现了”去猜当前要执行哪种创建行为，而是显式要求：

- `mode: "content"` — 创建单个普通节点
- `mode: "reference"` — 创建 reference 节点
- `mode: "import_text"` — 从多行文本批量创建内容树

这样保留了“reference 也是 create”的语义一致性，同时把原本互相干扰的三类输入契约拆开。

### 决策 2：删除递归 `children`

`children` 是本次问题的核心风险源，直接移除。

批量建树不再通过结构化 JSON 递归表达，而是走 `import_text` 模式，复用现有文本解析链路。这里的文本只是**输入入口**，解析完成后立即落成真实节点树，不会作为字符串长期保存。

### 决策 3：reference 只通过 `targetId` 创建

reference 节点不允许按名称解析，也不允许“模糊匹配 + 自动挑一个”。

原因：

- 节点名称可重复
- 节点名称会被编辑
- 同名报错只能阻止错误写入，不能凭空确定正确目标

因此：

- `reference` 模式必须显式传 `targetId`
- `import_text` 默认不负责 reference 解析
- 如果 AI 只有名字，必须先 search/read，拿到唯一 `nodeId`，再创建 reference

### 决策 4：删除 `duplicate`

`duplicate` 使用频率低，但会继续放大 `node_create` 的职责范围和 schema 复杂度。

当前版本直接移除；若未来确实出现稳定且高频的真实需求，再作为独立能力评估，而不是继续塞回 `node_create`。

### 决策 5：AI 导入使用“严格文本解析”，不直接复用用户粘贴的全部启发式

用户粘贴需要“尽量帮用户读懂剪贴板”，因此可以有 HTML/Markdown/样式推断等宽松逻辑。

AI 工具入口不一样。它需要的是**稳定、可预期、可回错**。

因此 `import_text` 应该：

- 只接受 plain text / Markdown
- 不依赖剪贴板 HTML 启发式
- 不做“坏层级自动拍平后继续写入”的静默容错
- 解析失败时直接返回错误，让模型重试

---

## 最终工具契约

### 公共定位参数

所有模式共享以下定位语义：

- `mode`: 必填，决定当前创建行为
- `parentId?`: 作为某个父节点的 child 创建
- `afterId?`: 作为某个节点的下一个 sibling 创建
- `position?`: 仅在 `parentId` 下有效，表示插入位置

约束：

- `parentId` 与 `afterId` 互斥
- `position` 只在 `parentId` 存在时有效

### Mode: `content`

用途：创建一个普通节点。

参数：

- `name`: 必填
- `tags?`: 可选，字符串数组
- `fields?`: 可选，`Record<string, string>`
- `data?`: 可选，浅层 raw node properties

说明：

- 不允许 `children`
- 不允许 `targetId`
- 不允许 `duplicateId`

典型场景：

- 创建一个 task
- 创建一个 field value 节点
- 创建一个 codeBlock 节点（通过 `data.type` / `data.codeLanguage`）

### Mode: `reference`

用途：创建一个 reference 节点。

参数：

- `targetId`: 必填

说明：

- `targetId` 只能是明确的 node ID
- 不接受名字、标题、关键词
- 不允许 `name`
- 不允许 `text`
- 不允许 `children`

典型场景：

- 在当前 panel 下创建某个既有节点的引用
- 在某个 fieldEntry 下创建 reference value

### Mode: `import_text`

用途：从多行文本或 Markdown 批量创建内容树。

参数：

- `text`: 必填，多行 plain text / Markdown

说明：

- 不允许结构化 `children`
- 不允许 `duplicateId`
- 默认不处理 reference 解析
- 文本里的 `#tag` 和 `field:: value` 仍可沿用现有解析能力
- 解析完成后立即落成真实节点树与 fieldEntry

典型场景：

- 一次创建一组平级节点
- 一次创建一棵列表/标题层级树
- 把 AI 生成的大纲直接导入当前父节点

### 参数草案

```json
{
  "mode": "content | reference | import_text",
  "parentId": "optional-parent-id",
  "afterId": "optional-sibling-id",
  "position": 0,

  "name": "only-for-content",
  "tags": ["task", "source"],
  "fields": { "Status": "Todo", "Priority": "High" },
  "data": { "type": "codeBlock", "description": "optional" },

  "targetId": "only-for-reference",

  "text": "only-for-import_text"
}
```

---

## Exact Behavior

### 场景 1：单节点创建

**GIVEN** AI 只需要创建一个普通节点  
**WHEN** 调用 `node_create(mode="content")`  
**THEN** 只创建一个节点，可附带 tags / fields / data，不允许递归 children

### 场景 2：批量内容建树

**GIVEN** AI 需要一次创建多个节点或一棵内容树  
**WHEN** 调用 `node_create(mode="import_text")`  
**THEN** 系统先解析 `text`，再一次性落成真实节点树；若解析失败，不做部分写入

### 场景 3：创建 reference

**GIVEN** AI 需要创建一个 reference 节点  
**WHEN** 调用 `node_create(mode="reference", targetId="...")`  
**THEN** 系统创建真实 reference 节点，目标只能是显式 `nodeId`

### 场景 4：同名节点

**GIVEN** 图谱里存在多个同名节点  
**WHEN** AI 想创建 reference  
**THEN** 不允许用名字直接创建；AI 必须先拿到唯一 `targetId`

### 场景 5：文本导入中出现引用意图

**GIVEN** `import_text` 的文本内容里出现类似“引用某节点”的表达  
**WHEN** 目标无法由明确 `nodeId` 确定  
**THEN** 当前版本直接视为不支持，不隐式创建 reference，也不做模糊匹配

---

## 返回值建议

### `content`

返回：

- `id`
- `parentId`
- 可选 `createdFields`
- 可选 `unresolvedFields`

### `reference`

返回：

- `id`
- `parentId`
- `isReference: true`
- `targetId`

### `import_text`

返回：

- `rootIds`
- `rootCount`
- `createdCount`
- 可选 `createdFields`
- 可选 `unresolvedFields`

这样能让 AI 在下一步继续读/改这些新建节点，而不是只知道“创建成功了”。

---

## 对 Prompt / Tool Description 的影响

`node_create` 的描述和 quick patterns 需要同步收敛：

- 用 `content` 创建单节点
- 用 `reference` 创建显式引用
- 用 `import_text` 创建多节点 / 层级内容
- 移除 `children` 递归示例
- 移除 `duplicate` 示例

推荐引导：

- 需要 1 个节点 → `content`
- 需要 2 个以上内容节点或层级 → `import_text`
- 需要引用已有节点 → 先 search/read，再 `reference`

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-tools/create-tool.ts` | 修改 | `node_create` 参数 schema 改为 mode-based；移除 `children` / `duplicateId`；重写 description / quick patterns |
| `src/lib/paste-parser.ts` | 修改 | 抽出或新增 AI 专用严格解析入口（plain text / Markdown only） |
| `src/stores/node-store.ts` | 修改 | 复用或补齐批量落树 helper，确保 `import_text` 一次性 commit，并返回摘要 |
| `src/lib/ai-tools/index.ts` | 可能修改 | 若需要新增 runtime metadata 或 tool hint，统一挂载入口 |
| `src/lib/ai-service.ts` | 修改 | 更新 agent tool wiring 与相关测试预期 |
| `src/lib/ai-proxy.ts` | 修改 | 保留现有兜底恢复，并为 Anthropic 专项参数透传做准备 |
| `server/src/routes/ai.ts` | 修改 | 透传 provider-specific strict / streaming 配置（如启用） |
| `tests/vitest/create-tool.test.ts` | 修改 | 覆盖三种 mode、新的校验边界、reference 仅接受 `targetId` |
| `tests/vitest/paste-parser.test.ts` | 修改 | 增加 AI 严格文本导入的解析测试 |
| `tests/vitest/paste-multi-line.test.ts` | 修改 | 验证 `import_text` 落树、tags、fields、code block、单次 commit |
| `tests/vitest/ai-service.test.ts` | 修改 | 更新工具描述、参数示例和 debug snapshot 预期 |
| `tests/vitest/ai-proxy.test.ts` | 修改 | Anthropic 透传与恢复策略回归 |

---

## 实施顺序

### Phase 1：契约收敛

- `node_create` 加 `mode`
- 删除 `children`
- 删除 `duplicateId`
- 保留 `reference(targetId)`
- 更新工具描述和测试

这是止血阶段，先把最脆弱的输入契约拿掉。

### Phase 2：接入 `import_text`

- 提供 AI 专用严格文本解析入口
- 把现有文本落树能力接到 `node_create(mode="import_text")`
- 增加 tags / fields / code block 回归测试

这是主修阶段，让批量建树回到已有基础设施上。

### Phase 3：Anthropic 硬化

- Anthropic provider / proxy 支持 strict tool use
- 明确关闭 eager/fine-grained input streaming（如果接入层支持）
- 保留现有 `jsonrepair` 作为兜底，而不是主路径

这是补强阶段，但不是第一优先级。

---

## Non-goals

当前方案明确不做：

- 不支持按名字创建 reference
- 不支持 `import_text` 里隐式解析 reference
- 不保留 `duplicate`
- 不继续维护结构化递归 `children`
- 不把文本作为持久化数据模型保存

---

## Checklist

- [ ] `create-tool.ts`：`node_create` 改为 `mode` 驱动
- [ ] `create-tool.ts`：移除 `children`
- [ ] `create-tool.ts`：移除 `duplicateId`
- [ ] `create-tool.ts`：`reference` 模式只接受 `targetId`
- [ ] `create-tool.ts`：更新 description / quick patterns
- [ ] `paste-parser.ts`：新增或抽出 AI 严格文本解析入口
- [ ] `node-store.ts`：确保 `import_text` 一次性落树 + 单次 commit
- [ ] 测试：单节点 `content` 创建
- [ ] 测试：`reference(targetId)` 创建
- [ ] 测试：`import_text` 创建平级节点
- [ ] 测试：`import_text` 创建层级节点
- [ ] 测试：`import_text` 解析 `#tag`
- [ ] 测试：`import_text` 解析 `field:: value`
- [ ] 测试：`import_text` 解析 fenced code block
- [ ] 测试：同名节点下不允许按名字创建 reference
- [ ] 测试：`npm run verify`

---

## 注意事项

1. **不要把 `import_text` 理解为字符串存储方案**  
   它只是创建入口，落地仍然必须是正常节点树与 fieldEntry。

2. **不要让 AI 工具复用用户粘贴的全部宽松启发式**  
   AI 入口要的是确定性，不是“尽量猜对”。

3. **reference 的稳定性优先于少一次工具调用**  
   如果没有唯一 `targetId`，就不应该创建 reference。

4. **先做契约收敛，再做 provider 层优化**  
   `children` 递归是主因，Anthropic strict/streaming 只是在其上继续加固。

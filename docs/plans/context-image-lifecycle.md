# AI Context Image Lifecycle Management

## 问题

多轮 AI 工具调用（特别是 browser tool 截图）导致 Chrome 扩展崩溃。

### 根因分析

截图以 base64 内嵌在 `agent.state.messages[]` 的 `ToolResultMessage.content` 中（每张 ~2-4MB）。三个放大器导致崩溃：

1. **签名计算**：`use-agent.ts:42-44` 的 `getPersistedMessageSignature()` 每次 agent 事件都 `JSON.stringify(agent.state.messages)`，含所有 base64 图片
2. **高频持久化**：签名变化触发 250ms debounce 写 IndexedDB（`use-agent.ts:78-86`），每次写入完整消息（含图片）
3. **上下文无限增长**：`transformContext` 只注入 system reminder，不做任何修剪。每轮 LLM 请求发送全部历史（含所有图片 base64）

### 影响范围

不仅限于截图。未来任何返回图片的工具（`node_read` 读取 image node、web clip 带图等）都会触发同样的问题。解法必须在**消息层**工具无感知地解决。

## 设计讨论与决策

### 被否决的方案

**方案 A：Image Store + Reference（存储层抽象）**

截图 → 存入 ImageStore（IndexedDB blob 或 R2）→ 消息里只存 `{ imageId, width, height }` 引用 → `transformContext` 按需解析近 N 个 ref 回 base64。

否决原因：
- 引入新模块（ImageStore）、新类型（imageRef）、新生命周期管理（eviction），~150 行新代码
- 需要改动所有返回图片的工具（`imageResult` → 先存后引用）
- Anthropic API 不支持 URL 图片，最终还是要解析回 base64 发送，存链接只是中间态
- 过早抽象——当前只有截图一个图片来源

**方案 B：图片转链接（URL 化）**

截图 → 上传 R2 → 消息里存 URL。

否决原因：
- 增加网络延迟和服务端存储成本，截图是临时数据不值得
- Anthropic API 必须 inline base64，URL 需在发送前 fetch 回来
- 引入了外部依赖（R2 可用性）影响 AI 体验

### 选择的方案：滑动窗口（上下文层处理）

**核心判断**：模型几乎不需要回看多轮之前的截图。截图的用途是验证刚执行的操作结果，保留最近 3 轮足矣。

**关键优势**：
1. **工具无感知** — `imageResult()` 保持不变，screenshot、未来的 node_read、web_clip 等任何返回图片的工具自动受益
2. **一处修改覆盖所有场景** — `transformContext` 是唯一管道，图片策略集中在此
3. **不引入新基础设施** — 无 blob store、无新 ID 体系、无 eviction 策略
4. **pi-agent-core 推荐做法** — 框架文档明确说 `transformContext` 用于 "Context window management — pruning old messages"

### 关于未来 image node 的兼容性

讨论中确认：未来 `node_read` 读取 image node 时，工具返回的图片同样是 `{ type: 'image', data, mimeType }` 格式的 `ToolResultMessage`。滑动窗口在消息层操作，不区分图片来源，因此 image node 读取自动受益于相同的上下文管理。

Image node 的**存储**（如何持久化图片数据到 R2/IndexedDB）是独立问题，属于 image node 功能本身的范畴，与 AI 上下文管理不耦合。

## 方案：滑动窗口 + 持久化剥离 + 轻量签名

pi-agent-core 的 `transformContext` hook 就是为上下文管理设计的（文档："Context window management — pruning old messages"）。在这个 hook 里统一处理图片生命周期，工具层无需任何改动。

### 修改清单

#### 1. `src/lib/ai-context.ts` — 新增 `stripOldImages()`

在 `transformContext` 管道中、`injectReminder` 之前调用。

**逻辑**：
- 从后往前遍历消息，找到含 `{ type: 'image' }` 的 `toolResult` 消息
- 最近 `RECENT_IMAGE_TURNS`（= 3）轮含图片的 tool result 保留完整 base64
- 更早的图片内容替换为文字占位：`{ type: 'text', text: '[Image: {mimeType}, removed from context]' }`
- 同时处理 `UserMessage.content` 中的图片（用户通过 prompt 附带的图片，目前不存在但预留）
- 不修改原始数组，返回新数组（immutable）

**常量**：
```typescript
const RECENT_IMAGE_TURNS = 3;
```

**导出**：`export function stripOldImages(messages: AgentMessage[]): AgentMessage[]`

测试用例：
- 无图片消息 → 返回相同引用（`toBe`）
- 2 轮图片（< 阈值）→ 全部保留
- 5 轮图片（> 阈值）→ 最近 3 轮保留 base64，前 2 轮替换为 text
- 混合消息（text-only tool result + image tool result）→ 只计入含图片的 tool result
- 同一 toolResult 含多张图片 → 全部替换或全部保留（按轮次计）
- UserMessage 中的图片 → 同样策略处理

#### 2. `src/lib/ai-service.ts` — 串联 `stripOldImages`

修改 `createAgent()` 中的 `transformContext`：

```typescript
// Before
transformContext: async (messages) => {
  const systemReminder = await buildSystemReminder();
  return injectReminder(messages, systemReminder);
},

// After
transformContext: async (messages) => {
  const stripped = stripOldImages(messages);
  const systemReminder = await buildSystemReminder();
  return injectReminder(stripped, systemReminder);
},
```

新增 import：`import { buildSystemReminder, injectReminder, stripOldImages } from './ai-context.js';`

#### 3. `src/hooks/use-agent.ts` — 轻量签名

**问题**：`getPersistedMessageSignature` 每次 agent 事件都 `JSON.stringify` 全部消息（含 base64）。

**修改**：

```typescript
// Before
function getPersistedMessageSignature(agent: Agent): string {
  return JSON.stringify(agent.state.messages);
}

// After
function getPersistedMessageSignature(agent: Agent): string {
  const messages = agent.state.messages;
  const length = messages.length;
  if (length === 0) return '0';
  const last = messages[length - 1];
  const timestamp = 'timestamp' in last ? (last as { timestamp: number }).timestamp : 0;
  return `${length}:${timestamp}`;
}
```

这个签名在消息数量或最后一条消息时间戳变化时触发持久化。足够检测新消息到达，同时避免序列化整个消息历史。

#### 4. `src/lib/ai-persistence.ts` — 持久化前剥离图片

**问题**：`saveChatSession` 把完整消息（含 base64）写入 IndexedDB，导致 DB 膨胀。

**修改**：在 `pruneMessages` 基础上增加 `stripImagesForPersistence`：

```typescript
function stripImagesForPersistence(messages: AgentMessage[]): AgentMessage[] {
  let hasImages = false;
  for (const m of messages) {
    if (messageHasImage(m)) { hasImages = true; break; }
  }
  if (!hasImages) return messages;

  return messages.map((m) => {
    if (!messageHasImage(m)) return m;
    return { ...m, content: replaceImageContent(m.content) };
  });
}
```

`replaceImageContent` 将 `{ type: 'image', data, mimeType }` 替换为 `{ type: 'text', text: '[Image removed from storage]' }`。

在 `saveChatSession` 中串联：
```typescript
messages: stripImagesForPersistence(pruneMessages(session.messages)),
```

**导出**：`stripImagesForPersistence` 不需要导出，保持内部函数。

测试用例：
- 无图片消息 → 返回相同引用
- 含图片消息 → 图片替换为 text，其他 content block 保留
- 通过 `saveChatSession` 保存含图片的 session → 恢复后无图片

### 不修改的文件

- `src/lib/ai-tools/browser-actions/shared.ts` — `imageResult()` 保持不变，工具层不需要知道上下文管理
- `src/lib/ai-proxy.ts` — 代理层不变
- `server/src/routes/ai.ts` — 服务端不变

### 测试文件

- `tests/vitest/ai-context.test.ts` — 新增 `stripOldImages` 测试（6 个用例）
- `tests/vitest/ai-persistence.test.ts` — 新增图片剥离测试（3 个用例）
- `tests/vitest/use-agent.test.ts` — 如果不存在此文件，可以不新建。签名改动通过 ai-context 和 ai-persistence 测试间接覆盖

### 验证

```bash
npm run verify  # typecheck → check:test-sync → test:run → build
```

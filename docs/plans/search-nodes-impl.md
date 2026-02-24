# Search Nodes 实施计划

> **Owner**: nodex-cc-2
> **Branch**: `cc2/search-nodes`
> **Spec**: `docs/features/search.md`
> **Scope**: Phase 1 — 最小可用搜索节点（单标签搜索 + 结果展示）

---

## 背景

Search Node 是 Tana 的持久化动态查询功能。用户通过 `?` 创建搜索节点，选择目标标签后，系统自动查找所有匹配节点并展示。

**关键上下文**：
- 原 `search-service.ts`（Supabase 版）已随 Loro 迁移删除
- 数据层现为纯客户端 Loro CRDT，搜索需基于内存遍历
- 搜索节点的 `type: 'search'` 已在类型系统中定义
- SEARCHES 容器已在 `system-node-registry.ts` 注册
- Slash command `search_node` 已注册但 `enabled: false`

---

## Phase 1 交付目标

用户可以通过 `?` 创建一个按标签搜索的节点，搜索结果动态展示在节点下方。

**用户故事**：
1. 在任意节点编辑器中输入 `?` → 弹出标签选择器
2. 选择 `#task` → 在当前位置创建搜索节点 `🔍 task`
3. 展开搜索节点 → 看到所有打了 `#task` 标签的节点（含子标签如 `#bug`）
4. 新增一个 `#task` 节点 → 搜索结果自动更新
5. 点击搜索结果 → navigateTo 原节点

---

## 实施步骤

### Step 1: 搜索引擎 — `src/lib/search-engine.ts`

**新建文件**，实现基于 Loro 的内存搜索。

```typescript
// 核心 API
export function searchByTag(tagDefId: string): string[]
export function collectTagHierarchy(tagDefId: string): Set<string>
```

**`searchByTag(tagDefId)`**:
1. 调用 `collectTagHierarchy(tagDefId)` 获取标签 + 所有子标签 ID
2. 遍历 `loroDoc.getAllNodeIds()`
3. 对每个节点调用 `loroDoc.getTags(id)`
4. 过滤 `tags.some(t => tagIds.has(t))`
5. 跳过结构类型（`fieldEntry`, `fieldDef`, `reference`, `search`）
6. 跳过工作区容器和回收站内节点
7. 返回匹配 ID 数组

**`collectTagHierarchy(tagDefId)`**:
1. 遍历所有 `type: 'tagDef'` 节点
2. 检查每个 tagDef 的 `extends` 属性
3. 递归收集以 `tagDefId` 为祖先的所有 tagDef ID
4. 返回 `Set<string>` 包含 tagDefId 自身 + 所有后代

**测试**: `tests/vitest/search-engine.test.ts`
- 单标签匹配
- 多态搜索（父标签 → 包含子标签实例）
- 跳过结构类型 / 回收站
- 空结果
- 性能：1000 节点 <50ms

**依赖**: 仅 `loroDoc`（无外部依赖）

---

### Step 2: 搜索节点创建 — `node-store.ts`

在 `node-store.ts` 中添加 `createSearchNode()`:

```typescript
createSearchNode(parentId: string, afterId: string | null, tagDefId: string): string {
  // 1. 获取 tagDef 名称
  const tagDef = loroDoc.toNodexNode(tagDefId);
  const name = tagDef?.name ?? 'Search';

  // 2. 创建节点
  const id = createChild(parentId, afterId, {
    name,
    type: 'search',
    tags: [tagDefId],  // Phase 1: tags 字段存搜索目标
  });

  // 3. commitDoc
  commitDoc('user:create-search');
  return id;
}
```

**测试**: `tests/vitest/search-engine.test.ts`（扩展）
- 创建搜索节点验证 type/tags/name

**依赖**: Step 1

---

### Step 3: `?` 触发 — 编辑器集成

**3a. 启用 slash command**

`src/lib/slash-commands.ts`:
```typescript
{
  id: 'search_node',
  name: 'Search node',
  keywords: ['search', 'node', 'find', '?'],
  enabled: true,  // ← 改为 true
  // 删除 disabledHint
}
```

**3b. 添加 `?` 触发符**

在编辑器 intent 层（`NodeEditor.tsx` 或 `row-keyboard-intents.ts`）添加 `?` 字符触发：
- 参考 `#` 触发 TagSelector 的实现模式
- `?` 在行首或空格后输入时触发
- 打开标签选择器（复用 `TagSelector` 或 `ReferenceSelector` 的 UI）
- 选择标签后调用 `createSearchNode()`
- 创建完成后焦点移到搜索节点

**需要确认的实现细节**（开发时检查）：
- `?` 触发是走 slash command 菜单（用户选 "Search node" 后再选标签），还是直接打开标签选择器？
  - **建议**：直接打开标签选择器（与 `#` 直接触发一致），slash menu 中的 "Search node" 也触发同一流程
- 标签选择器组件选哪个复用？检查 `TagSelector` vs `ReferenceSelector` 的 props 兼容性

**依赖**: Step 2

---

### Step 4: OutlinerItem 搜索节点渲染

**4a. BulletChevron 识别搜索节点**

搜索节点的 bullet 显示为**放大镜图标**（非普通圆点）：

```typescript
// BulletChevron.tsx — 新增 isSearch prop
if (isSearch) {
  // 渲染 Search icon (lucide) 替代普通 bullet
}
```

**4b. OutlinerItem 传递 isSearch**

```typescript
// OutlinerItem.tsx
const isSearch = node?.type === 'search';
// 传给 BulletChevron
<BulletChevron isSearch={isSearch} ... />
```

**4c. 搜索节点的 name 渲染**

- 搜索节点名称不可编辑（或可编辑用于重命名）
- 名称旁可选显示目标标签 badge

**依赖**: 无（可与 Step 1-3 并行）

---

### Step 5: 搜索结果动态展示

**核心组件**: 在 OutlinerItem 中，当 `type === 'search'` 且节点展开时，渲染搜索结果而非 children。

**5a. `useSearchResults` hook**

```typescript
// src/hooks/use-search-results.ts
export function useSearchResults(nodeId: string): string[] {
  const version = useNodeStore(s => s._version);
  return useMemo(() => {
    const node = loroDoc.toNodexNode(nodeId);
    if (node?.type !== 'search') return [];
    const targetTagId = node.tags?.[0]; // Phase 1: 第一个 tag 是搜索目标
    if (!targetTagId) return [];
    return searchByTag(targetTagId);
  }, [nodeId, version]);
}
```

**5b. OutlinerView / OutlinerItem 集成**

搜索节点展开时：
- 不渲染 `node.children`（普通 children）
- 改为渲染 `useSearchResults()` 返回的节点列表
- 每个结果节点使用引用 bullet 样式（同心圆 ⊙，复用 `BulletChevron.isReference`）
- 结果节点显示 TagBadge
- 点击结果节点 → `navigateTo(resultNodeId)`（zoom-in 到原节点）

**5c. 结果为空时的占位**

搜索无结果时显示占位文本：`"No matching nodes"`

**测试**: `tests/vitest/search-engine.test.ts`（扩展）
- `useSearchResults` 返回正确的匹配列表
- 节点变更后结果自动刷新（version 变化）

**依赖**: Step 1, Step 4

---

### Step 6: Seed Data + 集成验证

**6a. 添加搜索节点到种子数据**

`src/entrypoints/test/seed-data.ts`:
- 在 SEARCHES 容器下创建一个搜索节点（搜索 `#task`）
- 确保有 3-5 个 `#task` 节点作为搜索结果

**6b. 集成验证**

1. `npm run typecheck` — 无类型错误
2. `npm run test:run` — 全量测试通过
3. `npm run build` — 构建成功
4. Standalone 环境手动验证：
   - 搜索节点在侧栏 Searches 中可见
   - 展开显示匹配的 task 节点
   - 放大镜 bullet 正确渲染
   - 结果实时更新（添加新 #task 节点后）

**依赖**: Step 1-5 全部完成

---

### Step 7: 文档同步

- 更新 `docs/features/search.md`（当前状态表）
- 更新 `docs/TESTING.md`（新增测试覆盖）
- 更新 `docs/TASKS.md`（勾选完成项）
- 更新 `CLAUDE.md`（如有新文件/目录）

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新建** | `src/lib/search-engine.ts` | 搜索引擎（searchByTag + collectTagHierarchy） |
| **新建** | `src/hooks/use-search-results.ts` | 搜索结果 hook |
| **新建** | `tests/vitest/search-engine.test.ts` | 搜索引擎测试 |
| **修改** | `src/stores/node-store.ts` | 新增 `createSearchNode()` |
| **修改** | `src/lib/slash-commands.ts` | 启用 `search_node` |
| **修改** | `src/components/outliner/OutlinerItem.tsx` | 搜索节点渲染 + 结果展示 |
| **修改** | `src/components/outliner/BulletChevron.tsx` | 搜索节点放大镜 bullet |
| **修改** | `src/components/outliner/OutlinerView.tsx` | 搜索结果渲染分支 |
| **修改** | `src/components/editor/NodeEditor.tsx` | `?` 触发处理 |
| **修改** | `src/entrypoints/test/seed-data.ts` | 添加搜索节点种子数据 |
| **修改** | `src/hooks/use-node-search.ts` | 搜索结果中跳过 `type: 'search'` |

### ⚠️ 高风险文件

| 文件 | 风险 | 注意事项 |
|------|------|---------|
| `OutlinerItem.tsx` | 高 | 核心渲染组件，需在 TASKS.md 声明文件锁 |
| `node-store.ts` | 高 | 状态管理核心，需声明文件锁 |
| `BulletChevron.tsx` | 中 | 新增 prop，影响面小 |

---

## 开放问题（开发时决策）

| # | 问题 | 建议 | 决策时机 |
|---|------|------|---------|
| 1 | `?` 触发是走 slash menu 还是直接弹标签选择器？ | 直接弹标签选择器（与 `#` 行为一致） | Step 3 开始前 |
| 2 | 搜索节点名称是否可编辑？ | 可编辑（允许用户重命名） | Step 4 |
| 3 | 搜索结果的排序？ | 按 updatedAt 降序（最近修改在上） | Step 5 |
| 4 | 搜索结果是否包含回收站内节点？ | 不包含（跳过 TRASH 容器后代） | Step 1 |
| 5 | 搜索节点自身是否可拖拽/移动？ | 是，与普通节点一致 | Step 4 |

---

## 验收标准

- [ ] `?` 输入触发标签选择 → 创建搜索节点
- [ ] 搜索节点显示放大镜 bullet
- [ ] 展开搜索节点 → 显示所有匹配标签的节点
- [ ] 多态搜索：搜索父标签包含子标签实例
- [ ] 结果为引用 bullet 样式，点击 navigateTo 原节点
- [ ] 添加/删除/修改标签后，搜索结果自动刷新
- [ ] 搜索无结果时显示占位文本
- [ ] `npm run verify` 通过（typecheck + test-sync + test:run + build）
- [ ] Standalone 环境下种子数据搜索节点正常工作

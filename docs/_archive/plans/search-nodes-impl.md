# Search Nodes Phase 1 实施计划

> **Owner**: nodex-cc-2
> **Branch**: `cc2/search-nodes`
> **Spec**: `docs/features/search.md`

---

## 交付目标

用户通过 `?` 创建按标签搜索的节点，搜索结果在节点下方动态展示，支持完整交互（展开、编辑、查看字段）。

---

## 设计要点

1. **查询配置 = 子节点树**：搜索节点的 children 是 `type: 'queryCondition'` 条件节点，不是搜索结果
2. **搜索结果动态计算**：不存入 children，每次展开时由搜索引擎实时计算
3. **结果用 OutlinerItem 渲染**：继承全部交互（展开/编辑/字段），仅 bullet 改为引用样式
4. **创建搜索节点 = 创建 3 个节点**：SearchNode + AND root group + HAS_TAG condition

详见 `docs/features/search.md`。

---

## 实施步骤

### Step 1: 类型定义

**`src/types/node.ts`**：
- `NodeType` 新增 `'queryCondition'`
- `NodexNode` 新增属性：`queryLogic`, `queryOp`, `queryTargetTag`, `queryField`, `queryValue`

**`src/lib/loro-doc.ts`**：
- `toNodexNode()` 读取新属性
- `createNode()` / `setNodeData()` 支持写入新属性

**`src/hooks/use-node-search.ts`**：
- `SKIP_DOC_TYPES` 加入 `'queryCondition'` 和 `'search'`

验证：`npm run typecheck`

---

### Step 2: 搜索引擎

**新建 `src/lib/search-engine.ts`**：

```typescript
export function executeSearch(searchNodeId: string): string[]
export function collectTagHierarchy(tagDefId: string): Set<string>
```

- `executeSearch`：从搜索节点 children 找到根条件组，遍历所有可搜索节点，递归评估条件树
- `evaluateNode`：组节点按 `queryLogic`（AND/OR/NOT）递归，叶节点按 `queryOp` 判断
- `collectTagHierarchy`：遍历所有 `type: 'tagDef'` 节点，递归 `extends` 链收集后代
- `getAllSearchableNodes`：排除结构类型（`fieldEntry`, `fieldDef`, `reference`, `queryCondition`, `search`, `tagDef`）、工作区容器、回收站后代

**新建 `tests/vitest/search-engine.test.ts`**：
- 单标签匹配
- 多态搜索（父标签包含子标签实例）
- AND/OR/NOT 逻辑评估（即使 Phase 1 只用 AND，引擎应完整支持）
- 跳过结构类型和回收站
- 空结果
- `collectTagHierarchy` 递归正确性

---

### Step 3: 搜索节点创建

**`src/stores/node-store.ts`** 新增 `createSearchNode()`：

```typescript
createSearchNode(parentId: string, afterId: string | null, tagDefId: string): string {
  const tagDef = loroDoc.toNodexNode(tagDefId);
  const name = tagDef?.name ?? 'Search';

  // 1. 创建搜索节点
  const searchId = createChild(parentId, afterId, { name, type: 'search' });

  // 2. 创建 AND 根条件组
  const groupId = createChild(searchId, null, { type: 'queryCondition', queryLogic: 'AND' });

  // 3. 创建 HAS_TAG 条件
  createChild(groupId, null, { type: 'queryCondition', queryOp: 'HAS_TAG', queryTargetTag: tagDefId });

  commitDoc('user:create-search');
  return searchId;
}
```

扩展 `tests/vitest/search-engine.test.ts`：
- 创建后验证 3 节点结构正确
- 执行搜索返回匹配结果

---

### Step 4: `?` 触发

**`src/lib/slash-commands.ts`**：
- `search_node` 改 `enabled: true`，删除 `disabledHint`

**编辑器集成**（参考 `#` 触发 TagSelector 的实现）：
- `?` 在行首或空格后触发标签选择器
- 选择标签后调用 `createSearchNode(parentId, afterId, tagDefId)`
- 创建完成后删除 `?` 字符，焦点移到搜索节点

需要检查的实现细节：
- 复用 TagSelector 还是 ReferenceSelector 的 UI？看哪个更适合"选择一个标签"的场景
- `?` 是否也通过 slash menu 可触发？（建议：slash menu 的 "Search node" 条目也走同一流程）

---

### Step 5: 搜索节点渲染

**`src/components/outliner/BulletChevron.tsx`**：
- 新增 `isSearch?: boolean` prop
- `isSearch` 时渲染 Search 图标（lucide）替代普通 bullet

**`src/components/outliner/OutlinerItem.tsx`**：
- 识别 `node?.type === 'search'`，传 `isSearch` 给 BulletChevron
- 搜索节点名称可编辑（允许重命名）

---

### Step 6: 搜索结果渲染

**新建 `src/hooks/use-search-results.ts`**：

```typescript
export function useSearchResults(searchNodeId: string): string[] {
  const version = useNodeStore(s => s._version);
  return useMemo(() => executeSearch(searchNodeId), [searchNodeId, version]);
}
```

**`src/components/outliner/OutlinerView.tsx`**：
- 当父节点 `type === 'search'` 时，展开区域渲染搜索结果而非真实 children：

```typescript
if (parentNode.type === 'search') {
  const resultIds = useSearchResults(parentNodeId);
  return resultIds.map(id =>
    <OutlinerItem nodeId={id} isSearchResult depth={depth} />
  );
}
```

**`src/components/outliner/OutlinerItem.tsx`**：
- 新增 `isSearchResult?: boolean` prop
- 传给 BulletChevron 以显示引用 bullet 样式（⊙）

搜索无结果时显示占位文本：`"No matching nodes"`

---

### Step 7: Seed Data + 验证

**`src/entrypoints/test/seed-data.ts`**：
- 在 SEARCHES 容器下创建 1 个搜索节点（搜索 `#task`）
- 包含完整 3 节点结构（search + AND group + HAS_TAG condition）
- 确保有 3-5 个 `#task` 节点作为搜索结果

验证流程：
1. `npm run typecheck`
2. `npm run test:run`
3. `npm run build`
4. Standalone 环境视觉验证

---

### Step 8: 文档同步

- `docs/features/search.md` — 更新当前状态表
- `docs/TESTING.md` — 新增测试覆盖映射
- `docs/TASKS.md` — 勾选完成项
- `CLAUDE.md` — 如有新目录/文件

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新建** | `src/lib/search-engine.ts` | 搜索引擎（条件树递归评估 + 多态标签搜索） |
| **新建** | `src/hooks/use-search-results.ts` | 搜索结果 React hook |
| **新建** | `tests/vitest/search-engine.test.ts` | 搜索引擎 + 创建 + 条件评估测试 |
| **修改** | `src/types/node.ts` | NodeType 加 `queryCondition` + 查询属性 |
| **修改** | `src/lib/loro-doc.ts` | toNodexNode 读新属性 |
| **修改** | `src/stores/node-store.ts` | `createSearchNode()` |
| **修改** | `src/lib/slash-commands.ts` | 启用 `search_node` |
| **修改** | `src/components/outliner/BulletChevron.tsx` | `isSearch` 放大镜 bullet |
| **修改** | `src/components/outliner/OutlinerItem.tsx` | `isSearchResult` prop + 搜索节点识别 |
| **修改** | `src/components/outliner/OutlinerView.tsx` | 搜索结果渲染分支 |
| **修改** | `src/hooks/use-node-search.ts` | SKIP_DOC_TYPES 加 `queryCondition`, `search` |
| **修改** | `src/entrypoints/test/seed-data.ts` | 搜索节点种子数据 |
| **修改** | 编辑器触发相关文件 | `?` 触发处理（具体文件开发时确认） |

### ⚠️ 高风险文件

| 文件 | 风险 | 注意事项 |
|------|------|---------|
| `OutlinerItem.tsx` | 高 | 核心渲染，需在 TASKS.md 声明文件锁 |
| `node-store.ts` | 高 | 状态核心，需声明文件锁 |
| `OutlinerView.tsx` | 中 | 渲染入口，搜索分支需隔离 |

---

## 验收标准

- [ ] `?` 输入触发标签选择 → 创建搜索节点（3 节点结构）
- [ ] 搜索节点显示放大镜 bullet
- [ ] 展开搜索节点 → 动态显示匹配标签的节点
- [ ] 多态搜索：搜索父标签包含子标签实例
- [ ] 结果用 OutlinerItem 渲染：可展开、可编辑、可查看字段
- [ ] 结果 bullet 为引用样式（⊙）
- [ ] 节点变更后搜索结果自动刷新
- [ ] 搜索无结果时显示占位文本
- [ ] `npm run verify` 通过
- [ ] Standalone 种子数据搜索节点正常工作

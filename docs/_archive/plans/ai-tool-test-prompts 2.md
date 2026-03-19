# AI Tool Test Prompts

用于验证工具定义优化后模型行为是否符合预期的测试用例。

每个用例标注：**目标行为**（期望模型做什么）和 **旧问题**（优化前模型做错了什么）。

---

## T1: 结构化内容用 children，不用 content

**Prompt:**
> 帮我整理一下今天 standup 的内容：前端完成了搜索功能上线，后端修复了同步延迟 bug，设计侧交付了 Settings 页面 mockup。另外，下周需要跟进：性能优化和用户反馈收集。

**目标行为:**
- 创建一个节点（如"Standup 2026-03-12"）
- 用 `children` 存放每条内容，扁平排列
- 不出现 `content` 参数

**旧问题:** 模型把所有内容塞进 `content` 参数作为一段文本

---

## T2: children 扁平化，不建中间分组节点

**Prompt:**
> 我刚读了一篇关于 CRDT 的文章，有几个关键点：1) Yjs 和 Loro 的 merge 策略不同 2) Loro 用 Fugue 算法解决交叉编辑 3) 性能对比下来 Loro 在大文档上更快 4) 但 Yjs 生态更成熟

**目标行为:**
- 创建一个节点（如文章名）
- 4 个要点直接作为 children，扁平排列
- 不创建 "Key Points"、"Summary"、"关键点" 等中间分组节点

**旧问题:** 模型创建 "Key Points" → 子节点1、子节点2... 多了一层不必要的层级

---

## T3: 带标签和字段的批量创建

**Prompt:**
> 创建 3 个任务：1) "实现搜索高亮" 优先级 High，状态 To Do 2) "修复拖拽 bug" 优先级 Medium，状态 In Progress 3) "写测试用例" 优先级 Low，状态 To Do

**目标行为:**
- 创建一个父节点
- 3 个子节点，每个都带 `tags: ["task"]` 和 `fields: {"Priority": "...", "Status": "..."}`
- 用单次 `node_create` 调用（children batch），不是 3 次独立调用

**验证:** 每个子节点都有 tagDef_task 标签，且 Status/Priority 字段值正确

---

## T4: 搜索标签不存在时的错误引导

**Prompt:**
> 搜索所有标记为 "bug" 的节点

**目标行为:**
- 调用 `node_search` 时 `searchTags: ["bug"]`
- 由于 "bug" 标签不存在，返回 `unresolvedTags: ["bug"]` + hint
- 模型应告知用户标签不存在，建议可能的替代标签

**旧问题:** 静默返回空结果，模型回复 "没有找到任何节点"，用户不知道是标签名不对还是真的没有数据

---

## T5: 编辑后的返回值验证

**Prompt:**
> 把 "Design the data model" 这个任务改名为 "Design the graph model"，并加上 meeting 标签

**目标行为:**
- 调用 `node_edit`，返回 `{ updated: ["name", "tags"], tags: ["Meeting", ...] }`
- 返回值不包含 `id`（不重复参数信息）
- 模型确认修改成功，报告新标签列表

**验证:** 返回值中 `updated` 包含 "name" 和 "tags"，`tags` 字段仅在标签变更时出现

---

## T6: 删除节点后的返回值

**Prompt:**
> 删除 "Next meeting on Friday" 这个节点

**目标行为:**
- 模型先搜索找到该节点
- 调用 `node_delete`，返回 `{ action: "trashed", name: "Next meeting on Friday" }`
- 返回值不包含 `id`
- 模型告知已移至回收站

**验证:** 返回值只有 `action` 和 `name`，节点实际在 Trash 下

---

## T7: Undo 的操作报告

**Prompt:**
> （先执行 T5 的编辑操作，然后）撤销刚才的修改

**目标行为:**
- 调用 `undo`，返回 `{ undone: 1, hasMore: ..., reverted: ["node_edit(task_1, \"Design the graph model\")"] }`
- 模型告知撤销了什么操作，而不是只说 "已撤销 1 步"

**旧问题:** 返回只有 `{ undone: 1 }` 无操作详情，模型无法告知用户具体撤销了什么

---

## T8: Undo 不能用于重构

**Prompt:**
> 我有一个节点里写了很长的 description，帮我把内容拆分成子节点

**目标行为:**
- 读取节点内容
- 创建子节点（用 children 或逐个 node_create）
- 然后编辑原节点清除 description（`data: { description: "" }`）
- **不使用 undo** 来 "撤销然后重建"

**旧问题:** 模型用 undo 删除整个节点，再重新创建一个结构不同的节点，导致原节点的 ID、标签、字段值全部丢失

---

## T9: 节点不存在时的错误引导

**Prompt:**
> 读取节点 "nonexistent_123" 的内容

**目标行为:**
- `node_read` 抛出错误：`"Node not found: nonexistent_123. Use node_search to find the correct ID."`
- 模型建议用搜索来查找正确的节点 ID

**旧问题:** 模型收到 "Node not found" 就放弃了，不知道下一步该做什么

---

## T10: 创建引用节点

**Prompt:**
> 在 "My Project" 下面添加一个指向 "Meeting notes - Team standup" 的引用

**目标行为:**
- 先搜索找到两个节点的 ID
- 调用 `node_create` 的 `targetId` 参数创建引用
- 返回 `{ id: "...", parentId: "proj_1", isReference: true, targetId: "note_1" }`

---

## T11: 创建 schema 节点（fieldDef）

**Prompt:**
> 给 task 标签添加一个 "Estimate" 字段，类型是数字

**目标行为:**
- 调用 `node_create`，`parentId` 为 tagDef_task 的 ID
- `data: { type: "fieldDef", fieldType: "number" }`
- `name: "Estimate"`
- 不需要额外的 tags 或 fields 参数

---

## T12: 无标签时设置字段的错误引导

**Prompt:**
> 创建一个叫 "Quick note" 的节点，设置 Status 为 Todo

**目标行为:**
- 创建节点成功，但返回 `unresolvedFields: ["Status"]`
- hint 提示需要先添加标签
- 模型应该建议用户添加 task 标签，或者自动加上 tags: ["task"] 重试

**验证:** 节点被创建了（name = "Quick note"），但没有 Status 字段值

---

## 执行方式

1. 在 soma AI 聊天中依次输入上述 prompt
2. 观察模型的工具调用序列和参数
3. 检查返回值是否符合预期
4. 特别关注：
   - T1/T2: 不出现 `content` 参数，children 扁平
   - T4: 不静默返回空结果
   - T7: undo 返回操作详情
   - T8: 不用 undo 来重构
   - T9/T12: 错误/部分失败有可执行的引导

# Phase 1 验证清单

> nodex review PR #126 时使用。checkout 分支 → `npm run dev` → 加载扩展 → 逐项验证。

---

## 0. 自动化门槛

```bash
gh pr checkout 126
npm run typecheck && npm run check:test-sync && npm run test:run && npm run build
```

全过才继续浏览器验证。

---

## 1. Node tool 基础操作

| # | 操作 | 预期 | ✓ |
|---|------|------|---|
| T1 | Chat: "创建一个笔记叫测试" | Today journal 下出现"测试"节点 | |
| T2 | Chat: "创建一个 #task 叫买咖啡" | 节点有 #task 标签，tagDef 不存在时自动创建 | |
| T3 | Chat: "看看今天的日记有什么" | 返回 children 列表 | |
| T4 | Chat: "给刚才的笔记加上 #meeting" | outliner 中标签实时更新 | |
| T5 | Chat: "把测试移到 Schema 下面" | 节点从 journal 移到 Schema | |
| T6 | Chat: "删掉测试节点" | 节点进 Trash | |
| T7 | Chat: "搜索所有 #task 节点" | 返回匹配结果 | |
| T8 | Chat: "删掉 Journal 节点" | 拒绝（locked 保护） | |

## 2. Undo 隔离

| # | 操作 | 预期 | ✓ |
|---|------|------|---|
| T9 | 手动编辑节点 A → Chat 让 AI 创建节点 B → Chat: "撤回" | B 消失，A 的编辑保留 | |
| T10 | AI 创建节点 → 用户 ⌘Z | AI 创建的节点被撤销 | |
| T11 | 用户编辑 → AI 操作 → 用户编辑 → Chat "撤回" | 只回退 AI 操作，两次用户编辑保留 | |

## 3. System prompt & Context

| # | 操作 | 预期 | ✓ |
|---|------|------|---|
| T12 | 检查 #agent 节点是否存在，编辑其 Rules 子节点 | 下次对话反映新 Rules | |
| T13 | 导航到某节点 → Chat 提问"当前面板是什么" | agent 知道当前面板上下文 | |
| T14 | 用中文提问 / 用英文提问 | 回复语言跟随用户 | |

## 4. API key 迁移

| # | 操作 | 预期 | ✓ |
|---|------|------|---|
| T15 | 旧 chrome.storage 有 key → 启动扩展 | 自动迁移到 Settings 节点字段 + 旧存储清除 | |
| T16 | 在 Settings 节点修改 API Key 字段 | 下次 Chat 使用新 key | |
| T17 | 修改 #agent 节点 Model 字段 | 下次对话使用新 model | |

## 5. Reference & Tool call 渲染

| # | 操作 | 预期 | ✓ |
|---|------|------|---|
| T18 | AI 回复中包含 `<ref>` | 蓝色可点击文本 | |
| T19 | 点击 ref 链接 | PanelStack 导航到该节点 | |
| T20 | AI 回复中包含 `<cite>` | 角标数字，hover 显示摘要 | |
| T21 | 删除被引用的节点 → 查看 Chat | 灰色 + 删除线 | |
| T22 | AI 执行 node.create | tool call 默认折叠，点击展开 | |

## 6. Chat 持久化

| # | 操作 | 预期 | ✓ |
|---|------|------|---|
| T23 | 对话 5+ 条 → 关闭 Side Panel → 重新打开 | 对话恢复 | |
| T24 | 点击"新对话"按钮 | 清空当前，开始新对话 | |
| T25 | 发送大量消息（接近 100 条） | 旧消息裁剪，不崩溃 | |

## 7. ⌘K 集成

| # | 操作 | 预期 | ✓ |
|---|------|------|---|
| T26 | ⌘K → 输入"帮我整理笔记" | 出现 "Ask AI: ..." 选项 | |
| T27 | 选择 "Ask AI" 选项 | ChatDrawer 打开 + 消息发送 | |

## 8. 回归检查

| # | 功能 | ✓ |
|---|------|---|
| R1 | 大纲基础操作（创建/编辑/拖拽/缩进） | |
| R2 | 标签绑定/解绑 | |
| R3 | ⌘Z/⌘⇧Z 非 AI 场景正常 | |
| R4 | ⌘K 搜索节点正常 | |
| R5 | Web Clip 正常 | |
| R6 | 高亮功能正常 | |

# ⌘K Command Palette — Chat 搜索 + AI 模式

> 状态: Planned
> 日期: 2026-03-18

## 动机

当前 ⌘K 只搜索节点和命令。Chat 历史无法搜索，新建 Chat 只能通过 toolbar ✦ 按钮。"Ask AI" 入口藏在搜索无结果时才出现，发现性低。

参考 Raycast 的双模式设计（混合列表 + Tab 切换 AI 模式），将 Chat 完整融入 ⌘K。

## 设计

### 图标约定

| 场景 | 图标 | 说明 |
|------|------|------|
| 新建聊天 / Ask AI | `MessageCircleDashed` | 虚线气泡 = 待创建 |
| 历史聊天 session | `MessageCircle` | 实线气泡 = 已有对话 |

### 搜索模式（默认，当前基础上增强）

**空态 Suggestions：**
- 最近 1-2 个 Chat session（MessageCircle 图标，typeLabel `Chat`）混入 Suggestions
- "New Chat" 命令（MessageCircleDashed 图标）混入 Commands

**有输入时：**
- Chat 历史参与 fuzzy match（按 title），结果归入 "Chats" 分组
- "Ask AI: {query}" **始终显示**在列表底部（去掉当前 `searchResults.length === 0` 限制）
- "Create: {query}" 保持在 Ask AI 上方
- Ask AI 图标从 Sparkles 改为 MessageCircleDashed

```
┌─────────────────────────────────────────────┐
│ 天气                          Ask AI  Tab   │
├─────────────────────────────────────────────┤
│ Nodes                                       │
│   ● 成都天气 2026-03-17          Node       │
│ Chats                                       │
│   💬 天气查询与建议               Chat       │
│ ─────                                       │
│   + Create: 天气                 Create     │
│   💬̤ Ask AI: 天气                Ask AI     │
├─────────────────────────────────────────────┤
│                            Open Node  ↵     │
└─────────────────────────────────────────────┘
```

### AI 模式（Tab 切换）

搜索栏右侧显示 `Ask AI` + `Tab` 按钮。按 Tab 键或点击按钮切换。

**空态：**
- 最近 Chat session 列表
- "New Chat" 命令

**有输入时：**
- fuzzy match Chat 历史
- 底部 "Ask AI: {query}"，Enter 新建 Chat + 发送

**退出：** `←` 按钮 / Esc / Shift+Tab → 返回搜索模式

```
┌─────────────────────────────────────────────┐
│ ← Ask AI anything...                  Esc   │
├─────────────────────────────────────────────┤
│ Recent Chats                                │
│   💬 天气查询与建议               Chat       │
│   💬 代码 Review 讨论             Chat       │
│   💬 AIOS 研究笔记               Chat       │
│ Commands                                    │
│   💬̤ New Chat                    Command    │
├─────────────────────────────────────────────┤
│                             Ask AI  ↵       │
└─────────────────────────────────────────────┘
```

## 已有基础

| 组件 | 状态 | 说明 |
|------|------|------|
| Ask AI 入口 | ✅ 已有 | `CommandPalette.tsx:276`，条件需放宽 |
| `openChatWithPrompt()` | ✅ 已有 | `chat-panel-actions.ts`，找/建 Chat 面板 + 发送 |
| `pendingChatPrompt` 状态 | ✅ 已有 | `ui-store.ts`，ChatPanel 消费 |
| `listChatSessionMetas()` | ✅ 已有 | `ai-persistence.ts`，返回 `{ id, title, updatedAt }[]` |
| Chat session title | ✅ 已有 | LLM 自动生成，持久化到 IndexedDB |
| `MessageCircle` 图标 | ✅ 已有 | `icons.ts` |
| `MessageCircleDashed` 图标 | ❌ 需导出 | lucide-react 中存在 |
| AI 模式 Tab 切换 | ❌ 需实现 | CommandPalette 新增 `aiMode` state |

## 文件清单

| 文件 | 动作 | 内容 |
|------|------|------|
| `src/lib/icons.ts` | 修改 | 导出 `MessageCircleDashed` |
| `src/lib/palette-commands.ts` | 修改 | 注册 "New Chat" 命令 |
| `src/components/search/CommandPalette.tsx` | 修改 | Chat 历史搜索 + Ask AI 始终可见 + AI 模式 Tab 切换 |
| `src/lib/chat-panel-actions.ts` | 可能微调 | 确认 `openChatPanel()` 无参版本可用 |

## 实施顺序

1. `icons.ts` — 导出 `MessageCircleDashed`
2. `palette-commands.ts` — "New Chat" 命令
3. `CommandPalette.tsx` — 搜索模式增强（Chat 历史 + Ask AI 始终可见 + 图标）
4. `CommandPalette.tsx` — AI 模式（Tab 切换 + 独立视图）
5. 测试 + verify

Step 3 可独立交付，Step 4 在此基础上追加。

## 验证要点

- [ ] 空态 Suggestions 中显示最近 Chat session
- [ ] 输入关键字匹配 Chat title → Chats 分组中显示
- [ ] "Ask AI: {query}" 在有输入时始终显示（不论是否有节点匹配）
- [ ] "New Chat" 命令可搜索、可执行
- [ ] Tab 键切换到 AI 模式，显示 Chat 历史列表
- [ ] AI 模式输入文本 → Enter → 新建 Chat + 发送 prompt
- [ ] Esc / ← 退出 AI 模式回到搜索模式
- [ ] 选中历史 Chat → 打开对应 session 面板

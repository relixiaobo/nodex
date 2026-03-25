# Task Board

> 所有任务的单一事实来源。Agent 通过 `Read docs/TASKS.md` 获取全局状态。
>
> **维护规则**：
> - nodex 创建 feature branch + Draft PR（PR body 是 Dev Agent 唯一指令来源）
> - Dev Agent 在对应 worktree 中 checkout branch 执行，完成后 push + `gh pr ready`
> - **禁止 Dev Agent 执行 `gh pr merge`** — 只有 nodex 有权合并 PR
> - nodex merge 后更新此文件 + `docs/changelog-next.md`
>
> **历史记录**：已完成任务超过一周后归档到 `docs/_archive/COMPLETED-HISTORY.md`

---

## Agent 状态

| 工作区 | 分支 | 任务 | 状态 |
|--------|------|------|------|
| nodex-claude | claude/chat-at-mention | @ 引用节点 (#179) | 待启动 |
| nodex-claude-2 | claude-2/tana-import | Tana 数据智能导入 | 待启动 |
| nodex-gemini | — | 空闲 | — |
| nodex-codex | codex/official-skill-sync | Official Skill Sync (#178) | 待启动 |

---

## 进行中

---

## 待办

### v0.3 — Chat Drawer + AI 体验（当前阶段）

> **产品方向**：Think where you read。Outliner 常驻 + Chat 抽屉随时呼出，AI 作为通用思考伙伴。详见 `docs/plans/ai-first-product-vision.md` + `docs/ai-personality.md`。

#### Chat 体验

- [ ] **@ 引用节点** — Chat 输入框 `@` 触发节点选择器，精确注入上下文
- [x] ~~**View Context Injection**~~ (#174) — system reminder 注入可见树快照

#### AI 能力

- [ ] Spark 质量提升 — 三轮认知压缩优化 + 进度 UI
- [ ] 碰撞策略 v0→v1 — agent 驱动 node_search 渐进式碰撞
- [ ] Taste 学习 — Schema evolution skill（OpLog Correction → #skill 规则）
- [ ] /review 命令 — 认知镜像（新结构、升级、矛盾、同构）

#### 自定义 Provider + 模型

- [x] ~~Phase 1: 自定义模型字段~~ (#151)
- [ ] **Phase 2: 模型自动发现** — "Fetch Models" 调用 `/v1/models` 端点自动填充 Models 字段
- [ ] **Phase 3: 内置 Provider 预设** — Qwen/DeepSeek/Ollama 等预填 Base URL，用户只需填 API Key

#### 其他

- [ ] YouTube 抓取增强 — 获取视频 transcript
- [ ] 上下文感知 Sidebar — URL 匹配 → 关键词匹配 → 共读模式

---

### 上架准备

- [ ] **产品展示页** — 静态落地页（产品介绍 + 截图 + 安装链接 + 隐私政策）
- [ ] **About 101 板块** — 产品使用指南/教程

---

### Connect 增强

- [ ] Search Node AI 自然语言过滤 — 可编辑描述行 + AI 生成 queryCondition
- [ ] Table View 基础 — viewDef 节点 + 字段列渲染 + 列宽调整
- [ ] Supertags 完善 — Convert to supertag / Title expression / Pinned fields
- [ ] 日期增强 — 自然语言日期解析 / 日记模板

---

### 图片节点支持

> 设计：`docs/plans/image-node-support.md`

- [ ] Phase 1a: 后端基础设施
- [ ] Phase 1b: 客户端管线 + Editor 粘贴
- [ ] Phase 1c: Slash command
- [ ] Phase 2: AI 集成
- [ ] Phase 3: 生态

---

### 编辑器增强

- [ ] 合并节点 — 选中多个重复节点 → 合并为一个
- [ ] 数学公式渲染 — KaTeX
- [ ] Floating Toolbar: @ Reference 按钮
- [ ] Slash Command 后续 — Paste / Search node / Checklist
- [ ] 性能基线测量

---

### 账号与数据管理

- [ ] **删除账号数据** — 后端 `DELETE /api/user/data` 清除用户在 D1/R2 的所有数据；前端在 Settings 提供入口 + 二次确认

---

### 多工作区 & 协作

- [ ] 工作区模型 — 元数据 + 切换器 UI
- [ ] 独立 LoroDoc — 每个工作区独立持久化和同步
- [ ] 权限模型 — owner / editor / viewer
- [ ] 官方工作区 — soma 维护的只读内容
- [ ] 协作工作区 — 多人编辑

---

### 远期

- [ ] 异步任务 — 侧边栏保持开着 + tab group 隔离 + 任务感知 Chat UI
- [ ] 多 Agent 协作 — Agent 编排 + subagent 委派
- [ ] 视图类型 — Cards / Calendar / List & Tabs（需要独立窗口 / Web 版）

---

## 已完成（最近一周）

| 日期 | 任务 | Agent | PR |
|------|------|-------|-----|
| 2026-03-24 | 新图标 + 截图 + store 资产 — 三色立方体 + 真实 app 截图 | claude | #177 |
| 2026-03-24 | 上架资料刷新 — store listing + landing page + 截图 + 定位统一 | claude | #176 |
| 2026-03-24 | View Context Injection — AI 看到用户可见的 outliner 树 | codex | #174 |
| 2026-03-24 | Chat Embed 交互修复 — NodeEmbed 限高 + dropdown portal 迁移 + focus 隔离 | codex | #175 |
| 2026-03-23 | Expand key 作用域隔离 — chat embed 和 outliner 独立展开状态 | codex | #173 |
| 2026-03-23 | Chat Drawer 布局 — Outliner 底层 + Chat 底部抽屉 + 单层 full-bleed | codex | #172 |
| 2026-03-21 | Toggle Layout — Chat/Node 双视角切换 + 状态保持 | codex | #171 |
| 2026-03-21 | Node 工具重构 — Tana Paste 统一格式 + search node 创建 | codex | #170 |
| 2026-03-20 | v0.2.0 发版 — Think with your AI | nodex | — |
| 2026-03-20 | AI 人格设计文档 + system prompt 重写 + skills 升级 | nodex | — |
| 2026-03-20 | 新用户引导 — 强制登录 + 内联 API key + 启动偏好 | codex | #163 |
| 2026-03-20 | 工具调用分组折叠（单消息内） | claude | #164 |
| 2026-03-20 | Chat 面板头部一致性 | codex | #162 |
| 2026-03-20 | node_read 无参数浏览 + Settings AI 分组 | codex | #161 |
| 2026-03-20 | extensible cite types (node/chat/url) | claude | #160 |
| 2026-03-20 | past_chats fuzzy search 升级 | codex | #159 |
| 2026-03-20 | Chat 节点展示 — ref/cite 浮窗 + `<node />` 内嵌 + 首屏 Chat | claude | #158 |
| 2026-03-20 | past_chats 跨会话记忆工具 + prompt 架构重构 | codex | #157 |
| 2026-03-20 | 多项 UI 修复 — citation 对齐/浮窗边框/dropdown 对齐/search node 图标去重/模型选择持久化/onboarding 同步闪烁/options picker | nodex | — |

> 更早的已完成记录见 `docs/_archive/COMPLETED-HISTORY.md`

### 已关闭的远期/非开发任务

Supabase 实时同步 (#34，已被 Cloudflare Sync 取代)、离线模式增强 (#35)、导入/导出 (#36)、Command Nodes (#37)、Title Expressions (#38)、Publishing (#39)、Input API (#40)。

# Nodex — Codex Agent Instructions

> 本文件供 OpenAI Codex 读取。完整项目规范见 `CLAUDE.md`，多 Agent 协作规范见 `docs/AGENT-COLLABORATION.md`。

## 你的身份

你是 **nodex-codex**，功能开发 Agent。

- 分支前缀：`codex/<feature>`
- Dev Server 端口：`5200`（`PORT=5200 npm run dev:test`）
- 主要职责：功能开发、提交 PR
- 次要职责：Bug 修复

## 必读文档

| 文档 | 内容 |
|------|------|
| `CLAUDE.md` | 项目概述、技术栈、数据模型、代码约定、测试策略 |
| `docs/AGENT-COLLABORATION.md` | 工作流、任务认领、Draft PR、文件锁、交接协议 |
| `docs/features/*.md` | 特性行为规格（实现时的权威参考） |
| `docs/design-system.md` | UI 视觉标准 |

## 不适用于你的内容

`CLAUDE.md` 中以下段落为 Claude Code 特有，你无需关注：

- **MCP 工具分工**（`chrome-devtools` / `claude-in-chrome`）— 你无法使用这些工具
- **`/self-test` Skill** — Claude Code 专属命令
- **Standalone 测试环境的 Store 全局访问**（`window.__nodeStore`）— 仅用于浏览器自动化验证
- **人工验收准入标准** — 由 nodex（review agent）管理

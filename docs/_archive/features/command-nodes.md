# Feature: Command Nodes（AI 命令节点）

> Phase 4+ | 设计方向 | 远期 AI 功能的数据模型设计

## 概述

Command Nodes 是 Tana 中将 AI prompt 模板、API 调用、自动化操作存为节点的机制。Nodex 的 AI 功能应遵循同样的"一切皆节点"路线，确保 AI 配置复用现有的节点/字段/标签基础设施，不需要独立的配置系统。

## 设计方向（非最终规格）

> 本文档记录设计原则和方向，不是详细的实现规格。实现前需要进一步调研 Tana Command Nodes 的具体行为。

### 核心原则

**Prompt 模板 = 节点，输入输出 = 字段，执行历史 = children。**

Command Node 不是硬编码的 JSON 配置文件，而是标准节点，可以被编辑、搜索、引用、模板化。

### 数据模型方向

```
CommandNode (doc_type: 'command')
  ├── props.name: "Summarize"                ← 命令名称（用户可编辑）
  ├── props.description: "Generate summary"  ← 命令描述
  ├── meta: [tagTupleId, promptTupleId]
  │     ├── Tuple [SYS_A13, commandTagDefId] ← 命令标签（分类）
  │     └── Tuple [SYS_A160, promptNode]     ← AI 指令（prompt 模板内容）
  └── children:
        ├── Tuple [inputAttrDefId, ...]      ← 输入参数定义（字段）
        ├── Tuple [outputAttrDefId, ...]     ← 输出格式定义（字段）
        └── resultNode₁, resultNode₂, ...    ← 每次执行的结果（children 列表）
```

### 关键设计点

| 维度 | 设计方向 | 与"一切皆节点"的关系 |
|------|----------|---------------------|
| Prompt 模板 | 节点内容（`props.name` 或专用 children） | 可编辑、可引用、可搜索 |
| 输入参数 | attrDef 字段定义（复用 Field 体系） | 参数类型验证复用字段验证；参数 UI 复用 FieldRow |
| 输出 | children（AI 生成的内容节点） | 结果自然可被引用、移动、组织 |
| 执行历史 | children 列表（时间线） | 每次执行创建结果子节点，可追溯 |
| 触发方式 | Slash command（`/summarize`）或标签事件 | 命令名称 = slash command 名称 |
| 模板化 | Supertag 模板中包含 Command 配置 | "所有 #meeting 自动生成纪要" = #meeting 模板字段 |

### Tana 参考

Tana 导出数据中的相关节点：

| 类型 | 数量 | 说明 |
|------|------|------|
| `doc_type: 'command'` | 45 | 系统命令定义 |
| `doc_type: 'systemTool'` | 30 | 系统工具 |
| `doc_type: 'chatbot'` | 1 | 聊天机器人定义 |

相关系统属性：

| 常量 | 值 | 用途 |
|------|-----|------|
| `SYS_A.AI_INSTRUCTIONS` | `SYS_A160` | AI 指令内容 |
| `SYS_A.AI_PAYLOAD` | `SYS_A176` | AI 请求 payload |
| `SYS_A.CHATBOT_CONFIG` | `SYS_A89` | 聊天机器人配置 |
| `SYS_A.COMMANDS_FULL_MENU` | `SYS_A175` | 命令菜单配置 |

### 与 AI 网关的关系

Command Node 定义"做什么"（prompt、参数、输出格式），AI 网关（`docs/features/ai-chat-agent-gateway.md`）负责"怎么做"（模型路由、API 调用、流式输出）。两者正交：

```
用户触发 /summarize
  → 读取 CommandNode 配置（prompt + 输入参数）
  → 拼装请求（网关负责）
  → POST /ai/chat（网关执行）
  → 结果写入 CommandNode.children（作为新子节点）
```

## 不做的事

- 不在 Command Node 中存储 API key 或认证信息（由网关层管理）
- 不设计独立的"命令配置页面"（配置页 = 标准 NodePanel + 系统标签模板）
- 不引入新的 docType（复用 `command`）

## 前置依赖

| 依赖 | 说明 |
|------|------|
| AI 网关（Phase A） | `/ai/chat` 统一入口 |
| Slash Command 扩展 | 动态注册用户自定义命令 |
| Supertag 事件触发 | 标签应用时自动执行命令 |

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-16 | Command Nodes 遵循"一切皆节点"路线 | 复用节点/字段/标签基础设施，不需要独立配置系统 |
| 2026-02-16 | 输入参数 = attrDef 字段 | 复用 FieldRow 渲染和字段验证，不需要独立的参数 UI |
| 2026-02-16 | 执行结果 = children | 结果自然可被引用、移动、组织，形成时间线 |
| 2026-02-16 | 配置页 = 标准 NodePanel | 与 tagDef/attrDef 配置页一致，不需要专门 UI |

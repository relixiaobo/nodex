# Feature: AI Chat / Agent 网关架构

> Phase 3 | 规划中 | 面向 Chrome Side Panel + Supabase 的统一 AI 请求层

## 概述

本文档定义 Nodex 的 AI Chat / Agent 接入架构，目标是在不改动前端主干交互的前提下，将 AI 请求统一收敛到 Serverless 网关，支持两种模式：

- BYOK（Bring Your Own Key）：用户填写 `apiKey + baseURL`
- Managed：平台提供封装好的模型路由与密钥

核心原则：前端只调用一个 AI 入口，模型厂商细节全部放在网关层处理。

## 背景与目标

当前项目已规划 AI Chat / AI Command Nodes（Phase 3），并且基础设施方案已经预留 Supabase Edge Functions 作为后端执行层。

本 feature 的目标是补齐 AI 路径的行为定义，避免后续在“前端直连模型”与“服务端代理模型”之间反复重构。

## 非目标

- 不在本阶段引入复杂的长期常驻后端（VM/K8s）
- 不在本阶段定义所有 Agent 工具实现细节
- 不在本阶段强制上线托管计费体系

## 总体架构

### 1) 请求路径统一

- 统一入口：`/ai/chat`（后续可扩展 `/ai/agent/*`）
- 前端不直接调用模型厂商 API
- 网关负责 provider 路由、重试、错误归一化、流式转发

### 2) 双模式共存

- `mode = byok`
  - 用户提供 `apiKey + baseURL`
  - 默认不持久化 key；优先“随请求传递”
- `mode = managed`
  - 使用平台密钥（存于函数环境变量）
  - 可附加配额、模型白名单、限流策略

### 3) 上下文分层

- 前端：轻上下文
  - 当前输入、当前页面临时状态、流式渲染状态
- 网关：重上下文（核心）
  - 历史消息拼装、RAG 检索、token 预算、摘要裁剪、tool 结果合并
- 数据层：长期记忆
  - 消息历史、会话摘要、Agent 运行轨迹、可选向量索引

## 为什么不建议长期“纯前端直连模型”

- 供应商切换成本高：前端需要适配每个厂商差异
- 观测性不足：难以统一错误码、重试和审计
- 风控能力弱：难做统一限流、防滥用、策略开关
- 演进成本高：从 BYOK 迁移到 Managed 时会出现较大重构

## 对现有架构的影响

### 不变

- Chrome Extension（WXT + React）主干不变
- Supabase 数据层（Auth/RLS/Postgres）主干不变

### 新增

- 新增 AI 网关函数（Supabase Edge Functions）
- 新增 AI 接口契约（请求/响应/错误码/流式事件）
- 新增 AI 可观测性（请求日志、失败率、P95、限流指标）

### 可能调整

- 扩展权限策略可收敛为“仅访问自有 API 域名”
- AI 相关前端服务层改为调用统一网关，不再直连第三方 baseURL

## 接口契约（草案）

### `POST /ai/chat`

请求示例（简化）：

```json
{
  "mode": "byok",
  "provider": "openai-compatible",
  "model": "gpt-4.1-mini",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "<user-key-or-empty>",
  "conversationId": "conv_xxx",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "stream": true
}
```

响应示例（非流式）：

```json
{
  "conversationId": "conv_xxx",
  "messageId": "msg_xxx",
  "outputText": "...",
  "usage": {
    "inputTokens": 1234,
    "outputTokens": 321
  }
}
```

流式建议：SSE，事件统一为 `delta` / `done` / `error`。

## 安全与合规边界

- BYOK 默认策略：不落库存储 key（降低合规风险）
- 如需持久化 BYOK：
  - 必须加密存储
  - 日志中禁止输出明文 key
- 仅允许 `https` baseURL（`localhost` 可作为开发例外）
- 网关必须具备基础限流（按用户/工作区）

## Agent 额外约束

- Agent 的步骤状态不应只保存在前端内存
- 至少持久化以下数据：
  - `run_id`
  - 当前阶段状态（running/succeeded/failed）
  - tool 调用轨迹与错误信息
- 页面刷新后可恢复执行态或展示最终结果

## 分阶段落地建议

### Phase A（最小可用）

- 上线 `/ai/chat` 统一入口
- 默认 BYOK 模式
- 支持流式输出 + 基础错误归一化

### Phase B（可运营）

- 增加 Managed 模式
- 增加限流、审计日志、模型白名单
- 增加会话摘要与上下文裁剪策略

### Phase C（Agent 增强）

- 增加 `/ai/agent/*` 任务接口
- 引入异步队列消费长任务
- 增加 Agent 状态恢复与失败重试

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-14 | AI 请求收敛到 Serverless 网关 | 统一协议、降低前端耦合、便于后续演进 |
| 2026-02-14 | 支持 BYOK + Managed 双模式 | 兼顾早期可用与后续商业化/运营能力 |
| 2026-02-14 | 上下文采用三层分工（前端轻、网关重、数据层长期） | 平衡交互性能、稳定性和可恢复性 |

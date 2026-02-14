# Nodex 基础设施方案（1000 用户阶段）

> 更新时间：2026-02-14  
> 适用范围：Chrome 扩展（WXT）+ Supabase 数据层 + 后续 Telegram/RSS/Agent 能力

## 1. 目标与策略

- 第一阶段按 **1000 注册用户**上线（约 100-300 DAU，峰值并发 30-80）。
- 采用 **托管优先**：先用 `Supabase + Serverless + Queue` 快速上线。
- 后续按指标触发迁移，避免过早自建复杂后端。

## 2. 核心结论

### 2.1 是否需要“服务器”

- 仅做扩展 + Supabase：不一定需要自建传统服务器。
- 一旦接入 Telegram webhook、RSS 抓取、Agent 长任务：需要后端执行层（可用 Serverless，不必先自建 VM）。

### 2.2 Serverless 选型

- 第一阶段推荐：**Supabase Edge Functions**（与现有 Supabase 最一致，改造成本最低）。
- Cloudflare Workers 是后续扩展方案，不是第一阶段必选。

### 2.3 后续功能迭代是否“自动更新”

- 不会自动更新所有能力。
- 需要通过 CI/CD 发布扩展版本、部署函数、执行数据库 migration 才会生效。
- 需要显式配置 feature flag、版本发布和回滚策略。

## 3. 第一阶段（1000 用户）目标架构

### 前端
- Chrome Extension（WXT + React）
- Side Panel UI + 本地缓存（chrome.storage）

### 数据与认证
- Supabase Postgres（生产库）
- Supabase Auth（含 Google 登录）
- RLS（workspace 维度权限）
- Realtime（多端同步）

### 后端执行层
- Supabase Edge Functions，承接：
- Telegram webhook 入口
- RSS 源管理与手动触发入口
- 敏感密钥相关逻辑（Bot Token、第三方 API key）

### 异步与调度
- Queue（建议基于 Supabase Queues/pgmq 思路）
- Worker（消费 RSS 抓取、Agent 任务）
- Cron（每 5-15 分钟错峰拉取 RSS）

### 可观测性
- Sentry（前端 + 函数）
- 告警：webhook 错误率、队列堆积、抓取失败率、慢查询

### 交付与环境
- `staging` + `prod` 两套环境
- CI：`typecheck + build + migration check`

## 4. Google 登录落地要点

- 使用 `Supabase Auth + Google Provider`。
- 扩展端只保留 `anon key`；`client secret` 只在 Supabase/后端。
- 需要固定生产扩展 ID，避免 OAuth redirect 地址变化。
- 明确首次登录流程（自动创建个人 workspace，或进入已有 workspace）。
- 自动写入 `workspace_members`。

## 5. Telegram / RSS 接入带来的新增要求

### Telegram
- 需要公网 HTTPS webhook 入口（函数即可）。
- 需要账号绑定：Telegram 用户 ↔ Nodex 用户/workspace。
- 需要消息路由、权限控制、审计日志。

### RSS
- 需要定时抓取（cron）+ 异步执行（queue/worker）。
- 需要去重与幂等（同一文章只入库一次）。
- 需要失败重试、限流、源健康检查。

## 6. 1000 用户阶段建议基线参数

- RSS Worker 并发：`5-10`
- Agent Worker 并发：`3-5`
- 任务重试：`3 次 + 指数退避`
- Cron：`5-15 分钟`分桶错峰执行
- Redis（可选但建议）：限流、去重、短会话状态

## 7. 成本口径（讨论版）

> 以 2026-02-14 讨论口径估算，实际以官方账单与当期定价为准。

- 方案 A：Supabase（含 Edge Functions）+ Supabase Queue  
  常见区间约：`$25 ~ $50 / 月`（1000 用户早期）
- 方案 B：Supabase + Cloudflare Workers/Queues  
  常见区间约：`$30 ~ $80 / 月`（取决于任务量与调用量）

说明：
- 初期通常不是“数据库容量”先爆，而是 webhook/队列/任务执行量先成为瓶颈。

## 8. 迁移触发阈值（连续 2 周满足任一项）

- 队列堆积时长 > `10 分钟`
- webhook P95 > `1 秒`
- RSS/Agent 失败率 > `2%`
- Serverless 成本持续超预算（例如 > `$300/月`）
- 长任务（>60s）显著增多，影响稳定性

## 9. 迁移路线（第二阶段）

- 保持 Supabase 数据层不动（先不迁库）。
- 先拆“执行层”：将 worker 迁到容器/常驻服务。
- 采用渐进迁移：`双写队列 -> 影子消费 -> 切流 -> 回滚开关`。
- webhook 可先保留 serverless，后续再切。

## 10. 防返工设计（从第一天开始）

- 统一 Job Schema：`idempotency_key`、`retry_count`、`status`
- 函数仅做入口，业务逻辑放 service/domain 层
- 外部事件落库（event log / outbox），支持重放
- 全部结构变更走 migration，不手改线上表
- 配置分层（env + feature flag），避免平台耦合

## 11. 阶段执行清单

### 阶段 1（上线前）
- 完成 Google 登录闭环（含 workspace_members 初始化）
- 完成 Telegram webhook 最小闭环（收消息 -> 写入 workspace）
- 完成 RSS 最小闭环（抓标题/链接/摘要 -> 写入 Inbox）
- 接入 Sentry 与基础告警

### 阶段 2（上线后 2-4 周）
- 补全重试、限流、审计日志
- 观察指标，优化任务并发与重试策略
- 增加 feature flag 与灰度发布

### 阶段 3（触发阈值后）
- 拆分执行层到常驻 worker
- 灰度迁移并验证回滚路径

# Auth 去 Supabase（Cloudflare-only）迁移评估草案

> 状态: **已立项 — Sync Phase 1 Step 0 前置任务** | 创建: 2026-02-22 | 作者: nodex-codex | 修订: nodex (2026-02-23)
>
> 本文评估”完全移除 Supabase 依赖”的可行性与成本。
> **决策结论**：Auth PoC 作为 Sync 实施计划 Step 0 前置任务执行，不延后。
> 详见 `docs/plans/sync-incremental-impl.md` § Step 0。

---

## 一、结论（先给答案）

**可以完全移除 Supabase。Auth PoC 已纳入 Sync 实施主线作为 Step 0 前置任务。**

- **可行性**：高（Cloudflare 侧可承载计算、存储、元数据；Auth 可用开源方案 + D1 自建）
- **工程成本**：中等偏高（认证系统迁移，而非配置切换）
- **执行时机**：**Sync Phase 1 Step 0（前置）**——在写 sync Worker 代码前完成 Auth PoC

**推荐路线（如立项）**：
1. 先做 **PoC**（`Better Auth + D1 + Workers`，保留 Supabase 并行）
2. 验证 Chrome Extension 登录链路、session 刷新、登出、恢复
3. 通过后再制定正式迁移计划（用户迁移/灰度/回滚）

---

## 二、为什么会有这个问题（背景）

PR #79 在同步方案评审后，Sync 数据面已经收敛到：

- Cloudflare Workers（API）
- Cloudflare R2（CRDT blob）
- Cloudflare D1（sync 元数据）

此时 `Supabase` 在系统中的主要职责只剩：

- Google OAuth 登录
- 用户 session / refresh token
- JWT 签发（供 Worker 验证）

因此出现自然问题：既然同步数据面都在 Cloudflare，是否也能把 Auth 迁走，进一步统一平台与降低成本。

---

## 三、当前系统中 Supabase 的实际参与面（代码现状）

当前认证使用面相对集中，迁移范围可控，但不是零成本：

- `src/lib/auth.ts`
  - `signInWithGoogle()`：`chrome.identity.launchWebAuthFlow` + **Supabase PKCE OAuth**
  - `exchangeCodeForSession()`：由 Supabase 完成 code → session 交换
  - `getCurrentUser()` / `onAuthStateChange()` / `signOut()`
- `src/services/supabase.ts`
  - `@supabase/supabase-js` 初始化与单例管理（PKCE flow）
- `src/stores/workspace-store.ts`
  - `initAuth()`、登录/登出、认证状态恢复依赖 `lib/auth.ts`
- `src/components/auth/*`
  - 登录 UI / 用户菜单（依赖 store 状态，不强绑定 Supabase SDK）

**关键现实约束**（会影响迁移成本）：
- 现有实现利用 Supabase 的 OAuth 托管能力，规避了部分 Google OAuth 配置复杂度（见 `src/lib/auth.ts` 注释）
- 去 Supabase 后，需要自行替换这条“PKCE + 会话 + 刷新”链路

---

## 四、Cloudflare-only 的含义（边界定义）

这里的“Cloudflare-only”指 **同步与认证的数据面/服务面都不再依赖 Supabase**：

- 保留：Cloudflare Workers / R2 / D1
- 移除：Supabase Auth（及其 JWT/session）
- 替换后需提供：
  - Google OAuth 登录
  - 用户资料读取
  - session / refresh token
  - 认证状态恢复
  - Worker 端鉴权与会话校验

**不在本草案范围**：
- Email/Password、Magic Link、MFA（如果未来要做，成本会显著上升）
- 多组织/团队管理
- 细粒度权限模型（可后续叠加）

---

## 五、可选方案对比（Cloudflare 生态 + 开源方案）

### 方案 A：Cloudflare Access（不推荐作为直接替代）

**定位**：Zero Trust / 应用入口访问控制，不是应用内终端用户 Auth 系统。

**优点**
- Cloudflare 官方产品，稳定
- 配置简单（保护 Web 应用入口）

**问题**
- 不等价于 Supabase Auth 的“应用内用户系统”
- 对 Chrome 扩展内的用户会话/refresh token/用户资料模型支持不匹配

**结论**
- 不适合作为 Nodex 当前“用户登录 + 应用内 session”直接替代方案

### 方案 B：`workers-oauth-provider`（官方开源基础组件，不是完整方案）

**定位**：OAuth Provider framework（协议组件）

**优点**
- 官方开源，Cloudflare 一方维护
- 可复用 OAuth 协议流程组件

**问题**
- 不是开箱即用 Auth 平台
- 仍需自行实现用户系统、登录 UI、授权逻辑、session 管理

**结论**
- 可作为底层构件参考，不适合作为 v1 迁移的“低成本替代”

### 方案 C：Auth.js + D1（可行，需做 Worker/Extension 适配）

**定位**：成熟 Auth 框架；已有 D1 adapter

**优点**
- 生态成熟、文档较全
- D1 adapter 已有现成支持
- Google OAuth 等 provider 现成

**问题**
- 更常见于 Web/SSR 框架场景（Next.js 等）
- 需确认在当前 `Chrome Extension + Workers API` 架构下的集成 ergonomics（非不能用，但要做适配）

**结论**
- 可行候选，适合做 PoC 对照组

### 方案 D：Better Auth + D1（推荐优先 PoC）

**定位**：更偏 framework-agnostic 的现代 Auth 方案，官方文档对 Cloudflare/D1 有明确支持路径

**优点**
- Cloudflare Workers + D1 路径清晰
- 相比完全自建，显著降低实现成本
- 适合先做“只支持 Google OAuth”的最小认证面

**问题**
- 仍需迁移现有 auth API 抽象与 extension 登录流程
- 需要验证与 `chrome.identity.launchWebAuthFlow` 的配合细节

**结论**
- **推荐作为首选 PoC**

### 方案 E：完全自建（Worker + Google OAuth + D1）

**优点**
- 平台统一、可控性最高
- 无额外框架依赖

**问题**
- 认证安全细节全部自担（state/PKCE/session/refresh/replay/rotation）
- 测试与长期维护成本最高

**结论**
- 除非现成方案无法满足扩展场景，否则不建议作为第一选择

---

## 六、成本判断（回答“是否可能重构成本不高”）

### 6.1 哪些部分可能“没那么贵”

如果目标严格收敛为：
- 仅 Google OAuth
- 单用户工作区（当前与 `workspace-store` 的假设一致）
- 不做邮箱密码 / MFA / 团队权限

则迁移成本确实可能低于直觉，原因是：
- 认证代码集中（`src/lib/auth.ts`, `src/services/supabase.ts`, `src/stores/workspace-store.ts`）
- UI 层主要依赖 store 抽象，不深度耦合 Supabase SDK
- D1 已在同步计划中引入，可复用作为 auth metadata / session store

### 6.2 哪些部分仍然是“真正成本”

以下不是配置替换，而是需要重写与验证的链路：

1. **OAuth 回调与 PKCE 交换**
   - 当前由 Supabase 托管；迁移后需由 Worker/Auth 框架处理
2. **session / refresh token 生命周期**
   - 启动恢复、过期、刷新失败、登出一致性
3. **Worker 鉴权接口**
   - 当前 sync Worker 验 Supabase JWT；迁移后需改为新 JWT/session 校验
4. **用户迁移 / 重新登录策略**
   - 是否迁移现有 Supabase 用户 ID 到新用户表
5. **回归测试**
   - 尤其是扩展端 `chrome.identity` 的实际交互与回调 URL

**判断**：
- “有现成方案，所以可能不高”这句话 **部分成立**
- 但前提是 **采用成熟框架 + 控制需求范围 + 先做 PoC**

---

## 七、迁移影响范围（按代码与配置）

### 7.1 必改（高概率）

- `src/lib/auth.ts`
  - Supabase PKCE 登录流替换为新方案（仍可保留 `chrome.identity.launchWebAuthFlow`）
- `src/services/supabase.ts`
  - 删除或替换为新的 auth client/service（如 `src/services/auth-client.ts`）
- `src/stores/workspace-store.ts`
  - `initAuth()` / `signInWithGoogle()` / `signOut()` 的调用源替换
- `src/lib/supabase.ts`
  - 同步相关初始化判断逻辑（如果仅剩 Auth 相关引用则需删改）
- `src/components/auth/LoginScreen.tsx`
  - 文案/错误处理/登录状态展示（逻辑变化可能较小）
- `src/components/auth/UserMenu.tsx`
  - 登出/用户信息来源适配

### 7.2 新增（高概率）

- `server/src/routes/auth/*`
  - OAuth start / callback / session refresh / logout / me
- `server/src/lib/auth/*`
  - provider 配置、session 签发、cookie/JWT 校验
- `server/migrations/*`
  - auth 用户/session/account 表（若方案使用 D1 持久化）

### 7.3 受影响但可后续处理

- Sync Worker 鉴权中间件（JWT 来源变化）
- 文档与部署配置（`wrangler.toml`、Google OAuth 回调地址）

---

## 八、建议的 PoC 方案（推荐立项方式）

### 8.1 PoC 目标（只验证关键风险，不求一次替代）

用 1 个独立分支/PR 完成以下最小闭环：

1. `Chrome Extension` 点击“Google 登录”
2. 通过 Cloudflare Worker（或所选框架）完成 OAuth
3. 扩展端拿到可恢复 session
4. `workspace-store.initAuth()` 启动后能恢复用户
5. `signOut()` 清理会话成功

### 8.2 推荐 PoC 技术路线

- **首选**：Better Auth + D1 + Workers
- **备选**：Auth.js + D1 + Workers
- **暂不做**：完全自建、Cloudflare Access 替代 Supabase Auth

### 8.3 PoC 验收标准（通过才考虑迁移主线）

- 登录成功率稳定（10 次交互无异常）
- 启动恢复 session 成功（重开 Side Panel / 刷新扩展）
- access token/session 过期后可自动恢复或给出明确错误
- 登出后状态清理一致（UI + store +服务端 session）
- 认证 API 延迟可接受（交互不明显劣化）
- 不影响当前 Sync Phase 1-2 开发分支推进

### 8.4 PoC 明确不做

- 用户数据迁移
- 多 provider（仅 Google）
- 生产部署切换
- 完整回滚方案

---

## 九、正式迁移（若 PoC 通过）建议分阶段

### Phase A：并行接入（不替换默认）

- 新 auth 服务上线（Cloudflare-only）
- 保留 Supabase Auth 作为当前默认路径
- 在开发环境或 feature flag 下切换

### Phase B：客户端抽象稳定

- 抽象 `AuthProvider` 接口，屏蔽具体实现
- `workspace-store` 仅依赖统一 auth API

### Phase C：灰度切换

- 新用户走 Cloudflare-only Auth
- 老用户继续 Supabase Auth（短期并存）

### Phase D：迁移与收尾

- 确定用户 ID 映射策略（保留/迁移/重新登录）
- 移除 `supabase-js` 认证依赖
- 清理 `src/services/supabase.ts` 等遗留代码

---

## 十、风险清单（Auth 迁移特有）

| 风险 | 描述 | 缓解 |
|------|------|------|
| Chrome 扩展 OAuth 回调不兼容 | 新方案与 `chrome.identity.launchWebAuthFlow` 集成细节不顺 | 先做 PoC；保持 Supabase 路径可回退 |
| session 刷新行为与现状不一致 | 启动恢复/过期刷新 UX 退化 | 增加 auth 集成测试与手测 checklist |
| 用户 ID 变化影响 workspace 绑定 | 当前 `workspace-store` 有 `currentWorkspaceId = user.id` 假设 | 迁移前先抽离 workspace identity 逻辑 |
| 安全边界实现错误 | 自建/半自建 auth 容易漏 state/PKCE/session 校验 | 优先使用成熟方案，避免完全自建 |
| 运维复杂度转移而非降低 | 从 Supabase 托管 Auth 转成自己维护 | 限定功能范围（Google-only），分阶段迁移 |

---

## 十一、决策结论（nodex 修订 2026-02-23）

### 最终决策

**Auth PoC 纳入 Sync 实施主线，作为 Step 0 前置任务。**

理由：
- 用户明确目标：**完全消除 Supabase 依赖，全部使用 Cloudflare 服务**
- 若先写 Supabase JWT 验证（原 Step 3），后续再迁移会产生返工
- Auth PoC 在 sync Worker 代码之前验证，失败风险提前暴露
- D1 已在 sync 计划中引入，Auth 共用同一 D1 实例，无额外基础设施成本

### 执行计划

1. **Step 0**（Sync 实施计划前置）：`Better Auth + D1 + Workers` PoC
2. 用本文第八节验收标准做准入
3. PoC 通过 → Steps 1-10 直接使用 Better Auth，不写 Supabase JWT 代码
4. PoC 失败 → 重新评估，可能退回 Supabase Auth 方案

详见 `docs/plans/sync-incremental-impl.md` § Step 0。

---

## 十二、调研参考（官方/一手为主）

### Cloudflare

- Cloudflare D1 定价（免费额度/计费）  
  https://developers.cloudflare.com/d1/platform/pricing/
- D1 Worker API（`batch()` / `withSession()` 等）  
  https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 限制  
  https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare Access（产品/文档入口，定位为访问控制）  
  https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/
- `workers-oauth-provider`（官方开源）  
  https://github.com/cloudflare/workers-oauth-provider

### Auth 方案（开源）

- Auth.js D1 Adapter（官方文档）  
  https://authjs.dev/getting-started/adapters/d1
- Better Auth（数据库与 Cloudflare 环境文档）  
  https://www.better-auth.com/docs/concepts/database

### Supabase（现状参考）

- Supabase JWT / Auth 文档  
  https://supabase.com/docs/guides/auth/jwts
- Supabase Pricing  
  https://supabase.com/pricing
- Supabase Billing 说明  
  https://supabase.com/docs/guides/platform/billing-on-supabase

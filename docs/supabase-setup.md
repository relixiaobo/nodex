# Supabase 部署与配置指南

> 面向上线准备。详细说明如何从零配置 Supabase 项目，使 Nodex 能连接云端数据库。
> 当前状态：开发阶段使用 standalone 离线模式，尚未连接真实 Supabase 实例。

---

## 目录

1. [概述：Nodex 用了 Supabase 的什么](#1-概述)
2. [创建 Supabase 项目](#2-创建-supabase-项目)
3. [执行数据库迁移](#3-执行数据库迁移)
4. [配置环境变量](#4-配置环境变量)
5. [验证连接](#5-验证连接)
6. [配置 Google OAuth 登录](#6-配置-google-oauth-登录)
7. [RLS（行级安全）详解](#7-rls行级安全详解)
8. [Realtime 配置](#8-realtime-配置)
9. [数据导入（Tana 迁移）](#9-数据导入)
10. [生产环境注意事项](#10-生产环境注意事项)
11. [费用估算](#11-费用估算)
12. [常见问题](#12-常见问题)

---

## 1. 概述

Nodex 使用 Supabase 作为后端，但采用**离线优先**架构——所有操作先在本地 Zustand store 完成（乐观更新），然后异步同步到 Supabase。没有 Supabase 时应用仍可完整运行。

### 当前使用的 Supabase 功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **Database (PostgreSQL)** | ✅ 使用中 | 单表 `nodes` 存储所有数据 |
| **Realtime** | ✅ 使用中 | 监听 `nodes` 表变更，多标签页同步 |
| **Auth** | ❌ 计划中 | Phase 4，Google OAuth 登录 |
| **Storage** | ❌ 未使用 | 图片/文件存储（未来可能需要） |
| **pgvector** | ⚠️ Schema 已就绪 | `node_embeddings` 表已建，AI 功能未实现 |

### 客户端 SDK

```
@supabase/supabase-js ^2.95.3
```

初始化方式：通过 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 两个环境变量。

---

## 2. 创建 Supabase 项目

### 2.1 注册 Supabase

1. 访问 https://supabase.com
2. 点击 "Start your project"
3. 使用 GitHub 账号登录（推荐）或邮箱注册

### 2.2 创建新项目

1. 进入 Dashboard → "New Project"
2. 填写：

| 字段 | 建议值 | 说明 |
|------|--------|------|
| **Organization** | 你的组织名 | 首次使用会自动创建 |
| **Project name** | `nodex` 或 `nodex-prod` | 仅展示用，不影响功能 |
| **Database Password** | 强密码（保存好！） | PostgreSQL 直连密码，后续可能需要 |
| **Region** | `Northeast Asia (Tokyo)` 或 `Southeast Asia (Singapore)` | 选离你最近的区域，影响延迟 |
| **Pricing Plan** | Free（开始）→ Pro（上线） | Free 有限制，见 §11 |

3. 点击 "Create new project"，等待约 2 分钟初始化

### 2.3 获取项目凭证

项目创建完成后，进入 **Settings → API**，记录以下两个值：

| 字段 | 位置 | 用途 |
|------|------|------|
| **Project URL** | `https://xxxxxxxx.supabase.co` | API 端点 |
| **anon / public key** | `eyJhbGci...` (很长的 JWT) | 客户端公钥，可安全暴露在前端 |

另外记录（但不要放到前端代码中）：

| 字段 | 用途 |
|------|------|
| **service_role key** | 服务端管理密钥，绕过 RLS，**绝对不能暴露** |
| **Database Password** | PostgreSQL 直连密码 |

---

## 3. 执行数据库迁移

### 3.1 方式 A：通过 Supabase Dashboard SQL Editor（推荐新手）

1. 进入 Dashboard → **SQL Editor**
2. 点击 "New query"
3. 复制 `supabase/migrations/001_create_nodes.sql` 的全部内容粘贴
4. 点击 "Run"
5. 确认无错误（应显示 "Success. No rows returned"）

### 3.2 方式 B：通过 Supabase CLI（推荐开发者）

安装 CLI：

```bash
# macOS
brew install supabase/tap/supabase

# npm（全局安装）
npm install -g supabase

# 验证安装
supabase --version
```

连接远程项目：

```bash
# 登录（会打开浏览器授权）
supabase login

# 将本地项目关联到远程 Supabase 项目
cd /path/to/nodex
supabase link --project-ref <your-project-ref>
# project-ref 在 Dashboard → Settings → General → Reference ID 中找到
# 格式类似 "abcdefghijklmnop"
```

推送迁移：

```bash
supabase db push
```

这会自动执行 `supabase/migrations/` 目录下的所有 SQL 文件。

### 3.3 验证数据库结构

在 Dashboard → **Table Editor** 中确认以下表已创建：

| 表名 | 说明 |
|------|------|
| `nodes` | 核心节点表（应有 25+ 列） |
| `users` | 用户表 |
| `workspace_members` | 工作区成员 |
| `editors` | 编辑者列表 |
| `node_embeddings` | AI 向量（可选） |

在 Dashboard → **Database → Indexes** 中确认索引已创建（应有 10+ 个索引）。

---

## 4. 配置环境变量

### 4.1 开发环境

在项目根目录创建或编辑 `.env` 文件：

```bash
# .env（不要提交到 git，已在 .gitignore 中）
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**如何获取这两个值**：
- Dashboard → Settings → API → Project URL
- Dashboard → Settings → API → Project API keys → `anon` `public`

### 4.2 生产环境

Chrome 扩展打包时，Vite 会在构建阶段将 `import.meta.env.VITE_*` 替换为实际值。因此：

```bash
# 构建生产版本时，.env 中的值会被 inline 到代码中
npm run build
```

生产环境的 `.env` 应使用**生产 Supabase 项目**的凭证（与开发环境分开）。

### 4.3 环境变量在代码中的流转

```
.env 文件
  → Vite 构建时替换 import.meta.env.VITE_SUPABASE_*
  → src/lib/supabase.ts: setupSupabase() 读取
  → src/services/supabase.ts: initSupabase(url, key) 创建客户端
  → src/services/node-service.ts: getSupabase() 使用客户端
```

### 4.4 离线开发模式（无需 Supabase）

如果不配置 `.env`（或值为空），应用自动进入离线模式：

- `setupSupabase()` 抛出异常 → 被 App.tsx 捕获 → `resetSupabase()`
- 所有 `isSupabaseReady()` 返回 `false`
- 数据仅存在内存中（刷新丢失）

standalone 测试模式完全跳过 Supabase：

```bash
npm run dev:test   # 启动 http://localhost:5199，纯离线
```

---

## 5. 验证连接

### 5.1 快速验证

配置 `.env` 后，启动开发服务器：

```bash
npm run dev
```

打开 Chrome → 扩展图标 → Side Panel，如果控制台没有 Supabase 错误，说明连接成功。

### 5.2 手动验证

在浏览器控制台（Side Panel 的 DevTools）中：

```javascript
// 检查 Supabase 是否已初始化
window.__nodeStore.getState()  // 应该有 entities 对象

// 如果连接 Supabase，entities 中应该有从远程获取的节点
Object.keys(window.__nodeStore.getState().entities).length
```

### 5.3 在 Dashboard 中验证

进入 Dashboard → **Table Editor → nodes**：
- 如果是新项目，表应为空
- 在 Side Panel 中创建几个节点，刷新 Dashboard 页面，应能看到新增行

---

## 6. 配置 Google OAuth 登录

> 这是 Phase 4 功能，上线前必须完成。提前配置好可以节省时间。

### 6.1 创建 Google OAuth 凭证

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目（或使用已有项目）
3. 进入 **APIs & Services → Credentials**
4. 点击 "Create Credentials" → **OAuth client ID**
5. 配置：

| 字段 | 值 |
|------|-----|
| Application type | Web application |
| Name | Nodex |
| Authorized JavaScript origins | `https://xxxxxxxx.supabase.co` |
| Authorized redirect URIs | `https://xxxxxxxx.supabase.co/auth/v1/callback` |

> 把 `xxxxxxxx` 替换为你的 Supabase 项目 Reference ID

6. 点击 "Create"，记录 **Client ID** 和 **Client Secret**

### 6.2 在 Supabase 中配置 Google Provider

1. Dashboard → **Authentication → Providers**
2. 找到 "Google"，点击展开
3. 打开 "Enable Google provider" 开关
4. 填入 Google OAuth 的 Client ID 和 Client Secret
5. 点击 "Save"

### 6.3 配置 OAuth Consent Screen

在 Google Cloud Console → **APIs & Services → OAuth consent screen**：

1. User Type: External（除非你有 Google Workspace 组织）
2. 填写应用名称、用户支持邮箱、开发者联系邮箱
3. Scopes: 添加 `email` 和 `profile`
4. Test users: 添加你自己的 Gmail（发布前只有测试用户能登录）
5. 发布状态：开始是 "Testing"，上线时需改为 "In production"

### 6.4 Chrome 扩展的特殊考虑

Chrome 扩展使用 OAuth 时有额外要求：

- Side Panel 中的 OAuth 弹窗可能被浏览器阻止
- 可能需要使用 `chrome.identity` API 替代标准 OAuth flow
- 或者使用 Supabase 的 `signInWithOAuth({ provider: 'google' })` + 弹窗方式
- 详细方案在 Phase 4 实现时确定

---

## 7. RLS（行级安全）详解

### 7.1 什么是 RLS

RLS (Row Level Security) 让数据库在每次查询时自动过滤行，确保用户只能访问自己有权限的数据。即使前端代码有 bug 或被篡改，数据也是安全的。

### 7.2 当前的 RLS 策略

迁移 SQL 中已定义了 4 条策略：

**nodes 表**：
```sql
-- 用户只能访问其所属工作区的节点
CREATE POLICY "Users can access workspace nodes" ON nodes
  FOR ALL USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.user_id = auth.uid()  -- Supabase Auth 提供的当前用户 ID
    )
  );
```

**workspace_members 表**：
```sql
-- 用户只能查看自己的成员关系
CREATE POLICY "Users can view own memberships" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());
```

**editors / node_embeddings 表**：类似的工作区级别策略。

### 7.3 RLS 与 Auth 的依赖关系

**关键**：RLS 策略中的 `auth.uid()` 依赖 Supabase Auth。当前没有登录流程，`auth.uid()` 返回 `null`，导致：

- 使用 `anon key` 时，RLS 策略会**阻止所有查询**（因为 `auth.uid()` 为 null）
- 解决方案（开发阶段二选一）：

**方案 A：暂时禁用 RLS（开发阶段推荐）**

```sql
-- 在 Dashboard → SQL Editor 中执行
ALTER TABLE nodes DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE editors DISABLE ROW LEVEL SECURITY;
ALTER TABLE node_embeddings DISABLE ROW LEVEL SECURITY;
```

**方案 B：添加临时的开放策略**

```sql
-- 允许 anon key 访问所有行（开发用，上线前移除！）
CREATE POLICY "Dev: allow all" ON nodes FOR ALL USING (true);
```

### 7.4 上线前的 RLS 检查清单

- [ ] 确认 Auth 登录流程正常
- [ ] 确认 `auth.uid()` 在登录后返回正确用户 ID
- [ ] 确认 `workspace_members` 表中有正确的用户-工作区映射
- [ ] 重新启用所有表的 RLS
- [ ] 移除临时的开放策略
- [ ] 测试：用户 A 无法访问用户 B 的工作区数据

---

## 8. Realtime 配置

### 8.1 当前实现

Nodex 使用 Supabase Realtime 监听 `nodes` 表的变更，实现多标签页同步。

代码位置：`src/hooks/use-realtime.ts`

```
订阅频道：nodes:{workspaceId}
监听事件：INSERT / UPDATE / DELETE
过滤条件：workspace_id = 当前工作区 ID
```

当远程有变更时，hook 自动将变更应用到本地 Zustand store。

### 8.2 Realtime 已在迁移中启用

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE nodes;
```

这行在 `001_create_nodes.sql` 中，执行迁移后自动生效。

### 8.3 验证 Realtime

1. 打开两个 Chrome 窗口，都打开 Nodex Side Panel
2. 在窗口 A 中创建一个节点
3. 窗口 B 应该在 1-2 秒内看到新节点出现

如果不生效：
- 检查 Dashboard → **Database → Replication**，确认 `nodes` 表在 publication 中
- 检查 Dashboard → **Settings → API**，确认 Realtime 未被禁用
- 检查浏览器 DevTools Console，是否有 WebSocket 错误

### 8.4 Realtime 限制

| 限制 | Free 计划 | Pro 计划 |
|------|-----------|----------|
| 并发连接数 | 200 | 500 |
| 每秒消息数 | 100 | 无限 |
| 频道数 | 100 | 无限 |

Nodex 每个标签页 = 1 个连接 + 1 个频道。Free 计划足够开发使用。

---

## 9. 数据导入

### 9.1 从 Tana 导入

项目有完整的 Tana 导入服务：`src/services/tana-import.ts`

```bash
# Tana 导出的 JSON 文件（约 16MB）
# 不要在 Claude Code 中直接打开，用脚本处理
```

导入流程：
1. 从 Tana 导出 JSON（Settings → Export）
2. 通过导入服务解析 JSON → 转换为 NodexNode → 批量写入 Supabase
3. 已验证：41,753 节点 100% 转换成功

### 9.2 种子数据

开发阶段可以用种子数据填充：

```bash
npm run dev:test   # standalone 模式自动加载 68 个测试节点
```

如果需要在真实 Supabase 中填充测试数据，可以先在 standalone 模式中操作，然后导出为 SQL INSERT 语句。

---

## 10. 生产环境注意事项

### 10.1 开发 vs 生产项目

建议创建两个 Supabase 项目：

| 环境 | 项目名 | 用途 |
|------|--------|------|
| 开发 | `nodex-dev` | 日常开发、测试、可随意删数据 |
| 生产 | `nodex-prod` | 真实用户数据、需谨慎操作 |

每个项目有独立的 URL、API Key、数据库。通过 `.env` 切换。

### 10.2 数据库备份

- **Free 计划**：无自动备份
- **Pro 计划**：每日自动备份，保留 7 天
- **手动备份**：Dashboard → Settings → Database → Download backup

建议：上线前升级到 Pro 计划（$25/月），获取自动备份和更高的资源限制。

### 10.3 连接池

Supabase 默认使用 PgBouncer 连接池。Nodex 是客户端直连，不需要额外配置。

但如果未来有 Edge Functions 或服务端代码，需要使用 Pooler 连接（Dashboard → Settings → Database → Connection String → Mode: Transaction）。

### 10.4 安全检查清单

上线前必须确认：

- [ ] `.env` 中使用生产项目的 URL 和 Key
- [ ] `anon key`（非 `service_role key`）在前端代码中
- [ ] RLS 已启用且策略正确
- [ ] Auth 登录流程正常
- [ ] `service_role key` 没有出现在任何前端代码中
- [ ] CORS 配置正确（默认允许所有，生产环境可限制）
- [ ] 数据库密码足够强且已安全存储

### 10.5 Chrome 扩展分发

Chrome Web Store 发布扩展时，`.env` 的值已在构建时 inline 到代码中。因此：

```bash
# 生产构建流程
# 1. 确保 .env 指向生产 Supabase 项目
# 2. 构建
npm run build

# 3. 打包
npm run zip

# 4. 上传 .zip 到 Chrome Web Store
```

`anon key` 出现在构建产物中是安全的——它是公钥，配合 RLS 使用。真正的安全保障来自 RLS 策略。

---

## 11. 费用估算

### Free 计划（开发阶段足够）

| 资源 | 限制 |
|------|------|
| 数据库空间 | 500 MB |
| 文件存储 | 1 GB |
| 带宽 | 2 GB/月 |
| 每月活跃用户 | 50,000 (Auth) |
| Realtime 连接 | 200 并发 |
| Edge Functions | 500K 调用/月 |
| 项目暂停 | 7 天不活跃自动暂停 |

**注意**：Free 计划项目会在 7 天无活跃后自动暂停，需要手动恢复。不适合生产使用。

### Pro 计划（上线推荐，$25/月）

| 资源 | 限制 |
|------|------|
| 数据库空间 | 8 GB（可扩展） |
| 文件存储 | 100 GB |
| 带宽 | 250 GB/月 |
| 每月活跃用户 | 100,000 (Auth) |
| Realtime 连接 | 500 并发 |
| 每日自动备份 | 7 天保留 |
| 不自动暂停 | 持续运行 |

### Nodex 数据量预估

基于 Tana 导出数据（单用户，深度使用 1 年+）：

| 指标 | 值 |
|------|-----|
| 总节点数 | 41,753 |
| 数据库空间 | 约 50-80 MB |
| 单节点平均大小 | 约 1-2 KB |

Free 计划的 500 MB 可以支撑约 25-50 万节点，对于单用户或小团队足够。

---

## 12. 常见问题

### Q: 没有 Supabase 能开发吗？

**可以**。运行 `npm run dev:test` 进入 standalone 模式，完全不需要 Supabase。所有功能都可以在离线模式下开发和测试。

### Q: anon key 暴露在前端安全吗？

**安全**，这是设计如此。`anon key` 是公钥，它只能访问 RLS 策略允许的数据。真正的安全保障来自：
- RLS 策略限制每个用户只能访问自己工作区的数据
- `auth.uid()` 由 Supabase Auth 提供，前端无法伪造

### Q: service_role key 是什么？什么时候用？

`service_role key` 可以绕过所有 RLS 策略，直接读写所有数据。**绝对不能放到前端代码中**。用途：
- 服务端脚本（数据迁移、管理操作）
- Edge Functions（服务端逻辑）
- 管理工具

### Q: 多个开发者怎么协作？

每个开发者可以：
1. 共用同一个 Supabase 项目（`.env` 中相同的 URL 和 Key）—— 共享数据
2. 各自创建自己的 Supabase 项目 —— 数据隔离
3. 使用 Supabase CLI 的 Local Dev（`supabase start`）—— 本地 Docker 容器

推荐方案 3：

```bash
# 安装 Docker Desktop（前置条件）
# 然后：
supabase init      # 初始化本地配置
supabase start     # 启动本地 Supabase（Docker）
# 会输出本地 URL 和 Key，填入 .env
```

本地 Supabase 功能完整（数据库、Auth、Realtime、Storage），数据存储在 Docker volume 中。

### Q: 数据库 schema 变更怎么管理？

1. 在 `supabase/migrations/` 目录下创建新的 SQL 文件（按序号命名）
2. 使用 Supabase CLI 推送：`supabase db push`
3. 或在 Dashboard → SQL Editor 中手动执行

```bash
# 创建新迁移文件
supabase migration new add_some_column
# 会生成 supabase/migrations/20260214000000_add_some_column.sql
# 编辑 SQL 文件后执行 supabase db push
```

### Q: Realtime 不工作怎么排查？

1. 检查 `ALTER PUBLICATION supabase_realtime ADD TABLE nodes;` 是否执行
2. Dashboard → Database → Replication → 确认 `nodes` 在列表中
3. 浏览器 DevTools → Network → WS → 查看 WebSocket 连接
4. 检查 `isSupabaseReady()` 是否返回 true
5. Free 计划的 Realtime 连接数有限（200），确认未超限

### Q: 如何查看/操作数据库？

| 方式 | 适用场景 |
|------|----------|
| Dashboard → Table Editor | 浏览数据，简单 CRUD |
| Dashboard → SQL Editor | 执行 SQL 查询，调试 |
| `psql` 直连 | 高级操作（Dashboard → Settings → Database → Connection String） |
| Supabase CLI | 迁移管理、类型生成 |

### Q: pgvector 扩展需要额外配置吗？

不需要。迁移 SQL 中的 `CREATE EXTENSION IF NOT EXISTS "pgvector"` 会自动启用。Supabase 所有计划都包含 pgvector。

`node_embeddings` 表已创建，当实现 AI 功能时直接使用即可。

---

## 附录：文件对照表

| 文件 | 用途 |
|------|------|
| `supabase/migrations/001_create_nodes.sql` | 数据库 DDL（表、索引、RLS、Realtime） |
| `.env` / `.env.example` | 环境变量（Supabase URL + Key） |
| `src/env.d.ts` | TypeScript 类型声明（VITE_SUPABASE_*） |
| `src/services/supabase.ts` | 客户端单例（initSupabase / getSupabase / isSupabaseReady） |
| `src/lib/supabase.ts` | WXT 环境适配（从 env 读取配置） |
| `src/services/node-service.ts` | 数据库 CRUD（全部通过 getSupabase() 操作） |
| `src/hooks/use-realtime.ts` | Realtime 订阅 hook |
| `src/stores/node-store.ts` | Zustand store（乐观更新 + isSupabaseReady 检查） |

# 用户认证 & 环境策略

> **目标读者**: 开发者 + 产品（用户）
> **当前阶段**: 未上线，仅开发环境

---

## 1. 环境规划

### 三套环境概览

| 环境 | 用途 | 谁用 | 何时需要 |
|------|------|------|---------|
| **Dev** | 本地开发调试 | 开发者 | **现在就要** |
| **Production** | 正式对外发布 | 所有用户 | **首次公开发布时** |
| **Preview (Staging)** | 上线前验证、内测 | QA、产品、内测用户 | 见下方触发条件 |

### 当前阶段：只需 Dev + Production 两套

产品尚未上线，没有内测用户。先搭建 Dev 和 Production 即可。

### 何时新增 Preview 环境

满足以下**任一条件**时，新增 Preview：

- [ ] 有非开发者需要试用（产品、设计师、朋友内测）
- [ ] 需要在类真实数据上验证，但不能影响正式用户
- [ ] 发布节奏变快，需要 release candidate 阶段性验证
- [ ] Chrome Web Store 上架后，想用 trusted testers 通道做灰度

届时需要：
- 新增 `.env.staging`
- Supabase 决策：共用生产项目（数据隔离）或创建独立 staging 项目
- Chrome Web Store 使用 trusted testers 发布通道

---

## 2. 各环境配置对照

### Dev（本地开发）

| 配置项 | 值 |
|--------|---|
| 环境文件 | `.env` |
| Supabase | 开发项目（或本地 Supabase） |
| Chrome Extension ID | 固定开发 ID（wxt.config.ts 配置 key） |
| Google OAuth Client | Dev Client ID（Google Cloud Console） |
| OAuth Redirect URI | `https://<dev-ext-id>.chromiumapp.org/` |
| 启动方式 | `npm run dev` |

### Production（正式发布）

| 配置项 | 值 |
|--------|---|
| 环境文件 | `.env.production` |
| Supabase | 生产项目 |
| Chrome Extension ID | Chrome Web Store 分配的固定 ID |
| Google OAuth Client | Prod Client ID（Google Cloud Console） |
| OAuth Redirect URI | `https://<prod-ext-id>.chromiumapp.org/` |
| 构建方式 | `npm run build` → `.output/chrome-mv3/` |

### Preview（未来，当需要时）

| 配置项 | 值 |
|--------|---|
| 环境文件 | `.env.staging` |
| Supabase | 与 Production 共用或独立 staging 项目 |
| Chrome Extension ID | 同 Production（通过 trusted testers 通道分发） |
| Google OAuth Client | 可复用 Prod Client（同一 extension ID） |
| 发布方式 | Chrome Web Store → trusted testers 通道 |

---

## 3. 技术方案：Google OAuth + Chrome Extension

### 为什么 Chrome 扩展的 OAuth 特殊

浏览器扩展没有传统的 web redirect URL。Chrome 提供 `chrome.identity` API，redirect URI 格式为：
```
https://<extension-id>.chromiumapp.org/
```

Extension ID 在开发模式下每次加载可能变化（除非固定 key），而 Chrome Web Store 发布后会分配固定 ID。因此 Dev 和 Production 需要**不同的 Google OAuth Client ID**。

### 认证流程

```
用户点击「Google 登录」
  → chrome.identity.launchWebAuthFlow({ url: supabaseAuthUrl })
  → Google 登录页（浏览器弹窗）
  → Google 返回 auth code 到 redirect URI
  → Supabase 交换 token
  → 获取 session → 存入 workspace-store
  → UI 更新为已登录状态
```

### Supabase Auth 配置清单

- [ ] Supabase Dashboard → Authentication → Providers → 启用 Google
- [ ] 填入 Google OAuth Client ID 和 Client Secret
- [ ] Redirect URLs 添加：`https://<dev-ext-id>.chromiumapp.org/`
- [ ] （生产时）Redirect URLs 添加：`https://<prod-ext-id>.chromiumapp.org/`

### Google Cloud Console 配置清单

- [ ] 创建项目（或使用现有项目）
- [ ] APIs & Services → Credentials → Create OAuth 2.0 Client ID
- [ ] Application type: **Chrome Extension**（Dev 用）或 **Web application**
- [ ] 填入 Chrome Extension ID
- [ ] 获取 Client ID 和 Client Secret → 填入 Supabase

### Chrome Extension Manifest 变更

```typescript
// wxt.config.ts — 需要新增的权限
permissions: ['storage', 'sidePanel', 'activeTab', 'identity'],
```

### 固定开发 Extension ID

为避免每次 `npm run dev` 加载时 ID 变化（导致 OAuth redirect 失效），需要在 wxt.config.ts 中固定 key：

```typescript
// wxt.config.ts
manifest: {
  // ... existing config
  key: '<base64-encoded-public-key>',  // 固定开发 extension ID
}
```

生成方式：打包一次扩展 → 从 `.crx` 提取 public key → base64 编码。

---

## 4. 环境变量文件

### `.env`（Dev，已有）

```bash
VITE_SUPABASE_URL=https://your-dev-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-dev-anon-key
# Google Auth 不需要前端变量，配置在 Supabase Dashboard
```

### `.env.production`（Production，需新建）

```bash
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-prod-anon-key
```

### `.env.staging`（Preview，未来需要时新建）

```bash
VITE_SUPABASE_URL=https://your-staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-staging-anon-key
```

> `.env` 和 `.env.production` 已在 `.gitignore` 中。`.env.example` 提供模板。

---

## 5. 现有代码影响

### workspace-store.ts 需要扩展

当前 store 只有 `setUser(userId)` 手动设置。需要新增：
- `signInWithGoogle()` — 调用 Supabase Auth
- `onAuthStateChange()` — 监听登录状态变化
- `signOut()` — 登出（替代当前的 `logout()`）
- `session` / `user` 状态字段

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/lib/auth.ts` | Google OAuth 流程封装（chrome.identity + Supabase Auth） |
| `src/components/auth/LoginScreen.tsx` | 登录页 UI |
| `src/components/auth/UserMenu.tsx` | 已登录状态下的用户头像 + 菜单 |

### App.tsx 路由守卫

```
if (!isAuthenticated) → 显示 LoginScreen
if (isAuthenticated)  → 显示正常 App（当前的 Sidebar + PanelStack）
```

---

## 6. 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-17 | 当前只搭 Dev + Production，不建 Preview | 产品未上线，无内测用户 |
| 2026-02-17 | 一个 Supabase 项目，Dev/Prod 用不同环境变量 | 简化管理，后续可拆分 |
| 2026-02-17 | 两个 Google OAuth Client ID（Dev/Prod） | Chrome Extension ID 不同，redirect URI 不同 |

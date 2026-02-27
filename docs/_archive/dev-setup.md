# Nodex 开发环境凭据（本文件已 .gitignore，不会同步到 GitHub）

> 最后更新：2026-02-28

---

## Cloudflare 账号

| 项目 | 值 |
|------|-----|
| 账号邮箱 | lixiaobock@gmail.com |
| Account ID | b1a3fb394ace5764455bdeba307cbdf0 |
| Workers 子域名 | getsoma.workers.dev |

---

## Staging 环境

### Worker

| 项目 | 值 |
|------|-----|
| URL | https://nodex-sync-staging.getsoma.workers.dev |
| Health | https://nodex-sync-staging.getsoma.workers.dev/health |

### D1 数据库

| 项目 | 值 |
|------|-----|
| 名称 | nodex-sync-staging |
| ID | 27da737a-e879-44de-bd38-2af7b94c18d1 |

### R2 Bucket

| 项目 | 值 |
|------|-----|
| 名称 | nodex-sync-staging |
| 用途 | Sync CRDT blobs（push/pull 增量更新 + snapshot） |

### Google OAuth Client (Staging 专用)

| 项目 | 值 |
|------|-----|
| Client ID | 289447364185-7trph08vln7c6ckec5e2rh1c4qaqc2gj.apps.googleusercontent.com |
| Client Secret | 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 |
| Redirect URI | https://nodex-sync-staging.getsoma.workers.dev/api/auth/callback/google |

### Secrets (已通过 wrangler secret put 设置)

| Secret | 状态 |
|--------|------|
| GOOGLE_CLIENT_ID | 已设置 |
| GOOGLE_CLIENT_SECRET | 已设置 |
| BETTER_AUTH_SECRET | 已设置 (9449a4a3b297f49e156d2be8d7f4b1e3862da46d0fd229d35809edcb1fb6658d) |
| CHROME_EXTENSION_ID | 已设置 (gkpgogocbjejpildfebpklkldhogdfkp) |

---

## Production 环境

### D1 数据库

| 项目 | 值 |
|------|-----|
| 名称 | nodex-sync |
| ID | 2ce73b94-7256-4940-ae38-680b84661c2e |

### R2 Bucket

| 项目 | 值 |
|------|-----|
| 名称 | nodex-sync |
| 用途 | Sync CRDT blobs（push/pull 增量更新 + snapshot） |

### Worker

| 项目 | 值 |
|------|-----|
| URL | https://nodex-sync.getsoma.workers.dev |
| 状态 | 已部署 |

### Google OAuth Client (Production 专用)

| 项目 | 值 |
|------|-----|
| 名称 | Nodex Production |
| Client ID | 289447364185-j7s0dlvjp53rto7o87dbj3gkfa5vu4m7.apps.googleusercontent.com |
| Client Secret | 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 |
| Redirect URI | https://nodex-sync.getsoma.workers.dev/api/auth/callback/google |

### Secrets (已通过 wrangler secret put 设置)

| Secret | 状态 |
|--------|------|
| GOOGLE_CLIENT_ID | 已设置 |
| GOOGLE_CLIENT_SECRET | 已设置 |
| BETTER_AUTH_SECRET | 已设置 (d777e3bbc1bdf9cdf5ddbceadb0ac72003158ab2cd6edb2ff73f0a38cd179cd7) |
| CHROME_EXTENSION_ID | 已设置 (joabcnflpakkpkalkphcdkdbfkcfhlpa) |
| DEV_EXTENSION_ID | 已设置 (gkpgogocbjejpildfebpklkldhogdfkp) — Dev builds |
| PREVIEW_EXTENSION_ID | 已设置 (andlcnfkdjeebjfdjangcnjaicfapmni) — Preview builds |

---

## Chrome Extension ID

| 环境 | ID | 来源 |
|------|-----|------|
| Dev | gkpgogocbjejpildfebpklkldhogdfkp | wxt.config.ts dev key 推导 |
| Preview | andlcnfkdjeebjfdjangcnjaicfapmni | wxt.config.ts preview key 推导 |
| Store (Production) | joabcnflpakkpkalkphcdkdbfkcfhlpa | Chrome Web Store 分配 |

---

## 常用命令

```bash
# 部署（需要代理，终端设置 HTTPS_PROXY）
export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890

cd server
npm run deploy:staging          # 部署 staging Worker
npm run deploy:production       # 部署 production Worker
npm run db:migrate:staging      # 应用 staging D1 迁移
npm run db:migrate:production   # 应用 production D1 迁移

# 管理 secrets
wrangler secret put <NAME> --env staging
wrangler secret put <NAME> --env production
wrangler secret list --env staging
```

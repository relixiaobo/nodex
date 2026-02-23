-- E2E test seed data — run BEFORE starting `wrangler dev`.
-- These are well-known test credentials used by tests/vitest/sync-e2e.test.ts
--
-- Usage:
--   cd server
--   npm run db:migrate:local
--   npm run db:seed:e2e
--   npm run dev

INSERT OR IGNORE INTO "user" (id, name, email)
VALUES ('user_e2e_test', 'E2E Test User', 'e2e@test.nodex.local');

INSERT OR REPLACE INTO "session" (id, token, "userId", "expiresAt")
VALUES ('sess_e2e_test', 'e2e_test_token_fixed', 'user_e2e_test', datetime('now', '+30 days'));

#!/usr/bin/env node
/**
 * Deploy helper — injects git commit hash into wrangler deploy.
 *
 * Usage: node scripts/deploy.mjs <staging|production>
 */
import { execSync } from 'node:child_process';

const env = process.argv[2];
if (!env || !['staging', 'production'].includes(env)) {
  console.error('Usage: node scripts/deploy.mjs <staging|production>');
  process.exit(1);
}

const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

console.log(`Deploying to ${env} (commit: ${commit})...\n`);
execSync(
  `npx wrangler deploy --env ${env} --define '__GIT_COMMIT__:"${commit}"'`,
  { stdio: 'inherit' },
);

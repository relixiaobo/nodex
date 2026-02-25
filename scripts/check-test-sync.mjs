#!/usr/bin/env node

import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function tryRun(cmd) {
  try {
    return run(cmd);
  } catch {
    return '';
  }
}

function getDiffBase() {
  const baseRef = process.env.GITHUB_BASE_REF || 'main';
  const remoteBase = `origin/${baseRef}`;

  const mergeBase = tryRun(`git merge-base HEAD ${remoteBase}`);
  if (mergeBase) return mergeBase;

  // Fallback: previous commit when remote base isn't available.
  const previous = tryRun('git rev-parse HEAD~1');
  if (previous) return previous;

  return '';
}

function getChangedFiles(base) {
  if (!base) return [];
  const out = tryRun(`git diff --name-only ${base}...HEAD`);
  if (!out) return [];
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function isSourceFile(path) {
  return path.startsWith('src/');
}

function isVitestFile(path) {
  return path.startsWith('tests/vitest/') && path.endsWith('.test.ts');
}

function main() {
  const base = getDiffBase();
  const changed = getChangedFiles(base);

  if (changed.length === 0) {
    console.log('[check-test-sync] no changed files detected, skip.');
    return;
  }

  const srcChanged = changed.some(isSourceFile);
  const vitestChanged = changed.some(isVitestFile);

  const errors = [];

  if (srcChanged && !vitestChanged) {
    errors.push(
      'Detected changes under src/ but no tests were updated under tests/vitest/*.test.ts.',
    );
  }

  if (errors.length > 0) {
    console.error('[check-test-sync] failed:\n- ' + errors.join('\n- '));
    process.exit(1);
  }

  console.log('[check-test-sync] passed.');
}

main();

#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function getComponentFiles() {
  const out = run(`rg --files src/components -g '*.tsx'`);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

const IGNORE_LINE_PATTERNS = [
  /https?:\/\//,
  /className=/,
  /data-[\w-]+=/,
  /role=/,
  /type=/,
  /import\s+/,
  /from\s+['"]/,
  /t\(/,
];

// Only match text nodes that are immediately followed by a JSX tag (`<Tag` or `</Tag`).
// This avoids false positives on TS comparisons like `a > b && a < c`.
const JSX_TEXT_RE = />\s*([A-Za-z][^<>{]{1,80})\s*(?=<\/?[A-Za-z])/g;
const ATTR_RE = /\b(?:title|placeholder|aria-label|alt|heading)=["']([A-Za-z][^"']{0,120})["']/g;

function collectFindings(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (IGNORE_LINE_PATTERNS.some((re) => re.test(line))) continue;

    JSX_TEXT_RE.lastIndex = 0;
    ATTR_RE.lastIndex = 0;

    let m;
    while ((m = JSX_TEXT_RE.exec(line)) !== null) {
      const text = m[1].trim();
      if (!text) continue;
      if (/^[A-Z_][A-Z0-9_]*$/.test(text)) continue;
      findings.push({ line: i + 1, kind: 'jsx-text', text });
    }
    while ((m = ATTR_RE.exec(line)) !== null) {
      const text = m[1].trim();
      if (!text) continue;
      findings.push({ line: i + 1, kind: 'attr', text });
    }
  }

  return findings;
}

function main() {
  const files = getComponentFiles();
  const all = [];

  for (const file of files) {
    const findings = collectFindings(file);
    if (findings.length > 0) all.push([file, findings]);
  }

  if (all.length === 0) {
    console.log('[check:i18n-copy] no obvious hardcoded component copy found.');
    return;
  }

  console.warn('[check:i18n-copy] advisory report: possible hardcoded component copy found');
  for (const [file, findings] of all) {
    console.warn(`\n- ${file}`);
    for (const f of findings.slice(0, 10)) {
      console.warn(`  L${f.line} [${f.kind}] ${f.text}`);
    }
    if (findings.length > 10) {
      console.warn(`  ... ${findings.length - 10} more`);
    }
  }
  console.warn('\n[check:i18n-copy] non-blocking (exit 0).');
}

main();

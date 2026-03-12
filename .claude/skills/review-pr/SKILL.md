---
name: review-pr
description: Verify code changes and review Dev Agent PRs. Use this whenever someone says "review", "verify", "check the PR", "test this", "validate changes", or any variant of wanting to confirm code works correctly. Also use when a Dev Agent marks a PR as ready, or when you need to run the standard verification suite (typecheck, tests, build) before committing. Works in two modes — quick verify (no args) runs automated checks only; PR review (with PR number) adds browser verification against a test plan.
---

# Review PR

Verify code changes or review a Dev Agent's PR. Two modes depending on arguments.

## How to read `$ARGUMENTS`

- Empty or `verify` → **Quick Verify** (automated checks only)
- PR number (e.g. `126`) → **Full PR Review** (automated + browser + report)
- PR number + path (e.g. `126 docs/plans/phase-1-test-plan.md`) → Full review with explicit test plan

---

## Quick Verify (no PR number)

Run the standard verification suite. Dev agents use this after code changes, before marking PR ready.

```bash
npm run verify
```

This runs: `typecheck → check:test-sync → test:run → build` in sequence. Any failure stops the chain.

If a step fails:
1. Report the specific error
2. Suggest a fix direction
3. After fixing, rerun `npm run verify` from the start — don't skip steps

That's it. Quick verify is intentionally simple. The value is having one command that runs everything in the right order.

---

## Full PR Review (with PR number)

nodex uses this to review a Dev Agent's submitted PR. The goal is to catch issues that automated tests miss — visual bugs, interaction regressions, incorrect behavior that technically passes typecheck.

### Step 1: Prepare

1. Read PR info:

```bash
gh pr view <PR号> --json title,body,headRefName,state,isDraft
```

2. If PR is still Draft, ask the user whether to proceed or wait
3. Checkout the branch:

```bash
gh pr checkout <PR号>
```

4. Find the test plan:
   - If a path was given in `$ARGUMENTS` → use it
   - Otherwise → look at the PR body for which phase/feature this covers, search `docs/plans/*-test-plan.md`
   - If no test plan exists → tell the user, run automated checks only

5. Read the test plan file to understand what needs browser verification

### Step 2: Automated checks

```bash
npm run verify
```

All four checks must pass before proceeding to browser verification. If any fail, stop here — report the failure, don't waste time on browser tests when the code doesn't compile or tests are broken.

### Step 3: Browser verification

This step needs MCP tools (chrome-devtools / claude-in-chrome). If MCP is unavailable, output the test plan as a checklist for the user to verify manually.

1. Start dev server:

```bash
npm run dev
```

2. Wait for build output in `.output/chrome-mv3-dev/`
3. Ask the user to confirm the extension is loaded in Chrome
4. Walk through each scenario in the test plan:
   - Use `claude-in-chrome` MCP tools to interact with the extension (navigate, click, type, screenshot)
   - For each scenario: record PASS / FAIL / SKIP
   - SKIP means the scenario can't be verified via MCP (e.g. requires real keyboard events that ProseMirror ignores from synthetic input)
   - On FAIL: take a screenshot as evidence, describe what went wrong

5. Run the regression checks section of the test plan (if present)

### Step 4: Report

Output a structured review report:

```
## PR #<号> Review Report

### Automated checks
| Check | Result |
|-------|--------|
| typecheck | PASS/FAIL |
| test-sync | PASS/FAIL |
| vitest | PASS/FAIL |
| build | PASS/FAIL |

### Browser verification
| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| T1 | ... | PASS/FAIL/SKIP | ... |

### Regression checks
| # | Feature | Result |
|---|---------|--------|
| R1 | ... | PASS/FAIL |

### Summary
- Passed: X / Total: Y
- Blocking issues: [list FAIL items]
- Recommendation: approve / request changes / needs discussion
```

### How to decide

- **All automated + browser checks pass** → recommend approve
- **FAIL on non-core items** → list issues, recommend request changes with priority guidance
- **Core functionality FAIL** → block merge, describe reproduction steps in detail

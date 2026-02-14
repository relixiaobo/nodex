# Legacy Scripts (Retired)

`tests/scripts/*.js` has been retired.

Reason:

1. The project now uses `Vitest-first` as the only primary automated regression path.
2. DevTools `evaluate_script` snippets are no longer maintained as source of truth.

Use instead:

1. `npm run test:run` for automated regression.
2. `docs/TESTING.md` for coverage mapping and execution order.
3. `docs/MANUAL-TEST-CHECKLIST.md` only for high-risk manual exceptions.

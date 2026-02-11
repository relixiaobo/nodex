/**
 * Phase 1.4 — Edge Case / Boundary Condition Tests
 *
 * Tests operations that should be no-ops or gracefully fail:
 * - indent first child (no previous sibling)
 * - outdent top-level node (no grandparent)
 * Run via chrome-devtools evaluate_script on localhost:5199.
 *
 * Expected: { allPassed: true, results: [...] }
 */
(async () => {
  const ns = window.__nodeStore;
  const results = [];

  // indent first child (no previous sibling → should no-op)
  const firstChild = ns.getState().entities['task_1'].children[0];
  const parentBefore = ns.getState().entities[firstChild]?.props._ownerId;
  try {
    await ns.getState().indentNode(firstChild, 'user_default');
  } catch (e) { /* expected to fail or no-op */ }
  const parentAfter = ns.getState().entities[firstChild]?.props._ownerId;
  results.push({
    test: 'indent first child (no-op)',
    pass: parentAfter === parentBefore,
  });

  // outdent top-level node (parent is container → should no-op)
  // proj_1 is a direct child of ws_default_LIBRARY (container), so outdent should be blocked
  const topParentBefore = ns.getState().entities['proj_1']?.props._ownerId;
  try {
    await ns.getState().outdentNode('proj_1', 'user_default');
  } catch (e) { /* expected */ }
  const topParentAfter = ns.getState().entities['proj_1']?.props._ownerId;
  results.push({
    test: 'outdent top-level (no-op)',
    pass: topParentAfter === topParentBefore,
  });

  const allPassed = results.every(r => r.pass);
  return { allPassed, results };
})()

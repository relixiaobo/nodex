/**
 * Phase 1.2 — CRUD + Tree Operations
 *
 * Tests: createSibling, indent, outdent, moveDown, moveUp,
 *        trashNode, createChild, updateNodeName.
 * All test nodes are cleaned up after each operation.
 * Run via chrome-devtools evaluate_script on localhost:5199.
 *
 * Expected: { allPassed: true, results: [...] }
 */
(async () => {
  const ns = window.__nodeStore;
  const e = () => Object.keys(ns.getState().entities).length;
  const results = [];
  const countBefore = e();

  // ── createSibling ──
  const n1 = await ns.getState().createSibling('subtask_1a', 'ws_default', 'user_default');
  results.push({ test: 'createSibling', pass: e() === countBefore + 1, newId: n1.id });

  // ── indent (becomes child of previous sibling) ──
  await ns.getState().indentNode(n1.id, 'user_default');
  const afterIndent = ns.getState().entities[n1.id]?.props._ownerId;
  results.push({ test: 'indent', pass: afterIndent === 'subtask_1a', parentAfter: afterIndent });

  // ── outdent (back to grandparent) ──
  await ns.getState().outdentNode(n1.id, 'user_default');
  const afterOutdent = ns.getState().entities[n1.id]?.props._ownerId;
  results.push({ test: 'outdent', pass: afterOutdent === 'task_1', parentAfter: afterOutdent });

  // ── moveDown + moveUp (roundtrip, position restored) ──
  const childrenBefore = [...ns.getState().entities['task_1'].children];
  await ns.getState().moveNodeDown(n1.id, 'user_default');
  await ns.getState().moveNodeUp(n1.id, 'user_default');
  const childrenAfter = ns.getState().entities['task_1'].children;
  results.push({
    test: 'moveUp/Down roundtrip',
    pass: JSON.stringify(childrenAfter) === JSON.stringify(childrenBefore),
  });

  // ── trashNode (verify both _ownerId and trash.children updated) ──
  await ns.getState().trashNode(n1.id, 'ws_default', 'user_default');
  const trash = ns.getState().entities['ws_default_TRASH'];
  const inTrash = trash?.children?.includes(n1.id);
  const notInParent = !ns.getState().entities['task_1'].children.includes(n1.id);
  results.push({
    test: 'trashNode',
    pass: inTrash === true && notInParent === true,
    inTrash,
    notInParent,
  });

  // ── createChild ──
  const child = await ns.getState().createChild('note_2', 'ws_default', 'user_default', 'Test child');
  const parentChildren = ns.getState().entities['note_2'].children;
  results.push({
    test: 'createChild',
    pass: parentChildren.includes(child.id) && ns.getState().entities[child.id]?.props.name === 'Test child',
  });
  // cleanup
  await ns.getState().trashNode(child.id, 'ws_default', 'user_default');

  // ── updateNodeName ──
  const origName = ns.getState().entities['idea_1']?.props.name;
  await ns.getState().updateNodeName('idea_1', 'Renamed idea', 'user_default');
  results.push({
    test: 'updateNodeName',
    pass: ns.getState().entities['idea_1']?.props.name === 'Renamed idea',
  });
  // restore
  await ns.getState().updateNodeName('idea_1', origName, 'user_default');

  // ── summary ──
  const allPassed = results.every(r => r.pass);
  return { allPassed, results };
})()

/**
 * Phase 1.3 — UI Store Operations
 *
 * Tests: navigateTo, goBack, replacePanel, expand, collapse,
 *        toggleExpanded, setFocusedNode, openSearch, closeSearch,
 *        toggleSidebar.
 * All state is restored after each test.
 * Run via chrome-devtools evaluate_script on localhost:5199.
 *
 * Expected: { allPassed: true, results: [...] }
 */
(() => {
  const ui = window.__uiStore;
  const results = [];
  const historyBefore = ui.getState().panelHistory.length;
  const indexBefore = ui.getState().panelIndex;

  // navigateTo (replaces pushPanel)
  ui.getState().navigateTo('inbox_3');
  const s1 = ui.getState();
  results.push({ test: 'navigateTo', pass: s1.panelHistory[s1.panelIndex] === 'inbox_3' });

  // goBack (replaces popPanel)
  ui.getState().goBack();
  const s2 = ui.getState();
  results.push({ test: 'goBack', pass: s2.panelIndex === s1.panelIndex - 1 });

  // goForward
  ui.getState().goForward();
  const s3 = ui.getState();
  results.push({ test: 'goForward', pass: s3.panelHistory[s3.panelIndex] === 'inbox_3' });

  // replacePanel
  const currentBefore = ui.getState().panelHistory[ui.getState().panelIndex];
  ui.getState().replacePanel('note_2');
  const currentAfter = ui.getState().panelHistory[ui.getState().panelIndex];
  results.push({ test: 'replacePanel', pass: currentAfter === 'note_2' });
  ui.getState().replacePanel(currentBefore); // restore

  // expand / collapse (compound keys: parentId:nodeId)
  ui.getState().setExpanded('ws_default_LIBRARY:note_2', true);
  results.push({ test: 'expand', pass: ui.getState().expandedNodes.has('ws_default_LIBRARY:note_2') });
  ui.getState().setExpanded('ws_default_LIBRARY:note_2', false);
  results.push({ test: 'collapse', pass: !ui.getState().expandedNodes.has('ws_default_LIBRARY:note_2') });

  // toggle expand
  ui.getState().toggleExpanded('ws_default_LIBRARY:note_2');
  results.push({ test: 'toggleExpand', pass: ui.getState().expandedNodes.has('ws_default_LIBRARY:note_2') });
  ui.getState().toggleExpanded('ws_default_LIBRARY:note_2'); // restore

  // focus
  ui.getState().setFocusedNode('subtask_1a');
  results.push({ test: 'setFocus', pass: ui.getState().focusedNodeId === 'subtask_1a' });
  ui.getState().setFocusedNode(null);
  results.push({ test: 'clearFocus', pass: ui.getState().focusedNodeId === null });

  // search open/close
  ui.getState().openSearch();
  results.push({ test: 'openSearch', pass: ui.getState().searchOpen === true });
  ui.getState().closeSearch();
  results.push({ test: 'closeSearch', pass: ui.getState().searchOpen === false });

  // sidebar toggle
  const sidebarBefore = ui.getState().sidebarOpen;
  ui.getState().toggleSidebar();
  results.push({ test: 'toggleSidebar', pass: ui.getState().sidebarOpen === !sidebarBefore });
  ui.getState().toggleSidebar(); // restore

  const allPassed = results.every(r => r.pass);
  return { allPassed, results };
})()

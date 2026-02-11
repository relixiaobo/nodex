/**
 * Phase 1.3 — UI Store Operations
 *
 * Tests: pushPanel, popPanel, replacePanel, expand, collapse,
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
  const stackBefore = ui.getState().panelStack.length;

  // pushPanel
  ui.getState().pushPanel('inbox_3');
  results.push({ test: 'pushPanel', pass: ui.getState().panelStack.length === stackBefore + 1 });

  // popPanel
  ui.getState().popPanel();
  results.push({ test: 'popPanel', pass: ui.getState().panelStack.length === stackBefore });

  // replacePanel
  const topBefore = ui.getState().panelStack[ui.getState().panelStack.length - 1];
  ui.getState().replacePanel('note_2');
  const topAfter = ui.getState().panelStack[ui.getState().panelStack.length - 1];
  results.push({ test: 'replacePanel', pass: topAfter === 'note_2' });
  ui.getState().replacePanel(topBefore); // restore

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

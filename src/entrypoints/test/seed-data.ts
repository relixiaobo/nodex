/**
 * Seed sample data for the test page.
 *
 * Creates a realistic outliner tree with various node types
 * to exercise all outliner interactions.
 *
 * New model (Loro Phase 1):
 * - Flat NodexNode: no `props` wrapper
 * - NodeType: 'fieldEntry' (was 'tuple'), 'fieldDef' (was 'attrDef')
 * - Tags: direct node.tags array (no meta tuples)
 * - TagDef config: direct properties (showCheckbox, color, etc.)
 * - FieldDef config: direct properties (fieldType, minValue, etc.)
 * - Container IDs: fixed (CONTAINER_IDS.*)
 */
import { initLoroDoc, initLoroDocForTest, commitDoc, clearUndoHistoryForTest } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { deleteSnapshot } from '../../lib/loro-persistence.js';
import { resetTimeline } from '../../lib/undo-timeline.js';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { CONTAINER_IDS, FIELD_TYPES } from '../../types/index.js';
import type { InlineRefEntry, TextMark } from '../../types/index.js';
import { ensureDateNode } from '../../lib/journal.js';

const WS_ID = 'ws_default';

/** Create a node with specific ID and data if it doesn't already exist. */
function cn(id: string, parentId: string | null, data: Record<string, unknown>, index?: number): void {
  if (loroDoc.hasNode(id)) return;
  loroDoc.createNode(id, parentId, index);
  const marks = data.marks as TextMark[] | undefined;
  const inlineRefs = data.inlineRefs as InlineRefEntry[] | undefined;
  const name = data.name as string | undefined;

  if (marks || inlineRefs) {
    const { marks: _marks, inlineRefs: _inlineRefs, ...rest } = data;
    if (Object.keys(rest).length > 0) loroDoc.setNodeDataBatch(id, rest);
    loroDoc.setNodeRichTextContent(id, name ?? '', marks ?? [], inlineRefs ?? []);
    return;
  }

  if (Object.keys(data).length > 0) {
    loroDoc.setNodeDataBatch(id, data);
  }
}

function seedBody(): void {
  // Skip if already seeded (avoid re-seeding on hot reload)
  if (loroDoc.getAllNodeIds().length > 10) return;

  // ─── Workspace containers (root-level, no parent) ───
  cn(CONTAINER_IDS.LIBRARY,  null, { name: 'Library' });
  cn(CONTAINER_IDS.INBOX,    null, { name: 'Inbox' });
  cn(CONTAINER_IDS.JOURNAL,  null, { name: 'Journal' });
  cn(CONTAINER_IDS.SEARCHES, null, { name: 'Searches' });
  cn(CONTAINER_IDS.TRASH,    null, { name: 'Trash' });
  cn(CONTAINER_IDS.SCHEMA,   null, { name: 'Schema' });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Task (showCheckbox, color, done-state mapping via direct props)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_task', CONTAINER_IDS.SCHEMA, {
    type: 'tagDef', name: 'Task', showCheckbox: true, color: 'emerald',
  });

  // FieldDef: Status (OPTIONS)
  cn('attrDef_status', 'tagDef_task', { type: 'fieldDef', name: 'Status', fieldType: FIELD_TYPES.OPTIONS });
  cn('opt_todo',        'attrDef_status', { name: 'To Do' });
  cn('opt_in_progress', 'attrDef_status', { name: 'In Progress' });
  cn('opt_done',        'attrDef_status', { name: 'Done' });

  // FieldDef: Priority (OPTIONS)
  cn('attrDef_priority', 'tagDef_task', { type: 'fieldDef', name: 'Priority', fieldType: FIELD_TYPES.OPTIONS });
  cn('opt_high',   'attrDef_priority', { name: 'High' });
  cn('opt_medium', 'attrDef_priority', { name: 'Medium' });
  cn('opt_low',    'attrDef_priority', { name: 'Low' });

  // FieldDef: Due (DATE)
  cn('attrDef_due', 'tagDef_task', { type: 'fieldDef', name: 'Due', fieldType: FIELD_TYPES.DATE });

  // FieldDef: Done (CHECKBOX)
  cn('attrDef_done_chk', 'tagDef_task', { type: 'fieldDef', name: 'Done', fieldType: FIELD_TYPES.CHECKBOX });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Person
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_person', CONTAINER_IDS.SCHEMA, {
    type: 'tagDef', name: 'Person',
    description: 'Tag for tracking people and their contact info',
  });
  cn('attrDef_email',   'tagDef_person', { type: 'fieldDef', name: 'Email',   fieldType: FIELD_TYPES.EMAIL  });
  cn('attrDef_company', 'tagDef_person', { type: 'fieldDef', name: 'Company', fieldType: FIELD_TYPES.PLAIN  });
  cn('attrDef_age',     'tagDef_person', { type: 'fieldDef', name: 'Age',     fieldType: FIELD_TYPES.NUMBER, minValue: 0, maxValue: 150 });
  cn('attrDef_website', 'tagDef_person', { type: 'fieldDef', name: 'Website', fieldType: FIELD_TYPES.URL    });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: DevTask (extends Task)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_dev_task', CONTAINER_IDS.SCHEMA, {
    type: 'tagDef', name: 'Dev Task', showCheckbox: true,
    extends: 'tagDef_task',
    description: 'Dev task extending Task with a Branch field',
  });
  cn('attrDef_branch', 'tagDef_dev_task', { type: 'fieldDef', name: 'Branch', fieldType: FIELD_TYPES.PLAIN });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: WebClip
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_web_clip', CONTAINER_IDS.SCHEMA, { type: 'tagDef', name: 'web_clip' });
  cn('attrDef_source_url', 'tagDef_web_clip', { type: 'fieldDef', name: 'Source URL', fieldType: FIELD_TYPES.URL });

  // ═══════════════════════════════════════════════════════════════
  // Library content
  // ═══════════════════════════════════════════════════════════════

  // ── Project ──
  cn('proj_1', CONTAINER_IDS.LIBRARY, {
    name: 'My Project',
    description: 'A sample project to demonstrate outliner features',
  });

  // task_1: tagged with Task — applyTag auto-creates fieldEntry children
  cn('task_1', 'proj_1', { name: 'Design the data model' });
  useNodeStore.getState().applyTag('task_1', 'tagDef_task');
  cn('subtask_1a', 'task_1', { name: 'Define node types and properties' });
  cn('subtask_1b', 'task_1', { name: 'Create database migration' });

  cn('task_2', 'proj_1', { name: 'Build the outliner UI' });
  cn('subtask_2a', 'task_2', { name: 'Implement BulletChevron component' });
  cn('subtask_2b', 'task_2', { name: 'Add keyboard navigation' });
  cn('subtask_2c', 'task_2', { name: 'Implement drag and drop' });

  cn('task_3', 'proj_1', { name: 'Connect to Supabase' });

  // ── Person node ──
  cn('person_1', CONTAINER_IDS.LIBRARY, { name: 'Alice Johnson' });
  useNodeStore.getState().applyTag('person_1', 'tagDef_person');

  // ── Simple notes ──
  cn('note_1', CONTAINER_IDS.LIBRARY, { name: 'Meeting notes - Team standup' });
  cn('note_1a', 'note_1', { name: 'Discussed project timeline' });
  cn('note_1b', 'note_1', { name: 'Need to review PR #42' });
  cn('note_1c', 'note_1', { name: 'Next meeting on Friday' });

  cn('note_2', CONTAINER_IDS.LIBRARY, { name: 'Quick ideas' });
  cn('idea_1', 'note_2', { name: 'Try using virtual scrolling for large lists' });
  cn('idea_2', 'note_2', { name: 'Add dark mode support' });

  // ── Rich text test nodes ──
  cn('note_rich', CONTAINER_IDS.LIBRARY, { name: 'Rich text formatting tests' });
  cn('rich_1', 'note_rich', {
    name: 'Bold text mixed with normal',
    marks: [{ start: 0, end: 9, type: 'bold' }],
  });
  cn('rich_2', 'note_rich', {
    name: 'Italic text and bold italic',
    marks: [
      { start: 0, end: 11, type: 'italic' },
      { start: 16, end: 27, type: 'bold' },
      { start: 16, end: 27, type: 'italic' },
    ],
  });
  cn('rich_3', 'note_rich', {
    name: 'Inline code snippet in a sentence',
    marks: [{ start: 7, end: 19, type: 'code' }],
  });
  cn('rich_4', 'note_rich', {
    name: 'Strikethrough text for done items',
    marks: [{ start: 0, end: 17, type: 'strike' }],
  });
  cn('rich_5', 'note_rich', {
    name: 'Text with highlighted parts',
    marks: [{ start: 10, end: 21, type: 'highlight' }],
  });
  cn('rich_inline_ref', 'note_rich', {
    name: 'Refer to \uFFFC for details',
    inlineRefs: [{ offset: 9, targetNodeId: 'task_1', displayName: 'Design the data model' }],
  });

  // ═══════════════════════════════════════════════════════════════
  // Inbox content
  // ═══════════════════════════════════════════════════════════════
  cn('inbox_1', CONTAINER_IDS.INBOX, { name: 'Read the article about Chrome extensions' });
  cn('inbox_2', CONTAINER_IDS.INBOX, { name: 'Respond to email from client' });
  cn('inbox_3', CONTAINER_IDS.INBOX, { name: 'Review pull request' });
  cn('inbox_3a', 'inbox_3', { name: 'Check test coverage' });
  cn('inbox_3b', 'inbox_3', { name: 'Verify performance impact' });

  // Web clip (pre-tagged)
  cn('webclip_1', CONTAINER_IDS.INBOX, {
    name: 'Example Article — Medium',
    description: 'A sample web clip to demonstrate the clipping feature',
  });
  useNodeStore.getState().applyTag('webclip_1', 'tagDef_web_clip');
  // Set Source URL value: create a value node under the fieldEntry
  const wcFeId = loroDoc.getChildren('webclip_1')
    .find((c) => {
      const n = loroDoc.toNodexNode(c);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_source_url';
    });
  if (wcFeId) {
    cn('webclip1_val_url', wcFeId, { name: 'https://medium.com/example-article' });
  }

  // Web clip content child nodes (simulating parsed article body)
  cn('wc1_section1', 'webclip_1', {
    name: 'Introduction',
    marks: [{ start: 0, end: 12, type: 'bold' as const }],
  });
  cn('wc1_p1', 'wc1_section1', { name: 'This article explores the fundamentals of web clipping and knowledge management.' });
  cn('wc1_p2', 'wc1_section1', {
    name: 'Key concepts include structured note-taking and semantic tagging.',
    marks: [{ start: 22, end: 47, type: 'bold' as const }],
  });
  cn('wc1_section2', 'webclip_1', { name: 'Conclusion' });
  cn('wc1_p3', 'wc1_section2', { name: 'Web clipping transforms passive reading into active knowledge building.' });

  // ═══════════════════════════════════════════════════════════════
  // Journal content (real date hierarchy: Year → Week → Day)
  // ═══════════════════════════════════════════════════════════════
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  // ensureDateNode creates Year → Week → Day with system tags + descending sort
  const todayDayId = ensureDateNode(today);
  const yesterdayDayId = ensureDateNode(yesterday);

  // Today's notes (3 notes → heatmap tier 2: bg-primary/15)
  cn('j_today_1', todayDayId, { name: 'Started working on the outliner component' });
  cn('j_today_2', todayDayId, { name: 'Fixed a bug in the drag and drop handler' });
  cn('j_today_3', todayDayId, { name: 'Learned about TipTap keyboard shortcuts' });

  // Yesterday's notes (2 notes → heatmap tier 1: bg-primary/8)
  cn('j_yest_1', yesterdayDayId, { name: 'Reviewed PR for data model migration' });
  cn('j_yest_2', yesterdayDayId, { name: 'Sketched out the journal feature plan' });

  // ── More journal days for heatmap demo ──
  // -2 days: 5 notes → heatmap tier 3: bg-primary/25
  const day2ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
  const day2agoId = ensureDateNode(day2ago);
  cn('j_d2_1', day2agoId, { name: 'Deep work: refactored node-store architecture' });
  cn('j_d2_2', day2agoId, { name: 'Code review for 3 PRs' });
  cn('j_d2_3', day2agoId, { name: 'Fixed drag-and-drop edge case in nested outliner' });
  cn('j_d2_4', day2agoId, { name: 'Updated TESTING.md with new coverage' });
  cn('j_d2_5', day2agoId, { name: 'Deployed staging build and verified' });

  // -4 days: 1 note → heatmap tier 1: bg-primary/8
  const day4ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4);
  const day4agoId = ensureDateNode(day4ago);
  cn('j_d4_1', day4agoId, { name: 'Quick standup sync — no blockers' });

  // -5 days: 4 notes → heatmap tier 2: bg-primary/15
  const day5ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5);
  const day5agoId = ensureDateNode(day5ago);
  cn('j_d5_1', day5agoId, { name: 'Researched Tana config page architecture' });
  cn('j_d5_2', day5agoId, { name: 'Drafted supertag inheritance design' });
  cn('j_d5_3', day5agoId, { name: 'Pair programming on field validation' });
  cn('j_d5_4', day5agoId, { name: 'Wrote field-utils test coverage' });

  // -7 days: 6 notes → heatmap tier 3: bg-primary/25
  const day7ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const day7agoId = ensureDateNode(day7ago);
  cn('j_d7_1', day7agoId, { name: 'Kickoff meeting for calendar heatmap feature' });
  cn('j_d7_2', day7agoId, { name: 'Designed data model for note counts' });
  cn('j_d7_3', day7agoId, { name: 'Implemented getDayNoteCountsForMonth' });
  cn('j_d7_4', day7agoId, { name: 'Built CalendarGrid heatmap UI' });
  cn('j_d7_5', day7agoId, { name: 'Wrote vitest coverage for heatmap' });
  cn('j_d7_6', day7agoId, { name: 'Visual verification and polish' });

  // -10 days: 2 notes → heatmap tier 1: bg-primary/8
  const day10ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
  const day10agoId = ensureDateNode(day10ago);
  cn('j_d10_1', day10agoId, { name: 'Sprint retrospective notes' });
  cn('j_d10_2', day10agoId, { name: 'Planned next sprint priorities' });

  // -14 days: 3 notes → heatmap tier 2: bg-primary/15
  const day14ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
  const day14agoId = ensureDateNode(day14ago);
  cn('j_d14_1', day14agoId, { name: 'Explored Loro CRDT merge semantics' });
  cn('j_d14_2', day14agoId, { name: 'Benchmarked tree traversal performance' });
  cn('j_d14_3', day14agoId, { name: 'Fixed undo/redo edge case' });

  // ═══════════════════════════════════════════════════════════════
  // UI State: navigation + expand defaults
  // ═══════════════════════════════════════════════════════════════
  const uiStore = useUIStore.getState();

  // Expand some nodes by default for testing
  uiStore.setExpanded(`${CONTAINER_IDS.LIBRARY}:proj_1`, true);
  uiStore.setExpanded('proj_1:task_1', true);
  uiStore.setExpanded('proj_1:task_2', true);
  uiStore.setExpanded(`${CONTAINER_IDS.LIBRARY}:note_rich`, true);

  // Navigate to Library
  if (uiStore.panelHistory.length === 0) {
    uiStore.navigateTo(CONTAINER_IDS.LIBRARY);
  }
}

export async function seedTestData(options?: { forceFresh?: boolean }): Promise<void> {
  // Check for ?reset or ?fresh to bypass IndexedDB
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const forceFresh = options?.forceFresh ?? (params?.has('reset') || params?.has('fresh'));

  if (forceFresh) {
    // Ensure old persisted snapshot cannot reappear on next bootstrap.
    await deleteSnapshot(WS_ID);
    // Bypass IndexedDB — pure in-memory LoroDoc
    initLoroDocForTest(WS_ID);
    // Reset persisted UI/workspace state for deterministic test page boot.
    await useUIStore.persist.clearStorage();
    await useWorkspaceStore.persist.clearStorage();
    useUIStore.setState({ panelHistory: [], panelIndex: -1, expandedNodes: new Set() });
    useWorkspaceStore.setState({ currentWorkspaceId: null, userId: null, isAuthenticated: false, authUser: null });
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('nodex-ui');
    }
  } else {
    // Normal: load from IndexedDB snapshot if available
    await initLoroDoc(WS_ID);
  }

  // Set workspace/user in stores
  useWorkspaceStore.getState().setWorkspace(WS_ID);
  useWorkspaceStore.getState().setUser('user_default');

  seedBody();

  // Commit so Loro subscriptions fire and _version bumps for React
  commitDoc('__seed__');
}

/** Sync seed for test environments (call after initLoroDocForTest). */
export function seedTestDataSync(): void {
  initLoroDocForTest(WS_ID);

  // Set workspace/user in stores
  useWorkspaceStore.getState().setWorkspace(WS_ID);
  useWorkspaceStore.getState().setUser('user_default');

  seedBody();

  // Commit seed state with a special origin so UndoManager excludes it.
  // Any subsequent user operations will start a clean undo history.
  commitDoc('__seed__');
  // Some store actions (applyTag etc.) call commitDoc() internally without '__seed__' origin.
  // Reinitialize UndoManager to clear those intermediate entries.
  clearUndoHistoryForTest();
  // Clear unified timeline entries accumulated during seeding (navigateTo, applyTag etc.)
  resetTimeline();
}

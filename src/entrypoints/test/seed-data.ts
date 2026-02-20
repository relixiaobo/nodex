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
import { initLoroDoc, initLoroDocForTest, commitDoc } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { CONTAINER_IDS } from '../../types/index.js';

const WS_ID = 'ws_default';

/** Create a node with specific ID and data if it doesn't already exist. */
function cn(id: string, parentId: string | null, data: Record<string, unknown>, index?: number): void {
  if (loroDoc.hasNode(id)) return;
  loroDoc.createNode(id, parentId, index);
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
  cn('attrDef_status', 'tagDef_task', { type: 'fieldDef', name: 'Status', fieldType: 'OPTIONS' });
  cn('opt_todo',        'attrDef_status', { name: 'To Do' });
  cn('opt_in_progress', 'attrDef_status', { name: 'In Progress' });
  cn('opt_done',        'attrDef_status', { name: 'Done' });

  // FieldDef: Priority (OPTIONS)
  cn('attrDef_priority', 'tagDef_task', { type: 'fieldDef', name: 'Priority', fieldType: 'OPTIONS' });
  cn('opt_high',   'attrDef_priority', { name: 'High' });
  cn('opt_medium', 'attrDef_priority', { name: 'Medium' });
  cn('opt_low',    'attrDef_priority', { name: 'Low' });

  // FieldDef: Due (DATE)
  cn('attrDef_due', 'tagDef_task', { type: 'fieldDef', name: 'Due', fieldType: 'DATE' });

  // FieldDef: Done (CHECKBOX)
  cn('attrDef_done_chk', 'tagDef_task', { type: 'fieldDef', name: 'Done', fieldType: 'CHECKBOX' });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Person
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_person', CONTAINER_IDS.SCHEMA, {
    type: 'tagDef', name: 'Person',
    description: 'Tag for tracking people and their contact info',
  });
  cn('attrDef_email',   'tagDef_person', { type: 'fieldDef', name: 'Email',   fieldType: 'EMAIL'  });
  cn('attrDef_company', 'tagDef_person', { type: 'fieldDef', name: 'Company', fieldType: 'PLAIN'  });
  cn('attrDef_age',     'tagDef_person', { type: 'fieldDef', name: 'Age',     fieldType: 'NUMBER', minValue: 0, maxValue: 150 });
  cn('attrDef_website', 'tagDef_person', { type: 'fieldDef', name: 'Website', fieldType: 'URL'    });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: DevTask (extends Task)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_dev_task', CONTAINER_IDS.SCHEMA, {
    type: 'tagDef', name: 'Dev Task', showCheckbox: true,
    extends: 'tagDef_task',
    description: 'Dev task extending Task with a Branch field',
  });
  cn('attrDef_branch', 'tagDef_dev_task', { type: 'fieldDef', name: 'Branch', fieldType: 'PLAIN' });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: WebClip
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_web_clip', CONTAINER_IDS.SCHEMA, { type: 'tagDef', name: 'web_clip' });
  cn('attrDef_source_url', 'tagDef_web_clip', { type: 'fieldDef', name: 'Source URL', fieldType: 'URL' });

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

  // ═══════════════════════════════════════════════════════════════
  // Journal content
  // ═══════════════════════════════════════════════════════════════
  cn('journal_1', CONTAINER_IDS.JOURNAL, { name: "Today's Journal" });
  cn('j_1', 'journal_1', { name: 'Started working on the outliner component' });
  cn('j_2', 'journal_1', { name: 'Fixed a bug in the drag and drop handler' });
  cn('j_3', 'journal_1', { name: 'Learned about TipTap keyboard shortcuts' });

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

export async function seedTestData(): Promise<void> {
  // Initialize LoroDoc first (async)
  await initLoroDoc(WS_ID);

  // Set workspace/user in stores
  useWorkspaceStore.getState().setWorkspace(WS_ID);
  useWorkspaceStore.getState().setUser('user_default');

  seedBody();
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
}

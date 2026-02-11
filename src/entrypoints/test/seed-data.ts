/**
 * Seed sample data for the test page.
 *
 * Creates a realistic outliner tree with various node types
 * to exercise all outliner interactions.
 */
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import type { NodexNode, DocType } from '../../types/index.js';
import { SYS_A, SYS_D, SYS_V } from '../../types/index.js';

const WS_ID = 'ws_default';
const USER_ID = 'user_default';

function makeNode(
  id: string,
  name: string,
  parentId: string,
  children: string[] = [],
  docType?: DocType,
): NodexNode {
  const now = Date.now();
  return {
    id,
    workspaceId: WS_ID,
    props: {
      created: now,
      name,
      _ownerId: parentId,
      ...(docType ? { _docType: docType } : {}),
    },
    children,
    version: 1,
    updatedAt: now,
    createdBy: USER_ID,
    updatedBy: USER_ID,
  };
}

export function seedTestData() {
  const store = useNodeStore.getState();
  const wsStore = useWorkspaceStore.getState();
  const uiStore = useUIStore.getState();

  // Only seed if store is empty (avoid re-seeding on hot reload)
  if (Object.keys(store.entities).length > 10) return;

  // Set workspace
  wsStore.setWorkspace(WS_ID);
  wsStore.setUser(USER_ID);

  // ─── Container nodes ───
  const libraryId = `${WS_ID}_LIBRARY`;
  const inboxId = `${WS_ID}_INBOX`;
  const journalId = `${WS_ID}_JOURNAL`;
  const searchesId = `${WS_ID}_SEARCHES`;
  const trashId = `${WS_ID}_TRASH`;
  const schemaId = `${WS_ID}_SCHEMA`;

  const containers = [
    makeNode(libraryId, 'Library', WS_ID, ['proj_1', 'note_1', 'note_2', 'note_rich']),
    makeNode(inboxId, 'Inbox', WS_ID, ['inbox_1', 'inbox_2', 'inbox_3']),
    makeNode(journalId, 'Journal', WS_ID, ['journal_1']),
    makeNode(searchesId, 'Searches', WS_ID, []),
    makeNode(trashId, 'Trash', WS_ID, []),
    makeNode(schemaId, 'Schema', WS_ID, [
      'SYS_T02',
      'tagDef_task', 'tagDef_person',
      'attrDef_status', 'attrDef_priority', 'attrDef_due',
      'attrDef_email', 'attrDef_company',
    ]),
  ];

  // ─── Library nodes ───

  // Project with nested structure
  const projectNodes = [
    makeNode('proj_1', 'My Project', libraryId, ['task_1', 'task_2', 'task_3', 'note_1a']),
    {
      ...makeNode('task_1', 'Design the data model', 'proj_1', [
        'subtask_1a', 'subtask_1b',
        'task1_fld_status', 'task1_fld_priority', 'task1_fld_due',
      ]),
      props: {
        ...makeNode('task_1', 'Design the data model', 'proj_1').props,
        _metaNodeId: 'meta_task_1',
      },
      associationMap: {
        task1_fld_status: 'task1_assoc_status',
        task1_fld_priority: 'task1_assoc_priority',
        task1_fld_due: 'task1_assoc_due',
      },
    },
    makeNode('subtask_1a', 'Define node types and properties', 'task_1', []),
    makeNode('subtask_1b', 'Create database migration', 'task_1', []),
    makeNode('task_2', 'Build the outliner UI', 'proj_1', ['subtask_2a', 'subtask_2b', 'subtask_2c']),
    makeNode('subtask_2a', 'Implement BulletChevron component', 'task_2', []),
    makeNode('subtask_2b', 'Add keyboard navigation', 'task_2', []),
    makeNode('subtask_2c', 'Implement drag and drop', 'task_2', []),
    makeNode('task_3', 'Connect to Supabase', 'proj_1', []),
  ];

  // Simple notes
  const noteNodes = [
    makeNode('note_1', 'Meeting notes - Team standup', libraryId, ['note_1a', 'note_1b', 'note_1c']),
    makeNode('note_1a', 'Discussed project timeline', 'note_1', []),
    makeNode('note_1b', 'Need to review PR #42', 'note_1', []),
    makeNode('note_1c', 'Next meeting on Friday', 'note_1', []),
    makeNode('note_2', 'Quick ideas', libraryId, ['idea_1', 'idea_2']),
    makeNode('idea_1', 'Try using virtual scrolling for large lists', 'note_2', []),
    makeNode('idea_2', 'Add dark mode support', 'note_2', []),
  ];

  // Rich text test node
  const richTextNodes = [
    makeNode(
      'note_rich',
      'Rich text formatting tests',
      libraryId,
      ['rich_1', 'rich_2', 'rich_3', 'rich_4', 'rich_5', 'rich_inline_ref'],
    ),
    makeNode('rich_1', '<strong>Bold text</strong> mixed with normal', 'note_rich', []),
    makeNode('rich_2', '<em>Italic text</em> and <strong><em>bold italic</em></strong>', 'note_rich', []),
    makeNode('rich_3', 'Inline <code>code snippet</code> in a sentence', 'note_rich', []),
    makeNode('rich_4', '<s>Strikethrough text</s> for done items', 'note_rich', []),
    makeNode('rich_5', 'Text with <mark>highlighted</mark> parts', 'note_rich', []),
    makeNode('rich_inline_ref', 'Refer to <span data-inlineref-node="task_1">Design the data model</span> for details', 'note_rich', []),
  ];

  // ─── Inbox nodes ───
  const inboxNodes = [
    makeNode('inbox_1', 'Read the article about Chrome extensions', inboxId, []),
    makeNode('inbox_2', 'Respond to email from client', inboxId, []),
    makeNode('inbox_3', 'Review pull request', inboxId, ['inbox_3a', 'inbox_3b']),
    makeNode('inbox_3a', 'Check test coverage', 'inbox_3', []),
    makeNode('inbox_3b', 'Verify performance impact', 'inbox_3', []),
  ];

  // ─── Journal node ───
  const journalNodes = [
    makeNode('journal_1', 'Today\'s Journal', journalId, ['j_1', 'j_2', 'j_3']),
    makeNode('j_1', 'Started working on the outliner component', 'journal_1', []),
    makeNode('j_2', 'Fixed a bug in the drag and drop handler', 'journal_1', []),
    makeNode('j_3', 'Learned about TipTap keyboard shortcuts', 'journal_1', []),
  ];

  // ─── Schema: SYS_T02 + TagDef + AttrDef nodes ───

  // SYS_T02 (Field Definition) — system tag for attrDef config pages
  const sysT02Nodes: NodexNode[] = [
    makeNode('SYS_T02', 'Field Definition', schemaId, [
      'sysT02_tpl_type', 'sysT02_tpl_autocollect', 'sysT02_tpl_required', 'sysT02_tpl_hide',
    ], 'tagDef'),
    makeNode('sysT02_tpl_type', '', 'SYS_T02', [SYS_A.TYPE_CHOICE], 'tuple'),
    makeNode('sysT02_tpl_autocollect', '', 'SYS_T02', [SYS_A.AUTOCOLLECT_OPTIONS], 'tuple'),
    makeNode('sysT02_tpl_required', '', 'SYS_T02', [SYS_A.NULLABLE], 'tuple'),
    makeNode('sysT02_tpl_hide', '', 'SYS_T02', [SYS_A.HIDE_FIELD], 'tuple'),
  ];

  // AttrDef: Status (options type) — all config tuples + options
  const attrDefStatusNodes: NodexNode[] = [
    makeNode('attrDef_status', 'Status', schemaId, [
      'attrDef_status_type', 'attrDef_status_autocollect',
      'attrDef_status_required', 'attrDef_status_hide',
      'opt_todo', 'opt_in_progress', 'opt_done',
    ], 'attrDef'),
    makeNode('attrDef_status_type', '', 'attrDef_status', [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS], 'tuple'),
    makeNode('attrDef_status_autocollect', '', 'attrDef_status', [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES], 'tuple'),
    makeNode('attrDef_status_required', '', 'attrDef_status', [SYS_A.NULLABLE, SYS_V.NO], 'tuple'),
    makeNode('attrDef_status_hide', '', 'attrDef_status', [SYS_A.HIDE_FIELD, SYS_V.NEVER], 'tuple'),
    makeNode('opt_todo', 'To Do', 'attrDef_status'),
    makeNode('opt_in_progress', 'In Progress', 'attrDef_status'),
    makeNode('opt_done', 'Done', 'attrDef_status'),
  ];

  // AttrDef: Priority (options type)
  const attrDefPriorityNodes: NodexNode[] = [
    makeNode('attrDef_priority', 'Priority', schemaId, [
      'attrDef_priority_type', 'attrDef_priority_autocollect',
      'attrDef_priority_required', 'attrDef_priority_hide',
      'opt_high', 'opt_medium', 'opt_low',
    ], 'attrDef'),
    makeNode('attrDef_priority_type', '', 'attrDef_priority', [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS], 'tuple'),
    makeNode('attrDef_priority_autocollect', '', 'attrDef_priority', [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES], 'tuple'),
    makeNode('attrDef_priority_required', '', 'attrDef_priority', [SYS_A.NULLABLE, SYS_V.NO], 'tuple'),
    makeNode('attrDef_priority_hide', '', 'attrDef_priority', [SYS_A.HIDE_FIELD, SYS_V.NEVER], 'tuple'),
    makeNode('opt_high', 'High', 'attrDef_priority'),
    makeNode('opt_medium', 'Medium', 'attrDef_priority'),
    makeNode('opt_low', 'Low', 'attrDef_priority'),
  ];

  // AttrDef: Due (date type) — all 4 config tuples
  const attrDefDueNodes: NodexNode[] = [
    makeNode('attrDef_due', 'Due', schemaId, [
      'attrDef_due_type', 'attrDef_due_autocollect', 'attrDef_due_required', 'attrDef_due_hide',
    ], 'attrDef'),
    makeNode('attrDef_due_type', '', 'attrDef_due', [SYS_A.TYPE_CHOICE, SYS_D.DATE], 'tuple'),
    makeNode('attrDef_due_autocollect', '', 'attrDef_due', [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES], 'tuple'),
    makeNode('attrDef_due_required', '', 'attrDef_due', [SYS_A.NULLABLE, SYS_V.NO], 'tuple'),
    makeNode('attrDef_due_hide', '', 'attrDef_due', [SYS_A.HIDE_FIELD, SYS_V.NEVER], 'tuple'),
  ];

  // AttrDef: Email (email type)
  const attrDefEmailNodes: NodexNode[] = [
    makeNode('attrDef_email', 'Email', schemaId, [
      'attrDef_email_type', 'attrDef_email_autocollect', 'attrDef_email_required', 'attrDef_email_hide',
    ], 'attrDef'),
    makeNode('attrDef_email_type', '', 'attrDef_email', [SYS_A.TYPE_CHOICE, SYS_D.EMAIL], 'tuple'),
    makeNode('attrDef_email_autocollect', '', 'attrDef_email', [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES], 'tuple'),
    makeNode('attrDef_email_required', '', 'attrDef_email', [SYS_A.NULLABLE, SYS_V.NO], 'tuple'),
    makeNode('attrDef_email_hide', '', 'attrDef_email', [SYS_A.HIDE_FIELD, SYS_V.NEVER], 'tuple'),
  ];

  // AttrDef: Company (plain type)
  const attrDefCompanyNodes: NodexNode[] = [
    makeNode('attrDef_company', 'Company', schemaId, [
      'attrDef_company_type', 'attrDef_company_autocollect', 'attrDef_company_required', 'attrDef_company_hide',
    ], 'attrDef'),
    makeNode('attrDef_company_type', '', 'attrDef_company', [SYS_A.TYPE_CHOICE, SYS_D.PLAIN], 'tuple'),
    makeNode('attrDef_company_autocollect', '', 'attrDef_company', [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES], 'tuple'),
    makeNode('attrDef_company_required', '', 'attrDef_company', [SYS_A.NULLABLE, SYS_V.NO], 'tuple'),
    makeNode('attrDef_company_hide', '', 'attrDef_company', [SYS_A.HIDE_FIELD, SYS_V.NEVER], 'tuple'),
  ];

  // Set _metaNodeId on attrDef nodes (tagged with SYS_T02)
  attrDefStatusNodes[0].props._metaNodeId = 'meta_attrDef_status';
  attrDefPriorityNodes[0].props._metaNodeId = 'meta_attrDef_priority';
  attrDefDueNodes[0].props._metaNodeId = 'meta_attrDef_due';
  attrDefEmailNodes[0].props._metaNodeId = 'meta_attrDef_email';
  attrDefCompanyNodes[0].props._metaNodeId = 'meta_attrDef_company';

  // Set _sourceId on config tuples → SYS_T02 templates
  // Status (indices: [1]=type [2]=autocollect [3]=required [4]=hide)
  attrDefStatusNodes[1].props._sourceId = 'sysT02_tpl_type';
  attrDefStatusNodes[2].props._sourceId = 'sysT02_tpl_autocollect';
  attrDefStatusNodes[3].props._sourceId = 'sysT02_tpl_required';
  attrDefStatusNodes[4].props._sourceId = 'sysT02_tpl_hide';
  // Priority
  attrDefPriorityNodes[1].props._sourceId = 'sysT02_tpl_type';
  attrDefPriorityNodes[2].props._sourceId = 'sysT02_tpl_autocollect';
  attrDefPriorityNodes[3].props._sourceId = 'sysT02_tpl_required';
  attrDefPriorityNodes[4].props._sourceId = 'sysT02_tpl_hide';
  // Due (indices: [1]=type [2]=autocollect [3]=required [4]=hide)
  attrDefDueNodes[1].props._sourceId = 'sysT02_tpl_type';
  attrDefDueNodes[2].props._sourceId = 'sysT02_tpl_autocollect';
  attrDefDueNodes[3].props._sourceId = 'sysT02_tpl_required';
  attrDefDueNodes[4].props._sourceId = 'sysT02_tpl_hide';
  // Email
  attrDefEmailNodes[1].props._sourceId = 'sysT02_tpl_type';
  attrDefEmailNodes[2].props._sourceId = 'sysT02_tpl_autocollect';
  attrDefEmailNodes[3].props._sourceId = 'sysT02_tpl_required';
  attrDefEmailNodes[4].props._sourceId = 'sysT02_tpl_hide';
  // Company
  attrDefCompanyNodes[1].props._sourceId = 'sysT02_tpl_type';
  attrDefCompanyNodes[2].props._sourceId = 'sysT02_tpl_autocollect';
  attrDefCompanyNodes[3].props._sourceId = 'sysT02_tpl_required';
  attrDefCompanyNodes[4].props._sourceId = 'sysT02_tpl_hide';

  // Metanodes for attrDefs (SYS_T02 tag application chain)
  const attrDefMetanodes: NodexNode[] = [
    makeNode('meta_attrDef_status', '', 'attrDef_status', ['meta_attrDef_status_tag'], 'metanode'),
    makeNode('meta_attrDef_status_tag', '', 'meta_attrDef_status', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_priority', '', 'attrDef_priority', ['meta_attrDef_priority_tag'], 'metanode'),
    makeNode('meta_attrDef_priority_tag', '', 'meta_attrDef_priority', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_due', '', 'attrDef_due', ['meta_attrDef_due_tag'], 'metanode'),
    makeNode('meta_attrDef_due_tag', '', 'meta_attrDef_due', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_email', '', 'attrDef_email', ['meta_attrDef_email_tag'], 'metanode'),
    makeNode('meta_attrDef_email_tag', '', 'meta_attrDef_email', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_company', '', 'attrDef_company', ['meta_attrDef_company_tag'], 'metanode'),
    makeNode('meta_attrDef_company_tag', '', 'meta_attrDef_company', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
  ];

  // TagDef: Task — template Tuples reference attrDef IDs
  const tagDefTaskNodes = [
    makeNode('tagDef_task', 'Task', schemaId, ['taskField_status', 'taskField_priority', 'taskField_due'], 'tagDef'),
    makeNode('taskField_status', '', 'tagDef_task', ['attrDef_status'], 'tuple'),
    makeNode('taskField_priority', '', 'tagDef_task', ['attrDef_priority'], 'tuple'),
    makeNode('taskField_due', '', 'tagDef_task', ['attrDef_due'], 'tuple'),
  ];

  // TagDef: Person
  const tagDefPersonNodes = [
    makeNode('tagDef_person', 'Person', schemaId, ['personField_email', 'personField_company'], 'tagDef'),
    makeNode('personField_email', '', 'tagDef_person', ['attrDef_email'], 'tuple'),
    makeNode('personField_company', '', 'tagDef_person', ['attrDef_company'], 'tuple'),
  ];

  // ─── Pre-tag task_1 with "Task" tag (demo fields on startup) ───

  // Metanode for task_1
  const task1MetanodeNodes: NodexNode[] = [
    makeNode('meta_task_1', '', 'task_1', ['meta_task_1_tag'], 'metanode'),
    makeNode('meta_task_1_tag', '', 'meta_task_1', [SYS_A.NODE_SUPERTAGS, 'tagDef_task'], 'tuple'),
  ];
  // Field instance tuples + associatedData for task_1
  const task1FieldNodes: NodexNode[] = [
    makeNode('task1_fld_status', '', 'task_1', ['attrDef_status'], 'tuple'),
    makeNode('task1_fld_priority', '', 'task_1', ['attrDef_priority'], 'tuple'),
    makeNode('task1_fld_due', '', 'task_1', ['attrDef_due'], 'tuple'),
    makeNode('task1_assoc_status', '', 'task_1', [], 'associatedData'),
    makeNode('task1_assoc_priority', '', 'task_1', [], 'associatedData'),
    makeNode('task1_assoc_due', '', 'task_1', [], 'associatedData'),
  ];
  // Set _sourceId on field instance tuples (link to template)
  task1FieldNodes[0].props._sourceId = 'taskField_status';
  task1FieldNodes[1].props._sourceId = 'taskField_priority';
  task1FieldNodes[2].props._sourceId = 'taskField_due';

  const schemaNodes = [
    ...sysT02Nodes,
    ...attrDefStatusNodes,
    ...attrDefPriorityNodes,
    ...attrDefDueNodes,
    ...attrDefEmailNodes,
    ...attrDefCompanyNodes,
    ...attrDefMetanodes,
    ...tagDefTaskNodes,
    ...tagDefPersonNodes,
    ...task1MetanodeNodes,
    ...task1FieldNodes,
  ];

  // ─── Set all nodes ───
  const allNodes = [
    ...containers,
    ...projectNodes,
    ...noteNodes,
    ...richTextNodes,
    ...inboxNodes,
    ...journalNodes,
    ...schemaNodes,
  ];

  store.setNodes(allNodes);

  // Expand some nodes by default for testing (compound keys: parentId:nodeId)
  uiStore.setExpanded(`${libraryId}:proj_1`, true);
  uiStore.setExpanded(`proj_1:task_1`, true);
  uiStore.setExpanded(`proj_1:task_2`, true);
  uiStore.setExpanded(`${libraryId}:note_rich`, true);

  // Navigate to Library
  if (uiStore.panelStack.length === 0) {
    uiStore.pushPanel(libraryId);
  }
}

/**
 * Seed sample data for the test page.
 *
 * Creates a realistic outliner tree with various node types
 * to exercise all outliner interactions.
 *
 * Unified config field architecture: config tuples use the same data model
 * as regular fields (Tuple + AssociatedData). System attrDef nodes (SYS_A, NDX_A)
 * are created as real attrDef entities, enabling a single rendering path.
 */
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import type { NodexNode, DocType } from '../../types/index.js';
import { SYS_A, SYS_D, SYS_T, SYS_V } from '../../types/index.js';

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

/**
 * Create a config tuple + AssociatedData pair.
 * Returns [tuple, assoc] nodes and a mapping entry { tupleId: assocId }.
 */
function makeConfigEntry(
  tupleId: string,
  owner: string,
  key: string,
  value: string | undefined,
  sourceId?: string,
): { nodes: NodexNode[]; map: Record<string, string> } {
  const assocId = `${tupleId}_assoc`;
  const tuple = makeNode(tupleId, '', owner, [key], 'tuple');
  if (sourceId) tuple.props._sourceId = sourceId;
  const assoc = makeNode(assocId, '', owner, value ? [value] : [], 'associatedData');
  return { nodes: [tuple, assoc], map: { [tupleId]: assocId } };
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

  // ─── Workspace root node ───
  const libraryId = `${WS_ID}_LIBRARY`;
  const inboxId = `${WS_ID}_INBOX`;
  const journalId = `${WS_ID}_JOURNAL`;
  const searchesId = `${WS_ID}_SEARCHES`;
  const trashId = `${WS_ID}_TRASH`;
  const schemaId = `${WS_ID}_SCHEMA`;

  const wsRoot: NodexNode = {
    id: WS_ID,
    workspaceId: WS_ID,
    props: { created: Date.now(), name: 'My Workspace' },
    children: [libraryId, inboxId, journalId, searchesId, trashId, schemaId],
    version: 1,
    updatedAt: Date.now(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
  };

  // ─── Container nodes ───
  const containers = [
    makeNode(libraryId, 'Library', WS_ID, ['proj_1', 'person_1', 'note_1', 'note_2', 'note_rich']),
    makeNode(inboxId, 'Inbox', WS_ID, ['inbox_1', 'inbox_2', 'inbox_3', 'webclip_1']),
    makeNode(journalId, 'Journal', WS_ID, ['journal_1']),
    makeNode(searchesId, 'Searches', WS_ID, []),
    makeNode(trashId, 'Trash', WS_ID, []),
    makeNode(schemaId, 'Schema', WS_ID, [
      // System value nodes
      SYS_V.YES, SYS_V.NO,
      SYS_D.PLAIN, SYS_D.OPTIONS, SYS_D.OPTIONS_FROM_SUPERTAG, SYS_D.DATE, SYS_D.NUMBER, SYS_D.URL, SYS_D.EMAIL, SYS_D.CHECKBOX, SYS_D.BOOLEAN,
      SYS_V.NEVER, SYS_V.WHEN_EMPTY, SYS_V.WHEN_NOT_EMPTY, SYS_V.WHEN_VALUE_IS_DEFAULT, SYS_V.ALWAYS,
      // System attrDef nodes
      SYS_A.COLOR, SYS_A.EXTENDS, SYS_A.SHOW_CHECKBOX,
      SYS_A.DONE_STATE_MAPPING, SYS_A.DONE_MAP_CHECKED, SYS_A.DONE_MAP_UNCHECKED,
      SYS_A.CHILD_SUPERTAG,
      SYS_A.TYPE_CHOICE, SYS_A.SOURCE_SUPERTAG, SYS_A.AUTOCOLLECT_OPTIONS,
      SYS_A.AUTO_INITIALIZE, SYS_A.NULLABLE, SYS_A.HIDE_FIELD,
      SYS_A.MIN_VALUE, SYS_A.MAX_VALUE,
      // System tag templates + user tagDefs
      'SYS_T01', 'SYS_T02',
      'tagDef_task', 'tagDef_person', 'tagDef_dev_task', 'tagDef_web_clip',
    ]),
  ];

  // ─── Library nodes ───

  // Project with nested structure
  const projectNodes = [
    {
      ...makeNode('proj_1', 'My Project', libraryId, ['task_1', 'task_2', 'task_3', 'note_1a']),
      props: {
        ...makeNode('proj_1', 'My Project', libraryId).props,
        description: 'A sample project to demonstrate outliner features',
      },
    },
    {
      ...makeNode('task_1', 'Design the data model', 'proj_1', [
        'subtask_1a', 'subtask_1b',
        'task1_fld_status', 'task1_fld_priority', 'task1_fld_due', 'task1_fld_done',
      ]),
      props: {
        ...makeNode('task_1', 'Design the data model', 'proj_1').props,
        _metaNodeId: 'meta_task_1',
      },
      associationMap: {
        task1_fld_status: 'task1_assoc_status',
        task1_fld_priority: 'task1_assoc_priority',
        task1_fld_due: 'task1_assoc_due',
        task1_fld_done: 'task1_assoc_done',
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

  // Person node tagged with Person tag
  const personNodes = [
    {
      ...makeNode('person_1', 'Alice Johnson', libraryId, [
        'person1_fld_email', 'person1_fld_company', 'person1_fld_age', 'person1_fld_website',
      ]),
      props: {
        ...makeNode('person_1', 'Alice Johnson', libraryId).props,
        _metaNodeId: 'meta_person_1',
      },
      associationMap: {
        person1_fld_email: 'person1_assoc_email',
        person1_fld_company: 'person1_assoc_company',
        person1_fld_age: 'person1_assoc_age',
        person1_fld_website: 'person1_assoc_website',
      },
    },
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

  // ═══════════════════════════════════════════════════════════════
  // System value nodes — shared enumerations used by system attrDefs
  // ═══════════════════════════════════════════════════════════════

  const systemValueNodes: NodexNode[] = [
    // Boolean enum
    makeNode(SYS_V.YES, 'Yes', schemaId),
    makeNode(SYS_V.NO, 'No', schemaId),
    // Data type enum
    makeNode(SYS_D.PLAIN, 'Plain', schemaId),
    makeNode(SYS_D.OPTIONS, 'Options', schemaId),
    makeNode(SYS_D.OPTIONS_FROM_SUPERTAG, 'Options from supertag', schemaId),
    makeNode(SYS_D.DATE, 'Date', schemaId),
    makeNode(SYS_D.NUMBER, 'Number', schemaId),
    makeNode(SYS_D.URL, 'URL', schemaId),
    makeNode(SYS_D.EMAIL, 'Email', schemaId),
    makeNode(SYS_D.CHECKBOX, 'Checkbox', schemaId),
    makeNode(SYS_D.BOOLEAN, 'Boolean', schemaId),
    // Hide field enum
    makeNode(SYS_V.NEVER, 'Never', schemaId),
    makeNode(SYS_V.WHEN_EMPTY, 'When empty', schemaId),
    makeNode(SYS_V.WHEN_NOT_EMPTY, 'When not empty', schemaId),
    makeNode(SYS_V.WHEN_VALUE_IS_DEFAULT, 'When value is default', schemaId),
    makeNode(SYS_V.ALWAYS, 'Always', schemaId),
  ];

  // ═══════════════════════════════════════════════════════════════
  // System attrDef nodes — config fields for tagDef (SYS_T01) and attrDef (SYS_T02)
  // Each has: _docType='attrDef', children=[type_tuple, ...options], type_tuple=[SYS_A02, dataType]
  // ═══════════════════════════════════════════════════════════════

  // --- TagDef config attrDefs (SYS_T01 template fields) ---

  // SYS_A11 Color — OPTIONS type (color picker values not yet implemented, placeholder)
  const sysAttrDefColor: NodexNode[] = [
    makeNode(SYS_A.COLOR, 'Color', schemaId, [`${SYS_A.COLOR}_type`], 'attrDef'),
    makeNode(`${SYS_A.COLOR}_type`, '', SYS_A.COLOR, [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS], 'tuple'),
  ];

  // NDX_A05 Extends — OPTIONS_FROM_SUPERTAG type, source = SYS_T01
  const sysAttrDefExtends: NodexNode[] = [
    makeNode(SYS_A.EXTENDS, 'Extend from', schemaId, [`${SYS_A.EXTENDS}_type`, `${SYS_A.EXTENDS}_source`], 'attrDef'),
    makeNode(`${SYS_A.EXTENDS}_type`, '', SYS_A.EXTENDS, [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS_FROM_SUPERTAG], 'tuple'),
    makeNode(`${SYS_A.EXTENDS}_source`, '', SYS_A.EXTENDS, [SYS_A.SOURCE_SUPERTAG, SYS_T.SUPERTAG], 'tuple'),
  ];

  // SYS_A55 Show as checkbox — OPTIONS type [Yes/No]
  const sysAttrDefCheckbox: NodexNode[] = [
    makeNode(SYS_A.SHOW_CHECKBOX, 'Show as checkbox', schemaId, [`${SYS_A.SHOW_CHECKBOX}_type`, SYS_V.YES, SYS_V.NO], 'attrDef'),
    makeNode(`${SYS_A.SHOW_CHECKBOX}_type`, '', SYS_A.SHOW_CHECKBOX, [SYS_A.TYPE_CHOICE, SYS_D.BOOLEAN], 'tuple'),
  ];

  // NDX_A06 Done state mapping — OPTIONS type [Yes/No]
  const sysAttrDefDoneMapping: NodexNode[] = [
    makeNode(SYS_A.DONE_STATE_MAPPING, 'Done state mapping', schemaId, [`${SYS_A.DONE_STATE_MAPPING}_type`, SYS_V.YES, SYS_V.NO], 'attrDef'),
    makeNode(`${SYS_A.DONE_STATE_MAPPING}_type`, '', SYS_A.DONE_STATE_MAPPING, [SYS_A.TYPE_CHOICE, SYS_D.BOOLEAN], 'tuple'),
  ];

  // NDX_A07 Map checked to — PLAIN type (entries in AssociatedData)
  const sysAttrDefDoneChecked: NodexNode[] = [
    makeNode(SYS_A.DONE_MAP_CHECKED, 'Map checked to', schemaId, [`${SYS_A.DONE_MAP_CHECKED}_type`], 'attrDef'),
    makeNode(`${SYS_A.DONE_MAP_CHECKED}_type`, '', SYS_A.DONE_MAP_CHECKED, [SYS_A.TYPE_CHOICE, SYS_D.PLAIN], 'tuple'),
  ];

  // NDX_A08 Map unchecked to — PLAIN type (entries in AssociatedData)
  const sysAttrDefDoneUnchecked: NodexNode[] = [
    makeNode(SYS_A.DONE_MAP_UNCHECKED, 'Map unchecked to', schemaId, [`${SYS_A.DONE_MAP_UNCHECKED}_type`], 'attrDef'),
    makeNode(`${SYS_A.DONE_MAP_UNCHECKED}_type`, '', SYS_A.DONE_MAP_UNCHECKED, [SYS_A.TYPE_CHOICE, SYS_D.PLAIN], 'tuple'),
  ];

  // SYS_A14 Default child supertag — OPTIONS_FROM_SUPERTAG type, source = SYS_T01
  const sysAttrDefChildTag: NodexNode[] = [
    makeNode(SYS_A.CHILD_SUPERTAG, 'Default child supertag', schemaId, [`${SYS_A.CHILD_SUPERTAG}_type`, `${SYS_A.CHILD_SUPERTAG}_source`], 'attrDef'),
    makeNode(`${SYS_A.CHILD_SUPERTAG}_type`, '', SYS_A.CHILD_SUPERTAG, [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS_FROM_SUPERTAG], 'tuple'),
    makeNode(`${SYS_A.CHILD_SUPERTAG}_source`, '', SYS_A.CHILD_SUPERTAG, [SYS_A.SOURCE_SUPERTAG, SYS_T.SUPERTAG], 'tuple'),
  ];

  // --- AttrDef config attrDefs (SYS_T02 template fields) ---

  // SYS_A02 Field type — OPTIONS type [data type enums]
  const sysAttrDefFieldType: NodexNode[] = [
    makeNode(SYS_A.TYPE_CHOICE, 'Field type', schemaId, [
      `${SYS_A.TYPE_CHOICE}_type`,
      SYS_D.PLAIN, SYS_D.OPTIONS, SYS_D.OPTIONS_FROM_SUPERTAG, SYS_D.DATE, SYS_D.NUMBER, SYS_D.URL, SYS_D.EMAIL, SYS_D.CHECKBOX,
    ], 'attrDef'),
    makeNode(`${SYS_A.TYPE_CHOICE}_type`, '', SYS_A.TYPE_CHOICE, [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS], 'tuple'),
  ];

  // SYS_A06 Source supertag — OPTIONS_FROM_SUPERTAG type, source = SYS_T01
  const sysAttrDefSourceTag: NodexNode[] = [
    makeNode(SYS_A.SOURCE_SUPERTAG, 'Source supertag', schemaId, [`${SYS_A.SOURCE_SUPERTAG}_type`, `${SYS_A.SOURCE_SUPERTAG}_source`], 'attrDef'),
    makeNode(`${SYS_A.SOURCE_SUPERTAG}_type`, '', SYS_A.SOURCE_SUPERTAG, [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS_FROM_SUPERTAG], 'tuple'),
    makeNode(`${SYS_A.SOURCE_SUPERTAG}_source`, '', SYS_A.SOURCE_SUPERTAG, [SYS_A.SOURCE_SUPERTAG, SYS_T.SUPERTAG], 'tuple'),
  ];

  // SYS_A44 Auto-collect values — OPTIONS type [Yes/No]
  const sysAttrDefAutocollect: NodexNode[] = [
    makeNode(SYS_A.AUTOCOLLECT_OPTIONS, 'Auto-collect values', schemaId, [`${SYS_A.AUTOCOLLECT_OPTIONS}_type`, SYS_V.YES, SYS_V.NO], 'attrDef'),
    makeNode(`${SYS_A.AUTOCOLLECT_OPTIONS}_type`, '', SYS_A.AUTOCOLLECT_OPTIONS, [SYS_A.TYPE_CHOICE, SYS_D.BOOLEAN], 'tuple'),
  ];

  // NDX_A02 Auto-initialize — OPTIONS type [Yes/No]
  const sysAttrDefAutoInit: NodexNode[] = [
    makeNode(SYS_A.AUTO_INITIALIZE, 'Auto-initialize', schemaId, [`${SYS_A.AUTO_INITIALIZE}_type`, SYS_V.YES, SYS_V.NO], 'attrDef'),
    makeNode(`${SYS_A.AUTO_INITIALIZE}_type`, '', SYS_A.AUTO_INITIALIZE, [SYS_A.TYPE_CHOICE, SYS_D.BOOLEAN], 'tuple'),
  ];

  // SYS_A01 Required — OPTIONS type [Yes/No]
  const sysAttrDefRequired: NodexNode[] = [
    makeNode(SYS_A.NULLABLE, 'Required', schemaId, [`${SYS_A.NULLABLE}_type`, SYS_V.YES, SYS_V.NO], 'attrDef'),
    makeNode(`${SYS_A.NULLABLE}_type`, '', SYS_A.NULLABLE, [SYS_A.TYPE_CHOICE, SYS_D.BOOLEAN], 'tuple'),
  ];

  // NDX_A01 Hide field — OPTIONS type [hide enum values]
  const sysAttrDefHideField: NodexNode[] = [
    makeNode(SYS_A.HIDE_FIELD, 'Hide field', schemaId, [
      `${SYS_A.HIDE_FIELD}_type`,
      SYS_V.NEVER, SYS_V.WHEN_EMPTY, SYS_V.WHEN_NOT_EMPTY, SYS_V.WHEN_VALUE_IS_DEFAULT, SYS_V.ALWAYS,
    ], 'attrDef'),
    makeNode(`${SYS_A.HIDE_FIELD}_type`, '', SYS_A.HIDE_FIELD, [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS], 'tuple'),
  ];

  // NDX_A03 Minimum value — NUMBER type
  const sysAttrDefMinValue: NodexNode[] = [
    makeNode(SYS_A.MIN_VALUE, 'Minimum value', schemaId, [`${SYS_A.MIN_VALUE}_type`], 'attrDef'),
    makeNode(`${SYS_A.MIN_VALUE}_type`, '', SYS_A.MIN_VALUE, [SYS_A.TYPE_CHOICE, SYS_D.NUMBER], 'tuple'),
  ];

  // NDX_A04 Maximum value — NUMBER type
  const sysAttrDefMaxValue: NodexNode[] = [
    makeNode(SYS_A.MAX_VALUE, 'Maximum value', schemaId, [`${SYS_A.MAX_VALUE}_type`], 'attrDef'),
    makeNode(`${SYS_A.MAX_VALUE}_type`, '', SYS_A.MAX_VALUE, [SYS_A.TYPE_CHOICE, SYS_D.NUMBER], 'tuple'),
  ];

  const systemAttrDefNodes: NodexNode[] = [
    ...sysAttrDefColor, ...sysAttrDefExtends, ...sysAttrDefCheckbox,
    ...sysAttrDefDoneMapping, ...sysAttrDefDoneChecked, ...sysAttrDefDoneUnchecked,
    ...sysAttrDefChildTag,
    ...sysAttrDefFieldType, ...sysAttrDefSourceTag, ...sysAttrDefAutocollect,
    ...sysAttrDefAutoInit, ...sysAttrDefRequired, ...sysAttrDefHideField,
    ...sysAttrDefMinValue, ...sysAttrDefMaxValue,
  ];

  // ═══════════════════════════════════════════════════════════════
  // SYS_T01 (Supertag) — system tag for tagDef config pages
  // Template tuples reference system attrDef IDs as keys
  // ═══════════════════════════════════════════════════════════════

  const sysT01Nodes: NodexNode[] = [
    makeNode('SYS_T01', 'Supertag', schemaId, [
      'sysT01_tpl_color', 'sysT01_tpl_extends', 'sysT01_tpl_checkbox',
      'sysT01_tpl_done_mapping', 'sysT01_tpl_done_map_checked', 'sysT01_tpl_done_map_unchecked',
      'sysT01_tpl_childtag',
    ], 'tagDef'),
    makeNode('sysT01_tpl_color', '', 'SYS_T01', [SYS_A.COLOR], 'tuple'),
    makeNode('sysT01_tpl_extends', '', 'SYS_T01', [SYS_A.EXTENDS], 'tuple'),
    makeNode('sysT01_tpl_checkbox', '', 'SYS_T01', [SYS_A.SHOW_CHECKBOX, SYS_V.NO], 'tuple'),
    makeNode('sysT01_tpl_done_mapping', '', 'SYS_T01', [SYS_A.DONE_STATE_MAPPING, SYS_V.NO], 'tuple'),
    makeNode('sysT01_tpl_done_map_checked', '', 'SYS_T01', [SYS_A.DONE_MAP_CHECKED], 'tuple'),
    makeNode('sysT01_tpl_done_map_unchecked', '', 'SYS_T01', [SYS_A.DONE_MAP_UNCHECKED], 'tuple'),
    makeNode('sysT01_tpl_childtag', '', 'SYS_T01', [SYS_A.CHILD_SUPERTAG], 'tuple'),
  ];

  // SYS_T02 (Field Definition) — system tag for attrDef config pages
  const sysT02Nodes: NodexNode[] = [
    makeNode('SYS_T02', 'Field Definition', schemaId, [
      'sysT02_tpl_type', 'sysT02_tpl_source_supertag', 'sysT02_tpl_autocollect',
      'sysT02_tpl_autoinit', 'sysT02_tpl_required', 'sysT02_tpl_hide',
      'sysT02_tpl_min', 'sysT02_tpl_max',
    ], 'tagDef'),
    makeNode('sysT02_tpl_type', '', 'SYS_T02', [SYS_A.TYPE_CHOICE, SYS_D.PLAIN], 'tuple'),
    makeNode('sysT02_tpl_source_supertag', '', 'SYS_T02', [SYS_A.SOURCE_SUPERTAG], 'tuple'),
    makeNode('sysT02_tpl_autocollect', '', 'SYS_T02', [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES], 'tuple'),
    makeNode('sysT02_tpl_autoinit', '', 'SYS_T02', [SYS_A.AUTO_INITIALIZE, SYS_V.NO], 'tuple'),
    makeNode('sysT02_tpl_required', '', 'SYS_T02', [SYS_A.NULLABLE, SYS_V.NO], 'tuple'),
    makeNode('sysT02_tpl_hide', '', 'SYS_T02', [SYS_A.HIDE_FIELD, SYS_V.NEVER], 'tuple'),
    makeNode('sysT02_tpl_min', '', 'SYS_T02', [SYS_A.MIN_VALUE], 'tuple'),
    makeNode('sysT02_tpl_max', '', 'SYS_T02', [SYS_A.MAX_VALUE], 'tuple'),
  ];

  // ═══════════════════════════════════════════════════════════════
  // User AttrDef nodes — each with unified config tuples + AssociatedData
  // ═══════════════════════════════════════════════════════════════

  // Helper: create standard attrDef config tuples for SYS_T02 template
  function makeAttrDefConfigTuples(prefix: string, owner: string, dataType: string, extra?: { min?: string; max?: string }) {
    // For number min/max: create content nodes to hold the value (not raw strings)
    const minValueNodeId = extra?.min !== undefined ? `${prefix}_min_val` : undefined;
    const maxValueNodeId = extra?.max !== undefined ? `${prefix}_max_val` : undefined;
    const extraNodes: NodexNode[] = [];
    if (minValueNodeId && extra?.min !== undefined) {
      extraNodes.push(makeNode(minValueNodeId, extra.min, `${prefix}_min_assoc`));
    }
    if (maxValueNodeId && extra?.max !== undefined) {
      extraNodes.push(makeNode(maxValueNodeId, extra.max, `${prefix}_max_assoc`));
    }

    const entries = [
      makeConfigEntry(`${prefix}_type`, owner, SYS_A.TYPE_CHOICE, dataType, 'sysT02_tpl_type'),
      makeConfigEntry(`${prefix}_source_supertag`, owner, SYS_A.SOURCE_SUPERTAG, undefined, 'sysT02_tpl_source_supertag'),
      makeConfigEntry(`${prefix}_autocollect`, owner, SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES, 'sysT02_tpl_autocollect'),
      makeConfigEntry(`${prefix}_autoinit`, owner, SYS_A.AUTO_INITIALIZE, SYS_V.NO, 'sysT02_tpl_autoinit'),
      makeConfigEntry(`${prefix}_required`, owner, SYS_A.NULLABLE, SYS_V.NO, 'sysT02_tpl_required'),
      makeConfigEntry(`${prefix}_hide`, owner, SYS_A.HIDE_FIELD, SYS_V.NEVER, 'sysT02_tpl_hide'),
      makeConfigEntry(`${prefix}_min`, owner, SYS_A.MIN_VALUE, minValueNodeId, 'sysT02_tpl_min'),
      makeConfigEntry(`${prefix}_max`, owner, SYS_A.MAX_VALUE, maxValueNodeId, 'sysT02_tpl_max'),
    ];
    const nodes = [...entries.flatMap(e => e.nodes), ...extraNodes];
    const map: Record<string, string> = {};
    for (const e of entries) Object.assign(map, e.map);
    const childIds = entries.map(e => Object.keys(e.map)[0]);
    return { nodes, map, childIds };
  }

  // AttrDef: Status (OPTIONS)
  const statusCfg = makeAttrDefConfigTuples('attrDef_status', 'attrDef_status', SYS_D.OPTIONS);
  const attrDefStatusNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_status', 'Status', 'taskField_status', [
        ...statusCfg.childIds, 'opt_todo', 'opt_in_progress', 'opt_done',
      ], 'attrDef'),
      props: { ...makeNode('attrDef_status', '', '').props, _docType: 'attrDef' as DocType, name: 'Status', _ownerId: 'taskField_status', _metaNodeId: 'meta_attrDef_status' },
      associationMap: statusCfg.map,
    },
    ...statusCfg.nodes,
    makeNode('opt_todo', 'To Do', 'attrDef_status'),
    makeNode('opt_in_progress', 'In Progress', 'attrDef_status'),
    makeNode('opt_done', 'Done', 'attrDef_status'),
  ];

  // AttrDef: Priority (OPTIONS)
  const priorityCfg = makeAttrDefConfigTuples('attrDef_priority', 'attrDef_priority', SYS_D.OPTIONS);
  const attrDefPriorityNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_priority', 'Priority', 'taskField_priority', [
        ...priorityCfg.childIds, 'opt_high', 'opt_medium', 'opt_low',
      ], 'attrDef'),
      props: { ...makeNode('attrDef_priority', '', '').props, _docType: 'attrDef' as DocType, name: 'Priority', _ownerId: 'taskField_priority', _metaNodeId: 'meta_attrDef_priority' },
      associationMap: priorityCfg.map,
    },
    ...priorityCfg.nodes,
    makeNode('opt_high', 'High', 'attrDef_priority'),
    makeNode('opt_medium', 'Medium', 'attrDef_priority'),
    makeNode('opt_low', 'Low', 'attrDef_priority'),
  ];

  // AttrDef: Due (DATE)
  const dueCfg = makeAttrDefConfigTuples('attrDef_due', 'attrDef_due', SYS_D.DATE);
  const attrDefDueNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_due', 'Due', 'taskField_due', dueCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_due', '', '').props, _docType: 'attrDef' as DocType, name: 'Due', _ownerId: 'taskField_due', _metaNodeId: 'meta_attrDef_due' },
      associationMap: dueCfg.map,
    },
    ...dueCfg.nodes,
  ];

  // AttrDef: Email (EMAIL)
  const emailCfg = makeAttrDefConfigTuples('attrDef_email', 'attrDef_email', SYS_D.EMAIL);
  const attrDefEmailNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_email', 'Email', 'personField_email', emailCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_email', '', '').props, _docType: 'attrDef' as DocType, name: 'Email', _ownerId: 'personField_email', _metaNodeId: 'meta_attrDef_email' },
      associationMap: emailCfg.map,
    },
    ...emailCfg.nodes,
  ];

  // AttrDef: Company (PLAIN)
  const companyCfg = makeAttrDefConfigTuples('attrDef_company', 'attrDef_company', SYS_D.PLAIN);
  const attrDefCompanyNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_company', 'Company', 'personField_company', companyCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_company', '', '').props, _docType: 'attrDef' as DocType, name: 'Company', _ownerId: 'personField_company', _metaNodeId: 'meta_attrDef_company' },
      associationMap: companyCfg.map,
    },
    ...companyCfg.nodes,
  ];

  // AttrDef: Age (NUMBER)
  const ageCfg = makeAttrDefConfigTuples('attrDef_age', 'attrDef_age', SYS_D.NUMBER, { min: '0', max: '150' });
  const attrDefAgeNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_age', 'Age', 'personField_age', ageCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_age', '', '').props, _docType: 'attrDef' as DocType, name: 'Age', _ownerId: 'personField_age', _metaNodeId: 'meta_attrDef_age' },
      associationMap: ageCfg.map,
    },
    ...ageCfg.nodes,
  ];

  // AttrDef: Website (URL)
  const websiteCfg = makeAttrDefConfigTuples('attrDef_website', 'attrDef_website', SYS_D.URL);
  const attrDefWebsiteNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_website', 'Website', 'personField_website', websiteCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_website', '', '').props, _docType: 'attrDef' as DocType, name: 'Website', _ownerId: 'personField_website', _metaNodeId: 'meta_attrDef_website' },
      associationMap: websiteCfg.map,
    },
    ...websiteCfg.nodes,
  ];

  // AttrDef: Done (CHECKBOX)
  const doneCfg = makeAttrDefConfigTuples('attrDef_done', 'attrDef_done', SYS_D.CHECKBOX);
  const attrDefDoneNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_done', 'Done', 'taskField_done', doneCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_done', '', '').props, _docType: 'attrDef' as DocType, name: 'Done', _ownerId: 'taskField_done', _metaNodeId: 'meta_attrDef_done' },
      associationMap: doneCfg.map,
    },
    ...doneCfg.nodes,
  ];

  // AttrDef: Branch (PLAIN) — for dev_task tag
  const branchCfg = makeAttrDefConfigTuples('attrDef_branch', 'attrDef_branch', SYS_D.PLAIN);
  const attrDefBranchNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_branch', 'Branch', 'devTaskField_branch', branchCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_branch', '', '').props, _docType: 'attrDef' as DocType, name: 'Branch', _ownerId: 'devTaskField_branch', _metaNodeId: 'meta_attrDef_branch' },
      associationMap: branchCfg.map,
    },
    ...branchCfg.nodes,
  ];

  // AttrDef: Source URL (URL) — for web_clip tag
  const sourceUrlCfg = makeAttrDefConfigTuples('attrDef_source_url', 'attrDef_source_url', SYS_D.URL);
  const attrDefSourceUrlNodes: NodexNode[] = [
    {
      ...makeNode('attrDef_source_url', 'Source URL', 'webClipField_source_url', sourceUrlCfg.childIds, 'attrDef'),
      props: { ...makeNode('attrDef_source_url', '', '').props, _docType: 'attrDef' as DocType, name: 'Source URL', _ownerId: 'webClipField_source_url', _metaNodeId: 'meta_attrDef_source_url' },
      associationMap: sourceUrlCfg.map,
    },
    ...sourceUrlCfg.nodes,
  ];

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
    makeNode('meta_attrDef_age', '', 'attrDef_age', ['meta_attrDef_age_tag'], 'metanode'),
    makeNode('meta_attrDef_age_tag', '', 'meta_attrDef_age', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_website', '', 'attrDef_website', ['meta_attrDef_website_tag'], 'metanode'),
    makeNode('meta_attrDef_website_tag', '', 'meta_attrDef_website', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_done', '', 'attrDef_done', ['meta_attrDef_done_tag'], 'metanode'),
    makeNode('meta_attrDef_done_tag', '', 'meta_attrDef_done', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_branch', '', 'attrDef_branch', ['meta_attrDef_branch_tag'], 'metanode'),
    makeNode('meta_attrDef_branch_tag', '', 'meta_attrDef_branch', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
    makeNode('meta_attrDef_source_url', '', 'attrDef_source_url', ['meta_attrDef_source_url_tag'], 'metanode'),
    makeNode('meta_attrDef_source_url_tag', '', 'meta_attrDef_source_url', [SYS_A.NODE_SUPERTAGS, 'SYS_T02'], 'tuple'),
  ];

  // ═══════════════════════════════════════════════════════════════
  // TagDef nodes — config tuples use unified model (AssociatedData)
  // ═══════════════════════════════════════════════════════════════

  // Helper: create tagDef config tuples from SYS_T01 template
  function makeTagDefConfigTuples(prefix: string, owner: string, opts: {
    checkbox?: string; extends?: string; doneMapping?: string;
    doneCheckedEntries?: NodexNode[]; doneUncheckedEntries?: NodexNode[];
  }) {
    const entries = [
      makeConfigEntry(`${prefix}_cfg_color`, owner, SYS_A.COLOR, undefined, 'sysT01_tpl_color'),
      makeConfigEntry(`${prefix}_cfg_extends`, owner, SYS_A.EXTENDS, opts.extends, 'sysT01_tpl_extends'),
      makeConfigEntry(`${prefix}_cfg_checkbox`, owner, SYS_A.SHOW_CHECKBOX, opts.checkbox ?? SYS_V.NO, 'sysT01_tpl_checkbox'),
      makeConfigEntry(`${prefix}_cfg_done_mapping`, owner, SYS_A.DONE_STATE_MAPPING, opts.doneMapping ?? SYS_V.NO, 'sysT01_tpl_done_mapping'),
      makeConfigEntry(`${prefix}_cfg_done_checked`, owner, SYS_A.DONE_MAP_CHECKED, undefined, 'sysT01_tpl_done_map_checked'),
      makeConfigEntry(`${prefix}_cfg_done_unchecked`, owner, SYS_A.DONE_MAP_UNCHECKED, undefined, 'sysT01_tpl_done_map_unchecked'),
      makeConfigEntry(`${prefix}_cfg_childtag`, owner, SYS_A.CHILD_SUPERTAG, undefined, 'sysT01_tpl_childtag'),
    ];
    const nodes = entries.flatMap(e => e.nodes);
    const map: Record<string, string> = {};
    for (const e of entries) Object.assign(map, e.map);
    const childIds = entries.map(e => Object.keys(e.map)[0]);

    // Add done mapping entries to AssociatedData if provided
    if (opts.doneCheckedEntries?.length) {
      const assocId = `${prefix}_cfg_done_checked_assoc`;
      const assoc = nodes.find(n => n.id === assocId);
      if (assoc) {
        assoc.children = opts.doneCheckedEntries.map(e => e.id);
        nodes.push(...opts.doneCheckedEntries);
      }
    }
    if (opts.doneUncheckedEntries?.length) {
      const assocId = `${prefix}_cfg_done_unchecked_assoc`;
      const assoc = nodes.find(n => n.id === assocId);
      if (assoc) {
        assoc.children = opts.doneUncheckedEntries.map(e => e.id);
        nodes.push(...opts.doneUncheckedEntries);
      }
    }

    return { nodes, map, childIds };
  }

  // TagDef: Task (with done state mapping)
  const taskCfg = makeTagDefConfigTuples('tagDef_task', 'tagDef_task', {
    checkbox: SYS_V.YES,
    doneMapping: SYS_V.YES,
    doneCheckedEntries: [
      makeNode('tagDef_task_dm_checked_1', '', 'tagDef_task_cfg_done_checked_assoc',
        [SYS_A.DONE_MAP_CHECKED, 'attrDef_status', 'opt_done'], 'tuple'),
    ],
    doneUncheckedEntries: [
      makeNode('tagDef_task_dm_unchecked_1', '', 'tagDef_task_cfg_done_unchecked_assoc',
        [SYS_A.DONE_MAP_UNCHECKED, 'attrDef_status', 'opt_todo'], 'tuple'),
    ],
  });
  const tagDefTaskNodes: NodexNode[] = [
    {
      ...makeNode('tagDef_task', 'Task', schemaId, [
        ...taskCfg.childIds,
        'taskField_status', 'taskField_priority', 'taskField_due', 'taskField_done',
        'taskTpl_default_note',
      ], 'tagDef'),
      props: { ...makeNode('tagDef_task', '', '').props, _docType: 'tagDef' as DocType, name: 'Task', _ownerId: schemaId, _metaNodeId: 'meta_tagDef_task' },
      associationMap: taskCfg.map,
    },
    ...taskCfg.nodes,
    makeNode('taskField_status', '', 'tagDef_task', ['attrDef_status'], 'tuple'),
    makeNode('taskField_priority', '', 'tagDef_task', ['attrDef_priority'], 'tuple'),
    makeNode('taskField_due', '', 'tagDef_task', ['attrDef_due'], 'tuple'),
    makeNode('taskField_done', '', 'tagDef_task', ['attrDef_done'], 'tuple'),
    makeNode('taskTpl_default_note', 'Notes', 'tagDef_task'),
  ];

  // TagDef: Person
  const personCfg = makeTagDefConfigTuples('tagDef_person', 'tagDef_person', {});
  const tagDefPersonNodes: NodexNode[] = [
    {
      ...makeNode('tagDef_person', 'Person', schemaId, [
        ...personCfg.childIds,
        'personField_email', 'personField_company', 'personField_age', 'personField_website',
      ], 'tagDef'),
      props: {
        ...makeNode('tagDef_person', '', '').props, _docType: 'tagDef' as DocType,
        name: 'Person', _ownerId: schemaId, _metaNodeId: 'meta_tagDef_person',
        description: 'Tag for tracking people and their contact info',
      },
      associationMap: personCfg.map,
    },
    ...personCfg.nodes,
    makeNode('personField_email', '', 'tagDef_person', ['attrDef_email'], 'tuple'),
    makeNode('personField_company', '', 'tagDef_person', ['attrDef_company'], 'tuple'),
    makeNode('personField_age', '', 'tagDef_person', ['attrDef_age'], 'tuple'),
    makeNode('personField_website', '', 'tagDef_person', ['attrDef_website'], 'tuple'),
  ];

  // TagDef: Dev Task — extends Task
  const devTaskCfg = makeTagDefConfigTuples('tagDef_dev_task', 'tagDef_dev_task', {
    checkbox: SYS_V.YES,
    extends: 'tagDef_task',
  });
  const tagDefDevTaskNodes: NodexNode[] = [
    {
      ...makeNode('tagDef_dev_task', 'Dev Task', schemaId, [
        ...devTaskCfg.childIds,
        'devTaskField_branch',
      ], 'tagDef'),
      props: {
        ...makeNode('tagDef_dev_task', '', '').props, _docType: 'tagDef' as DocType,
        name: 'Dev Task', _ownerId: schemaId, _metaNodeId: 'meta_tagDef_dev_task',
        description: 'Dev task extending Task with a Branch field',
      },
      associationMap: devTaskCfg.map,
    },
    ...devTaskCfg.nodes,
    makeNode('devTaskField_branch', '', 'tagDef_dev_task', ['attrDef_branch'], 'tuple'),
  ];

  // TagDef: web_clip
  const webClipCfg = makeTagDefConfigTuples('tagDef_web_clip', 'tagDef_web_clip', {});
  const tagDefWebClipNodes: NodexNode[] = [
    {
      ...makeNode('tagDef_web_clip', 'web_clip', schemaId, [
        ...webClipCfg.childIds,
        'webClipField_source_url',
      ], 'tagDef'),
      props: { ...makeNode('tagDef_web_clip', '', '').props, _docType: 'tagDef' as DocType, name: 'web_clip', _ownerId: schemaId, _metaNodeId: 'meta_tagDef_web_clip' },
      associationMap: webClipCfg.map,
    },
    ...webClipCfg.nodes,
    makeNode('webClipField_source_url', '', 'tagDef_web_clip', ['attrDef_source_url'], 'tuple'),
  ];

  // Metanodes for tagDefs (SYS_T01 tag application chain)
  const tagDefMetanodes: NodexNode[] = [
    makeNode('meta_tagDef_task', '', 'tagDef_task', ['meta_tagDef_task_tag'], 'metanode'),
    makeNode('meta_tagDef_task_tag', '', 'meta_tagDef_task', [SYS_A.NODE_SUPERTAGS, SYS_T.SUPERTAG], 'tuple'),
    makeNode('meta_tagDef_person', '', 'tagDef_person', ['meta_tagDef_person_tag'], 'metanode'),
    makeNode('meta_tagDef_person_tag', '', 'meta_tagDef_person', [SYS_A.NODE_SUPERTAGS, SYS_T.SUPERTAG], 'tuple'),
    makeNode('meta_tagDef_dev_task', '', 'tagDef_dev_task', ['meta_tagDef_dev_task_tag'], 'metanode'),
    makeNode('meta_tagDef_dev_task_tag', '', 'meta_tagDef_dev_task', [SYS_A.NODE_SUPERTAGS, SYS_T.SUPERTAG], 'tuple'),
    makeNode('meta_tagDef_web_clip', '', 'tagDef_web_clip', ['meta_tagDef_web_clip_tag'], 'metanode'),
    makeNode('meta_tagDef_web_clip_tag', '', 'meta_tagDef_web_clip', [SYS_A.NODE_SUPERTAGS, SYS_T.SUPERTAG], 'tuple'),
  ];

  // ─── Pre-tag task_1 with "Task" tag (demo fields on startup) ───
  const task1MetanodeNodes: NodexNode[] = [
    makeNode('meta_task_1', '', 'task_1', ['meta_task_1_tag'], 'metanode'),
    makeNode('meta_task_1_tag', '', 'meta_task_1', [SYS_A.NODE_SUPERTAGS, 'tagDef_task'], 'tuple'),
  ];
  const task1FieldNodes: NodexNode[] = [
    makeNode('task1_fld_status', '', 'task_1', ['attrDef_status'], 'tuple'),
    makeNode('task1_fld_priority', '', 'task_1', ['attrDef_priority'], 'tuple'),
    makeNode('task1_fld_due', '', 'task_1', ['attrDef_due'], 'tuple'),
    makeNode('task1_fld_done', '', 'task_1', ['attrDef_done'], 'tuple'),
    makeNode('task1_assoc_status', '', 'task_1', [], 'associatedData'),
    makeNode('task1_assoc_priority', '', 'task_1', [], 'associatedData'),
    makeNode('task1_assoc_due', '', 'task_1', [], 'associatedData'),
    makeNode('task1_assoc_done', '', 'task_1', [], 'associatedData'),
  ];
  task1FieldNodes[0].props._sourceId = 'taskField_status';
  task1FieldNodes[1].props._sourceId = 'taskField_priority';
  task1FieldNodes[2].props._sourceId = 'taskField_due';
  task1FieldNodes[3].props._sourceId = 'taskField_done';

  // ─── Pre-tag person_1 with "Person" tag ───
  const person1MetanodeNodes: NodexNode[] = [
    makeNode('meta_person_1', '', 'person_1', ['meta_person_1_tag'], 'metanode'),
    makeNode('meta_person_1_tag', '', 'meta_person_1', [SYS_A.NODE_SUPERTAGS, 'tagDef_person'], 'tuple'),
  ];
  const person1FieldNodes: NodexNode[] = [
    makeNode('person1_fld_email', '', 'person_1', ['attrDef_email'], 'tuple'),
    makeNode('person1_fld_company', '', 'person_1', ['attrDef_company'], 'tuple'),
    makeNode('person1_fld_age', '', 'person_1', ['attrDef_age'], 'tuple'),
    makeNode('person1_fld_website', '', 'person_1', ['attrDef_website'], 'tuple'),
    makeNode('person1_assoc_email', '', 'person_1', [], 'associatedData'),
    makeNode('person1_assoc_company', '', 'person_1', [], 'associatedData'),
    makeNode('person1_assoc_age', '', 'person_1', [], 'associatedData'),
    makeNode('person1_assoc_website', '', 'person_1', [], 'associatedData'),
  ];
  person1FieldNodes[0].props._sourceId = 'personField_email';
  person1FieldNodes[1].props._sourceId = 'personField_company';
  person1FieldNodes[2].props._sourceId = 'personField_age';
  person1FieldNodes[3].props._sourceId = 'personField_website';

  // ─── Sample web clip node (pre-tagged) ───
  const webclip1Nodes: NodexNode[] = [
    {
      ...makeNode('webclip_1', 'Example Article — Medium', inboxId, ['webclip1_fld_source_url']),
      props: {
        ...makeNode('webclip_1', 'Example Article — Medium', inboxId).props,
        description: 'A sample web clip to demonstrate the clipping feature',
        _metaNodeId: 'meta_webclip_1',
      },
      associationMap: { webclip1_fld_source_url: 'webclip1_assoc_source_url' },
    },
    makeNode('meta_webclip_1', '', 'webclip_1', ['meta_webclip_1_tag'], 'metanode'),
    makeNode('meta_webclip_1_tag', '', 'meta_webclip_1', [SYS_A.NODE_SUPERTAGS, 'tagDef_web_clip'], 'tuple'),
    makeNode('webclip1_fld_source_url', '', 'webclip_1', ['attrDef_source_url', 'webclip1_val_url'], 'tuple'),
    makeNode('webclip1_val_url', 'https://medium.com/example-article', 'webclip1_assoc_source_url'),
    makeNode('webclip1_assoc_source_url', '', 'webclip_1', ['webclip1_val_url'], 'associatedData'),
  ];
  webclip1Nodes[3].props._sourceId = 'webClipField_source_url';

  // ─── Set all nodes ───
  const allNodes = [
    wsRoot,
    ...containers,
    ...projectNodes,
    ...personNodes,
    ...noteNodes,
    ...richTextNodes,
    ...inboxNodes,
    ...journalNodes,
    // System
    ...systemValueNodes,
    ...systemAttrDefNodes,
    ...sysT01Nodes,
    ...sysT02Nodes,
    // User attrDefs
    ...attrDefStatusNodes,
    ...attrDefPriorityNodes,
    ...attrDefDueNodes,
    ...attrDefEmailNodes,
    ...attrDefCompanyNodes,
    ...attrDefAgeNodes,
    ...attrDefWebsiteNodes,
    ...attrDefDoneNodes,
    ...attrDefBranchNodes,
    ...attrDefSourceUrlNodes,
    ...attrDefMetanodes,
    // TagDefs
    ...tagDefTaskNodes,
    ...tagDefPersonNodes,
    ...tagDefDevTaskNodes,
    ...tagDefWebClipNodes,
    ...tagDefMetanodes,
    // Pre-tagged instances
    ...webclip1Nodes,
    ...task1MetanodeNodes,
    ...task1FieldNodes,
    ...person1MetanodeNodes,
    ...person1FieldNodes,
  ];

  store.setNodes(allNodes);

  // Expand some nodes by default for testing (compound keys: parentId:nodeId)
  uiStore.setExpanded(`${libraryId}:proj_1`, true);
  uiStore.setExpanded(`proj_1:task_1`, true);
  uiStore.setExpanded(`proj_1:task_2`, true);
  uiStore.setExpanded(`${libraryId}:note_rich`, true);

  // Navigate to Library
  if (uiStore.panelHistory.length === 0) {
    uiStore.navigateTo(libraryId);
  }
}

/**
 * Seed sample data for the test page.
 *
 * Creates a realistic outliner tree with various node types
 * to exercise all outliner interactions.
 *
 * New model (Loro Phase 1):
 * - Flat NodexNode: no `props` wrapper
 * - NodeType: 'fieldEntry', 'fieldDef'
 * - Tags: direct node.tags array (no meta indirection)
 * - TagDef config: direct properties (showCheckbox, color, etc.)
 * - FieldDef config: direct properties (fieldType, minValue, etc.)
 * - System node IDs: fixed (SYSTEM_NODE_IDS.*)
 */
import { initLoroDoc, initLoroDocForTest, commitDoc, clearUndoHistoryForTest } from '../../lib/loro-doc.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { deleteSnapshot } from '../../lib/loro-persistence.js';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { SYSTEM_NODE_IDS, FIELD_TYPES, SYS_T, NDX_F, NDX_T, SYS_V } from '../../types/index.js';
import type { InlineRefEntry, TextMark } from '../../types/index.js';
import { buildExpandedNodeKey } from '../../lib/expanded-node-key.js';
import { ensureDateNode } from '../../lib/journal.js';
import { SYSTEM_SCHEMA_NODE_IDS, ensureSystemSchema, migrateSettingsToAIGroup } from '../../lib/system-schema-presets.js';
import { ensureAgentNode } from '../../lib/ai-agent-node.js';

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

  // ─── Workspace home node (tree root) ───
  cn(WS_ID, null, { name: 'Workspace' });

  // ─── Well-known top-level nodes ───
  cn(SYSTEM_NODE_IDS.JOURNAL,  WS_ID, { name: 'Daily notes', locked: true });
  cn(SYSTEM_NODE_IDS.LIBRARY,  WS_ID, { name: 'Library' });
  cn(SYSTEM_NODE_IDS.SEARCHES, WS_ID, { name: 'Searches' });
  cn(SYSTEM_NODE_IDS.TRASH,    WS_ID, { name: 'Trash', locked: true });
  cn(SYSTEM_NODE_IDS.SCHEMA,   WS_ID, { name: 'Schema', locked: true });
  cn(SYSTEM_NODE_IDS.SETTINGS, WS_ID, { name: 'Settings', locked: true });
  ensureSystemSchema();
  ensureAgentNode(WS_ID);
  migrateSettingsToAIGroup();

  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const todayDayId = ensureDateNode(today);
  const yesterdayDayId = ensureDateNode(yesterday);

  // ─── Fixed system schema for workspace settings ───
  cn(NDX_T.WORKSPACE_SETTINGS, SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef',
    name: 'Workspace settings',
    description: 'System schema for workspace-level settings',
    locked: true,
  });
  cn(NDX_F.SETTING_HIGHLIGHT_ENABLED, NDX_T.WORKSPACE_SETTINGS, {
    type: 'fieldDef',
    name: 'Highlight & Comment',
    fieldType: FIELD_TYPES.BOOLEAN,
    description: 'Show floating toolbar when selecting text on web pages',
    locked: true,
    nullable: true,
    cardinality: 'single',
  });
  cn(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY, SYSTEM_NODE_IDS.SETTINGS, {
    type: 'fieldEntry',
    fieldDefId: NDX_F.SETTING_HIGHLIGHT_ENABLED,
  });
  cn(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE, SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY, {
    name: SYS_V.YES,
  });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Task (showCheckbox, color, done-state mapping via direct props)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_task', SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'Task', showCheckbox: true, color: 'green',
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
  cn('tagDef_person', SYSTEM_NODE_IDS.SCHEMA, {
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
  cn('tagDef_dev_task', SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'Dev Task', showCheckbox: true,
    extends: 'tagDef_task',
    description: 'Dev task extending Task with a Branch field',
  });
  cn('attrDef_branch', 'tagDef_dev_task', { type: 'fieldDef', name: 'Branch', fieldType: FIELD_TYPES.PLAIN });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Meeting (with Default content / template)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_meeting', SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'Meeting',
    description: 'Tag for meetings — has template default content',
  });
  cn('attrDef_attendees', 'tagDef_meeting', { type: 'fieldDef', name: 'Attendees', fieldType: FIELD_TYPES.PLAIN });
  // Default content (plain nodes under tagDef, no type)
  cn('tpl_agenda',  'tagDef_meeting', { name: 'Agenda' });
  cn('tpl_notes',   'tagDef_meeting', { name: 'Notes' });
  cn('tpl_actions', 'tagDef_meeting', { name: 'Action Items' });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Source (web clips, articles, etc.) — fixed ID SYS_T202
  // ═══════════════════════════════════════════════════════════════
  cn(SYS_T.SOURCE, SYSTEM_NODE_IDS.SCHEMA, { type: 'tagDef', name: 'source', color: 'sage' });
  cn(NDX_F.SOURCE_URL, SYS_T.SOURCE, { type: 'fieldDef', name: 'URL', fieldType: FIELD_TYPES.URL });
  cn(NDX_F.SOURCE_HIGHLIGHTS, SYS_T.SOURCE, {
    type: 'fieldDef',
    name: 'Highlights',
    fieldType: FIELD_TYPES.OPTIONS_FROM_SUPERTAG,
    sourceSupertag: SYS_T.HIGHLIGHT,
    hideField: SYS_V.ALWAYS,
  });

  // ═══════════════════════════════════════════════════════════════
  // FieldDefs under #source: Author (NDX_F03), Published (NDX_F04)
  // ═══════════════════════════════════════════════════════════════
  cn(NDX_F.AUTHOR, SYS_T.SOURCE, { type: 'fieldDef', name: 'Author', fieldType: FIELD_TYPES.OPTIONS });
  cn(NDX_F.PUBLISHED, SYS_T.SOURCE, { type: 'fieldDef', name: 'Published', fieldType: FIELD_TYPES.DATE });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Book (extends Source)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_book', SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'book', color: 'brown', extends: SYS_T.SOURCE,
  });

  // ── Store image tags (simple, no field inheritance — for clean screenshots) ──
  cn('tagDef_si_article', SYSTEM_NODE_IDS.SCHEMA, { type: 'tagDef', name: 'article', color: 'blue' });
  cn('tagDef_si_book', SYSTEM_NODE_IDS.SCHEMA, { type: 'tagDef', name: 'book', color: 'brown' });
  cn('tagDef_si_method', SYSTEM_NODE_IDS.SCHEMA, { type: 'tagDef', name: 'method', color: 'blue' });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Insight (standalone tag for key insights)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_insight', SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'insight', color: 'green',
  });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Mental Model (concept tag)
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_mental_model', SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'mental-model', color: 'indigo',
  });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Project
  // ═══════════════════════════════════════════════════════════════
  cn('tagDef_project', SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'project', color: 'orange',
  });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Article (extends Source) — NDX_T01
  // ═══════════════════════════════════════════════════════════════
  cn(NDX_T.ARTICLE, SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'article', color: 'slate', extends: SYS_T.SOURCE,
  });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Video (extends Source) — NDX_T02 + Duration field
  // ═══════════════════════════════════════════════════════════════
  cn(NDX_T.VIDEO, SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'video', color: 'red', extends: SYS_T.SOURCE,
  });
  cn(NDX_F.DURATION, NDX_T.VIDEO, { type: 'fieldDef', name: 'Duration', fieldType: FIELD_TYPES.PLAIN });

  // ═══════════════════════════════════════════════════════════════
  // TagDef: Social (extends Source) — NDX_T03
  // ═══════════════════════════════════════════════════════════════
  cn(NDX_T.SOCIAL, SYSTEM_NODE_IDS.SCHEMA, {
    type: 'tagDef', name: 'social', color: 'blue', extends: SYS_T.SOURCE,
  });

  // ═══════════════════════════════════════════════════════════════
  // Today content
  // ═══════════════════════════════════════════════════════════════

  // ── Project ──
  cn('proj_1', todayDayId, {
    name: 'Rethinking our onboarding flow',
  });

  // task_1: tagged with Task — applyTag auto-creates fieldEntry children
  cn('task_1', 'proj_1', { name: 'Review user interview recordings' });
  useNodeStore.getState().applyTag('task_1', 'tagDef_task');
  cn('subtask_1a', 'task_1', { name: 'Session 3 — user struggled with the pricing page' });
  cn('subtask_1b', 'task_1', { name: 'Session 5 — loved the quick-start template' });

  cn('task_2', 'proj_1', { name: 'Map current drop-off points' });
  cn('subtask_2a', 'task_2', { name: 'Step 3 has 40% abandon rate — need to simplify' });
  cn('subtask_2b', 'task_2', { name: 'Users expect social login, we only offer email' });
  cn('subtask_2c', 'task_2', { name: 'Mobile conversion is half of desktop' });

  cn('task_3', 'proj_1', { name: 'Prototype a 2-step signup flow in Figma' });

  // ── Meeting node (tagged with Meeting → should get template content) ──
  cn('meeting_1', 'proj_1', { name: 'Design review with Sarah' });
  useNodeStore.getState().applyTag('meeting_1', 'tagDef_meeting');

  // ── Person node ──
  cn('person_1', todayDayId, { name: 'Sarah Chen' });
  useNodeStore.getState().applyTag('person_1', 'tagDef_person');

  // ── Simple notes ──
  cn('note_1', todayDayId, { name: 'Writing as a thinking tool' });
  cn('note_1a', 'note_1', { name: 'Writing forces you to confront what you don\'t actually understand' });
  cn('note_1b', 'note_1', { name: 'The act of writing is the act of discovering what you believe' });
  cn('note_1c', 'note_1', { name: 'Most people think they understand until they try to explain it' });

  cn('note_2', todayDayId, { name: 'Quick captures' });
  cn('idea_1', 'note_2', { name: 'Check Figma comments on the modal redesign' });
  cn('idea_2', 'note_2', { name: 'Ask David about the API rate-limiting approach' });

  // ═══════════════════════════════════════════════════════════════
  // Store image content: Reading Notes
  // ═══════════════════════════════════════════════════════════════
  cn('si_reading_notes', todayDayId, { name: 'Reading Notes' });

  // 1. The Design of Everyday Things #article (expanded, with children)
  cn('si_deep_reading', 'si_reading_notes', { name: 'The Design of Everyday Things' });
  useNodeStore.getState().applyTag('si_deep_reading', 'tagDef_si_article');
  cn('si_dr_1', 'si_deep_reading', { name: 'Good design is actually invisible — you only notice it when it fails' });
  useNodeStore.getState().applyTag('si_dr_1', 'tagDef_insight');
  cn('si_dr_2', 'si_deep_reading', { name: 'Affordances signal what actions are possible; signifiers show where' });
  cn('si_dr_3', 'si_deep_reading', { name: 'Most errors are design errors, not user errors — blame the system, not the person' });

  // 2. Second-Order Thinking #mental-model (collapsed)
  cn('si_sot', 'si_reading_notes', { name: 'Second-Order Thinking' });
  useNodeStore.getState().applyTag('si_sot', 'tagDef_mental_model');

  // 3. Finish Thinking, Fast and Slow #book (done checkbox)
  cn('si_tfs', 'si_reading_notes', { name: 'Finish Thinking, Fast and Slow — chapter 3' });
  useNodeStore.getState().applyTag('si_tfs', 'tagDef_si_book');
  useNodeStore.getState().applyTag('si_tfs', 'tagDef_task');
  loroDoc.setNodeDataBatch('si_tfs', { done: Date.now() });

  // 4. Write weekly review #project (unchecked)
  cn('si_weekly', 'si_reading_notes', { name: 'Write weekly review — synthesize last 5 articles' });
  useNodeStore.getState().applyTag('si_weekly', 'tagDef_project');
  useNodeStore.getState().applyTag('si_weekly', 'tagDef_task');

  // 5. Insight
  cn('si_slow', 'si_reading_notes', { name: 'The best thinking is slow — the gap between stimulus and response is where wisdom lives' });
  useNodeStore.getState().applyTag('si_slow', 'tagDef_insight');

  // 6. Why Great Leaders Think Slowly #article
  cn('si_leaders', 'si_reading_notes', { name: 'Why Great Leaders Think Slowly' });
  useNodeStore.getState().applyTag('si_leaders', 'tagDef_si_article');

  // 7. Meeting with Sarah about research direction #meeting
  cn('si_meeting_sarah', 'si_reading_notes', { name: 'Research direction sync with Sarah' });
  useNodeStore.getState().applyTag('si_meeting_sarah', 'tagDef_meeting');

  // ═══════════════════════════════════════════════════════════════
  // Store image content: Library > Mental Models (Scene 2 — Connect)
  // ═══════════════════════════════════════════════════════════════
  cn('si_mental_models', todayDayId, { name: 'Mental Models' });

  // Second-Order Thinking #mental-model (with children)
  cn('si_mm_sot', 'si_mental_models', { name: 'Second-Order Thinking' });
  useNodeStore.getState().applyTag('si_mm_sot', 'tagDef_mental_model');
  cn('si_mm_sot_1', 'si_mm_sot', { name: 'Always ask "And then what?" — your first reaction is almost never the full picture' });
  useNodeStore.getState().applyTag('si_mm_sot_1', 'tagDef_insight');
  cn('si_mm_sot_2', 'si_mm_sot', { name: 'Not about predicting the future, but mapping the range of consequences' });

  // Inversion #mental-model
  cn('si_mm_inv', 'si_mental_models', { name: 'Inversion' });
  useNodeStore.getState().applyTag('si_mm_inv', 'tagDef_mental_model');
  cn('si_mm_inv_1', 'si_mm_inv', {
    name: 'Instead of "how do I succeed?" → ask "what would guarantee failure?" and avoid it',
  });

  // Applying mental models to product work #project (with inline ref)
  cn('si_mm_dte', 'si_mental_models', { name: 'Applying mental models to product decisions' });
  useNodeStore.getState().applyTag('si_mm_dte', 'tagDef_project');
  cn('si_mm_dte_1', 'si_mm_dte', {
    name: 'Use \uFFFC when scoping features — what are the second-order effects?',
    inlineRefs: [{ offset: 4, targetNodeId: 'si_mm_sot', displayName: 'Second-Order Thinking' }],
  });

  // ── Rich text test nodes ──
  cn('note_rich', todayDayId, { name: 'Formatting examples' });
  cn('rich_1', 'note_rich', {
    name: 'Key insight from the article on focus',
    marks: [{ start: 0, end: 11, type: 'bold' }],
  });
  cn('rich_2', 'note_rich', {
    name: 'Deep work requires eliminating shallow distractions',
    marks: [
      { start: 0, end: 9, type: 'italic' },
      { start: 30, end: 51, type: 'bold' },
      { start: 30, end: 51, type: 'italic' },
    ],
  });
  cn('rich_3', 'note_rich', {
    name: 'The key metric is time-to-value for new users',
    marks: [{ start: 15, end: 28, type: 'code' }],
  });
  cn('rich_4', 'note_rich', {
    name: 'Old approach — abandoned because it didn\'t scale',
    marks: [{ start: 0, end: 12, type: 'strike' }],
  });
  cn('rich_5', 'note_rich', {
    name: 'Users care about speed above everything else',
    marks: [{ start: 17, end: 22, type: 'highlight' }],
  });
  cn('rich_inline_ref', 'note_rich', {
    name: 'Related to \uFFFC from the user research',
    inlineRefs: [{ offset: 11, targetNodeId: 'task_1', displayName: 'Review user interview recordings' }],
  });

  // ═══════════════════════════════════════════════════════════════
  // Additional Today content
  // ═══════════════════════════════════════════════════════════════
  cn('inbox_1', todayDayId, { name: 'Revisit the competitor analysis doc' });
  cn('inbox_2', todayDayId, { name: 'Reply to the partnership proposal from Linear' });
  cn('inbox_3', todayDayId, { name: 'Review the Q2 roadmap draft' });
  cn('inbox_3a', 'inbox_3', { name: 'Revenue projections look optimistic — check assumptions' });
  cn('inbox_3b', 'inbox_3', { name: 'Need more data on the enterprise segment' });

  // Web clip (pre-tagged)
  cn('webclip_1', todayDayId, {
    name: 'Why Great Products Need Fewer Features — Medium',
  });
  useNodeStore.getState().applyTag('webclip_1', SYS_T.SOURCE);
  // Set URL field value: create a value node under the fieldEntry
  const wcFeId = loroDoc.getChildren('webclip_1')
    .find((c) => {
      const n = loroDoc.toNodexNode(c);
      return n?.type === 'fieldEntry' && n.fieldDefId === NDX_F.SOURCE_URL;
    });
  if (wcFeId) {
    cn('webclip1_val_url', wcFeId, { name: 'https://medium.com/example-article' });
  }

  // Web clip content child nodes (simulating parsed article body)
  cn('wc1_section1', 'webclip_1', {
    name: 'The Paradox of Choice',
    marks: [{ start: 0, end: 21, type: 'bold' as const }],
  });
  cn('wc1_p1', 'wc1_section1', { name: 'Every feature you add makes every other feature harder to find and use.' });
  cn('wc1_p2', 'wc1_section1', {
    name: 'The best products say no to good ideas to make room for great ones.',
    marks: [{ start: 19, end: 21, type: 'bold' as const }],
  });
  cn('wc1_section2', 'webclip_1', { name: 'Conclusion' });
  cn('wc1_p3', 'wc1_section2', { name: 'Simplicity isn\'t about doing less — it\'s about focusing on what matters most.' });

  // ═══════════════════════════════════════════════════════════════
  // Journal content (real date hierarchy: Year → Week → Day)
  // ═══════════════════════════════════════════════════════════════
  // Additional notes on Today plus older days for heatmap coverage.

  // How to Do Great Work (Paul Graham) #article
  cn('j_pg', todayDayId, { name: 'How to Do Great Work — Paul Graham' });
  useNodeStore.getState().applyTag('j_pg', 'tagDef_si_article');
  cn('j_pg_1', 'j_pg', { name: 'Four steps: choose a field, learn enough, notice gaps, explore them' });
  cn('j_pg_2', 'j_pg', { name: 'Great work sits at the intersection of aptitude, deep interest, and an important problem' });
  useNodeStore.getState().applyTag('j_pg_2', 'tagDef_insight');

  // Atomic Habits notes
  cn('j_deep', todayDayId, { name: 'Atomic Habits — James Clear' });
  useNodeStore.getState().applyTag('j_deep', 'tagDef_si_book');
  cn('j_deep_1', 'j_deep', { name: 'Habits are the compound interest of self-improvement' });
  useNodeStore.getState().applyTag('j_deep_1', 'tagDef_insight');
  cn('j_deep_2', 'j_deep', { name: 'You don\'t rise to the level of your goals, you fall to the level of your systems' });
  cn('j_deep_2a', 'j_deep_2', { name: 'This explains why new year resolutions fail — goals without systems' });
  cn('j_deep_3', 'j_deep', { name: 'Make the cue obvious, the craving attractive, the response easy, the reward satisfying' });
  useNodeStore.getState().applyTag('j_deep_3', 'tagDef_si_method');

  // Why Great Leaders Think Slowly #article
  cn('j_leaders', todayDayId, { name: 'Why Great Leaders Think Slowly' });
  useNodeStore.getState().applyTag('j_leaders', 'tagDef_si_article');
  cn('j_leaders_1', 'j_leaders', { name: 'The gap between stimulus and response is where leadership lives — same pattern as second-order thinking' });

  // Range by David Epstein #book
  cn('j_range', todayDayId, { name: 'Range — David Epstein' });
  useNodeStore.getState().applyTag('j_range', 'tagDef_si_book');
  cn('j_range_1', 'j_range', { name: 'Generalists triumph in a specialized world — early sampling beats early specialization' });

  // Yesterday's notes
  cn('j_yest_1', yesterdayDayId, { name: 'Finished reading the Jobs-to-be-Done framework paper' });
  cn('j_yest_2', yesterdayDayId, { name: 'Sketched the new onboarding wireframe in Figma' });

  // ── More journal days for heatmap demo ──
  const day2ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
  const day2agoId = ensureDateNode(day2ago);
  cn('j_d2_1', day2agoId, { name: 'Deep work session: wrote the product strategy doc' });
  cn('j_d2_2', day2agoId, { name: 'Reviewed 3 competitor landing pages for positioning ideas' });
  cn('j_d2_3', day2agoId, { name: 'Interesting pattern: all top products lead with outcomes, not features' });
  cn('j_d2_4', day2agoId, { name: 'Updated the messaging framework based on user interviews' });
  cn('j_d2_5', day2agoId, { name: 'Shared draft with the team for feedback' });

  const day4ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4);
  const day4agoId = ensureDateNode(day4ago);
  cn('j_d4_1', day4agoId, { name: 'Quick sync with marketing — aligned on launch timeline' });

  const day5ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5);
  const day5agoId = ensureDateNode(day5ago);
  cn('j_d5_1', day5agoId, { name: 'Researched how Notion and Linear handle onboarding' });
  cn('j_d5_2', day5agoId, { name: 'Drafted the "first 5 minutes" experience flow' });
  cn('j_d5_3', day5agoId, { name: 'Brainstormed with David on the activation metric' });
  cn('j_d5_4', day5agoId, { name: 'Wrote the PRD for onboarding v2' });

  const day7ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const day7agoId = ensureDateNode(day7ago);
  cn('j_d7_1', day7agoId, { name: 'Kickoff meeting for Q2 growth initiative' });
  cn('j_d7_2', day7agoId, { name: 'Mapped the full user journey from signup to first value' });
  cn('j_d7_3', day7agoId, { name: 'Identified 3 key friction points in the current flow' });
  cn('j_d7_4', day7agoId, { name: 'Read "Hooked" by Nir Eyal — useful framework for habit loops' });
  cn('j_d7_5', day7agoId, { name: 'Applied the Hook model to our activation sequence' });
  cn('j_d7_6', day7agoId, { name: 'Shared findings in the all-hands' });

  const day10ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
  const day10agoId = ensureDateNode(day10ago);
  cn('j_d10_1', day10agoId, { name: 'Sprint retro — team wants more user research time' });
  cn('j_d10_2', day10agoId, { name: 'Planned the next round of user interviews' });

  const day14ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
  const day14agoId = ensureDateNode(day14ago);
  cn('j_d14_1', day14agoId, { name: 'Explored the "Aha moment" concept from Chamath Palihapitiya' });
  cn('j_d14_2', day14agoId, { name: 'Facebook\'s was "7 friends in 10 days" — what\'s ours?' });
  cn('j_d14_3', day14agoId, { name: 'Hypothesis: our aha moment is first time AI references a past note' });

  // ═══════════════════════════════════════════════════════════════
  // Search node: "Task" tag search (queryCondition tree + auto-materialized results)
  // ═══════════════════════════════════════════════════════════════
  cn('search_task', SYSTEM_NODE_IDS.SEARCHES, { type: 'search', name: 'Everything tagged #Task' });
  cn('search_task_and', 'search_task', { type: 'queryCondition', queryLogic: 'AND' });
  cn('search_task_cond', 'search_task_and', { type: 'queryCondition', queryOp: 'HAS_TAG', queryTagDefId: 'tagDef_task' });
  // Results are auto-materialized on panel open via refreshSearchResults

  // ═══════════════════════════════════════════════════════════════
  // UI State: current node + expand defaults
  // ═══════════════════════════════════════════════════════════════
  const uiStore = useUIStore.getState();

  // Expand some nodes by default for testing (skipUndo=true to avoid
  // creating undo entries during seed — Bug 1 fix)
  uiStore.setExpanded(buildExpandedNodeKey('node-main', todayDayId, 'proj_1'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', 'proj_1', 'task_1'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', 'proj_1', 'task_2'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', todayDayId, 'note_rich'), true, true);

  // Store image nodes: expand article nodes with children
  uiStore.setExpanded(buildExpandedNodeKey('node-main', 'si_reading_notes', 'si_deep_reading'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', 'si_mental_models', 'si_mm_sot'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', 'si_mental_models', 'si_mm_inv'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', 'si_mental_models', 'si_mm_dte'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', todayDayId, 'j_pg'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', todayDayId, 'j_deep'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', 'j_deep_2', 'j_deep_2a'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', todayDayId, 'j_leaders'), true, true);
  uiStore.setExpanded(buildExpandedNodeKey('node-main', todayDayId, 'j_range'), true, true);

  uiStore.replaceCurrentNode(todayDayId);
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
    useUIStore.setState({
      chatDrawerOpen: false,
      currentNodeId: null,
      currentChatSessionId: null,
      nodeHistory: [],
      nodeHistoryIndex: -1,
      expandedNodes: new Set(),
    });
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
  // Some store actions (applyTag etc.) call commitDoc() internally without '__seed__' origin,
  // creating stray undo entries.  Clear them so user starts with a clean undo history.
  clearUndoHistoryForTest();
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
}

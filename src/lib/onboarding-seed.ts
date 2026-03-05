/**
 * Onboarding seed data for first-time users.
 *
 * Creates a welcome tree under today's date node with:
 * 1. "Welcome to soma" intro section
 * 2. Sample article clip (#article tag + Source URL field)
 * 3. "Getting started" task checklist (#task tag + Status field)
 * 4. Keyboard shortcuts reference (collapsed)
 *
 * All operations use system origin to exclude from undo history.
 * Idempotent — checks for sentinel node before seeding.
 */
import * as loroDoc from './loro-doc.js';
import { commitDoc } from './loro-doc.js';
import { ensureTodayNode } from './journal.js';
import { applyTagMutationsNoCommit } from '../stores/node-store.js';
import { useUIStore } from '../stores/ui-store.js';
import { CONTAINER_IDS, FIELD_TYPES, NDX_T, NDX_F } from '../types/index.js';
import type { TextMark } from '../types/index.js';
import { nanoid } from 'nanoid';

// ─── Sentinel ────────────────────────────────────────────────────────────────

const SENTINEL_ID = 'onb_welcome';

export function isOnboardingSeeded(): boolean {
  return loroDoc.hasNode(SENTINEL_ID);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(
  id: string,
  parentId: string,
  name: string,
  opts?: {
    marks?: TextMark[];
    description?: string;
    type?: string;
    fieldType?: string;
    showCheckbox?: boolean;
    color?: string;
    extends?: string;
    completedAt?: number;
    minValue?: number;
    maxValue?: number;
  },
): void {
  if (loroDoc.hasNode(id)) return;
  loroDoc.createNode(id, parentId);

  const data: Record<string, unknown> = {};
  if (opts?.type) data.type = opts.type;
  if (opts?.fieldType) data.fieldType = opts.fieldType;
  if (opts?.showCheckbox) data.showCheckbox = opts.showCheckbox;
  if (opts?.color) data.color = opts.color;
  if (opts?.extends) data.extends = opts.extends;
  if (opts?.description) data.description = opts.description;
  if (opts?.completedAt) data.completedAt = opts.completedAt;
  if (opts?.minValue !== undefined) data.minValue = opts.minValue;
  if (opts?.maxValue !== undefined) data.maxValue = opts.maxValue;

  if (Object.keys(data).length > 0) {
    loroDoc.setNodeDataBatch(id, data);
  }

  if (opts?.marks && opts.marks.length > 0) {
    loroDoc.setNodeRichTextContent(id, name, opts.marks, []);
  } else {
    loroDoc.setNodeRichTextContent(id, name, [], []);
  }
}

/** Set an options field value on a node (creates fieldEntry + valueNode). */
function setOptionField(nodeId: string, fieldDefId: string, optionNodeId: string): void {
  const feId = nanoid();
  loroDoc.createNode(feId, nodeId);
  loroDoc.setNodeDataBatch(feId, { type: 'fieldEntry', fieldDefId });

  const valId = nanoid();
  loroDoc.createNode(valId, feId);
  loroDoc.setNodeData(valId, 'targetId', optionNodeId);
}

/** Set a plain/URL field value on a node (creates fieldEntry + valueNode). */
function setPlainField(nodeId: string, fieldDefId: string, value: string): void {
  const feId = nanoid();
  loroDoc.createNode(feId, nodeId);
  loroDoc.setNodeDataBatch(feId, { type: 'fieldEntry', fieldDefId });

  const valId = nanoid();
  loroDoc.createNode(valId, feId);
  loroDoc.setNodeRichTextContent(valId, value, [], []);
}

// ─── Main seed function ──────────────────────────────────────────────────────

export function seedOnboardingData(): void {
  if (isOnboardingSeeded()) return;

  const todayId = ensureTodayNode();

  // ═══════════════════════════════════════════════════════════════════════════
  // Schema: #task tagDef + fields (only if user doesn't have one yet)
  // ═══════════════════════════════════════════════════════════════════════════

  cn('onb_tagDef_task', CONTAINER_IDS.SCHEMA, 'task', {
    type: 'tagDef', showCheckbox: true, color: 'green',
  });

  // Status field (options)
  cn('onb_attrDef_status', 'onb_tagDef_task', 'Status', {
    type: 'fieldDef', fieldType: FIELD_TYPES.OPTIONS,
  });
  cn('onb_opt_todo', 'onb_attrDef_status', 'To Do');
  cn('onb_opt_in_progress', 'onb_attrDef_status', 'In Progress');
  cn('onb_opt_done', 'onb_attrDef_status', 'Done');

  // Due field (date)
  cn('onb_attrDef_due', 'onb_tagDef_task', 'Due', {
    type: 'fieldDef', fieldType: FIELD_TYPES.DATE,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 1: Welcome to soma
  // ═══════════════════════════════════════════════════════════════════════════

  cn(SENTINEL_ID, todayId, 'Welcome to soma', {
    marks: [{ start: 0, end: 15, type: 'bold' }],
  });

  cn('onb_tagline', SENTINEL_ID,
    'Think where you read \u2014 your browser sidebar for capturing and connecting ideas');

  cn('onb_basics', SENTINEL_ID,
    'Everything here is a node \u2014 click to edit, press Enter to create, Tab to indent');

  cn('onb_cmdk', SENTINEL_ID,
    'Press \u2318K to search anything or run commands', {
      marks: [{ start: 6, end: 8, type: 'code' }],
    });

  cn('onb_journal', SENTINEL_ID,
    'This is today\u2019s journal \u2014 press \u2318\u21E7D to jump here anytime', {
      marks: [{ start: 35, end: 39, type: 'code' }],
    });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 2: Sample article clip
  // ═══════════════════════════════════════════════════════════════════════════

  cn('onb_clip', todayId, 'How to Take Smart Notes \u2014 S\u00F6nke Ahrens', {
    description: 'A guide to the Zettelkasten method and connected note-taking',
  });
  applyTagMutationsNoCommit('onb_clip', NDX_T.ARTICLE);
  // Set Source URL field value
  setPlainField('onb_clip', NDX_F.SOURCE_URL, 'https://example.com/smart-notes');

  cn('onb_clip_p1', 'onb_clip',
    'Writing is not the outcome of thinking \u2014 it is the medium', {
      marks: [{ start: 42, end: 59, type: 'bold' }],
    });

  cn('onb_clip_p2', 'onb_clip',
    'Good tools for thought don\u2019t make thinking easier \u2014 they make it visible');

  cn('onb_clip_hint', 'onb_clip',
    'Clip any page with /clip_page or highlight text to save it here', {
      marks: [{ start: 19, end: 29, type: 'code' }],
    });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 3: Getting started tasks
  // ═══════════════════════════════════════════════════════════════════════════

  cn('onb_tasks', todayId, 'Getting started');

  // Task 1: completed
  cn('onb_task_1', 'onb_tasks', 'Open soma for the first time', {
    completedAt: Date.now(),
  });
  applyTagMutationsNoCommit('onb_task_1', 'onb_tagDef_task');
  setOptionField('onb_task_1', 'onb_attrDef_status', 'onb_opt_done');

  // Task 2: in progress
  cn('onb_task_2', 'onb_tasks', 'Try editing this node \u2014 click and type');
  applyTagMutationsNoCommit('onb_task_2', 'onb_tagDef_task');
  setOptionField('onb_task_2', 'onb_attrDef_status', 'onb_opt_in_progress');

  // Task 3: todo
  cn('onb_task_3', 'onb_tasks', 'Highlight text on any webpage');
  applyTagMutationsNoCommit('onb_task_3', 'onb_tagDef_task');
  setOptionField('onb_task_3', 'onb_attrDef_status', 'onb_opt_todo');

  // Task 4: todo
  cn('onb_task_4', 'onb_tasks', 'Clip a page with \u2318\u21E7S or the /clip_page command', {
    marks: [{ start: 18, end: 22, type: 'code' }],
  });
  applyTagMutationsNoCommit('onb_task_4', 'onb_tagDef_task');
  setOptionField('onb_task_4', 'onb_attrDef_status', 'onb_opt_todo');

  // Task 5: todo
  cn('onb_task_5', 'onb_tasks', 'Search your notes with \u2318K', {
    marks: [{ start: 23, end: 25, type: 'code' }],
  });
  applyTagMutationsNoCommit('onb_task_5', 'onb_tagDef_task');
  setOptionField('onb_task_5', 'onb_attrDef_status', 'onb_opt_todo');

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 4: Keyboard shortcuts (collapsed by default)
  // ═══════════════════════════════════════════════════════════════════════════

  cn('onb_shortcuts', todayId, 'Keyboard shortcuts', {
    marks: [{ start: 0, end: 18, type: 'bold' }],
  });

  cn('onb_kb_1', 'onb_shortcuts', 'Enter \u2014 new node below');
  cn('onb_kb_2', 'onb_shortcuts', 'Tab / Shift+Tab \u2014 indent / outdent');
  cn('onb_kb_3', 'onb_shortcuts', '\u2318K \u2014 search and commands');
  cn('onb_kb_4', 'onb_shortcuts', '\u2318\u21E7D \u2014 go to today');
  cn('onb_kb_5', 'onb_shortcuts', '# \u2014 add a tag (type # in a node)');
  cn('onb_kb_6', 'onb_shortcuts', '/ \u2014 slash commands (clip, code block, \u2026)');

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 5: Deletable hint
  // ═══════════════════════════════════════════════════════════════════════════

  cn('onb_deletable', todayId,
    'These welcome notes are yours \u2014 edit or delete them anytime');

  // ═══════════════════════════════════════════════════════════════════════════
  // UI state: expand defaults
  // ═══════════════════════════════════════════════════════════════════════════

  const ui = useUIStore.getState();
  ui.setExpanded(`${todayId}:${SENTINEL_ID}`, true, true);
  ui.setExpanded(`${todayId}:onb_clip`, true, true);
  ui.setExpanded(`${todayId}:onb_tasks`, true, true);
  // onb_shortcuts: intentionally left collapsed

  // Single commit with system origin → excluded from undo history
  commitDoc('system:onboarding');
}

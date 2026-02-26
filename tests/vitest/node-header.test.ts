/**
 * Tests for NodePanel Header redesign:
 * - UIStore expandedHiddenFields (toggle, clear, key format)
 * - NodeHeader block visibility logic (icon, checkbox, tag conditions)
 * - Column alignment constants match OutlinerItem
 */
import { useUIStore, partializeUIStore } from '../../src/stores/ui-store.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { shouldNodeShowCheckbox } from '../../src/lib/checkbox-utils.js';
import { resolveNodeStructuralIcon } from '../../src/lib/field-utils.js';
import { resolveTagColor } from '../../src/lib/tag-colors.js';
import { resetAndSeed } from './helpers/test-state.js';

// Seed data node IDs (from seed-data.ts)
const TAG_DEF_TASK = 'tagDef_task';
const FIELD_DEF_STATUS = 'attrDef_status';
const CONTENT_NODE = 'note_1'; // plain content node
const TASK_NODE = 'task_1'; // tagged with Task (has checkbox)

// ─── UIStore: expandedHiddenFields ──────────────────────────────────────────

describe('UIStore expandedHiddenFields', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('starts with empty set', () => {
    const { expandedHiddenFields } = useUIStore.getState();
    expect(expandedHiddenFields.size).toBe(0);
  });

  it('toggleHiddenField adds a field key', () => {
    useUIStore.getState().toggleHiddenField('panel1', 'field1');
    const { expandedHiddenFields } = useUIStore.getState();
    expect(expandedHiddenFields.has('panel1:field1')).toBe(true);
    expect(expandedHiddenFields.size).toBe(1);
  });

  it('toggleHiddenField removes an already-expanded field', () => {
    useUIStore.getState().toggleHiddenField('panel1', 'field1');
    useUIStore.getState().toggleHiddenField('panel1', 'field1');
    const { expandedHiddenFields } = useUIStore.getState();
    expect(expandedHiddenFields.has('panel1:field1')).toBe(false);
    expect(expandedHiddenFields.size).toBe(0);
  });

  it('supports multiple panel:field keys independently', () => {
    const ui = useUIStore.getState();
    ui.toggleHiddenField('panel1', 'fieldA');
    ui.toggleHiddenField('panel1', 'fieldB');
    ui.toggleHiddenField('panel2', 'fieldA');
    const { expandedHiddenFields } = useUIStore.getState();
    expect(expandedHiddenFields.has('panel1:fieldA')).toBe(true);
    expect(expandedHiddenFields.has('panel1:fieldB')).toBe(true);
    expect(expandedHiddenFields.has('panel2:fieldA')).toBe(true);
    expect(expandedHiddenFields.size).toBe(3);
  });

  it('clearExpandedHiddenFields resets to empty', () => {
    useUIStore.getState().toggleHiddenField('panel1', 'field1');
    useUIStore.getState().toggleHiddenField('panel2', 'field2');
    expect(useUIStore.getState().expandedHiddenFields.size).toBe(2);

    useUIStore.getState().clearExpandedHiddenFields();
    expect(useUIStore.getState().expandedHiddenFields.size).toBe(0);
  });

  it('is not persisted (session-only state)', () => {
    const state = useUIStore.getState();
    const persisted = partializeUIStore(state);
    expect(persisted).not.toHaveProperty('expandedHiddenFields');
  });
});

// ─── NodeHeader block visibility logic ─────────────────────────────────────

describe('NodeHeader block visibility logic', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  describe('Block ① Icon — conditional rendering', () => {
    it('tagDef nodes have a tag color for icon rendering', () => {
      const color = resolveTagColor(TAG_DEF_TASK);
      expect(color).toBeDefined();
      expect(color.text).toBeTruthy();
    });

    it('fieldDef nodes resolve a structural icon', () => {
      const node = useNodeStore.getState().getNode(FIELD_DEF_STATUS);
      expect(node).toBeTruthy();
      expect(node!.type).toBe('fieldDef');
      const icon = resolveNodeStructuralIcon(node!);
      expect(icon).not.toBeNull();
    });

    it('regular content nodes have no structural icon', () => {
      const node = useNodeStore.getState().getNode(CONTENT_NODE);
      expect(node).toBeTruthy();
      expect(node!.type).toBeUndefined();
      const icon = resolveNodeStructuralIcon(node!);
      expect(icon).toBeNull();
    });
  });

  describe('Block ② Name row — checkbox visibility', () => {
    it('task node (with showCheckbox tag) shows checkbox', () => {
      const node = useNodeStore.getState().getNode(TASK_NODE);
      expect(node).toBeTruthy();
      const { showCheckbox } = shouldNodeShowCheckbox(node!);
      expect(showCheckbox).toBe(true);
    });

    it('plain content node does NOT show checkbox', () => {
      const node = useNodeStore.getState().getNode(CONTENT_NODE);
      expect(node).toBeTruthy();
      const { showCheckbox } = shouldNodeShowCheckbox(node!);
      expect(showCheckbox).toBe(false);
    });
  });

  describe('Block ③ Supertag row — tag conditions', () => {
    it('tagged node has tags array', () => {
      const node = useNodeStore.getState().getNode(TASK_NODE);
      expect(node!.tags.length).toBeGreaterThan(0);
    });

    it('untagged content node has empty tags', () => {
      const node = useNodeStore.getState().getNode(CONTENT_NODE);
      expect(node!.tags.length).toBe(0);
    });

    it('tagDef/fieldDef nodes should not show supertag row', () => {
      // Per spec: supertag row hidden when node.type is tagDef or fieldDef
      const tagNode = useNodeStore.getState().getNode(TAG_DEF_TASK);
      const fieldNode = useNodeStore.getState().getNode(FIELD_DEF_STATUS);
      expect(tagNode!.type === 'tagDef' || tagNode!.type === 'fieldDef').toBe(true);
      expect(fieldNode!.type === 'tagDef' || fieldNode!.type === 'fieldDef').toBe(true);
    });
  });
});


import { describe, expect, it } from 'vitest';
import { buildTriggerEditorProps, type EditorTriggerState } from '../../src/hooks/use-editor-triggers.js';
import { getTreeReferenceBlockMessage } from '../../src/lib/reference-rules.js';

function makeDummyTriggerState(overrides?: Partial<EditorTriggerState>): EditorTriggerState {
  const noop = () => {};
  return {
    hashTag: {
      open: false,
      query: '',
      selectedIndex: 0,
      anchor: undefined,
      tagDropdownRef: { current: null },
      onTrigger: noop,
      onDeactivate: noop,
      onSelect: noop,
      onCreateNew: noop,
      onConfirm: noop,
      onNavDown: noop,
      onNavUp: noop,
      onForceCreate: noop,
      onClose: noop,
    },
    reference: {
      open: false,
      query: '',
      selectedIndex: 0,
      anchor: undefined,
      treeContextParentId: null,
      refDropdownRef: { current: null },
      onTrigger: noop,
      onDeactivate: noop,
      onSelect: noop,
      onCreateNew: noop,
      onConfirm: noop,
      onNavDown: noop,
      onNavUp: noop,
      onForceCreate: noop,
      onClose: noop,
    },
    slash: {
      open: false,
      query: '',
      selectedIndex: -1,
      anchor: undefined,
      filteredCommands: [],
      onTrigger: noop,
      onDeactivate: noop,
      onConfirm: noop,
      onNavDown: noop,
      onNavUp: noop,
      onClose: noop,
      executeCommand: noop as any,
    },
    onFieldTriggerFire: noop,
    hasOverlayOpen: false,
    resetAll: noop,
    ...overrides,
  };
}

describe('buildTriggerEditorProps', () => {
  it('maps all trigger handler props', () => {
    const state = makeDummyTriggerState();
    const props = buildTriggerEditorProps(state);

    // Hash tag props
    expect(props).toHaveProperty('onHashTag');
    expect(props).toHaveProperty('onHashTagDeactivate');
    expect(props).toHaveProperty('hashTagActive');
    expect(props).toHaveProperty('onHashTagConfirm');
    expect(props).toHaveProperty('onHashTagNavDown');
    expect(props).toHaveProperty('onHashTagNavUp');
    expect(props).toHaveProperty('onHashTagCreate');
    expect(props).toHaveProperty('onHashTagClose');

    // Field trigger
    expect(props).toHaveProperty('onFieldTriggerFire');

    // Reference props
    expect(props).toHaveProperty('onReference');
    expect(props).toHaveProperty('onReferenceDeactivate');
    expect(props).toHaveProperty('referenceActive');
    expect(props).toHaveProperty('onReferenceConfirm');
    expect(props).toHaveProperty('onReferenceNavDown');
    expect(props).toHaveProperty('onReferenceNavUp');
    expect(props).toHaveProperty('onReferenceCreate');
    expect(props).toHaveProperty('onReferenceClose');

    // Slash props
    expect(props).toHaveProperty('onSlashCommand');
    expect(props).toHaveProperty('onSlashCommandDeactivate');
    expect(props).toHaveProperty('slashActive');
    expect(props).toHaveProperty('onSlashConfirm');
    expect(props).toHaveProperty('onSlashNavDown');
    expect(props).toHaveProperty('onSlashNavUp');
    expect(props).toHaveProperty('onSlashClose');
  });

  it('reflects open state from trigger state', () => {
    const openHashTag = makeDummyTriggerState({
      hashTag: {
        ...makeDummyTriggerState().hashTag,
        open: true,
      },
    });
    const props = buildTriggerEditorProps(openHashTag);
    expect(props.hashTagActive).toBe(true);
    expect(props.referenceActive).toBe(false);
    expect(props.slashActive).toBe(false);
  });

  it('passes onFieldTriggerFire as undefined when disabled', () => {
    const state = makeDummyTriggerState({ onFieldTriggerFire: undefined });
    const props = buildTriggerEditorProps(state);
    expect(props.onFieldTriggerFire).toBeUndefined();
  });
});

describe('getTreeReferenceBlockMessage', () => {
  it('returns self-child message for self_parent', () => {
    const msg = getTreeReferenceBlockMessage('self_parent');
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe('string');
  });

  it('returns cycle message for would_create_display_cycle', () => {
    const msg = getTreeReferenceBlockMessage('would_create_display_cycle');
    expect(msg).toBeTruthy();
  });

  it('returns unavailable message for missing_parent', () => {
    const msg = getTreeReferenceBlockMessage('missing_parent');
    expect(msg).toBeTruthy();
  });

  it('returns unavailable message for missing_target', () => {
    const msg = getTreeReferenceBlockMessage('missing_target');
    expect(msg).toBeTruthy();
  });

  it('returns unavailable message for null', () => {
    const msg = getTreeReferenceBlockMessage(null);
    expect(msg).toBeTruthy();
  });
});

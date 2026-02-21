import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FieldRow,
  FIELD_ROW_SELECTION_OVERLAY_CLASS,
  FIELD_ROW_SELECTION_OVERLAY_STYLE,
  isFieldRowInteractiveTarget,
  resolveFieldRowSelectAction,
  shouldSelectFieldRow,
} from '../../src/components/fields/FieldRow.js';
import { FIELD_TYPES } from '../../src/types/index.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

function resolveTaskFieldEntry(fieldDefId: string) {
  const store = useNodeStore.getState();
  const task = store.getNode('task_1');
  const tupleId = task?.children.find((cid) => {
    const child = store.getNode(cid);
    return child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId;
  });
  if (!tupleId) throw new Error(`Missing fieldEntry for ${fieldDefId}`);
  const fieldDef = store.getNode(fieldDefId);
  return {
    tupleId,
    attrDefName: fieldDef?.name ?? 'Status',
    dataType: fieldDef?.fieldType ?? FIELD_TYPES.PLAIN,
  };
}

describe('FieldRow selected highlight', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('uses the same visual recipe as content rows for selection mask', () => {
    expect(FIELD_ROW_SELECTION_OVERLAY_CLASS).toContain('bg-selection-row');
    expect(FIELD_ROW_SELECTION_OVERLAY_CLASS).toContain('border-primary/[0.15]');
    expect(FIELD_ROW_SELECTION_OVERLAY_CLASS).not.toContain('z-0');
    expect(FIELD_ROW_SELECTION_OVERLAY_STYLE).toMatchObject({ left: -4, top: 1, bottom: 1 });
  });

  it('keeps name/value layers above the selection mask', () => {
    const { tupleId, attrDefName, dataType } = resolveTaskFieldEntry('attrDef_status');
    useUIStore.setState({ selectedNodeIds: new Set(), focusedNodeId: null, editingFieldNameId: null });

    const html = renderToStaticMarkup(createElement(FieldRow, {
      nodeId: 'task_1',
      attrDefId: 'attrDef_status',
      attrDefName,
      tupleId,
      dataType,
    }));

    expect(html).toContain('relative z-[1] flex items-center gap-1');
    expect(html).toContain('relative z-[1] flex flex-1 min-w-0 items-start');
  });

  it('treats only non-interactive name-side clicks as tuple selection triggers', () => {
    const nameSide = document.createElement('div');
    const valueSide = document.createElement('div');
    valueSide.setAttribute('data-field-value', '');
    const innerButton = document.createElement('button');
    valueSide.appendChild(innerButton);

    expect(isFieldRowInteractiveTarget(nameSide)).toBe(false);
    expect(isFieldRowInteractiveTarget(innerButton)).toBe(true);
    expect(isFieldRowInteractiveTarget(valueSide)).toBe(true);
    expect(isFieldRowInteractiveTarget(null)).toBe(true);
  });

  it('suppresses row selection during editing and post-drag click', () => {
    const nameSide = document.createElement('div');
    expect(
      shouldSelectFieldRow({ isEditing: false, justDragged: false, target: nameSide }),
    ).toBe(true);
    expect(
      shouldSelectFieldRow({ isEditing: true, justDragged: false, target: nameSide }),
    ).toBe(false);
    expect(
      shouldSelectFieldRow({ isEditing: false, justDragged: true, target: nameSide }),
    ).toBe(false);
  });

  it('maps modifiers to single/toggle/range selection actions', () => {
    const nameSide = document.createElement('div');
    expect(resolveFieldRowSelectAction({
      isEditing: false,
      justDragged: false,
      target: nameSide,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    })).toBe('single');
    expect(resolveFieldRowSelectAction({
      isEditing: false,
      justDragged: false,
      target: nameSide,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
    })).toBe('toggle');
    expect(resolveFieldRowSelectAction({
      isEditing: false,
      justDragged: false,
      target: nameSide,
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
    })).toBe('range');
  });
});

import { describe, expect, it } from 'vitest';
import { SYS_V } from '../../src/types/index.js';
import {
  buildFieldOwnerColors,
  buildVisibleChildrenRows,
} from '../../src/components/outliner/OutlinerItem.js';

describe('OutlinerItem field ordering and color', () => {
  it('pins template fields on top while keeping manual fields in original order', () => {
    const allChildIds = ['content_a', 'manual_field', 'content_b', 'template_field'];
    const fieldMap = new Map([
      ['manual_field', {
        fieldDefId: 'field_manual',
        templateId: undefined,
        hideMode: SYS_V.NEVER,
        isEmpty: true,
      }],
      ['template_field', {
        fieldDefId: 'field_template',
        templateId: 'field_template',
        hideMode: SYS_V.NEVER,
        isEmpty: true,
      }],
    ]);

    const rows = buildVisibleChildrenRows({
      allChildIds,
      fieldMap,
      tagIds: ['tag_task'],
      getFieldDefOwnerId: (fieldDefId) => (fieldDefId === 'field_template' ? 'tag_task' : 'schema'),
      getNodeType: (nodeId) => (nodeId === 'tag_task' ? 'tagDef' : undefined),
      getChildNodeType: (childId) => (childId.startsWith('content_') ? undefined : 'fieldEntry'),
      isOutlinerContentType: (nodeType) => nodeType === undefined,
    });

    expect(rows.map((row) => row.id)).toEqual([
      'template_field',
      'content_a',
      'manual_field',
      'content_b',
    ]);
  });

  it('colors only tagDef-owned fields and leaves schema/manual fields neutral', () => {
    const colors = buildFieldOwnerColors(
      new Map([
        ['template_entry', { fieldDefId: 'field_template' }],
        ['manual_entry', { fieldDefId: 'field_manual' }],
      ]),
      (fieldDefId) => (fieldDefId === 'field_template' ? 'tag_task' : 'schema'),
      (nodeId) => (nodeId === 'tag_task' ? 'tagDef' : undefined),
      (tagDefId) => `${tagDefId}-color`,
    );

    expect(colors.get('template_entry')).toBe('tag_task-color');
    expect(colors.has('manual_entry')).toBe(false);
  });

  it('uses templateId owner for inherited template field colors', () => {
    const colors = buildFieldOwnerColors(
      new Map([
        ['inherited_entry', { fieldDefId: 'field_local_copy', templateId: 'field_template' }],
      ]),
      (fieldDefId) => {
        if (fieldDefId === 'field_local_copy') return 'schema';
        if (fieldDefId === 'field_template') return 'tag_task';
        return null;
      },
      (nodeId) => (nodeId === 'tag_task' ? 'tagDef' : undefined),
      (tagDefId) => `${tagDefId}-color`,
    );

    expect(colors.get('inherited_entry')).toBe('tag_task-color');
  });
});

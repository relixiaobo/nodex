import { AlignLeft, List } from 'lucide-react';
import type { NodexNode } from '../../src/types/index.js';
import { SYS_A, SYS_D, SYS_V } from '../../src/types/index.js';
import {
  findAutoCollectTupleId,
  getFieldTypeIcon,
  getFieldTypeLabel,
  isPlainFieldType,
  resolveAutoCollectedOptions,
  resolveDataType,
  resolveFieldOptions,
  resolveHideField,
  resolveMaxValue,
  resolveMinValue,
  resolveRequired,
  resolveSourceSupertag,
  resolveTaggedNodes,
} from '../../src/lib/field-utils.js';

function node(
  id: string,
  opts?: {
    docType?: string;
    ownerId?: string;
    children?: string[];
    meta?: string[];
  },
): NodexNode {
  return {
    id,
    workspaceId: 'ws_default',
    props: {
      name: id,
      _docType: opts?.docType,
      _ownerId: opts?.ownerId,
    },
    children: opts?.children ?? [],
    meta: opts?.meta,
    version: 1,
    updatedAt: 0,
    createdBy: 'user_default',
    updatedBy: 'user_default',
  };
}

describe('field utils', () => {
  it('resolves attrDef config values and defaults', () => {
    const entities: Record<string, NodexNode> = {
      attr: node('attr', {
        docType: 'attrDef',
        children: ['t_type', 't_src', 't_hide', 't_nullable', 't_min', 't_max'],
      }),
      t_type: node('t_type', { docType: 'tuple', children: [SYS_A.TYPE_CHOICE, SYS_D.DATE] }),
      t_src: node('t_src', { docType: 'tuple', children: [SYS_A.SOURCE_SUPERTAG, 'tagDef_task'] }),
      t_hide: node('t_hide', { docType: 'tuple', children: [SYS_A.HIDE_FIELD, SYS_V.ALWAYS] }),
      t_nullable: node('t_nullable', { docType: 'tuple', children: [SYS_A.NULLABLE, SYS_V.YES] }),
      t_min: node('t_min', { docType: 'tuple', children: [SYS_A.MIN_VALUE, '3.5'] }),
      t_max: node('t_max', { docType: 'tuple', children: [SYS_A.MAX_VALUE, '10'] }),
    };

    expect(resolveDataType(entities, 'attr')).toBe(SYS_D.DATE);
    expect(resolveSourceSupertag(entities, 'attr')).toBe('tagDef_task');
    expect(resolveHideField(entities, 'attr')).toBe(SYS_V.ALWAYS);
    expect(resolveRequired(entities, 'attr')).toBe(true);
    expect(resolveMinValue(entities, 'attr')).toBe(3.5);
    expect(resolveMaxValue(entities, 'attr')).toBe(10);

    expect(resolveDataType(entities, 'missing_attr')).toBe(SYS_D.PLAIN);
    expect(resolveHideField(entities, 'missing_attr')).toBe(SYS_V.NEVER);
    expect(resolveRequired(entities, 'missing_attr')).toBe(false);
  });

  it('returns undefined for invalid min/max number config', () => {
    const entities: Record<string, NodexNode> = {
      attr: node('attr', { docType: 'attrDef', children: ['t_min', 't_max'] }),
      t_min: node('t_min', { docType: 'tuple', children: [SYS_A.MIN_VALUE, 'x'] }),
      t_max: node('t_max', { docType: 'tuple', children: [SYS_A.MAX_VALUE, 'NaN'] }),
    };
    expect(resolveMinValue(entities, 'attr')).toBeUndefined();
    expect(resolveMaxValue(entities, 'attr')).toBeUndefined();
  });

  it('resolves field options and autocollect state', () => {
    const entities: Record<string, NodexNode> = {
      attr: node('attr', { docType: 'attrDef', children: ['cfg_tuple', 'opt_1', 'opt_2', 'auto_tuple'] }),
      cfg_tuple: node('cfg_tuple', { docType: 'tuple', children: [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS] }),
      auto_tuple: node('auto_tuple', {
        docType: 'tuple',
        children: [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.YES, 'auto_1', 'auto_2'],
      }),
      opt_1: node('opt_1'),
      opt_2: node('opt_2'),
      auto_1: node('auto_1'),
      auto_2: node('auto_2'),
    };

    expect(resolveFieldOptions(entities, 'attr')).toEqual(['opt_1', 'opt_2']);
    expect(resolveAutoCollectedOptions(entities, 'attr')).toEqual(['auto_1', 'auto_2']);
    expect(findAutoCollectTupleId(entities, 'attr')).toBe('auto_tuple');

    entities.auto_tuple = node('auto_tuple', {
      docType: 'tuple',
      children: [SYS_A.AUTOCOLLECT_OPTIONS, SYS_V.NO, 'auto_1'],
    });
    expect(resolveAutoCollectedOptions(entities, 'attr')).toEqual([]);
  });

  it('resolves tagged content nodes through node.meta tuples', () => {
    const entities: Record<string, NodexNode> = {
      content_1: node('content_1', { meta: ['tag_tuple_1'] }),
      content_2: node('content_2', { meta: ['tag_tuple_2'] }),
      tuple_node: node('tuple_node', { docType: 'tuple', meta: ['tag_tuple_1'] }),
      tag_tuple_1: node('tag_tuple_1', { docType: 'tuple', children: [SYS_A.NODE_SUPERTAGS, 'tagDef_task'] }),
      tag_tuple_2: node('tag_tuple_2', { docType: 'tuple', children: [SYS_A.NODE_SUPERTAGS, 'tagDef_person'] }),
    };

    expect(resolveTaggedNodes(entities, 'tagDef_task')).toEqual(['content_1']);
    expect(resolveTaggedNodes(entities, 'tagDef_person')).toEqual(['content_2']);
  });

  it('maps labels and icons for field types', () => {
    expect(getFieldTypeLabel(SYS_D.INTEGER)).toBe('Number');
    expect(getFieldTypeLabel('unknown')).toBe('Plain');
    expect(isPlainFieldType(SYS_D.PLAIN)).toBe(true);
    expect(isPlainFieldType('')).toBe(true);
    expect(isPlainFieldType(SYS_D.DATE)).toBe(false);

    expect(getFieldTypeIcon(SYS_D.OPTIONS)).toBe(List);
    expect(getFieldTypeIcon(SYS_D.OPTIONS_FROM_SUPERTAG)).toBe(List);
    expect(getFieldTypeIcon('unknown')).toBe(AlignLeft);
  });
});

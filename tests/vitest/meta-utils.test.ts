import { describe, expect, test } from 'vitest';
import type { NodexNode } from '../../src/types/index.js';
import {
  getMetaTuples,
  findMetaTuple,
  addMetaTupleId,
  removeMetaTupleId,
} from '../../src/lib/meta-utils.js';

/** 最小化节点工厂 */
function node(
  id: string,
  opts?: {
    children?: string[];
    meta?: string[];
    docType?: string;
  },
): NodexNode {
  return {
    id,
    workspaceId: 'ws_test',
    props: {
      created: 0,
      _docType: opts?.docType as NodexNode['props']['_docType'],
    },
    children: opts?.children,
    meta: opts?.meta,
    version: 1,
    updatedAt: 0,
    createdBy: 'test',
    updatedBy: 'test',
  };
}

describe('getMetaTuples', () => {
  test('返回 meta 数组中对应的 tuple 节点', () => {
    const tagTuple = node('tuple_1', {
      docType: 'tuple',
      children: ['SYS_A13', 'tagDef_task'],
    });
    const cbTuple = node('tuple_2', {
      docType: 'tuple',
      children: ['SYS_A55', 'SYS_V03'],
    });
    const contentNode = node('n1', { meta: ['tuple_1', 'tuple_2'] });
    const entities: Record<string, NodexNode> = {
      n1: contentNode,
      tuple_1: tagTuple,
      tuple_2: cbTuple,
    };

    const result = getMetaTuples(contentNode, entities);
    expect(result).toEqual([tagTuple, cbTuple]);
  });

  test('跳过不存在的 tuple ID', () => {
    const tagTuple = node('tuple_1', {
      docType: 'tuple',
      children: ['SYS_A13', 'tagDef_task'],
    });
    const contentNode = node('n1', { meta: ['tuple_1', 'nonexistent'] });
    const entities: Record<string, NodexNode> = {
      n1: contentNode,
      tuple_1: tagTuple,
    };

    const result = getMetaTuples(contentNode, entities);
    expect(result).toEqual([tagTuple]);
  });

  test('空 meta 返回空数组', () => {
    const entities: Record<string, NodexNode> = {};

    expect(getMetaTuples(node('n1', { meta: [] }), entities)).toEqual([]);
    expect(getMetaTuples(node('n2'), entities)).toEqual([]);
  });
});

describe('findMetaTuple', () => {
  test('按 children[0] key 查找 meta tuple', () => {
    const tagTuple = node('tag_tuple', {
      docType: 'tuple',
      children: ['SYS_A13', 'tagDef_task'],
    });
    const cbTuple = node('cb_tuple', {
      docType: 'tuple',
      children: ['SYS_A55', 'SYS_V03'],
    });
    const contentNode = node('n1', { meta: ['tag_tuple', 'cb_tuple'] });
    const entities: Record<string, NodexNode> = {
      n1: contentNode,
      tag_tuple: tagTuple,
      cb_tuple: cbTuple,
    };

    expect(findMetaTuple(contentNode, 'SYS_A13', entities)).toBe(tagTuple);
    expect(findMetaTuple(contentNode, 'SYS_A55', entities)).toBe(cbTuple);
  });

  test('未找到返回 undefined', () => {
    const tagTuple = node('tag_tuple', {
      docType: 'tuple',
      children: ['SYS_A13', 'tagDef_task'],
    });
    const contentNode = node('n1', { meta: ['tag_tuple'] });
    const entities: Record<string, NodexNode> = {
      n1: contentNode,
      tag_tuple: tagTuple,
    };

    expect(findMetaTuple(contentNode, 'SYS_A99', entities)).toBeUndefined();
  });

  test('空 meta 返回 undefined', () => {
    expect(findMetaTuple(node('n1'), 'SYS_A13', {})).toBeUndefined();
  });
});

describe('addMetaTupleId', () => {
  test('追加新 tuple ID 到 meta', () => {
    expect(addMetaTupleId(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  test('已存在的 ID 不重复添加', () => {
    const original = ['a', 'b'];
    const result = addMetaTupleId(original, 'b');
    expect(result).toEqual(['a', 'b']);
    expect(result).toBe(original); // 返回原引用
  });

  test('undefined meta 创建新数组', () => {
    expect(addMetaTupleId(undefined, 'a')).toEqual(['a']);
  });

  test('空数组 meta 创建新数组', () => {
    expect(addMetaTupleId([], 'a')).toEqual(['a']);
  });
});

describe('removeMetaTupleId', () => {
  test('移除存在的 tuple ID', () => {
    expect(removeMetaTupleId(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  test('移除不存在的 ID 返回原数组', () => {
    const original = ['a', 'b'];
    const result = removeMetaTupleId(original, 'z');
    expect(result).toEqual(['a', 'b']);
    expect(result).toBe(original); // 返回原引用
  });

  test('undefined meta 返回空数组', () => {
    expect(removeMetaTupleId(undefined, 'a')).toEqual([]);
  });
});

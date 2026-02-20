/**
 * meta-utils: After Loro migration, meta Tuple indirection is eliminated.
 * getMetaTuples/findMetaTuple are stubs. addMetaTupleId/removeMetaTupleId
 * are kept for legacy array manipulation.
 */
import { describe, expect, test } from 'vitest';
import type { NodexNode } from '../../src/types/index.js';
import {
  getMetaTuples,
  findMetaTuple,
  addMetaTupleId,
  removeMetaTupleId,
} from '../../src/lib/meta-utils.js';

function makeNode(id: string): NodexNode {
  return { id, tags: [], children: [], createdAt: 0, updatedAt: 0 } as unknown as NodexNode;
}

describe('getMetaTuples', () => {
  test('返回空数组（Loro 迁移后 meta Tuple 已废弃）', () => {
    const node = makeNode('n1');
    const result = getMetaTuples(node, {});
    expect(result).toEqual([]);
  });
});

describe('findMetaTuple', () => {
  test('始终返回 undefined（Loro 迁移后 meta Tuple 已废弃）', () => {
    const node = makeNode('n1');
    expect(findMetaTuple(node, 'SYS_A13', {})).toBeUndefined();
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

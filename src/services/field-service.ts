/**
 * Nodex 字段服务 — Phase 1 Loro 迁移存根
 *
 * 字段操作已迁移到 LoroDoc（node-store.ts setFieldValue 等）。
 * 本文件保留旧接口以避免破坏导入链，但所有异步函数均为空操作。
 */
import type { NodexNode } from '../types/index.js';

export interface FieldValueEntry {
  fieldEntry: NodexNode;
  valueNodeIds: string[];
  valueNodes: NodexNode[];
}

export type FieldValueMap = Record<string, FieldValueEntry>;

export async function getFieldValues(_nodeId: string): Promise<FieldValueMap> {
  return {};
}

export async function getFieldValue(
  _nodeId: string,
  _fieldDefId: string,
): Promise<FieldValueEntry | null> {
  return null;
}

export async function getFieldDataType(
  _fieldDefId: string,
): Promise<string> {
  return 'plain';
}

export async function getFieldOptions(
  _fieldDefId: string,
): Promise<NodexNode[]> {
  return [];
}

export async function setFieldValue(
  _nodeId: string,
  _fieldDefId: string,
  _values: string[],
  _userId: string,
): Promise<void> {}

export async function setFieldTextValue(
  _nodeId: string,
  _fieldDefId: string,
  _text: string,
  _userId: string,
): Promise<void> {}

export async function clearFieldValue(
  _nodeId: string,
  _fieldDefId: string,
  _userId: string,
): Promise<void> {}

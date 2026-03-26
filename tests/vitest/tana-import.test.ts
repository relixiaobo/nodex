/**
 * Tana Import — transformTanaExport 核心转换测试
 */
import { describe, it, expect } from 'vitest';
import {
  transformTanaExport,
  importTanaExport,
  validateTanaExport,
  validateTransformResult,
} from '../../src/services/tana-import.js';
import type { TanaExportData, TanaDoc } from '../../src/services/tana-import.js';

// ── Helpers ──

const doc = (id: string, props: Partial<TanaDoc['props']> & { created?: number } = {}, extra: Partial<TanaDoc> = {}): TanaDoc => ({
  id,
  props: { created: 1000, ...props },
  ...extra,
});

const makeTanaExport = (docs: TanaDoc[] = []): TanaExportData => ({
  editors: [['test@example.com', 0]],
  lastTxid: 'tx_1',
  currentWorkspaceId: 'ws_test',
  docs,
  workspaces: {},
});

// ── transformTanaExport ──

describe('transformTanaExport', () => {
  it('transforms basic content node', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Hello', _ownerId: 'ws' }),
      // Need a node with _ownerId ending in _SCHEMA for ws detection
      doc('dummy_tagDef', { _docType: 'tagDef', name: 'x', _ownerId: 'ws_SCHEMA' }),
    ]);
    const result = transformTanaExport(data);
    const n1 = result.nodes.find(n => n.node.id === 'n1');
    expect(n1).toBeDefined();
    expect(n1!.node.name).toBe('Hello');
    expect(n1!.parentId).toBe('ROOT');
    expect(result.stats.contentNodes).toBeGreaterThanOrEqual(1);
  });

  it('detects workspace ID from _SCHEMA suffix', () => {
    const data = makeTanaExport([
      doc('myws', {}),
      doc('myws_SCHEMA', { _ownerId: 'myws' }),
      doc('tagDef1', { _docType: 'tagDef', name: 'test', _ownerId: 'myws_SCHEMA' }),
    ]);
    const result = transformTanaExport(data);
    // workspace root should be mapped to ROOT
    expect(result.nodes.every(n => n.parentId !== 'myws')).toBe(true);
  });

  it('extracts tags from metanode SYS_A13 tuple', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Tagged', _ownerId: 'ws', _metaNodeId: 'n1_META' }),
      doc('n1_META', { _docType: 'metanode', _ownerId: 'n1' }, {
        children: ['n1_META_tag'],
      }),
      doc('n1_META_tag', { _docType: 'tuple' }, {
        children: ['SYS_A13', 'eo4IGJg-uGYy'],  // card tag
      }),
      // The card tag ref node (needed for remap check)
      doc('eo4IGJg-uGYy', { _docType: 'tagDef', name: 'card', _ownerId: 'ws_SCHEMA' }),
    ]);
    const result = transformTanaExport(data);
    const n1 = result.nodes.find(n => n.node.id === 'n1');
    expect(n1).toBeDefined();
    expect(n1!.node.tags).toContain('eo4IGJg-uGYy');
  });

  it('remaps article tag to NDX_T01', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Article', _ownerId: 'ws', _metaNodeId: 'n1_META' }),
      doc('n1_META', { _docType: 'metanode', _ownerId: 'n1' }, {
        children: ['n1_META_tag'],
      }),
      doc('n1_META_tag', { _docType: 'tuple' }, {
        children: ['SYS_A13', 'Y5LItkZPjavg'],  // article → NDX_T01
      }),
    ]);
    const result = transformTanaExport(data);
    const n1 = result.nodes.find(n => n.node.id === 'n1');
    expect(n1!.node.tags).toContain('NDX_T01');
  });

  it('discards book/podcast/person tags', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Book node', _ownerId: 'ws', _metaNodeId: 'n1_META' }),
      doc('n1_META', { _docType: 'metanode', _ownerId: 'n1' }, {
        children: ['n1_META_tag'],
      }),
      doc('n1_META_tag', { _docType: 'tuple' }, {
        children: ['SYS_A13', 'KDgcfPtcXCcA'],  // book → discard
      }),
    ]);
    const result = transformTanaExport(data);
    const n1 = result.nodes.find(n => n.node.id === 'n1');
    expect(n1!.node.tags).toEqual([]);
  });

  it('converts tuple field instance to fieldEntry', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'With field', _ownerId: 'ws' }, {
        children: ['fe_tuple'],
      }),
      doc('fe_tuple', { _docType: 'tuple', _ownerId: 'n1' }, {
        children: ['SYS_A78', 'val_1'],  // URL field → NDX_F01
      }),
      doc('SYS_A78', { name: 'URL' }),
      doc('val_1', { name: 'https://example.com', _ownerId: 'fe_tuple' }),
    ]);
    const result = transformTanaExport(data);
    const fe = result.nodes.find(n => n.node.type === 'fieldEntry');
    expect(fe).toBeDefined();
    expect(fe!.node.fieldDefId).toBe('NDX_F01');
    expect(fe!.node.children).toContain('val_1');
  });

  it('creates user tagDef with fieldDef children', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      // task tagDef
      doc('jDc2ISPtN3v3', { _docType: 'tagDef', name: 'task', _ownerId: 'ws_SCHEMA', _metaNodeId: 'task_META' }, {
        children: ['task_tpl_status'],
      }),
      doc('task_META', { _docType: 'metanode', _ownerId: 'jDc2ISPtN3v3' }, {
        children: ['task_META_chk'],
      }),
      doc('task_META_chk', { _docType: 'tuple' }, {
        children: ['SYS_A55', 'SYS_V03'],  // showCheckbox = Yes
      }),
      // template field: Status
      doc('task_tpl_status', { _docType: 'tuple', _ownerId: 'jDc2ISPtN3v3' }, {
        children: ['FcH-bv_pHVIt', 'default_val'],
      }),
      doc('FcH-bv_pHVIt', { _docType: 'attrDef', name: 'Status', _ownerId: 'task_tpl_status' }),
      doc('default_val', { name: 'Backlog' }),
    ]);
    const result = transformTanaExport(data);

    const taskTag = result.nodes.find(n => n.node.id === 'jDc2ISPtN3v3');
    expect(taskTag).toBeDefined();
    expect(taskTag!.node.type).toBe('tagDef');
    expect(taskTag!.node.showCheckbox).toBe(true);
    expect(taskTag!.node.children).toContain('FcH-bv_pHVIt');
    expect(taskTag!.parentId).toBe('SCHEMA');

    const statusField = result.nodes.find(n => n.node.id === 'FcH-bv_pHVIt');
    expect(statusField).toBeDefined();
    expect(statusField!.node.type).toBe('fieldDef');
    expect(statusField!.node.name).toBe('Status');
  });

  it('skips discarded tagDefs (book, podcast, person)', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('KDgcfPtcXCcA', { _docType: 'tagDef', name: 'book', _ownerId: 'ws_SCHEMA' }),
    ]);
    const result = transformTanaExport(data);
    expect(result.nodes.find(n => n.node.id === 'KDgcfPtcXCcA')).toBeUndefined();
  });

  it('skips trash nodes', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('trashed', { name: 'Deleted', _ownerId: 'ws_TRASH' }),
    ]);
    const result = transformTanaExport(data);
    expect(result.nodes.find(n => n.node.id === 'trashed')).toBeUndefined();
  });

  it('preserves completedAt from _done', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Done task', _ownerId: 'ws', _done: 1769594835949 }),
    ]);
    const result = transformTanaExport(data);
    const n1 = result.nodes.find(n => n.node.id === 'n1');
    expect(n1!.node.completedAt).toBe(1769594835949);
  });

  it('maps codeblock to codeBlock type', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('cb1', { name: 'const x = 1', _ownerId: 'ws', _docType: 'codeblock' }),
    ]);
    const result = transformTanaExport(data);
    const cb = result.nodes.find(n => n.node.id === 'cb1');
    expect(cb!.node.type).toBe('codeBlock');
  });

  it('skips metanode and associatedData from output', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('meta1', { _docType: 'metanode', _ownerId: 'n1' }),
      doc('assoc1', { _docType: 'associatedData', _ownerId: 'meta1' }),
    ]);
    const result = transformTanaExport(data);
    expect(result.nodes.find(n => n.node.id === 'meta1')).toBeUndefined();
    expect(result.nodes.find(n => n.node.id === 'assoc1')).toBeUndefined();
  });
});

// ── validateTransformResult ──

describe('validateTransformResult', () => {
  it('detects missing parent', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Hello', _ownerId: 'ws' }),
      doc('dummy_tagDef', { _docType: 'tagDef', name: 'x', _ownerId: 'ws_SCHEMA' }),
    ]);
    const result = transformTanaExport(data);
    // Manually inject a bad parentId to test validation
    result.nodes.push({
      node: { id: 'bad', name: 'Bad', children: [], tags: [], createdAt: 1, updatedAt: 1 },
      parentId: 'nonexistent',
    });
    const issues = validateTransformResult(result);
    expect(issues.some(i => i.type === 'missing_parent' && i.refId === 'nonexistent')).toBe(true);
  });

  it('returns empty for valid result', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Hello', _ownerId: 'ws' }),
      doc('dummy_tagDef', { _docType: 'tagDef', name: 'x', _ownerId: 'ws_SCHEMA' }),
    ]);
    const result = transformTanaExport(data);
    const issues = validateTransformResult(result);
    expect(issues).toEqual([]);
  });

  it('accepts system IDs as valid targets', () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Tagged', _ownerId: 'ws', _metaNodeId: 'n1_META' }),
      doc('n1_META', { _docType: 'metanode', _ownerId: 'n1' }, { children: ['n1_t'] }),
      doc('n1_t', { _docType: 'tuple' }, { children: ['SYS_A13', 'NDX_T01'] }),
      doc('dummy_tagDef', { _docType: 'tagDef', name: 'x', _ownerId: 'ws_SCHEMA' }),
    ]);
    const result = transformTanaExport(data);
    const issues = validateTransformResult(result, { tagIds: new Set(['NDX_T01']) });
    expect(issues.filter(i => i.type === 'missing_tag')).toEqual([]);
  });
});

// ── Legacy API compat ──

describe('importTanaExport — legacy API', () => {
  it('returns importedNodes from transform result', async () => {
    const data = makeTanaExport([
      doc('ws_SCHEMA', { _ownerId: 'ws' }),
      doc('ws', {}),
      doc('n1', { name: 'Hello', _ownerId: 'ws' }),
    ]);
    const result = await importTanaExport(data, 'user_1');
    expect(result.totalDocs).toBe(3);
    expect(result.importedNodes).toBeGreaterThan(0);
  });
});

describe('validateTanaExport — returns totalDocs', () => {
  it('returns totalDocs from data', () => {
    const data = makeTanaExport([
      doc('n1', { created: 1000 }),
      doc('n2', { created: 1000 }),
    ]);
    const result = validateTanaExport(data);
    expect(result.totalDocs).toBe(2);
  });
});

/**
 * Tana Import — Phase 1 stub contract.
 * importTanaExport is a stub that returns importedNodes: 0.
 * validateTanaExport returns empty ref lists (validation is also a stub in Phase 1).
 */
import { describe, it, expect } from 'vitest';
import { importTanaExport, validateTanaExport } from '../../src/services/tana-import.js';
import type { TanaExportData } from '../../src/services/tana-import.js';

const makeTanaExport = (docs: TanaExportData['docs'] = []): TanaExportData => ({
  editors: [['test@example.com', 0]],
  lastTxid: 'tx_1',
  currentWorkspaceId: 'ws_test',
  docs,
  workspaces: {},
});

describe('importTanaExport — Phase 1 stub contract', () => {
  it('returns importedNodes: 0 (stub)', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 }, children: ['n1'] },
      { id: 'n1', props: { created: 1000, _ownerId: 'ws_test' } },
    ]);
    const result = await importTanaExport(data, 'user_1');
    expect(result.importedNodes).toBe(0);
  });

  it('returns totalDocs = docs.length', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 } },
      { id: 'n1', props: { created: 1000 } },
      { id: 'n2', props: { created: 1000 } },
    ]);
    const result = await importTanaExport(data, 'user_1');
    expect(result.totalDocs).toBe(3);
  });

  it('returns skippedNodes = totalDocs (all skipped in stub)', async () => {
    const data = makeTanaExport([
      { id: 'ws_test', props: { created: 1000 } },
      { id: 'n1', props: { created: 1000 } },
    ]);
    const result = await importTanaExport(data, 'user_1');
    expect(result.skippedNodes).toBe(result.totalDocs);
  });

  it('returns workspaceId from data.currentWorkspaceId', async () => {
    const data = makeTanaExport();
    const result = await importTanaExport(data, 'user_1');
    expect(result.workspaceId).toBe('ws_test');
  });

  it('returns empty errors array', async () => {
    const data = makeTanaExport([{ id: 'n1', props: { created: 1000 } }]);
    const result = await importTanaExport(data, 'user_1');
    expect(result.errors).toEqual([]);
  });

  it('handles empty docs array', async () => {
    const data = makeTanaExport([]);
    const result = await importTanaExport(data, 'user_1');
    expect(result.totalDocs).toBe(0);
    expect(result.importedNodes).toBe(0);
  });
});

describe('validateTanaExport — Phase 1 stub returns empty ref lists', () => {
  it('returns empty missing ref arrays regardless of data', () => {
    const data: TanaExportData = {
      editors: [],
      lastTxid: 'tx_1',
      currentWorkspaceId: 'ws_test',
      docs: [
        {
          id: 'node_1',
          props: { created: 1000, _ownerId: 'missing_parent', _metaNodeId: 'missing_meta' },
          children: ['missing_child'],
          associationMap: { missing_key: 'missing_val' },
        },
      ],
      workspaces: {},
    };
    const result = validateTanaExport(data);
    expect(result.missingChildRefs).toEqual([]);
    expect(result.missingOwnerRefs).toEqual([]);
    expect(result.missingMetaNodeRefs).toEqual([]);
    expect(result.missingAssociationRefs).toEqual([]);
  });

  it('returns totalDocs from data.docs.length', () => {
    const data = makeTanaExport([
      { id: 'n1', props: { created: 1000 } },
      { id: 'n2', props: { created: 1000 } },
    ]);
    const result = validateTanaExport(data);
    expect(result.totalDocs).toBe(2);
  });
});

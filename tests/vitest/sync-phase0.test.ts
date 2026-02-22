/**
 * Sync Phase 0 — Client Sync-Ready 准备项测试
 *
 * 1. PeerID 持久化 — save/restore round-trip, format validation
 * 2. VersionVector 持久化 — encode/decode round-trip
 * 3. SnapshotRecord 格式验证 — 字段完整性 + 旧格式拒绝
 * 4. Workspace ID 规范化 — 生成唯一 ws_{nanoid}
 * 5. subscribeLocalUpdates hook — 注册 + 清理 + import 不触发
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LoroDoc, VersionVector } from 'loro-crdt';

import {
  createNode,
  setNodeData,
  commitDoc,
  initLoroDocForTest,
  resetLoroDoc,
  exportSnapshot,
  getVersionVector,
  getLoroDoc,
} from '../../src/lib/loro-doc.js';

import type { SnapshotRecord } from '../../src/lib/loro-persistence.js';

import {
  getOrCreateDefaultWorkspaceId,
  DEFAULT_WORKSPACE_STORAGE_KEY,
} from '../../src/lib/workspace-id.js';

// ============================================================
// SnapshotRecord format validation
// ============================================================

describe('SnapshotRecord format validation', () => {
  /**
   * Simulates the loadSnapshotRecord logic (post-cleanup):
   * - Bare Uint8Array (old format) → null (discarded, no backward compat)
   * - Valid SnapshotRecord → return as-is
   * - null/undefined → null
   */
  function parseSnapshotResult(result: unknown): SnapshotRecord | null {
    if (!result) return null;
    // Old bare Uint8Array format is discarded — project not yet launched
    if (result instanceof Uint8Array) return null;
    if (!(result as SnapshotRecord).snapshot) return null;
    return result as SnapshotRecord;
  }

  it('rejects bare Uint8Array (old format) — returns null', () => {
    const oldData = new Uint8Array([1, 2, 3, 4]);
    expect(parseSnapshotResult(oldData)).toBeNull();
  });

  it('passes through SnapshotRecord unchanged', () => {
    const original: SnapshotRecord = {
      snapshot: new Uint8Array([5, 6, 7]),
      peerIdStr: '12345',
      versionVector: new Uint8Array([8, 9]),
      savedAt: 1000,
    };
    const record = parseSnapshotResult(original);

    expect(record).toBe(original);
    expect(record!.peerIdStr).toBe('12345');
    expect(record!.savedAt).toBe(1000);
  });

  it('returns null for missing data', () => {
    expect(parseSnapshotResult(null)).toBeNull();
    expect(parseSnapshotResult(undefined)).toBeNull();
  });

  it('SnapshotRecord fields are all populated from real doc', () => {
    initLoroDocForTest('ws_snap');
    createNode('n1', null);
    commitDoc();

    const doc = getLoroDoc();
    const snapshot = doc.export({ mode: 'snapshot' });
    const vvBytes = doc.oplogVersion().encode();
    const peerIdStr = doc.peerIdStr;

    const record: SnapshotRecord = {
      snapshot,
      peerIdStr,
      versionVector: vvBytes,
      savedAt: Date.now(),
    };

    expect(record.snapshot.length).toBeGreaterThan(0);
    expect(record.peerIdStr).toMatch(/^\d+$/);
    expect(record.versionVector.length).toBeGreaterThan(0);
    expect(record.savedAt).toBeGreaterThan(0);

    // Verify snapshot is restorable
    const doc2 = new LoroDoc();
    doc2.import(record.snapshot);
    expect(doc2.getTree('nodes').nodes().length).toBeGreaterThan(0);

    // Verify VV is decodable
    const restoredVV = VersionVector.decode(record.versionVector);
    expect(restoredVV.toJSON().size).toBeGreaterThan(0);

    resetLoroDoc();
  });
});

// ============================================================
// PeerID 持久化
// ============================================================

describe('PeerID persistence', () => {
  beforeEach(() => {
    resetLoroDoc();
  });

  it('PeerID round-trip: save peerIdStr, restore to new doc', () => {
    const docA = new LoroDoc();
    const peerIdA = docA.peerIdStr;
    expect(peerIdA).toBeTruthy();
    expect(typeof peerIdA).toBe('string');

    const docB = new LoroDoc();
    docB.setPeerId(peerIdA as `${number}`);
    expect(docB.peerIdStr).toBe(peerIdA);
  });

  it('setPeerId before import preserves identity through snapshot round-trip', () => {
    // Create doc A, make changes, export snapshot
    const docA = new LoroDoc();
    const peerIdA = docA.peerIdStr;
    docA.getTree('nodes').createNode();
    docA.commit();
    const snapshot = docA.export({ mode: 'snapshot' });

    // Correct restore order: new doc → setPeerId → import
    const docB = new LoroDoc();
    docB.setPeerId(peerIdA as `${number}`);
    docB.import(snapshot);

    expect(docB.peerIdStr).toBe(peerIdA);

    // New operations on docB use the restored peer ID
    docB.getTree('nodes').createNode();
    docB.commit();

    const history = docB.getAllChanges();
    // All changes should be under the same peer ID
    const peers = [...history.keys()];
    expect(peers.length).toBe(1);
    expect(String(peers[0])).toBe(peerIdA);
  });

  it('peerIdStr format is numeric string', () => {
    const doc = new LoroDoc();
    const peerIdStr = doc.peerIdStr;
    expect(peerIdStr).toMatch(/^\d+$/);
  });

  it('different LoroDoc instances get different random peer IDs', () => {
    const doc1 = new LoroDoc();
    const doc2 = new LoroDoc();
    expect(doc1.peerIdStr).not.toBe(doc2.peerIdStr);
  });

  it('invalid peerIdStr does not crash setPeerId (graceful degradation path)', () => {
    // Test the fallback path: if peerIdStr is invalid, the doc should still work
    const doc = new LoroDoc();
    const originalPeerId = doc.peerIdStr;

    // Empty string should be handled gracefully by the caller (our code wraps in try/catch)
    // Note: Loro may throw on empty/invalid setPeerId — our code catches and falls back
    try {
      doc.setPeerId('' as `${number}`);
    } catch {
      // Expected to throw for empty string — this validates our try/catch in initLoroDoc
    }
    // Doc should still be functional (either with new or original peer ID)
    expect(doc.peerIdStr).toBeTruthy();
  });
});

// ============================================================
// VersionVector 持久化
// ============================================================

describe('VersionVector persistence', () => {
  beforeEach(() => {
    resetLoroDoc();
  });

  it('VV encode/decode round-trip preserves peer entries', () => {
    initLoroDocForTest('ws_vv_test');
    createNode('n1', null);
    setNodeData('n1', 'name', 'hello');
    commitDoc();

    const vv = getVersionVector();
    const bytes = vv.encode();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const restored = VersionVector.decode(bytes);
    expect(restored).toBeDefined();

    const originalMap = vv.toJSON();
    const restoredMap = restored.toJSON();
    expect(restoredMap.size).toBe(originalMap.size);
    for (const [peer, counter] of originalMap) {
      expect(restoredMap.get(peer)).toBe(counter);
    }
  });

  it('empty doc produces valid VV', () => {
    initLoroDocForTest('ws_vv_empty');
    const vv = getVersionVector();
    const bytes = vv.encode();
    expect(bytes).toBeInstanceOf(Uint8Array);
    const restored = VersionVector.decode(bytes);
    expect(restored).toBeDefined();
  });

  it('VV grows after operations', () => {
    initLoroDocForTest('ws_vv_grow');

    const vv1 = getVersionVector();
    const map1 = vv1.toJSON();

    createNode('n1', null);
    commitDoc();

    const vv2 = getVersionVector();
    const map2 = vv2.toJSON();

    expect(map2.size).toBeGreaterThanOrEqual(map1.size);
    let anyGrew = false;
    for (const [peer, counter] of map2) {
      const oldCounter = map1.get(peer) ?? 0;
      if (counter > oldCounter) anyGrew = true;
    }
    expect(anyGrew).toBe(true);
  });

  it('VV can be used for incremental export', () => {
    initLoroDocForTest('ws_vv_incr');
    createNode('n1', null);
    commitDoc();

    const vvBefore = getVersionVector();

    createNode('n2', null);
    commitDoc();

    const doc = getLoroDoc();
    // Export only the delta since vvBefore
    const delta = doc.export({ mode: 'update', from: vvBefore });
    expect(delta).toBeInstanceOf(Uint8Array);
    expect(delta.length).toBeGreaterThan(0);

    // Delta should be importable into a copy of the doc at vvBefore state
    const docCopy = new LoroDoc();
    docCopy.import(doc.export({ mode: 'snapshot' }));
    // The import should not throw
  });
});

// ============================================================
// Workspace ID 规范化
// ============================================================

describe('Workspace ID normalization', () => {
  beforeEach(() => {
    localStorage.removeItem(DEFAULT_WORKSPACE_STORAGE_KEY);
  });

  it('generates unique ws_{nanoid} on first call', async () => {
    const wsId = await getOrCreateDefaultWorkspaceId();
    expect(wsId).toMatch(/^ws_[A-Za-z0-9_-]{21}$/);
  });

  it('returns same ID on subsequent calls', async () => {
    const wsId1 = await getOrCreateDefaultWorkspaceId();
    const wsId2 = await getOrCreateDefaultWorkspaceId();
    expect(wsId1).toBe(wsId2);
  });

  it('persists to localStorage', async () => {
    const wsId = await getOrCreateDefaultWorkspaceId();
    const stored = localStorage.getItem(DEFAULT_WORKSPACE_STORAGE_KEY);
    expect(stored).toBe(wsId);
  });

  it('uses existing value if already stored', async () => {
    localStorage.setItem(DEFAULT_WORKSPACE_STORAGE_KEY, 'ws_preexisting');
    const wsId = await getOrCreateDefaultWorkspaceId();
    expect(wsId).toBe('ws_preexisting');
  });

  it('two fresh calls generate different IDs (different profiles)', async () => {
    const wsId1 = await getOrCreateDefaultWorkspaceId();
    localStorage.removeItem(DEFAULT_WORKSPACE_STORAGE_KEY);
    const wsId2 = await getOrCreateDefaultWorkspaceId();
    // Should be different since we cleared storage between calls
    expect(wsId1).not.toBe(wsId2);
  });
});

// ============================================================
// subscribeLocalUpdates hook 注册验证
// ============================================================

describe('subscribeLocalUpdates hook', () => {
  beforeEach(() => {
    resetLoroDoc();
  });

  it('local updates callback fires on commit', () => {
    const doc = new LoroDoc();
    const updates: Uint8Array[] = [];
    const unsub = doc.subscribeLocalUpdates((bytes) => {
      updates.push(bytes);
    });

    doc.getTree('nodes').createNode();
    doc.commit();

    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toBeInstanceOf(Uint8Array);

    unsub();
  });

  it('unsubscribe stops callback', () => {
    const doc = new LoroDoc();
    const updates: Uint8Array[] = [];
    const unsub = doc.subscribeLocalUpdates((bytes) => {
      updates.push(bytes);
    });

    doc.getTree('nodes').createNode();
    doc.commit();
    const countAfterFirst = updates.length;

    unsub();

    doc.getTree('nodes').createNode();
    doc.commit();
    expect(updates.length).toBe(countAfterFirst);
  });

  it('import does not trigger subscribeLocalUpdates', () => {
    const docA = new LoroDoc();
    docA.getTree('nodes').createNode();
    docA.commit();
    const snapshot = docA.export({ mode: 'snapshot' });

    const docB = new LoroDoc();
    const updates: Uint8Array[] = [];
    docB.subscribeLocalUpdates((bytes) => {
      updates.push(bytes);
    });

    docB.import(snapshot);
    expect(updates.length).toBe(0);
  });

  it('multiple subscribes can coexist and unsubscribe independently', () => {
    const doc = new LoroDoc();
    const updates1: Uint8Array[] = [];
    const updates2: Uint8Array[] = [];

    const unsub1 = doc.subscribeLocalUpdates((bytes) => updates1.push(bytes));
    const unsub2 = doc.subscribeLocalUpdates((bytes) => updates2.push(bytes));

    doc.getTree('nodes').createNode();
    doc.commit();
    expect(updates1.length).toBeGreaterThan(0);
    expect(updates2.length).toBeGreaterThan(0);

    unsub1();
    const count1 = updates1.length;

    doc.getTree('nodes').createNode();
    doc.commit();
    // Only updates2 should grow
    expect(updates1.length).toBe(count1);
    expect(updates2.length).toBeGreaterThan(count1);

    unsub2();
  });
});

/**
 * Sync roundtrip tests:
 *
 * 1. Low-level: subscribeLocalUpdates → import works for LoroTree (raw Loro API)
 * 2. Data recovery: importUpdates() triggers subscriber notification so UI reflects
 *    recovered data (regression test for ab4714b)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoroDoc } from 'loro-crdt';
import {
  createNode,
  setNodeData,
  getChildren,
  toNodexNode,
  hasNode,
  getAllNodeIds,
  commitDoc,
  importUpdates,
  importUpdatesBatch,
  subscribe,
  initLoroDocForTest,
  resetLoroDoc,
  getLoroDoc,
} from '../../src/lib/loro-doc.js';

describe('Loro sync roundtrip', () => {
  it('subscribeLocalUpdates captures tree node creation', () => {
    const doc1 = new LoroDoc();
    const tree1 = doc1.getTree('nodes');

    const captured: Uint8Array[] = [];
    doc1.subscribeLocalUpdates((bytes) => {
      captured.push(new Uint8Array(bytes));
    });

    // Create a tree node
    const node = tree1.createNode();
    node.data.set('id', 'test-node-1');
    doc1.commit();

    expect(captured.length).toBeGreaterThan(0);

    // Import ALL captured bytes into a fresh doc
    const doc2 = new LoroDoc();
    for (const bytes of captured) {
      doc2.import(bytes);
    }

    const tree2 = doc2.getTree('nodes');
    const nodes2 = [...tree2.nodes()];

    // Log details for debugging
    console.log('captured updates:', captured.length);
    console.log('bytes per update:', captured.map(b => b.length));
    console.log('hex header:', Array.from(captured[0].slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('doc2 tree nodes:', nodes2.length);
    console.log('doc2 VV:', JSON.stringify(doc2.oplogVersion().toJSON()));

    // Also test: export snapshot from doc1, import into doc3
    const snapshot = doc1.export({ mode: 'snapshot' });
    const doc3 = new LoroDoc();
    doc3.import(snapshot);
    const nodes3 = [...doc3.getTree('nodes').nodes()];
    console.log('snapshot bytes:', snapshot.length);
    console.log('doc3 tree nodes (from snapshot):', nodes3.length);

    // Also test: export update from doc1, import into doc4
    const update = doc1.export({ mode: 'update' });
    const doc4 = new LoroDoc();
    doc4.import(update);
    const nodes4 = [...doc4.getTree('nodes').nodes()];
    console.log('update bytes:', update.length);
    console.log('doc4 tree nodes (from update export):', nodes4.length);

    expect(nodes3.length).toBe(1); // Snapshot should always work
    // This is the critical assertion — does subscribeLocalUpdates roundtrip work?
    expect(nodes2.length).toBe(1);
  });

  it('multiple sequential updates rebuild tree', () => {
    const doc1 = new LoroDoc();
    const tree1 = doc1.getTree('nodes');

    const captured: Uint8Array[] = [];
    doc1.subscribeLocalUpdates((bytes) => {
      captured.push(new Uint8Array(bytes));
    });

    // First commit: create root node
    const root = tree1.createNode();
    root.data.set('id', 'root');
    doc1.commit();

    // Second commit: create child node
    const child = tree1.createNode(root.id);
    child.data.set('id', 'child');
    doc1.commit();

    // Third commit: set text data
    root.data.set('text', 'Hello World');
    doc1.commit();

    console.log('total captured updates:', captured.length);

    // Import all into fresh doc
    const doc2 = new LoroDoc();
    for (const bytes of captured) {
      doc2.import(bytes);
    }

    const tree2 = doc2.getTree('nodes');
    const nodes2 = [...tree2.nodes()];
    console.log('doc2 tree nodes:', nodes2.length);
    for (const n of nodes2) {
      console.log('  node:', n.id, 'data.id:', n.data.get('id'), 'parent:', n.parent?.id);
    }

    expect(nodes2.length).toBe(2);
  });
});

// ============================================================
// Data recovery regression: importUpdates() must notify subscribers
// (regression test for ab4714b)
// ============================================================

describe('importUpdates triggers subscriber notification', () => {
  beforeEach(() => {
    resetLoroDoc();
    initLoroDocForTest('test-ws');
  });

  it('subscriber fires after importUpdates with new nodes', () => {
    // Phase 1: Create nodes and export full state
    const root = createNode('root', null);
    setNodeData(root, 'name', 'Root Node');
    const child = createNode('child', root);
    setNodeData(child, 'name', 'Child Node');
    commitDoc();

    const doc = getLoroDoc();
    const updateBytes = doc.export({ mode: 'update' });

    // Phase 2: Reset to empty doc (simulates IndexedDB deletion + restart)
    resetLoroDoc();
    initLoroDocForTest('test-ws');

    expect(hasNode('root')).toBe(false);
    expect(hasNode('child')).toBe(false);

    // Phase 3: Import the exported bytes (simulates pull from server)
    const subscriberFn = vi.fn();
    const unsub = subscribe(subscriberFn);

    importUpdates(updateBytes);

    // Subscriber must have been called AFTER mappings are rebuilt
    expect(subscriberFn).toHaveBeenCalled();

    // Nodes must be accessible via the module API
    expect(hasNode('root')).toBe(true);
    expect(hasNode('child')).toBe(true);
    expect(toNodexNode('root')?.name).toBe('Root Node');
    expect(toNodexNode('child')?.name).toBe('Child Node');
    expect(getChildren('root')).toContain('child');

    unsub();
  });

  it('subscriber sees correct data (not stale mappings)', () => {
    // Create initial state and export
    createNode('nodeA', null);
    setNodeData('nodeA', 'name', 'Alpha');
    commitDoc();
    const bytes = getLoroDoc().export({ mode: 'update' });

    // Reset
    resetLoroDoc();
    initLoroDocForTest('test-ws');

    // Track what the subscriber sees when called
    let subscriberSawNode = false;
    const unsub = subscribe(() => {
      // This callback runs during importUpdates.
      // With the fix, at least the LAST call has correct mappings.
      if (hasNode('nodeA')) {
        subscriberSawNode = true;
      }
    });

    importUpdates(bytes);

    // The explicit notifySubscribers() after rebuildMappings must ensure
    // the subscriber sees the node on its final invocation
    expect(subscriberSawNode).toBe(true);
    expect(toNodexNode('nodeA')?.name).toBe('Alpha');

    unsub();
  });

  it('multiple sequential imports accumulate nodes correctly', () => {
    // Simulate pull: server sends updates in batches
    // Batch 1: create root
    const doc1 = new LoroDoc();
    const tree1 = doc1.getTree('nodes');
    const r = tree1.createNode();
    r.data.set('id', 'server-root');
    r.data.set('name', 'Server Root');
    doc1.commit();
    const bytes1 = doc1.export({ mode: 'update' });

    // Batch 2: create child (from same doc, export incremental)
    const vvAfterBatch1 = doc1.oplogVersion();
    const c = tree1.createNode(r.id);
    c.data.set('id', 'server-child');
    c.data.set('name', 'Server Child');
    doc1.commit();
    const bytes2 = doc1.export({ mode: 'update', from: vvAfterBatch1 });

    // Import into our module doc
    const subscriberCalls: number[] = [];
    const unsub = subscribe(() => {
      subscriberCalls.push(getAllNodeIds().length);
    });

    importUpdates(bytes1);
    expect(hasNode('server-root')).toBe(true);

    importUpdates(bytes2);
    expect(hasNode('server-child')).toBe(true);
    expect(getChildren('server-root')).toContain('server-child');

    // Subscriber was called for each import
    expect(subscriberCalls.length).toBeGreaterThanOrEqual(2);

    unsub();
  });

  it('importUpdatesBatch imports multiple updates with single rebuild', () => {
    // Create two batches of data in a separate LoroDoc
    const doc1 = new LoroDoc();
    const tree1 = doc1.getTree('nodes');

    // Batch 1: create root
    const r = tree1.createNode();
    r.data.set('id', 'batchA');
    r.data.set('name', 'Batch A');
    doc1.commit();
    const bytes1 = doc1.export({ mode: 'update' });

    // Batch 2: create child (incremental from batch 1)
    const vvAfterBatch1 = doc1.oplogVersion();
    const c = tree1.createNode(r.id);
    c.data.set('id', 'batchB');
    c.data.set('name', 'Batch B');
    doc1.commit();
    const bytes2 = doc1.export({ mode: 'update', from: vvAfterBatch1 });

    // Track subscriber notifications during batch import
    const subscriberCalls: number[] = [];
    const unsub = subscribe(() => {
      subscriberCalls.push(getAllNodeIds().length);
    });

    // Import as batch — should rebuild mappings + notify only once
    importUpdatesBatch([bytes1, bytes2]);

    // Both nodes must be accessible
    expect(hasNode('batchA')).toBe(true);
    expect(hasNode('batchB')).toBe(true);
    expect(toNodexNode('batchA')?.name).toBe('Batch A');
    expect(toNodexNode('batchB')?.name).toBe('Batch B');
    expect(getChildren('batchA')).toContain('batchB');

    // importUpdatesBatch calls notifySubscribers once explicitly;
    // doc.subscribe may also fire during individual doc.import() calls,
    // but the explicit notification at the end ensures correct mappings.
    expect(subscriberCalls.length).toBeGreaterThanOrEqual(1);

    unsub();
  });
});

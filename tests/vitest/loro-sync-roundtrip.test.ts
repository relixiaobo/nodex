/**
 * Minimal reproduction: does subscribeLocalUpdates → import work for LoroTree?
 *
 * This test verifies that bytes from subscribeLocalUpdates can reconstruct
 * tree nodes when imported into a fresh LoroDoc.
 */
import { describe, it, expect } from 'vitest';
import { LoroDoc } from 'loro-crdt';

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

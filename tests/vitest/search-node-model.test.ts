import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import type { QueryOp } from '../../src/types/node.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('Search Node data model (Step 0)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('persists queryCondition node with queryLogic (group)', () => {
    const id = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
    loroDoc.setNodeDataBatch(id, {
      type: 'queryCondition',
      queryLogic: 'AND',
    });
    loroDoc.commitDoc('__seed__');

    const node = loroDoc.toNodexNode(id);
    expect(node).not.toBeNull();
    expect(node!.type).toBe('queryCondition');
    expect(node!.queryLogic).toBe('AND');
    expect(node!.queryOp).toBeUndefined();
  });

  it('persists queryCondition node with queryOp (leaf)', () => {
    const id = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
    loroDoc.setNodeDataBatch(id, {
      type: 'queryCondition',
      queryOp: 'HAS_TAG' satisfies QueryOp,
      queryTagDefId: 'tagDef_task',
    });
    loroDoc.commitDoc('__seed__');

    const node = loroDoc.toNodexNode(id);
    expect(node!.type).toBe('queryCondition');
    expect(node!.queryOp).toBe('HAS_TAG');
    expect(node!.queryTagDefId).toBe('tagDef_task');
    expect(node!.queryLogic).toBeUndefined();
  });

  it('persists queryFieldDefId for field conditions', () => {
    const id = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
    loroDoc.setNodeDataBatch(id, {
      type: 'queryCondition',
      queryOp: 'FIELD_IS' satisfies QueryOp,
      queryFieldDefId: 'fieldDef_priority',
    });
    loroDoc.commitDoc('__seed__');

    const node = loroDoc.toNodexNode(id);
    expect(node!.queryOp).toBe('FIELD_IS');
    expect(node!.queryFieldDefId).toBe('fieldDef_priority');
  });

  it('persists lastRefreshedAt on search node', () => {
    const id = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
    const ts = Date.now();
    loroDoc.setNodeDataBatch(id, {
      type: 'search',
      name: 'My search',
      lastRefreshedAt: ts,
    });
    loroDoc.commitDoc('__seed__');

    const node = loroDoc.toNodexNode(id);
    expect(node!.type).toBe('search');
    expect(node!.lastRefreshedAt).toBe(ts);
  });

  it('supports condition tree structure (AND group with leaf children)', () => {
    // Create search node
    const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
    loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Tasks' });

    // Create AND group as child
    const andGroupId = loroDoc.createNode(undefined, searchId);
    loroDoc.setNodeDataBatch(andGroupId, {
      type: 'queryCondition',
      queryLogic: 'AND',
    });

    // Create leaf conditions as children of AND group
    const tagCondId = loroDoc.createNode(undefined, andGroupId);
    loroDoc.setNodeDataBatch(tagCondId, {
      type: 'queryCondition',
      queryOp: 'HAS_TAG' satisfies QueryOp,
      queryTagDefId: 'tagDef_task',
    });

    const doneCondId = loroDoc.createNode(undefined, andGroupId);
    loroDoc.setNodeDataBatch(doneCondId, {
      type: 'queryCondition',
      queryOp: 'NOT_DONE' satisfies QueryOp,
    });

    loroDoc.commitDoc('__seed__');

    // Verify tree structure
    const search = loroDoc.toNodexNode(searchId);
    expect(search!.children).toContain(andGroupId);

    const andGroup = loroDoc.toNodexNode(andGroupId);
    expect(andGroup!.queryLogic).toBe('AND');
    expect(andGroup!.children).toEqual([tagCondId, doneCondId]);

    const tagCond = loroDoc.toNodexNode(tagCondId);
    expect(tagCond!.queryOp).toBe('HAS_TAG');
    expect(tagCond!.queryTagDefId).toBe('tagDef_task');

    const doneCond = loroDoc.toNodexNode(doneCondId);
    expect(doneCond!.queryOp).toBe('NOT_DONE');
  });

  it('round-trips query fields through Loro snapshot export/import', () => {
    const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
    loroDoc.setNodeDataBatch(searchId, {
      type: 'search',
      name: 'Round-trip test',
      lastRefreshedAt: 1700000000000,
    });

    const condId = loroDoc.createNode(undefined, searchId);
    loroDoc.setNodeDataBatch(condId, {
      type: 'queryCondition',
      queryOp: 'DONE_LAST_DAYS' satisfies QueryOp,
    });
    loroDoc.commitDoc('__seed__');

    // Export and reimport
    const snapshot = loroDoc.exportSnapshot();
    loroDoc.importUpdates(snapshot);

    const search = loroDoc.toNodexNode(searchId);
    expect(search!.lastRefreshedAt).toBe(1700000000000);

    const cond = loroDoc.toNodexNode(condId);
    expect(cond!.queryOp).toBe('DONE_LAST_DAYS');
  });
});

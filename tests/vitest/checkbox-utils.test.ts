/**
 * Pure functions for checkbox visibility and state transitions.
 * New Loro model: all functions take NodexNode directly (no entity dict).
 * - task_1 is tagged with tagDef_task (showCheckbox=true in seed)
 * - idea_1 is untagged (inside note_2)
 */
import {
  shouldNodeShowCheckbox,
  hasTagShowCheckbox,
  resolveCheckboxClick,
  resolveCmdEnterCycle,
} from '../../src/lib/checkbox-utils.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('shouldNodeShowCheckbox', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('tag-driven node: showCheckbox=true, isDone=false (no completedAt)', () => {
    const node = loroDoc.toNodexNode('task_1')!;
    const result = shouldNodeShowCheckbox(node);
    expect(result.showCheckbox).toBe(true);
    expect(result.isDone).toBe(false);
  });

  it('untagged node without completedAt: showCheckbox=false', () => {
    const node = loroDoc.toNodexNode('idea_1')!;
    const result = shouldNodeShowCheckbox(node);
    expect(result.showCheckbox).toBe(false);
    expect(result.isDone).toBe(false);
  });

  it('manual node with completedAt=0 (undone sentinel): showCheckbox=true, isDone=false', () => {
    loroDoc.setNodeData('idea_1', 'completedAt', 0);
    const node = loroDoc.toNodexNode('idea_1')!;
    const result = shouldNodeShowCheckbox(node);
    expect(result.showCheckbox).toBe(true);
    expect(result.isDone).toBe(false);
  });

  it('manual node with completedAt=timestamp: showCheckbox=true, isDone=true', () => {
    loroDoc.setNodeData('idea_1', 'completedAt', Date.now());
    const node = loroDoc.toNodexNode('idea_1')!;
    const result = shouldNodeShowCheckbox(node);
    expect(result.showCheckbox).toBe(true);
    expect(result.isDone).toBe(true);
  });

  it('tag-driven done: showCheckbox=true, isDone=true', () => {
    loroDoc.setNodeData('task_1', 'completedAt', Date.now());
    const node = loroDoc.toNodexNode('task_1')!;
    const result = shouldNodeShowCheckbox(node);
    expect(result.showCheckbox).toBe(true);
    expect(result.isDone).toBe(true);
  });
});

describe('hasTagShowCheckbox', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns true for node tagged with showCheckbox=true tagDef', () => {
    const node = loroDoc.toNodexNode('task_1')!;
    expect(hasTagShowCheckbox(node)).toBe(true);
  });

  it('returns false for untagged node', () => {
    const node = loroDoc.toNodexNode('idea_1')!;
    expect(hasTagShowCheckbox(node)).toBe(false);
  });

  it('returns true via extends chain (tagDef_dev_task extends tagDef_task with showCheckbox)', () => {
    // tagDef_dev_task has showCheckbox=true directly in seed data
    useNodeStore.getState().applyTag('idea_1', 'tagDef_dev_task');
    const node = loroDoc.toNodexNode('idea_1')!;
    expect(hasTagShowCheckbox(node)).toBe(true);
  });
});

describe('resolveCheckboxClick', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('tag-driven undone → done: returns completedAt > 0', () => {
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveCheckboxClick(node);
    expect(result.completedAt).toBeGreaterThan(0);
  });

  it('tag-driven done → undone: returns undefined (tag keeps checkbox visible)', () => {
    loroDoc.setNodeData('task_1', 'completedAt', Date.now());
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveCheckboxClick(node);
    expect(result.completedAt).toBeUndefined();
  });

  it('manual undone (completedAt=0) → done: returns timestamp > 0', () => {
    loroDoc.setNodeData('idea_1', 'completedAt', 0);
    const node = loroDoc.toNodexNode('idea_1')!;
    const result = resolveCheckboxClick(node);
    expect(result.completedAt).toBeGreaterThan(0);
  });

  it('manual done → undone: returns 0 (keeps checkbox)', () => {
    loroDoc.setNodeData('idea_1', 'completedAt', Date.now());
    const node = loroDoc.toNodexNode('idea_1')!;
    const result = resolveCheckboxClick(node);
    expect(result.completedAt).toBe(0);
  });
});

describe('resolveCmdEnterCycle', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('tag-driven undone → done (2-state): returns timestamp', () => {
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveCmdEnterCycle(node);
    expect(result.completedAt).toBeGreaterThan(0);
  });

  it('tag-driven done → undone (2-state): returns undefined', () => {
    loroDoc.setNodeData('task_1', 'completedAt', Date.now());
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveCmdEnterCycle(node);
    expect(result.completedAt).toBeUndefined();
  });

  it('manual No → Undone (3-state): returns 0', () => {
    const node = loroDoc.toNodexNode('idea_1')!; // completedAt = undefined
    const result = resolveCmdEnterCycle(node);
    expect(result.completedAt).toBe(0);
  });

  it('manual Undone → Done (3-state): returns timestamp > 0', () => {
    loroDoc.setNodeData('idea_1', 'completedAt', 0);
    const node = loroDoc.toNodexNode('idea_1')!;
    const result = resolveCmdEnterCycle(node);
    expect(result.completedAt).toBeGreaterThan(0);
  });

  it('manual Done → No (3-state): returns undefined', () => {
    loroDoc.setNodeData('idea_1', 'completedAt', Date.now());
    const node = loroDoc.toNodexNode('idea_1')!;
    const result = resolveCmdEnterCycle(node);
    expect(result.completedAt).toBeUndefined();
  });
});

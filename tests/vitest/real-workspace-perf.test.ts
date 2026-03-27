import 'fake-indexeddb/auto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetLoroDoc, initLoroDocForTest, importUpdatesBatch } from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { canCreateChildrenUnder, getNodeCapabilities } from '../../src/lib/node-capabilities.js';
import { computeNodeFields } from '../../src/hooks/use-node-fields.js';
import { buildVisibleChildrenRows } from '../../src/components/outliner/row-model.js';
import { readViewConfig, applyViewPipeline } from '../../src/lib/view-pipeline.js';
import { isOutlinerContentNodeType } from '../../src/lib/node-type-utils.js';

interface ExportedSnapshotPayload {
  format: string;
  workspaceId: string;
  snapshotBase64: string;
  versionVectorBase64?: string;
  savedAt?: number;
}

interface PerfTargets {
  busiestParentId: string;
  siblingNodeId: string;
  nestedNodeId: string;
}

interface BenchmarkSummary {
  avgMs: number;
  minMs: number;
  maxMs: number;
  medianMs: number;
  p95Ms: number;
}

const SNAPSHOT_PATH = process.env.REAL_WORKSPACE_SNAPSHOT;
const realDescribe = SNAPSHOT_PATH ? describe : describe.skip;

function decodeBase64ToUint8Array(input: string): Uint8Array {
  return Uint8Array.from(Buffer.from(input, 'base64'));
}

function loadSnapshotPayload(snapshotPath: string): ExportedSnapshotPayload {
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  return JSON.parse(raw) as ExportedSnapshotPayload;
}

function importSnapshotFresh(payload: ExportedSnapshotPayload): void {
  resetLoroDoc();
  initLoroDocForTest(payload.workspaceId);
  const snapshot = decodeBase64ToUint8Array(payload.snapshotBase64);
  const result = importUpdatesBatch([snapshot]);
  expect(result).toMatchObject({ imported: 1, skipped: 0, poisoned: false });
}

function getMovableContentChildren(parentId: string): string[] {
  return loroDoc
    .getChildren(parentId)
    .filter((childId) => {
      const child = loroDoc.toNodexNode(childId);
      return child?.type !== 'fieldEntry' && getNodeCapabilities(childId).canMove;
    });
}

function pickTargets(): PerfTargets {
  const allIds = loroDoc.getAllNodeIds();
  const parentCandidates = allIds
    .filter((nodeId) => canCreateChildrenUnder(nodeId))
    .map((nodeId) => ({
      nodeId,
      movableChildren: getMovableContentChildren(nodeId),
    }))
    .filter((entry) => entry.movableChildren.length >= 3)
    .sort((a, b) => b.movableChildren.length - a.movableChildren.length);

  const busiestParent = parentCandidates[0];
  expect(busiestParent).toBeTruthy();

  const busiestParentId = busiestParent!.nodeId;
  const siblingChildren = busiestParent!.movableChildren;
  const siblingNodeId = siblingChildren[Math.floor(siblingChildren.length / 2)];

  let nestedNodeId: string | null = null;
  for (const parent of parentCandidates) {
    for (const childId of parent.movableChildren) {
      const grandchildren = getMovableContentChildren(childId);
      if (grandchildren.length === 0) continue;
      nestedNodeId = grandchildren[Math.floor(grandchildren.length / 2)];
      break;
    }
    if (nestedNodeId) break;
  }

  expect(nestedNodeId).toBeTruthy();

  return {
    busiestParentId,
    siblingNodeId,
    nestedNodeId: nestedNodeId!,
  };
}

function summarizeDurations(durations: number[]): BenchmarkSummary {
  const sorted = [...durations].sort((a, b) => a - b);
  const avgMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    avgMs,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    medianMs,
    p95Ms: sorted[p95Index],
  };
}

function formatSummary(summary: BenchmarkSummary): string {
  return `avg=${summary.avgMs.toFixed(2)}ms median=${summary.medianMs.toFixed(2)}ms p95=${summary.p95Ms.toFixed(2)}ms min=${summary.minMs.toFixed(2)}ms max=${summary.maxMs.toFixed(2)}ms`;
}

function benchmarkFreshMutation(
  payload: ExportedSnapshotPayload,
  label: string,
  fn: (targets: PerfTargets) => void,
  iterations = 7,
): BenchmarkSummary {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    importSnapshotFresh(payload);
    const targets = pickTargets();
    const t0 = performance.now();
    fn(targets);
    durations.push(performance.now() - t0);
  }

  const summary = summarizeDurations(durations);
  console.log(`[real-workspace-perf] ${label}: ${formatSummary(summary)}`);
  return summary;
}

function computeVisibleRows(parentId: string): number {
  const store = useNodeStore.getState();
  const node = store.getNode(parentId);
  const allChildIds = node?.children ?? [];
  const fields = computeNodeFields(store.getNode, store.getChildren, parentId);
  const fieldMap = new Map(fields.map((field) => [field.fieldEntryId, field]));
  const tagIds = node?.tags ?? [];
  const viewConfig = readViewConfig(parentId, store.getViewDefId, store.getNode, store.getFilters);
  const rows = buildVisibleChildrenRows({
    allChildIds,
    fieldMap,
    tagIds,
    getFieldDefOwnerId: (fieldDefId) => loroDoc.getParentId(fieldDefId),
    getNodeType: (id) => store.getNode(id)?.type,
    getChildNodeType: (id) => store.getNode(id)?.type,
    isOutlinerContentType: isOutlinerContentNodeType,
  });

  return applyViewPipeline(rows, viewConfig, store.getNode, store._version).length;
}

realDescribe('real workspace structural perf', () => {
  it(
    'imports a real snapshot and reports structural mutation timings',
    () => {
      const payload = loadSnapshotPayload(SNAPSHOT_PATH!);
      expect(payload.format).toBe('nodex-workspace-snapshot-v1');
      importSnapshotFresh(payload);

      const nodeCount = loroDoc.getAllNodeIds().length;
      expect(nodeCount).toBeGreaterThan(10_000);

      const targets = pickTargets();
      const busiestParentChildren = getMovableContentChildren(targets.busiestParentId);
      const busiestParent = loroDoc.toNodexNode(targets.busiestParentId);

      console.log('[real-workspace-perf] workspace summary', {
        workspaceId: payload.workspaceId,
        nodeCount,
        busiestParentId: targets.busiestParentId,
        busiestParentName: busiestParent?.name ?? null,
        busiestParentType: busiestParent?.type ?? 'content',
        busiestParentMovableChildren: busiestParentChildren.length,
      });

      const hotReadDurations: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        computeVisibleRows(targets.busiestParentId);
        hotReadDurations.push(performance.now() - t0);
      }
      const hotReadSummary = summarizeDurations(hotReadDurations);
      console.log(`[real-workspace-perf] visibleRows(${targets.busiestParentId}): ${formatSummary(hotReadSummary)}`);

      const createChildSummary = benchmarkFreshMutation(payload, 'createChild', ({ busiestParentId }) => {
        useNodeStore.getState().createChild(busiestParentId, undefined, { name: 'perf child' });
      });

      const createSiblingSummary = benchmarkFreshMutation(payload, 'createSibling', ({ siblingNodeId }) => {
        useNodeStore.getState().createSibling(siblingNodeId, { name: 'perf sibling' });
      });

      const indentSummary = benchmarkFreshMutation(payload, 'indentNode', ({ siblingNodeId }) => {
        useNodeStore.getState().indentNode(siblingNodeId);
      });

      const outdentSummary = benchmarkFreshMutation(payload, 'outdentNode', ({ nestedNodeId }) => {
        useNodeStore.getState().outdentNode(nestedNodeId);
      });

      const reorderSummary = benchmarkFreshMutation(payload, 'moveNodeTo(reorder)', ({ busiestParentId, siblingNodeId }) => {
        useNodeStore.getState().moveNodeTo(siblingNodeId, busiestParentId, 0);
      });

      expect(createChildSummary.p95Ms).toBeLessThan(100);
      expect(createSiblingSummary.p95Ms).toBeLessThan(100);
      expect(indentSummary.p95Ms).toBeLessThan(100);
      expect(outdentSummary.p95Ms).toBeLessThan(100);
      expect(reorderSummary.p95Ms).toBeLessThan(100);
    },
    120_000,
  );
});

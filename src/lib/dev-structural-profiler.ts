import type { ProfilerOnRenderCallback } from 'react';

type ComponentBucket = {
  renders: number;
  mounts: number;
  uniqueInstances: Set<string>;
};

type CompletedOperation = {
  id: number;
  name: string;
  meta: Record<string, unknown>;
  startedAt: number;
  mutationMs: number;
  totalMs: number;
  commitCount: number;
  commitOrigins: Record<string, number>;
  commitActualDurationMs: number;
  commitBaseDurationMs: number;
  components: Record<string, { renders: number; mounts: number; uniqueInstances: number }>;
};

type ActiveOperation = {
  id: number;
  name: string;
  meta: Record<string, unknown>;
  startedAt: number;
  mutationMs: number | null;
  commitCount: number;
  commitOrigins: Map<string, number>;
  commitActualDurationMs: number;
  commitBaseDurationMs: number;
  components: Map<string, ComponentBucket>;
};

type StructuralProfilerApi = {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  isEnabled: () => boolean;
  last: () => CompletedOperation | null;
  history: () => CompletedOperation[];
  state: () => { enabled: boolean; active: string | null };
};

const DEV_STORAGE_KEY = 'soma:structural-perf';
const MAX_HISTORY = 50;

let installed = false;
let enabled = false;
let nextOperationId = 1;
let activeProfileDepth = 0;
let activeOperation: ActiveOperation | null = null;
const completedOperations: CompletedOperation[] = [];

function hasDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readPersistedEnabled(): boolean {
  if (!hasDom()) return false;
  try {
    return window.localStorage.getItem(DEV_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistEnabled(next: boolean): void {
  if (!hasDom()) return;
  try {
    if (next) {
      window.localStorage.setItem(DEV_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(DEV_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures in dev instrumentation.
  }
}

function frameNow(): Promise<number> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve(performance.now()));
      return;
    }
    setTimeout(() => resolve(performance.now()), 0);
  });
}

function ensureComponentBucket(operation: ActiveOperation, componentName: string): ComponentBucket {
  let bucket = operation.components.get(componentName);
  if (!bucket) {
    bucket = { renders: 0, mounts: 0, uniqueInstances: new Set() };
    operation.components.set(componentName, bucket);
  }
  return bucket;
}

function snapshotComponents(operation: ActiveOperation): CompletedOperation['components'] {
  return Object.fromEntries(
    [...operation.components.entries()].map(([name, bucket]) => [
      name,
      {
        renders: bucket.renders,
        mounts: bucket.mounts,
        uniqueInstances: bucket.uniqueInstances.size,
      },
    ]),
  );
}

function snapshotCommitOrigins(operation: ActiveOperation): Record<string, number> {
  return Object.fromEntries([...operation.commitOrigins.entries()].sort((a, b) => b[1] - a[1]));
}

function logCompletedOperation(operation: CompletedOperation): void {
  const header = `[soma-perf] ${operation.name} total=${operation.totalMs.toFixed(2)}ms mutation=${operation.mutationMs.toFixed(2)}ms commits=${operation.commitCount}`;
  console.groupCollapsed(header);
  console.log({
    name: operation.name,
    meta: operation.meta,
    totalMs: Number(operation.totalMs.toFixed(2)),
    mutationMs: Number(operation.mutationMs.toFixed(2)),
    commitCount: operation.commitCount,
    commitOrigins: operation.commitOrigins,
    commitActualDurationMs: Number(operation.commitActualDurationMs.toFixed(2)),
    commitBaseDurationMs: Number(operation.commitBaseDurationMs.toFixed(2)),
  });
  const rows = Object.entries(operation.components)
    .map(([component, stats]) => ({ component, ...stats }))
    .sort((a, b) => b.renders - a.renders);
  if (rows.length > 0) {
    console.table(rows);
  }
  console.groupEnd();
}

async function finalizeOperation(operation: ActiveOperation): Promise<void> {
  await frameNow();
  const settledAt = await frameNow();
  const completed: CompletedOperation = {
    id: operation.id,
    name: operation.name,
    meta: operation.meta,
    startedAt: operation.startedAt,
    mutationMs: operation.mutationMs ?? 0,
    totalMs: settledAt - operation.startedAt,
    commitCount: operation.commitCount,
    commitOrigins: snapshotCommitOrigins(operation),
    commitActualDurationMs: operation.commitActualDurationMs,
    commitBaseDurationMs: operation.commitBaseDurationMs,
    components: snapshotComponents(operation),
  };
  completedOperations.push(completed);
  if (completedOperations.length > MAX_HISTORY) completedOperations.shift();
  if (activeOperation?.id === operation.id) activeOperation = null;
  logCompletedOperation(completed);
}

function buildApi(): StructuralProfilerApi {
  return {
    enable: () => {
      enabled = true;
      persistEnabled(true);
      console.info('[soma-perf] enabled');
    },
    disable: () => {
      enabled = false;
      persistEnabled(false);
      activeOperation = null;
      activeProfileDepth = 0;
      console.info('[soma-perf] disabled');
    },
    clear: () => {
      completedOperations.length = 0;
      console.info('[soma-perf] history cleared');
    },
    isEnabled: () => enabled,
    last: () => completedOperations[completedOperations.length - 1] ?? null,
    history: () => [...completedOperations],
    state: () => ({
      enabled,
      active: activeOperation?.name ?? null,
    }),
  };
}

export function installDevStructuralProfiler(): void {
  if (!import.meta.env.DEV || !hasDom() || installed) return;
  installed = true;
  enabled = readPersistedEnabled();
  (window as typeof window & { __somaPerf?: StructuralProfilerApi }).__somaPerf = buildApi();
  console.info('[soma-perf] ready. Use window.__somaPerf.enable() to start profiling structural actions.');
}

export function beginStructuralProfile(
  name: string,
  meta: Record<string, unknown>,
): (mutationMs: number) => void {
  if (!import.meta.env.DEV || !enabled) {
    return () => {};
  }

  activeProfileDepth += 1;

  // Nested structural calls belong to the outermost operation.
  if (activeProfileDepth > 1) {
    return () => {
      activeProfileDepth = Math.max(0, activeProfileDepth - 1);
    };
  }

  const operation: ActiveOperation = {
    id: nextOperationId++,
    name,
    meta,
    startedAt: performance.now(),
    mutationMs: null,
    commitCount: 0,
    commitOrigins: new Map(),
    commitActualDurationMs: 0,
    commitBaseDurationMs: 0,
    components: new Map(),
  };
  activeOperation = operation;

  return (mutationMs: number) => {
    operation.mutationMs = mutationMs;
    activeProfileDepth = Math.max(0, activeProfileDepth - 1);
    void finalizeOperation(operation);
  };
}

export const onStructuralProfilerCommit: ProfilerOnRenderCallback = (
  _id,
  _phase,
  actualDuration,
  baseDuration,
) => {
  if (!enabled || !activeOperation) return;
  activeOperation.commitCount += 1;
  activeOperation.commitActualDurationMs += actualDuration;
  activeOperation.commitBaseDurationMs += baseDuration;
};

export function recordStructuralCommitOrigin(origin: string): void {
  if (!enabled || !activeOperation) return;
  activeOperation.commitOrigins.set(origin, (activeOperation.commitOrigins.get(origin) ?? 0) + 1);
}

function recordComponentActivity(componentName: string, instanceId: string | undefined, kind: 'render' | 'mount'): void {
  if (!enabled || !activeOperation) return;
  const bucket = ensureComponentBucket(activeOperation, componentName);
  if (kind === 'render') bucket.renders += 1;
  if (kind === 'mount') bucket.mounts += 1;
  if (instanceId) bucket.uniqueInstances.add(instanceId);
}

export function recordStructuralComponentRender(componentName: string, instanceId?: string): void {
  recordComponentActivity(componentName, instanceId, 'render');
}

export function recordStructuralComponentMount(componentName: string, instanceId?: string): void {
  recordComponentActivity(componentName, instanceId, 'mount');
}

import { useEffect, useRef } from 'react';
import type { ProfilerOnRenderCallback } from 'react';

type DevStructuralProfilerModule = typeof import('./dev-structural-profiler.js');

let devProfilerModule: DevStructuralProfilerModule | null = null;
let devProfilerPromise: Promise<DevStructuralProfilerModule | null> | null = null;

function loadDevProfiler(): Promise<DevStructuralProfilerModule | null> {
  if (!import.meta.env.DEV) {
    return Promise.resolve(null);
  }
  if (devProfilerModule) {
    return Promise.resolve(devProfilerModule);
  }
  if (!devProfilerPromise) {
    devProfilerPromise = import('./dev-structural-profiler.js').then((mod) => {
      devProfilerModule = mod;
      return mod;
    });
  }
  return devProfilerPromise;
}

export function installStructuralProfiler(): void {
  if (!import.meta.env.DEV) return;
  void loadDevProfiler().then((mod) => mod?.installDevStructuralProfiler());
}

export function beginStructuralProfile(
  name: string,
  meta: Record<string, unknown>,
): (mutationMs: number) => void {
  if (!import.meta.env.DEV || !devProfilerModule) {
    return () => {};
  }
  return devProfilerModule.beginStructuralProfile(name, meta);
}

export const onStructuralProfilerCommit: ProfilerOnRenderCallback = (...args) => {
  if (!import.meta.env.DEV) return;
  devProfilerModule?.onStructuralProfilerCommit(...args);
};

export function recordStructuralCommitOrigin(origin: string): void {
  if (!import.meta.env.DEV) return;
  devProfilerModule?.recordStructuralCommitOrigin(origin);
}

export function useStructuralRenderTrace(componentName: string, instanceId?: string): void {
  const mountIdRef = useRef(instanceId);
  mountIdRef.current = instanceId;

  if (import.meta.env.DEV) {
    devProfilerModule?.recordStructuralComponentRender(componentName, mountIdRef.current);
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    devProfilerModule?.recordStructuralComponentMount(componentName, mountIdRef.current);
  }, [componentName]);
}

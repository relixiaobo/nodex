type DevChatProfilerModule = typeof import('./dev-chat-profiler.js');

export interface ChatProfileHandle {
  mark(label: string, meta?: Record<string, unknown>): void;
  end(meta?: Record<string, unknown>): void;
}

let devProfilerModule: DevChatProfilerModule | null = null;
let devProfilerPromise: Promise<DevChatProfilerModule | null> | null = null;

function loadDevProfiler(): Promise<DevChatProfilerModule | null> {
  if (!import.meta.env.DEV) {
    return Promise.resolve(null);
  }
  if (devProfilerModule) {
    return Promise.resolve(devProfilerModule);
  }
  if (!devProfilerPromise) {
    devProfilerPromise = import('./dev-chat-profiler.js').then((mod) => {
      devProfilerModule = mod;
      return mod;
    });
  }
  return devProfilerPromise;
}

export function installChatProfiler(): void {
  if (!import.meta.env.DEV) return;
  void loadDevProfiler().then((mod) => mod?.installDevChatProfiler());
}

export function beginChatProfile(
  name: string,
  meta: Record<string, unknown>,
): ChatProfileHandle {
  if (!import.meta.env.DEV || !devProfilerModule) {
    return {
      mark: () => {},
      end: () => {},
    };
  }

  return devProfilerModule.beginChatProfile(name, meta);
}

export async function measureChatAsync<T>(
  name: string,
  meta: Record<string, unknown>,
  task: () => Promise<T>,
): Promise<T> {
  const profile = beginChatProfile(name, meta);
  try {
    const result = await task();
    profile.end();
    return result;
  } catch (error) {
    profile.end({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

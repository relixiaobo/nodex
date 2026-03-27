type ChatProfilerApi = {
  enable: () => void;
  disable: () => void;
  clear: () => void;
  isEnabled: () => boolean;
  history: () => CompletedProfile[];
};

type ChatProfileMark = {
  label: string;
  atMs: number;
  sinceStartMs: number;
  meta?: Record<string, unknown>;
};

type CompletedProfile = {
  id: number;
  name: string;
  meta: Record<string, unknown>;
  startedAt: number;
  totalMs: number;
  marks: ChatProfileMark[];
  endMeta?: Record<string, unknown>;
};

type ActiveProfile = {
  id: number;
  name: string;
  meta: Record<string, unknown>;
  startedAt: number;
  marks: ChatProfileMark[];
  ended: boolean;
};

const DEV_STORAGE_KEY = 'soma:chat-perf';
const MAX_HISTORY = 80;

let installed = false;
let enabled = false;
let nextProfileId = 1;
const completedProfiles: CompletedProfile[] = [];

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

function logProfile(profile: CompletedProfile): void {
  const header = `[chat-perf] ${profile.name} total=${profile.totalMs.toFixed(2)}ms`;
  console.groupCollapsed(header);
  console.log({
    name: profile.name,
    meta: profile.meta,
    totalMs: Number(profile.totalMs.toFixed(2)),
    endMeta: profile.endMeta ?? null,
  });
  if (profile.marks.length > 0) {
    console.table(profile.marks.map((mark) => ({
      label: mark.label,
      sinceStartMs: Number(mark.sinceStartMs.toFixed(2)),
      meta: mark.meta ?? null,
    })));
  }
  console.groupEnd();
}

function buildApi(): ChatProfilerApi {
  return {
    enable: () => {
      enabled = true;
      persistEnabled(true);
      console.info('[chat-perf] enabled');
    },
    disable: () => {
      enabled = false;
      persistEnabled(false);
      console.info('[chat-perf] disabled');
    },
    clear: () => {
      completedProfiles.length = 0;
      console.info('[chat-perf] history cleared');
    },
    isEnabled: () => enabled,
    history: () => [...completedProfiles],
  };
}

export function installDevChatProfiler(): void {
  if (!import.meta.env.DEV || !hasDom() || installed) return;
  installed = true;
  enabled = readPersistedEnabled();
  (window as typeof window & { __somaChatPerf?: ChatProfilerApi }).__somaChatPerf = buildApi();
  console.info('[chat-perf] ready. Use window.__somaChatPerf.enable() to profile chat hydration/persistence.');
}

export function beginChatProfile(name: string, meta: Record<string, unknown>) {
  const profile: ActiveProfile = {
    id: nextProfileId++,
    name,
    meta,
    startedAt: performance.now(),
    marks: [],
    ended: false,
  };

  return {
    mark(label: string, markMeta?: Record<string, unknown>) {
      if (!enabled || profile.ended) return;
      const atMs = performance.now();
      profile.marks.push({
        label,
        atMs,
        sinceStartMs: atMs - profile.startedAt,
        meta: markMeta,
      });
    },
    end(endMeta?: Record<string, unknown>) {
      if (!enabled || profile.ended) return;
      profile.ended = true;
      const completed: CompletedProfile = {
        id: profile.id,
        name: profile.name,
        meta: profile.meta,
        startedAt: profile.startedAt,
        totalMs: performance.now() - profile.startedAt,
        marks: profile.marks,
        endMeta,
      };
      completedProfiles.push(completed);
      if (completedProfiles.length > MAX_HISTORY) completedProfiles.shift();
      logProfile(completed);
    },
  };
}

const CDP_VERSION = '1.3';
const IDLE_DETACH_MS = 15_000;
const MAX_NETWORK_RECORDS = 200;
const MAX_CONSOLE_RECORDS = 200;

interface NetworkRequestRecord {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  type?: string;
  size?: number;
  timestamp: number;
}

interface ConsoleMessageRecord {
  level: 'error' | 'warn' | 'log' | 'info';
  text: string;
  timestamp: string;
}

interface TabSessionState {
  idleTimer: ReturnType<typeof setTimeout> | null;
  networkEnabled: boolean;
  consoleEnabled: boolean;
  pendingNetworkRequests: Map<string, NetworkRequestRecord>;
  completedNetworkRequests: NetworkRequestRecord[];
  consoleMessages: ConsoleMessageRecord[];
}

const sessions = new Map<number, TabSessionState>();
let listenersRegistered = false;

function getDebuggee(tabId: number): chrome.debugger.Debuggee {
  return { tabId };
}

function getOrCreateSession(tabId: number): TabSessionState {
  const existing = sessions.get(tabId);
  if (existing) return existing;

  const created: TabSessionState = {
    idleTimer: null,
    networkEnabled: false,
    consoleEnabled: false,
    pendingNetworkRequests: new Map(),
    completedNetworkRequests: [],
    consoleMessages: [],
  };
  sessions.set(tabId, created);
  return created;
}

function clearIdleTimer(tabId: number): void {
  const session = sessions.get(tabId);
  if (!session?.idleTimer) return;

  clearTimeout(session.idleTimer);
  session.idleTimer = null;
}

function scheduleIdleDetach(tabId: number): void {
  const session = getOrCreateSession(tabId);
  clearIdleTimer(tabId);
  session.idleTimer = setTimeout(() => {
    void detachFromTab(tabId).catch(() => {});
  }, IDLE_DETACH_MS);
}

function trimCompletedNetworkRecords(records: NetworkRequestRecord[]): NetworkRequestRecord[] {
  return records.length <= MAX_NETWORK_RECORDS
    ? records
    : records.slice(records.length - MAX_NETWORK_RECORDS);
}

function trimConsoleRecords(records: ConsoleMessageRecord[]): ConsoleMessageRecord[] {
  return records.length <= MAX_CONSOLE_RECORDS
    ? records
    : records.slice(records.length - MAX_CONSOLE_RECORDS);
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number') {
    if (value > 10_000_000_000) return value;
    return Math.round(value * 1000);
  }

  return Date.now();
}

function toIsoTimestamp(value: unknown): string {
  return new Date(toTimestamp(value)).toISOString();
}

function normalizeConsoleLevel(value: string | undefined): ConsoleMessageRecord['level'] {
  switch (value) {
    case 'error':
      return 'error';
    case 'warning':
    case 'warn':
      return 'warn';
    case 'info':
      return 'info';
    default:
      return 'log';
  }
}

function stringifyRemoteValue(remoteObject: {
  value?: unknown;
  unserializableValue?: string;
  description?: string;
}): string {
  if (remoteObject.unserializableValue) return remoteObject.unserializableValue;
  if (typeof remoteObject.value === 'string') return remoteObject.value;
  if (remoteObject.value !== undefined) return JSON.stringify(remoteObject.value);
  if (remoteObject.description) return remoteObject.description;
  return '';
}

function handleDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params?: any,
): void {
  const tabId = source.tabId;
  if (!tabId) return;

  const session = sessions.get(tabId);
  if (!session) return;

  if (method === 'Network.requestWillBeSent') {
    const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
    if (!requestId) return;
    const request = (params?.request ?? {}) as { url?: string; method?: string };
    const record: NetworkRequestRecord = {
      requestId,
      url: request.url ?? '',
      method: request.method ?? 'GET',
      type: typeof params?.type === 'string' ? params.type.toLowerCase() : undefined,
      timestamp: toTimestamp((params as { wallTime?: number })?.wallTime ?? params?.timestamp),
    };
    session.pendingNetworkRequests.set(requestId, record);
    return;
  }

  if (method === 'Network.responseReceived') {
    const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
    if (!requestId) return;

    const pending = session.pendingNetworkRequests.get(requestId);
    if (!pending) return;

    const response = (params?.response ?? {}) as { status?: number };
    pending.status = response.status;
    pending.type = typeof params?.type === 'string' ? params.type.toLowerCase() : pending.type;
    return;
  }

  if (method === 'Network.loadingFinished') {
    const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
    if (!requestId) return;

    const pending = session.pendingNetworkRequests.get(requestId);
    if (!pending) return;

    const size = (params as { encodedDataLength?: number }).encodedDataLength;
    pending.size = typeof size === 'number' ? Math.round(size) : pending.size;
    session.pendingNetworkRequests.delete(requestId);
    session.completedNetworkRequests = trimCompletedNetworkRecords([
      ...session.completedNetworkRequests,
      { ...pending },
    ]);
    return;
  }

  if (method === 'Network.loadingFailed') {
    const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
    if (!requestId) return;

    const pending = session.pendingNetworkRequests.get(requestId);
    if (!pending) return;

    pending.status = 0;
    session.pendingNetworkRequests.delete(requestId);
    session.completedNetworkRequests = trimCompletedNetworkRecords([
      ...session.completedNetworkRequests,
      { ...pending },
    ]);
    return;
  }

  if (method === 'Runtime.consoleAPICalled') {
    const consoleParams = params as {
      type?: string;
      args?: Array<{ value?: unknown; unserializableValue?: string; description?: string }>;
      timestamp?: number;
    };
    const text = (consoleParams.args ?? [])
      .map((arg) => stringifyRemoteValue(arg))
      .filter(Boolean)
      .join(' ');

    session.consoleMessages = trimConsoleRecords([
      ...session.consoleMessages,
      {
        level: normalizeConsoleLevel(consoleParams.type),
        text: text || consoleParams.type || 'console',
        timestamp: toIsoTimestamp(consoleParams.timestamp),
      },
    ]);
    return;
  }

  if (method === 'Log.entryAdded') {
    const entry = (params?.entry ?? {}) as { level?: string; text?: string; timestamp?: number };
    session.consoleMessages = trimConsoleRecords([
      ...session.consoleMessages,
      {
        level: normalizeConsoleLevel(entry.level),
        text: entry.text ?? '',
        timestamp: toIsoTimestamp(entry.timestamp),
      },
    ]);
  }
}

function handleDebuggerDetach(source: chrome.debugger.Debuggee): void {
  const tabId = source.tabId;
  if (!tabId) return;

  clearIdleTimer(tabId);
  sessions.delete(tabId);
}

function ensureListenersRegistered(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;
  chrome.debugger.onEvent.addListener(handleDebuggerEvent);
  chrome.debugger.onDetach.addListener(handleDebuggerDetach);
}

function sendDebuggerCommandInternal<T>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(getDebuggee(tabId), method, params ?? {}, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? `CDP command failed: ${method}`));
        return;
      }

      resolve(result as T);
    });
  });
}

export async function attachToTab(tabId: number): Promise<void> {
  ensureListenersRegistered();

  if (sessions.has(tabId)) {
    scheduleIdleDetach(tabId);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach(getDebuggee(tabId), CDP_VERSION, () => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message ?? 'Failed to attach debugger';
        reject(new Error(message));
        return;
      }
      resolve();
    });
  });

  getOrCreateSession(tabId);
  scheduleIdleDetach(tabId);
}

export async function detachFromTab(tabId: number): Promise<void> {
  if (!sessions.has(tabId)) return;

  clearIdleTimer(tabId);

  await new Promise<void>((resolve) => {
    chrome.debugger.detach(getDebuggee(tabId), () => {
      sessions.delete(tabId);
      resolve();
    });
  });
}

export async function sendCommand<T>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  await attachToTab(tabId);
  const result = await sendDebuggerCommandInternal<T>(tabId, method, params);
  scheduleIdleDetach(tabId);
  return result;
}

export async function evaluateInTab<T>(tabId: number, expression: string): Promise<T> {
  const result = await sendCommand<{
    result?: { value?: T; unserializableValue?: string; description?: string };
    exceptionDetails?: { text?: string };
  }>(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Page evaluation failed');
  }

  if (!result.result) {
    return undefined as T;
  }

  if (result.result.unserializableValue !== undefined) {
    return result.result.unserializableValue as T;
  }

  if (result.result.value !== undefined) {
    return result.result.value;
  }

  return result.result.description as T;
}

export async function enableNetworkTracking(tabId: number): Promise<void> {
  const session = getOrCreateSession(tabId);
  if (session.networkEnabled) {
    scheduleIdleDetach(tabId);
    return;
  }

  await sendCommand(tabId, 'Network.enable');
  session.networkEnabled = true;
}

export async function enableConsoleTracking(tabId: number): Promise<void> {
  const session = getOrCreateSession(tabId);
  if (session.consoleEnabled) {
    scheduleIdleDetach(tabId);
    return;
  }

  await sendCommand(tabId, 'Runtime.enable');
  await sendCommand(tabId, 'Log.enable');
  session.consoleEnabled = true;
}

export function getRecentNetworkRequests(tabId: number, urlPattern?: string): {
  requests: Array<{ url: string; method: string; status?: number; type?: string; size?: number }>;
  total: number;
} {
  const session = sessions.get(tabId);
  if (!session) return { requests: [], total: 0 };

  scheduleIdleDetach(tabId);

  const combined = [
    ...session.completedNetworkRequests,
    ...session.pendingNetworkRequests.values(),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const filtered = combined.filter((request) => {
    if (!urlPattern) return true;
    return request.url.includes(urlPattern);
  });

  return {
    requests: filtered.slice(0, 50).map(({ requestId: _requestId, timestamp: _timestamp, ...rest }) => rest),
    total: filtered.length,
  };
}

export function getRecentConsoleMessages(tabId: number, logLevel: 'all' | 'error' | 'warn' | 'log' | 'info'): {
  messages: ConsoleMessageRecord[];
  total: number;
} {
  const session = sessions.get(tabId);
  if (!session) return { messages: [], total: 0 };

  scheduleIdleDetach(tabId);

  const filtered = logLevel === 'all'
    ? session.consoleMessages
    : session.consoleMessages.filter((message) => message.level === logLevel);

  return {
    messages: filtered.slice(-100).reverse(),
    total: filtered.length,
  };
}

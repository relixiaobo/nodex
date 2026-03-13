import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface DebuggerStub {
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  sendCommand: ReturnType<typeof vi.fn>;
  emitEvent: (source: chrome.debugger.Debuggee, method: string, params?: unknown) => void;
}

function createDebuggerStub(): DebuggerStub {
  let onEventListener: ((source: chrome.debugger.Debuggee, method: string, params?: unknown) => void) | null = null;
  let onDetachListener: ((source: chrome.debugger.Debuggee) => void) | null = null;

  const attach = vi.fn((_debuggee: chrome.debugger.Debuggee, _version: string, callback: () => void) => {
    callback();
  });
  const detach = vi.fn((debuggee: chrome.debugger.Debuggee, callback: () => void) => {
    callback();
    onDetachListener?.(debuggee);
  });
  const sendCommand = vi.fn((
    _debuggee: chrome.debugger.Debuggee,
    method: string,
    _params: unknown,
    callback: (result?: unknown) => void,
  ) => {
    switch (method) {
      case 'Runtime.evaluate':
        callback({ result: { value: 'evaluated' } });
        break;
      default:
        callback({});
        break;
    }
  });

  vi.stubGlobal('chrome', {
    runtime: {
      get lastError() {
        return null;
      },
    },
    debugger: {
      attach,
      detach,
      sendCommand,
      onEvent: {
        addListener(listener: (source: chrome.debugger.Debuggee, method: string, params?: unknown) => void) {
          onEventListener = listener;
        },
      },
      onDetach: {
        addListener(listener: (source: chrome.debugger.Debuggee) => void) {
          onDetachListener = listener;
        },
      },
    },
  });

  return {
    attach,
    detach,
    sendCommand,
    emitEvent(source, method, params) {
      onEventListener?.(source, method, params);
    },
  };
}

describe('cdp-manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('attaches once and auto-detaches after idle timeout', async () => {
    const stub = createDebuggerStub();
    const manager = await import('../../src/lib/ai-tools/cdp-manager.js');

    await manager.attachToTab(7);
    await manager.sendCommand(7, 'Page.enable');

    expect(stub.attach).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(stub.detach).toHaveBeenCalledTimes(1);
    expect(stub.detach).toHaveBeenCalledWith({ tabId: 7 }, expect.any(Function));
  });

  it('records network events and filters by url pattern', async () => {
    const stub = createDebuggerStub();
    const manager = await import('../../src/lib/ai-tools/cdp-manager.js');

    await manager.enableNetworkTracking(3);

    stub.emitEvent({ tabId: 3 }, 'Network.requestWillBeSent', {
      requestId: 'req_1',
      request: { url: 'https://api.example.com/data', method: 'GET' },
      type: 'XHR',
      wallTime: 1710000000,
    });
    stub.emitEvent({ tabId: 3 }, 'Network.responseReceived', {
      requestId: 'req_1',
      response: { status: 200 },
      type: 'XHR',
    });
    stub.emitEvent({ tabId: 3 }, 'Network.loadingFinished', {
      requestId: 'req_1',
      encodedDataLength: 1234,
    });

    const result = manager.getRecentNetworkRequests(3, 'api.example.com');

    expect(result.total).toBe(1);
    expect(result.requests[0]).toEqual({
      url: 'https://api.example.com/data',
      method: 'GET',
      status: 200,
      type: 'xhr',
      size: 1234,
    });
  });

  it('records console messages and filters by level', async () => {
    const stub = createDebuggerStub();
    const manager = await import('../../src/lib/ai-tools/cdp-manager.js');

    await manager.enableConsoleTracking(11);

    stub.emitEvent({ tabId: 11 }, 'Runtime.consoleAPICalled', {
      type: 'warning',
      args: [{ value: 'Careful now' }],
      timestamp: 1710000000000,
    });
    stub.emitEvent({ tabId: 11 }, 'Runtime.consoleAPICalled', {
      type: 'log',
      args: [{ value: 'Just FYI' }],
      timestamp: 1710000001000,
    });

    const result = manager.getRecentConsoleMessages(11, 'warn');

    expect(result.total).toBe(1);
    expect(result.messages[0]).toEqual({
      level: 'warn',
      text: 'Careful now',
      timestamp: new Date(1710000000000).toISOString(),
    });
  });

  it('surfaces evaluation results', async () => {
    createDebuggerStub();
    const manager = await import('../../src/lib/ai-tools/cdp-manager.js');

    const result = await manager.evaluateInTab<string>(5, 'document.title');

    expect(result).toBe('evaluated');
  });
});

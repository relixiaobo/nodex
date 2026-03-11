import type { WebClipCaptureResponse } from '../webclip-messaging.js';
import { toWebClipCaptureResponse } from '../webclip-messaging.js';
import { PAGE_CAPTURE_PAGE, type PageCaptureResponse } from './messaging.js';

const DEFAULT_READY_TIMEOUT_MS = 1200;
const DEFAULT_RETRY_DELAY_MS = 150;
const DEFAULT_RETRY_TIMES = 2;

export interface ContentScriptReadyTracker {
  waitForReady: (tabId: number) => Promise<boolean>;
  resolveReady: (tabId: number, ready: boolean) => void;
}

interface ContentScriptReadyTrackerOptions {
  timeoutMs?: number;
  clearTimeoutImpl?: (timeoutId: ReturnType<typeof setTimeout>) => void;
  setTimeoutImpl?: typeof setTimeout;
}

export function createContentScriptReadyTracker(
  options: ContentScriptReadyTrackerOptions = {},
): ContentScriptReadyTracker {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  const readyWaiters = new Map<number, Set<(ready: boolean) => void>>();

  return {
    waitForReady(tabId) {
      return new Promise((resolve) => {
        const waiters = readyWaiters.get(tabId) ?? new Set<(ready: boolean) => void>();
        let timeoutId: ReturnType<typeof setTimeout>;

        const onReady = (ready: boolean) => {
          clearTimeoutImpl(timeoutId);
          resolve(ready);
        };

        waiters.add(onReady);
        readyWaiters.set(tabId, waiters);

        timeoutId = setTimeoutImpl(() => {
          const activeWaiters = readyWaiters.get(tabId);
          if (!activeWaiters) return;

          activeWaiters.delete(onReady);
          if (activeWaiters.size === 0) {
            readyWaiters.delete(tabId);
          }

          resolve(false);
        }, timeoutMs);
      });
    },

    resolveReady(tabId, ready) {
      const waiters = readyWaiters.get(tabId);
      if (!waiters) return;

      readyWaiters.delete(tabId);
      for (const waiter of waiters) waiter(ready);
    },
  };
}

export interface PageCaptureTabTransportDeps {
  readyTracker: ContentScriptReadyTracker;
  executeScript: (tabId: number) => Promise<void>;
  sendMessageToTab: <T>(tabId: number, message: unknown) => Promise<T | null>;
  delay?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
  retryTimes?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendMessageToTabWithRetry<T>(
  tabId: number,
  message: unknown,
  deps: PageCaptureTabTransportDeps,
): Promise<T | null> {
  const retryTimes = deps.retryTimes ?? DEFAULT_RETRY_TIMES;
  const retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = deps.delay ?? delay;

  for (let attempt = 0; attempt < retryTimes; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs);
    const response = await deps.sendMessageToTab<T>(tabId, message);
    if (response !== null) return response;
  }

  return null;
}

export async function ensureTabContentScript(
  tabId: number,
  deps: PageCaptureTabTransportDeps,
): Promise<boolean> {
  const readyPromise = deps.readyTracker.waitForReady(tabId);
  try {
    await deps.executeScript(tabId);
  } catch {
    deps.readyTracker.resolveReady(tabId, false);
    return false;
  }

  return readyPromise;
}

export async function capturePageFromTab(
  tabId: number,
  deps: PageCaptureTabTransportDeps,
): Promise<PageCaptureResponse> {
  const ready = await ensureTabContentScript(tabId, deps);
  if (!ready) {
    return { ok: false, error: 'Content script initialization timed out' };
  }

  const response = await sendMessageToTabWithRetry<PageCaptureResponse>(tabId, {
    type: PAGE_CAPTURE_PAGE,
  }, deps);
  if (response) return response;

  return { ok: false, error: 'Content script did not respond after initialization' };
}

export async function capturePageFromTabForWebClip(
  tabId: number,
  deps: PageCaptureTabTransportDeps,
): Promise<WebClipCaptureResponse> {
  return toWebClipCaptureResponse(await capturePageFromTab(tabId, deps));
}

export async function forwardToTab(
  tabId: number,
  message: unknown,
  deps: PageCaptureTabTransportDeps,
): Promise<unknown> {
  const ready = await ensureTabContentScript(tabId, deps);
  if (!ready) {
    return { ok: false, error: 'Content script initialization timed out' };
  }

  const response = await sendMessageToTabWithRetry<unknown>(tabId, message, deps);
  if (response !== null) return response;

  return { ok: false, error: 'Content script did not respond' };
}

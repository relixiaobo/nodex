import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  WEBCLIP_CAPTURE_PAGE,
  CONTENT_SCRIPT_READY,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_CLICK,
  HIGHLIGHT_UNRESOLVABLE,
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_SCROLL_TO,
  HIGHLIGHT_CHECK_URL,
  HIGHLIGHT_CHECK_URL_REQUEST,
  type HighlightCheckUrlPayload,
  type HighlightCheckUrlRequestPayload,
} from '../../lib/highlight-messaging.js';

const CONTENT_SCRIPT_READY_TIMEOUT_MS = 1200;
const MESSAGE_RETRY_DELAY_MS = 150;
const MESSAGE_RETRY_TIMES = 2;

const contentScriptReadyWaiters = new Map<number, Set<(ready: boolean) => void>>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveReadyWaiters(tabId: number, ready: boolean): void {
  const waiters = contentScriptReadyWaiters.get(tabId);
  if (!waiters) return;
  contentScriptReadyWaiters.delete(tabId);
  for (const waiter of waiters) waiter(ready);
}

function waitForContentScriptReady(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    const waiters = contentScriptReadyWaiters.get(tabId) ?? new Set<(ready: boolean) => void>();
    const onReady = (ready: boolean) => {
      clearTimeout(timeoutId);
      resolve(ready);
    };

    waiters.add(onReady);
    contentScriptReadyWaiters.set(tabId, waiters);

    const timeoutId = setTimeout(() => {
      const activeWaiters = contentScriptReadyWaiters.get(tabId);
      if (!activeWaiters) return;
      activeWaiters.delete(onReady);
      if (activeWaiters.size === 0) {
        contentScriptReadyWaiters.delete(tabId);
      }
      resolve(false);
    }, CONTENT_SCRIPT_READY_TIMEOUT_MS);
  });
}

function getActiveTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const tabId = tabs[0]?.id;
      if (!tabId) {
        reject(new Error('No active tab found'));
        return;
      }

      resolve(tabId);
    });
  });
}

async function resolveTargetTabId(requestedTabId?: number): Promise<number> {
  if (requestedTabId) return requestedTabId;
  return getActiveTabId();
}

/**
 * Inject content script and wait for its explicit ready signal.
 */
async function ensureContentScript(tabId: number): Promise<boolean> {
  const readyPromise = waitForContentScriptReady(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  } catch {
    resolveReadyWaiters(tabId, false);
    return false;
  }
  return readyPromise;
}

async function sendMessageToTab<T>(tabId: number, message: unknown): Promise<T | null> {
  for (let attempt = 0; attempt < MESSAGE_RETRY_TIMES; attempt++) {
    if (attempt > 0) await delay(MESSAGE_RETRY_DELAY_MS);
    const response = await new Promise<T | null>((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (result?: T) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(result ?? null);
      });
    });
    if (response !== null) return response;
  }
  return null;
}

async function captureTabFromContentScript(tabId: number): Promise<WebClipCaptureResponse> {
  const ready = await ensureContentScript(tabId);
  if (!ready) {
    return { ok: false, error: 'Content script initialization timed out' };
  }

  const result = await sendMessageToTab<WebClipCaptureResponse>(tabId, {
    type: WEBCLIP_CAPTURE_PAGE,
  });
  if (result) return result;
  return { ok: false, error: 'Content script did not respond after initialization' };
}

/**
 * Forward a message from Side Panel to a specific tab's Content Script.
 */
async function forwardToTab(tabId: number, message: unknown): Promise<unknown> {
  const ready = await ensureContentScript(tabId);
  if (!ready) {
    return { ok: false, error: 'Content script initialization timed out' };
  }

  const result = await sendMessageToTab<unknown>(tabId, message);
  if (result !== null) return result;
  return { ok: false, error: 'Content script did not respond' };
}

/**
 * Check if a URL is valid for content script injection.
 * chrome://, edge://, about:, etc. cannot be injected.
 */
function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function forwardHighlightCheck(payload: HighlightCheckUrlPayload): void {
  chrome.runtime.sendMessage({
    type: HIGHLIGHT_CHECK_URL,
    payload,
  }).catch(() => {
    // Side Panel may not be open — silently ignore
  });
}

export default defineBackground(() => {
  // Open Side Panel when action button is clicked
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // Enable side panel to open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // ── Message Router ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;

    // ── Content Script Ready: CS -> BG ──
    if (type === CONTENT_SCRIPT_READY) {
      const tabId = sender.tab?.id;
      if (tabId) {
        resolveReadyWaiters(tabId, true);
      }
      sendResponse({ ok: true });
      return true;
    }

    // ── WebClip: Side Panel -> BG -> Content Script ──
    if (type === WEBCLIP_CAPTURE_ACTIVE_TAB) {
      (async () => {
        try {
          const tabId = await getActiveTabId();
          const result = await captureTabFromContentScript(tabId);
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error } satisfies WebClipCaptureResponse);
        }
      })();
      return true;
    }

    // ── Highlight Create: Content Script -> BG -> Side Panel ──
    // In MV3, the background intercepts CS messages. We must explicitly
    // forward to the Side Panel (another extension page) via runtime.sendMessage.
    if (type === HIGHLIGHT_CREATE) {
      const tabId = sender.tab?.id;
      // Only forward messages that originate from a content script tab.
      // This prevents background self-forward loops.
      if (!tabId) return false;
      // Forward augmented message to Side Panel and relay its response back to CS
      chrome.runtime.sendMessage(
        { ...message, _tabId: tabId },
        (spResponse) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(spResponse ?? { ok: true });
        },
      );
      return true;
    }

    // ── Highlight Click: Content Script -> BG -> Side Panel ──
    if (type === HIGHLIGHT_CLICK) {
      if (!sender.tab?.id) return false;
      chrome.runtime.sendMessage(message).catch(() => {});
      sendResponse({ ok: true });
      return true;
    }

    // ── Highlight Unresolvable: Content Script -> BG -> Side Panel ──
    if (type === HIGHLIGHT_UNRESOLVABLE) {
      if (!sender.tab?.id) return false;
      chrome.runtime.sendMessage(message).catch(() => {});
      sendResponse({ ok: true });
      return true;
    }

    // ── Highlight URL Change: Content Script -> BG -> Side Panel ──
    if (type === HIGHLIGHT_CHECK_URL_REQUEST) {
      const tabId = sender.tab?.id;
      const payload = message.payload as HighlightCheckUrlRequestPayload | undefined;
      if (!tabId || !payload?.url) {
        sendResponse({ ok: false, error: 'Invalid check-url-request payload' });
        return true;
      }
      forwardHighlightCheck({ url: payload.url, tabId });
      sendResponse({ ok: true });
      return true;
    }

    // ── Highlight Restore: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_RESTORE) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message._tabId);
          const result = await forwardToTab(tabId, {
            type: HIGHLIGHT_RESTORE,
            payload: message.payload,
          });
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }

    // ── Highlight Remove: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_REMOVE) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message._tabId);
          const result = await forwardToTab(tabId, {
            type: HIGHLIGHT_REMOVE,
            payload: message.payload,
          });
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }

    // ── Highlight Scroll To: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_SCROLL_TO) {
      (async () => {
        try {
          const tabId = await resolveTargetTabId(message._tabId);
          const result = await forwardToTab(tabId, {
            type: HIGHLIGHT_SCROLL_TO,
            payload: message.payload,
          });
          sendResponse(result);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error });
        }
      })();
      return true;
    }
  });

  // ── URL Change Listener — inject content script + trigger highlight echo check ──
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
      resolveReadyWaiters(tabId, false);
      return;
    }

    // Only react to completed navigation with a valid URL
    if (changeInfo.status !== 'complete') return;
    if (!isInjectableUrl(tab.url)) return;

    // Inject content script so selection toolbar is available immediately
    void ensureContentScript(tabId);

    // Send CHECK_URL to Side Panel so it can look up highlights for this URL
    forwardHighlightCheck({
      url: tab.url!,
      tabId,
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    resolveReadyWaiters(tabId, false);
  });
});

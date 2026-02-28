import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  WEBCLIP_CAPTURE_PAGE,
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
  type HighlightCheckUrlPayload,
} from '../../lib/highlight-messaging.js';

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

async function captureTabFromContentScript(tabId: number): Promise<WebClipCaptureResponse> {
  // Inject content script on demand (includes Defuddle library)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  } catch {
    return { ok: false, error: 'Cannot inject capture script into this page' };
  }

  // Send capture message after injection
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: WEBCLIP_CAPTURE_PAGE }, (response?: WebClipCaptureResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from content script'));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Inject content script into a tab if not already injected.
 * Returns true if injection succeeded (or was already present).
 */
async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Forward a message from Side Panel to a specific tab's Content Script.
 */
function forwardToTab(tabId: number, message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Check if a URL is valid for content script injection.
 * chrome://, edge://, about:, etc. cannot be injected.
 */
function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
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
    // The CS sends HIGHLIGHT_CREATE; we forward to Side Panel.
    // In MV3, Side Panel is a separate context reachable via runtime.sendMessage.
    // Since BG receives from CS, and Side Panel also listens on runtime.onMessage,
    // we just need the Side Panel to listen for this type directly.
    // The message already goes through runtime, so no extra routing needed here.
    // But we do need to note the sender tab ID for the Side Panel to respond back.
    if (type === HIGHLIGHT_CREATE) {
      // Augment payload with tab info so Side Panel knows which tab to respond to
      const tabId = sender.tab?.id;
      const augmented = { ...message, _tabId: tabId };
      // Forward to all extension pages (Side Panel will pick it up)
      // Side Panel listens on chrome.runtime.onMessage directly
      // Since CS -> runtime already reaches SP, we just pass through
      sendResponse({ ok: true, received: true });
      return true;
    }

    // ── Highlight Click: Content Script -> Side Panel ──
    if (type === HIGHLIGHT_CLICK) {
      // Same pattern — CS message already reaches SP via runtime
      sendResponse({ ok: true });
      return true;
    }

    // ── Highlight Unresolvable: Content Script -> Side Panel ──
    if (type === HIGHLIGHT_UNRESOLVABLE) {
      sendResponse({ ok: true });
      return true;
    }

    // ── Highlight Restore: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_RESTORE) {
      const tabId = message._tabId;
      if (!tabId) {
        sendResponse({ ok: false, error: 'No tab ID specified' });
        return true;
      }
      (async () => {
        await ensureContentScript(tabId);
        const result = await forwardToTab(tabId, {
          type: HIGHLIGHT_RESTORE,
          payload: message.payload,
        });
        sendResponse(result);
      })();
      return true;
    }

    // ── Highlight Remove: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_REMOVE) {
      const tabId = message._tabId;
      if (!tabId) {
        sendResponse({ ok: false, error: 'No tab ID specified' });
        return true;
      }
      (async () => {
        const result = await forwardToTab(tabId, {
          type: HIGHLIGHT_REMOVE,
          payload: message.payload,
        });
        sendResponse(result);
      })();
      return true;
    }

    // ── Highlight Scroll To: Side Panel -> BG -> Content Script ──
    if (type === HIGHLIGHT_SCROLL_TO) {
      const tabId = message._tabId;
      if (!tabId) {
        sendResponse({ ok: false, error: 'No tab ID specified' });
        return true;
      }
      (async () => {
        const result = await forwardToTab(tabId, {
          type: HIGHLIGHT_SCROLL_TO,
          payload: message.payload,
        });
        sendResponse(result);
      })();
      return true;
    }
  });

  // ── URL Change Listener — trigger highlight echo check ──
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only react to completed navigation with a valid URL
    if (changeInfo.status !== 'complete') return;
    if (!isInjectableUrl(tab.url)) return;

    // Send CHECK_URL to Side Panel so it can look up highlights for this URL
    const payload: HighlightCheckUrlPayload = {
      url: tab.url!,
      tabId,
    };

    chrome.runtime.sendMessage({
      type: HIGHLIGHT_CHECK_URL,
      payload,
    }).catch(() => {
      // Side Panel may not be open — silently ignore
    });
  });
});

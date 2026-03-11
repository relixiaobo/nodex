import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  WEBCLIP_CAPTURE_PAGE,
  CONTENT_SCRIPT_READY,
  X_VIDEO_FETCH_URL,
  type WebClipCaptureResponse,
  type XVideoFetchPayload,
  type XVideoFetchResponse,
} from '../../lib/webclip-messaging.js';
import {
  HIGHLIGHT_CREATE,
  HIGHLIGHT_DELETE,
  HIGHLIGHT_NOTES_SAVE,
  HIGHLIGHT_NOTE_GET,
  HIGHLIGHT_UNRESOLVABLE,
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_SCROLL_TO,
  HIGHLIGHT_CHECK_URL,
  HIGHLIGHT_CHECK_URL_REQUEST,
  type HighlightCreatePayload,
  type HighlightCheckUrlPayload,
  type HighlightCheckUrlRequestPayload,
  type HighlightDeletePayload,
  type HighlightNotesSavePayload,
  type HighlightNoteGetPayload,
  type HighlightRestorePayload,
} from '../../lib/highlight-messaging.js';
import {
  enqueuePendingHighlight,
  removePendingHighlight,
  findPendingHighlight,
  updatePendingHighlightNotes,
  getPendingHighlightsForUrl,
} from '../../lib/highlight-pending-queue.js';

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

/**
 * Check if the Side Panel is currently open.
 * Uses chrome.runtime.getContexts (MV3) to detect SIDE_PANEL contexts.
 */
async function isSidePanelOpen(): Promise<boolean> {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

/** Whether an ID is a pending-queue temp ID (not a real node ID). */
function isTempId(id: string): boolean {
  return id.startsWith('temp_');
}

/**
 * Forward a message to the Side Panel via runtime.sendMessage.
 * Resolves with the SP's response, or rejects if SP is unreachable.
 */
function forwardToSidePanel(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function forwardHighlightCheck(payload: HighlightCheckUrlPayload): Promise<void> {
  const spOpen = await isSidePanelOpen();

  if (spOpen) {
    // Online: forward to SP for LoroDoc lookup + restore
    chrome.runtime.sendMessage({
      type: HIGHLIGHT_CHECK_URL,
      payload,
    }).catch(() => {});
    return;
  }

  // Offline: restore from pending queue
  const pending = await getPendingHighlightsForUrl(payload.url);
  if (pending.length === 0) return;

  const restorePayload: HighlightRestorePayload = {
    highlights: pending.map((e) => ({
      id: e.tempId,
      anchor: e.anchor,
      color: '#9B7C38',
      hasNote: !!(e.noteEntries && e.noteEntries.length > 0),
    })),
  };

  await forwardToTab(payload.tabId, {
    type: HIGHLIGHT_RESTORE,
    payload: restorePayload,
  });
}

/**
 * Generate syndication token for x.com tweet.
 * Formula from Vercel's react-tweet library.
 */
function generateSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

/**
 * Fetch direct mp4 URL for an x.com video tweet via the Syndication API.
 */
async function fetchXVideoUrl(tweetId: string): Promise<XVideoFetchResponse> {
  const token = generateSyndicationToken(tweetId);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`;

  const res = await fetch(url);
  if (!res.ok) return {};

  const data = await res.json();

  // Find the highest-bitrate mp4 variant
  const mediaDetails = data?.mediaDetails;
  if (!Array.isArray(mediaDetails)) return {};

  for (const media of mediaDetails) {
    if (media.type !== 'video' && media.type !== 'animated_gif') continue;
    const variants = media.video_info?.variants;
    if (!Array.isArray(variants)) continue;

    let bestMp4: { url: string; bitrate: number } | undefined;
    for (const v of variants) {
      if (v.content_type !== 'video/mp4') continue;
      const bitrate = v.bitrate ?? 0;
      if (!bestMp4 || bitrate > bestMp4.bitrate) {
        bestMp4 = { url: v.url, bitrate };
      }
    }

    if (bestMp4) {
      return {
        mp4Url: bestMp4.url,
        posterUrl: media.media_url_https,
      };
    }
  }

  return {};
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

    // ── X Video URL Fetch: Content Script -> BG ──
    if (type === X_VIDEO_FETCH_URL) {
      const payload = message.payload as XVideoFetchPayload | undefined;
      if (!payload?.tweetId) {
        sendResponse({} as XVideoFetchResponse);
        return true;
      }
      fetchXVideoUrl(payload.tweetId).then((result) => {
        sendResponse(result);
      }).catch(() => {
        sendResponse({} as XVideoFetchResponse);
      });
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

    // ── Highlight Create: Content Script -> BG -> Side Panel (with offline queue) ──
    if (type === HIGHLIGHT_CREATE) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;

      (async () => {
        const spOpen = await isSidePanelOpen();

        if (spOpen) {
          try {
            const spResponse = await forwardToSidePanel({ ...message, _tabId: tabId });
            sendResponse(spResponse ?? { ok: true });
            return;
          } catch {
            // SP disappeared mid-forward — fall through to queue
          }
        }

        // Offline or forward failed → enqueue
        const payload = message.payload as HighlightCreatePayload | undefined;
        if (!payload) {
          sendResponse({ ok: false, error: 'Missing highlight payload' });
          return;
        }

        await enqueuePendingHighlight({
          tempId: payload.tempId ?? `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          anchor: payload.anchor,
          selectedText: payload.selectedText,
          pageUrl: payload.pageUrl,
          pageTitle: payload.pageTitle,
          noteEntries: payload.noteEntries,
          pageMeta: payload.pageMeta,
        });

        sendResponse({ ok: true, queued: true });
      })();
      return true;
    }

    // ── Highlight Delete: CS -> BG (tempId → storage, else → SP) ──
    if (type === HIGHLIGHT_DELETE) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;
      const payload = message.payload as HighlightDeletePayload | undefined;
      if (payload?.id && isTempId(payload.id)) {
        removePendingHighlight(payload.id).then(() => {
          sendResponse({ ok: true, deleted: true });
        });
        return true;
      }
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

    // ── Highlight Note Get: CS -> BG (tempId → storage, else → SP) ──
    if (type === HIGHLIGHT_NOTE_GET) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;
      const payload = message.payload as HighlightNoteGetPayload | undefined;
      if (payload?.id && isTempId(payload.id)) {
        findPendingHighlight(payload.id).then((entry) => {
          sendResponse({ ok: true, noteEntries: entry?.noteEntries ?? [] });
        });
        return true;
      }
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

    // ── Highlight Notes Save: CS -> BG (tempId → storage, else → SP) ──
    if (type === HIGHLIGHT_NOTES_SAVE) {
      const tabId = sender.tab?.id;
      if (!tabId) return false;
      const payload = message.payload as HighlightNotesSavePayload | undefined;
      if (payload?.id && isTempId(payload.id)) {
        updatePendingHighlightNotes(payload.id, payload.noteEntries).then(() => {
          sendResponse({ ok: true });
        });
        return true;
      }
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
      forwardHighlightCheck({ url: payload.url, tabId }).then(() => {
        sendResponse({ ok: true });
      });
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

    // Send CHECK_URL to Side Panel (or restore from pending queue if offline)
    void forwardHighlightCheck({
      url: tab.url!,
      tabId,
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    resolveReadyWaiters(tabId, false);
  });
});

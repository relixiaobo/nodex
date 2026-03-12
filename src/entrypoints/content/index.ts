import {
  CONTENT_SCRIPT_READY,
  PAGE_CAPTURE_PAGE,
  captureCurrentPageResult,
  fetchXVideoMetadataViaBackground,
} from '../../lib/page-capture/index.js';
import {
  WEBCLIP_CAPTURE_PAGE,
  toWebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';
import {
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_SCROLL_TO,
  type HighlightRestorePayload,
  type HighlightRemovePayload,
  type HighlightScrollToPayload,
} from '../../lib/highlight-messaging.js';
import {
  BROWSER_FIND,
  BROWSER_GET_SELECTION,
} from '../../lib/ai-tools/browser-messaging.js';
import { initHighlight, removeHighlightRendering, scrollToHighlight } from './highlight.js';
import { restoreHighlights } from './highlight-restore.js';

function notifyContentScriptReady(): void {
  chrome.runtime.sendMessage({ type: CONTENT_SCRIPT_READY }).catch(() => {});
}

function handlePageCapture(
  legacyWebClip: boolean,
  sendResponse: (response: unknown) => void,
): void {
  captureCurrentPageResult({
    window,
    document,
    location,
    services: {
      fetchXVideoMetadata: fetchXVideoMetadataViaBackground,
    },
  }).then((result) => {
    sendResponse(legacyWebClip ? toWebClipCaptureResponse(result) : result);
  });
}

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  registration: 'runtime',
  runAt: 'document_idle',

  main() {
    const extensionId = chrome.runtime?.id;
    if ((globalThis as { __nodexCaptureExtId?: string }).__nodexCaptureExtId === extensionId) {
      notifyContentScriptReady();
      return;
    }

    chrome.storage.local.get(['soma-settings', 'nodex-ui']).then((stored) => {
      const settings = stored?.['soma-settings'];
      const highlightEnabled = settings
        ? (settings.highlightEnabled ?? true)
        : (stored?.['nodex-ui']?.state?.highlightEnabled ?? true);

      if (!highlightEnabled) return;
      try {
        initHighlight();
      } catch {
        // Highlight can fail on hostile pages, but capture must still work.
      }
    }).catch(() => {
      try {
        initHighlight();
      } catch {
        // Highlight can fail on hostile pages, but capture must still work.
      }
    });

    (globalThis as { __nodexCaptureExtId?: string }).__nodexCaptureExtId = extensionId;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === PAGE_CAPTURE_PAGE) {
        handlePageCapture(false, sendResponse);
        return true;
      }

      if (message?.type === WEBCLIP_CAPTURE_PAGE) {
        handlePageCapture(true, sendResponse);
        return true;
      }

      if (message?.type === HIGHLIGHT_RESTORE) {
        restoreHighlights(message.payload as HighlightRestorePayload);
        sendResponse({ ok: true });
        return true;
      }

      if (message?.type === HIGHLIGHT_REMOVE) {
        removeHighlightRendering((message.payload as HighlightRemovePayload).id);
        sendResponse({ ok: true });
        return true;
      }

      if (message?.type === HIGHLIGHT_SCROLL_TO) {
        scrollToHighlight((message.payload as HighlightScrollToPayload).id);
        sendResponse({ ok: true });
        return true;
      }

      if (message?.type === BROWSER_FIND) {
        const query: string = message?.payload?.query ?? '';
        if (!query.trim()) {
          sendResponse({ matches: [], total: 0 });
          return true;
        }

        const bodyText = document.body?.innerText ?? '';
        const lowerText = bodyText.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matches: Array<{ excerpt: string; index: number }> = [];
        let searchFrom = 0;

        while (matches.length < 20) {
          const idx = lowerText.indexOf(lowerQuery, searchFrom);
          if (idx === -1) break;

          const start = Math.max(0, idx - 50);
          const end = Math.min(bodyText.length, idx + query.length + 50);
          matches.push({ excerpt: bodyText.slice(start, end), index: idx });
          searchFrom = idx + 1;
        }

        sendResponse({ matches, total: matches.length });
        return true;
      }

      if (message?.type === BROWSER_GET_SELECTION) {
        const selText = window.getSelection()?.toString() ?? '';
        sendResponse({ text: selText, hasSelection: selText.length > 0 });
        return true;
      }

      return false;
    });

    notifyContentScriptReady();
  },
});

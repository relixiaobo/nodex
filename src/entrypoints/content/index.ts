import Defuddle from 'defuddle';
import {
  WEBCLIP_CAPTURE_PAGE,
  type WebClipCapturePayload,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';
import {
  HIGHLIGHT_RESTORE,
  HIGHLIGHT_REMOVE,
  HIGHLIGHT_SCROLL_TO,
  type HighlightRestorePayload,
  type HighlightRemovePayload,
  type HighlightScrollToPayload,
} from '../../lib/highlight-messaging.js';
import { initHighlight, removeHighlightRendering, scrollToHighlight } from './highlight.js';
import { restoreHighlights } from './highlight-restore.js';

function captureCurrentPage(): WebClipCapturePayload {
  const url = location.href;
  const selectionText = window.getSelection()?.toString() ?? '';
  const extracted = new Defuddle(document, {
    url,
    markdown: false,
    separateMarkdown: false,
  }).parse();
  const title = extracted.title?.trim() || document.title?.trim() || location.hostname;
  const pageText = extracted.content ?? '';
  if (!pageText) {
    throw new Error('Defuddle returned empty content');
  }

  return {
    url,
    title,
    selectionText,
    pageText,
    capturedAt: Date.now(),
    author: extracted.author ?? undefined,
    published: extracted.published ?? undefined,
    description: extracted.description ?? undefined,
    siteName: extracted.site ?? undefined,
  };
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_idle',

  main() {
    // Guard: prevent duplicate listener when executeScript runs multiple times
    if ((globalThis as any).__nodexCaptureInstalled) return;
    (globalThis as any).__nodexCaptureInstalled = true;

    // Initialize highlight selection listener and custom elements
    initHighlight();

    // Message listener for both webclip capture and highlight commands
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // ── WebClip Capture ──
      if (message?.type === WEBCLIP_CAPTURE_PAGE) {
        try {
          const payload = captureCurrentPage();
          const response: WebClipCaptureResponse = { ok: true, payload };
          sendResponse(response);
        } catch (err) {
          const response: WebClipCaptureResponse = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
          sendResponse(response);
        }
        return true;
      }

      // ── Highlight Restore (Side Panel -> Content Script) ──
      if (message?.type === HIGHLIGHT_RESTORE) {
        const payload = message.payload as HighlightRestorePayload;
        restoreHighlights(payload);
        sendResponse({ ok: true });
        return true;
      }

      // ── Highlight Remove (Side Panel -> Content Script) ──
      if (message?.type === HIGHLIGHT_REMOVE) {
        const payload = message.payload as HighlightRemovePayload;
        removeHighlightRendering(payload.id);
        sendResponse({ ok: true });
        return true;
      }

      // ── Highlight Scroll To (Side Panel -> Content Script) ──
      if (message?.type === HIGHLIGHT_SCROLL_TO) {
        const payload = message.payload as HighlightScrollToPayload;
        scrollToHighlight(payload.id);
        sendResponse({ ok: true });
        return true;
      }
    });
  },
});

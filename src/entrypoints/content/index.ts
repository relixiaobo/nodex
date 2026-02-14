import {
  WEBCLIP_CAPTURE_PAGE,
  type WebClipCapturePayload,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';

const MAX_CAPTURE_TEXT_CHARS = 50_000;

function normalizeText(input: string): string {
  return input
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function captureCurrentPage(): WebClipCapturePayload {
  const title = document.title?.trim() || location.hostname;
  const url = location.href;
  const selectionText = normalizeText(window.getSelection()?.toString() ?? '');
  const rawPageText = document.body?.innerText ?? '';
  const pageText = normalizeText(rawPageText).slice(0, MAX_CAPTURE_TEXT_CHARS);

  return {
    url,
    title,
    selectionText,
    pageText,
    capturedAt: Date.now(),
  };
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== WEBCLIP_CAPTURE_PAGE) return;

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
    });
  },
});

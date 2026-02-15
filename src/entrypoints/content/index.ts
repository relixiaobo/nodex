import Defuddle from 'defuddle';
import {
  WEBCLIP_CAPTURE_PAGE,
  type WebClipCapturePayload,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';

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

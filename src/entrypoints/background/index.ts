import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  WEBCLIP_CAPTURE_PAGE,
  type WebClipCaptureResponse,
} from '../../lib/webclip-messaging.js';

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

export default defineBackground(() => {
  // Open Side Panel when action button is clicked
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // Enable side panel to open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Minimal web clip capture bridge: Side Panel -> Background -> Content Script
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== WEBCLIP_CAPTURE_ACTIVE_TAB) return;

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
  });
});

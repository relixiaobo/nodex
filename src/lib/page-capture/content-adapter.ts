import {
  PAGE_CAPTURE_FETCH_X_VIDEO,
  type PageCaptureXVideoPayload,
  type PageCaptureXVideoResponse,
} from './messaging.js';

export function fetchXVideoMetadataViaBackground(tweetId: string): Promise<PageCaptureXVideoResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: PAGE_CAPTURE_FETCH_X_VIDEO,
        payload: { tweetId } satisfies PageCaptureXVideoPayload,
      },
      (response?: PageCaptureXVideoResponse) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }

        resolve(response ?? {});
      },
    );
  });
}

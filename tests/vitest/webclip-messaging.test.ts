import { describe, it, expect } from 'vitest';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  WEBCLIP_CAPTURE_PAGE,
  CONTENT_SCRIPT_READY,
  X_VIDEO_FETCH_URL,
  type WebClipCaptureResponse,
  type XVideoFetchPayload,
  type XVideoFetchResponse,
} from '../../src/lib/webclip-messaging.js';

describe('webclip-messaging', () => {
  it('defines stable message constants', () => {
    expect(WEBCLIP_CAPTURE_ACTIVE_TAB).toBe('webclip:capture-active-tab');
    expect(WEBCLIP_CAPTURE_PAGE).toBe('webclip:capture-page');
    expect(CONTENT_SCRIPT_READY).toBe('content-script:ready');
    expect(X_VIDEO_FETCH_URL).toBe('x-video:fetch-url');
  });

  it('WebClipCaptureResponse supports success payload', () => {
    const response: WebClipCaptureResponse = {
      ok: true,
      payload: {
        url: 'https://example.com',
        title: 'Example',
        selectionText: '',
        pageText: '<p>Example</p>',
        capturedAt: Date.now(),
      },
    };

    expect(response.ok).toBe(true);
    expect(response.payload.url).toBe('https://example.com');
  });

  it('XVideoFetchPayload and XVideoFetchResponse types', () => {
    const payload: XVideoFetchPayload = { tweetId: '1234567890123456789' };
    expect(payload.tweetId).toBe('1234567890123456789');

    const responseWithUrl: XVideoFetchResponse = {
      mp4Url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/abc.mp4',
      posterUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/abc.jpg',
    };
    expect(responseWithUrl.mp4Url).toContain('video.twimg.com');
    expect(responseWithUrl.posterUrl).toContain('pbs.twimg.com');

    const emptyResponse: XVideoFetchResponse = {};
    expect(emptyResponse.mp4Url).toBeUndefined();
    expect(emptyResponse.posterUrl).toBeUndefined();
  });
});

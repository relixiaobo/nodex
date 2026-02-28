import { describe, it, expect } from 'vitest';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  WEBCLIP_CAPTURE_PAGE,
  CONTENT_SCRIPT_READY,
  type WebClipCaptureResponse,
} from '../../src/lib/webclip-messaging.js';

describe('webclip-messaging', () => {
  it('defines stable message constants', () => {
    expect(WEBCLIP_CAPTURE_ACTIVE_TAB).toBe('webclip:capture-active-tab');
    expect(WEBCLIP_CAPTURE_PAGE).toBe('webclip:capture-page');
    expect(CONTENT_SCRIPT_READY).toBe('content-script:ready');
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
});

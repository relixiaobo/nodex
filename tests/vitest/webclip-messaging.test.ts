import { describe, it, expect } from 'vitest';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  WEBCLIP_CAPTURE_PAGE,
  CONTENT_SCRIPT_READY,
  X_VIDEO_FETCH_URL,
  toWebClipCapturePayload,
  toWebClipCaptureResponse,
  type WebClipCaptureResponse,
  type XVideoFetchPayload,
  type XVideoFetchResponse,
} from '../../src/lib/webclip-messaging.js';
import type { CapturedPage } from '../../src/lib/page-capture/models.js';

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

  it('maps neutral CapturedPage data into the legacy flat webclip payload', () => {
    const page: CapturedPage = {
      url: 'https://x.com/user/status/123',
      title: 'Thread by @user',
      selectionText: 'selection',
      contentHtml: '<p>Hello</p>',
      capturedAt: 123,
      metadata: {
        author: '@user',
        published: '2026-03-11',
        description: 'hello',
        siteName: 'X',
        duration: 'PT45S',
        extractorType: 'twitter',
        ogType: 'article',
        schemaOrgType: 'SocialMediaPosting',
        hasArticleElement: false,
      },
      siteHints: {
        site: 'x',
        contentKind: 'article',
      },
    };

    expect(toWebClipCapturePayload(page)).toEqual({
      url: 'https://x.com/user/status/123',
      title: 'Thread by @user',
      selectionText: 'selection',
      pageText: '<p>Hello</p>',
      capturedAt: 123,
      author: '@user',
      published: '2026-03-11',
      description: 'hello',
      siteName: 'X',
      duration: 'PT45S',
      extractorType: 'twitter',
      ogType: 'article',
      schemaOrgType: 'SocialMediaPosting',
      hasArticleElement: false,
      isXArticle: true,
    });
  });

  it('adapts neutral capture results back into WebClipCaptureResponse', () => {
    const response = toWebClipCaptureResponse({
      ok: true,
      page: {
        url: 'https://example.com',
        title: 'Example',
        selectionText: '',
        contentHtml: '<p>Example</p>',
        capturedAt: 999,
        metadata: {},
        siteHints: { site: 'generic' },
      },
    });

    expect(response).toEqual({
      ok: true,
      payload: {
        url: 'https://example.com',
        title: 'Example',
        selectionText: '',
        pageText: '<p>Example</p>',
        capturedAt: 999,
        author: undefined,
        published: undefined,
        description: undefined,
        siteName: undefined,
        duration: undefined,
        extractorType: undefined,
        ogType: undefined,
        schemaOrgType: undefined,
        hasArticleElement: undefined,
        isXArticle: false,
      },
    });
  });

  it('passes through capture errors when adapting into WebClipCaptureResponse', () => {
    expect(toWebClipCaptureResponse({
      ok: false,
      error: 'capture exploded',
    })).toEqual({
      ok: false,
      error: 'capture exploded',
    });
  });
});

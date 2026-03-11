import { describe, expect, it, vi } from 'vitest';
import {
  capturePageFromTab,
  capturePageFromTabForWebClip,
  forwardToTab,
  sendMessageToTabWithRetry,
  type ContentScriptReadyTracker,
  type PageCaptureTabTransportDeps,
} from '../../src/lib/page-capture/background-transport.js';
import { PAGE_CAPTURE_PAGE } from '../../src/lib/page-capture/messaging.js';
import type { CapturedPage } from '../../src/lib/page-capture/models.js';

function createTracker(ready = true): ContentScriptReadyTracker {
  return {
    waitForReady: vi.fn().mockResolvedValue(ready),
    resolveReady: vi.fn(),
  };
}

function createPage(): CapturedPage {
  return {
    url: 'https://example.com',
    title: 'Example',
    selectionText: '',
    contentHtml: '<p>Example</p>',
    capturedAt: 123,
    metadata: {
      author: 'Author',
      extractorType: 'article',
    },
    siteHints: {
      site: 'generic',
    },
  };
}

function createDeps(overrides: Partial<PageCaptureTabTransportDeps> = {}): PageCaptureTabTransportDeps {
  return {
    readyTracker: createTracker(),
    executeScript: vi.fn().mockResolvedValue(undefined),
    sendMessageToTab: vi.fn().mockResolvedValue(null),
    delay: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('page-capture background transport', () => {
  it('captures a tab via the neutral page-capture message', async () => {
    const page = createPage();
    const deps = createDeps({
      sendMessageToTab: vi.fn().mockResolvedValue({ ok: true, page }),
    });

    const result = await capturePageFromTab(7, deps);

    expect(deps.executeScript).toHaveBeenCalledWith(7);
    expect(deps.sendMessageToTab).toHaveBeenCalledWith(7, { type: PAGE_CAPTURE_PAGE });
    expect(result).toEqual({ ok: true, page });
  });

  it('maps neutral capture results back to the legacy webclip payload', async () => {
    const deps = createDeps({
      sendMessageToTab: vi.fn().mockResolvedValue({ ok: true, page: createPage() }),
    });

    const result = await capturePageFromTabForWebClip(3, deps);

    expect(result).toEqual({
      ok: true,
      payload: {
        url: 'https://example.com',
        title: 'Example',
        selectionText: '',
        pageText: '<p>Example</p>',
        capturedAt: 123,
        author: 'Author',
        published: undefined,
        description: undefined,
        siteName: undefined,
        duration: undefined,
        extractorType: 'article',
        ogType: undefined,
        schemaOrgType: undefined,
        hasArticleElement: undefined,
        isXArticle: false,
      },
    });
  });

  it('retries tab messaging before giving up', async () => {
    const deps = createDeps({
      sendMessageToTab: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ok: true }),
    });

    const result = await sendMessageToTabWithRetry(9, { type: 'ping' }, deps);

    expect(deps.sendMessageToTab).toHaveBeenCalledTimes(2);
    expect(deps.delay).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
  });

  it('returns a timeout error when forwarding before the content script is ready', async () => {
    const deps = createDeps({
      readyTracker: createTracker(false),
    });

    const result = await forwardToTab(4, { type: 'ping' }, deps);

    expect(result).toEqual({ ok: false, error: 'Content script initialization timed out' });
    expect(deps.sendMessageToTab).not.toHaveBeenCalled();
  });
});

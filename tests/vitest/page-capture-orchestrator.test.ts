import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureCurrentPage, captureCurrentPageResult } from '../../src/lib/page-capture/orchestrator.js';
import type { DefuddlePageData, PageCaptureContext } from '../../src/lib/page-capture/models.js';

function setPage(
  options: {
    title?: string;
    head?: string;
    body?: string;
  } = {},
): void {
  document.head.innerHTML = `<title>${options.title ?? 'Page'}</title>${options.head ?? ''}`;
  document.body.innerHTML = options.body ?? '';
}

function createContext(url: string, overrides: Partial<NonNullable<PageCaptureContext['services']>> & {
  defuddleParse?: PageCaptureContext['services']['defuddleParse'];
} = {}): PageCaptureContext {
  return {
    window,
    document,
    location: new URL(url) as unknown as Location,
    services: {
      now: () => 123456789,
      ...overrides,
    },
  };
}

function captureWithBaseline(
  url: string,
  baseline: DefuddlePageData,
  services: Partial<NonNullable<PageCaptureContext['services']>> = {},
) {
  return captureCurrentPage(createContext(url, {
    defuddleParse: () => baseline,
    ...services,
  }));
}

describe('page-capture orchestrator', () => {
  beforeEach(() => {
    setPage();
  });

  it('builds a neutral CapturedPage result for generic pages', async () => {
    setPage({
      title: 'Example article',
      head: '<meta property="og:type" content="article">',
      body: '<article><p>Hello</p></article>',
    });

    const page = await captureWithBaseline('https://example.com/articles/hello', {
      title: 'Example article',
      content: '<p>Hello</p>',
      description: 'Summary',
      author: 'A. Writer',
      published: '2026-03-11',
      site: 'Example',
      extractorType: 'article',
      schemaOrgData: { '@type': 'Article' },
    });

    expect(page).toEqual({
      url: 'https://example.com/articles/hello',
      title: 'Example article',
      selectionText: '',
      contentHtml: '<p>Hello</p>',
      capturedAt: 123456789,
      metadata: {
        author: 'A. Writer',
        published: '2026-03-11',
        description: 'Summary',
        siteName: 'Example',
        duration: undefined,
        extractorType: 'article',
        ogType: 'article',
        schemaOrgType: 'Article',
        hasArticleElement: true,
      },
      siteHints: {
        site: 'generic',
      },
    });
  });

  it('uses x.com thread extraction for title, description, replies, and media', async () => {
    setPage({
      title: 'Thread by @author on X',
      body: `
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/author">author</a></div>
          <div data-testid="tweetText">Hello <div style="display:inline-flex"><a href="/friend">@friend</a></div><br>world</div>
          <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/1.jpg" alt="photo"></div>
        </article>
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/replyguy">replyguy</a></div>
          <div data-testid="tweetText">Reply text</div>
        </article>
      `,
    });

    const page = await captureWithBaseline('https://x.com/author/status/123', {
      title: 'Thread by @author on X',
      content: '<p>broken defuddle</p>',
      description: 'Thread by @author',
      author: undefined,
      extractorType: 'twitter',
    });

    expect(page.title).toBe('@author: Hello @friend\nworld');
    expect(page.metadata.description).toBe('Hello @friend\nworld');
    expect(page.metadata.author).toBe('@author');
    expect(page.contentHtml).toContain('<p>Hello <a href="/friend">@friend</a></p>');
    expect(page.contentHtml).toContain('<h2>Replies</h2>');
    expect(page.contentHtml).toContain('<img src="https://pbs.twimg.com/media/1.jpg" alt="photo">');
    expect(page.siteHints).toEqual({ site: 'x', contentKind: 'social' });
  });

  it('uses x.com profile extraction when the page is a profile', async () => {
    setPage({
      title: 'Chris on X',
      body: `
        <div data-testid="UserName">
          <div dir="ltr">Chris Olah</div>
          <div dir="ltr">@ch402</div>
        </div>
        <div data-testid="UserDescription">Interpretability researcher</div>
        <div data-testid="UserLocation">San Francisco</div>
        <div data-testid="UserJoinDate">Joined 2017</div>
        <a href="/ch402/following">120 Following</a>
        <a href="/ch402/followers">90K Followers</a>
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/ch402">ch402</a></div>
          <div data-testid="tweetText">Latest post about transformers</div>
          <a href="/ch402/status/1"><time datetime="2026-03-13T10:00:00.000Z">10h</time></a>
        </article>
        <article data-testid="tweet">
          <span data-testid="socialContext">ch402 reposted</span>
          <div data-testid="User-Name"><a href="/someone">someone</a></div>
          <div data-testid="tweetText">Reposted content</div>
          <a href="/someone/status/2"><time datetime="2026-03-13T08:00:00.000Z">12h</time></a>
        </article>
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/ch402">ch402</a></div>
          <div data-testid="tweetText">Earlier post about circuits</div>
        </article>
      `,
    });

    const page = await captureWithBaseline('https://x.com/ch402', {
      title: 'Chris on X',
      content: '<p>timeline</p>',
      description: 'ignored',
      extractorType: 'twitter',
    });

    expect(page.title).toBe('Chris Olah');
    expect(page.metadata.author).toBe('@ch402');
    expect(page.metadata.description).toBe('Interpretability researcher');
    expect(page.contentHtml).toContain('<p>Interpretability researcher</p>');
    expect(page.contentHtml).toContain('<li>San Francisco</li>');
    expect(page.contentHtml).toContain('<li>90K Followers</li>');
    expect(page.contentHtml).toContain('<h2>Posts</h2>');
    // Each tweet includes author and timestamp
    expect(page.contentHtml).toContain('<b>@ch402</b>');
    expect(page.contentHtml).toContain('datetime="2026-03-13T10:00:00.000Z"');
    expect(page.contentHtml).toContain('Latest post about transformers');
    // Reposted tweet shows social context
    expect(page.contentHtml).toContain('<em>ch402 reposted</em>');
    expect(page.contentHtml).toContain('<b>@someone</b>');
    expect(page.contentHtml).toContain('Reposted content');
    expect(page.contentHtml).toContain('Earlier post about circuits');
    expect(page.siteHints).toEqual({ site: 'x', contentKind: 'profile' });
  });

  it('uses x.com article extraction when the rich text article view is present', async () => {
    setPage({
      title: 'Thread by @ch402 on X',
      body: `
        <div data-testid="twitterArticleRichTextView">
          <h1>Thinking in public</h1>
          <p>Long-form article body</p>
        </div>
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/ch402">ch402</a></div>
        </article>
      `,
    });

    const page = await captureWithBaseline('https://x.com/ch402/status/456', {
      title: 'Thread by @ch402 on X',
      content: '<p>broken</p>',
      extractorType: 'twitter',
    });

    expect(page.title).toBe('Thinking in public');
    expect(page.contentHtml).toContain('<h1>Thinking in public</h1>');
    expect(page.metadata.author).toBe('@ch402');
    expect(page.siteHints).toEqual({ site: 'x', contentKind: 'article' });
  });

  it('extracts quote tweet content within a tweet', async () => {
    setPage({
      title: 'Thread by @alice on X',
      body: `
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/alice">alice</a></div>
          <div data-testid="tweetText">Check this out</div>
          <div class="quoted-tweet-card">
            <div data-testid="User-Name"><a href="/bob">bob</a></div>
            <div data-testid="tweetText">Original insight about AI safety</div>
          </div>
        </article>
      `,
    });

    const page = await captureWithBaseline('https://x.com/alice/status/789', {
      title: 'Thread by @alice on X',
      content: '<p>broken</p>',
      extractorType: 'twitter',
    });

    expect(page.contentHtml).toContain('Check this out');
    expect(page.contentHtml).toContain('<blockquote>');
    expect(page.contentHtml).toContain('<b>@bob</b>');
    expect(page.contentHtml).toContain('Original insight about AI safety');
  });

  it('shows pinned and repost indicators on x.com profile timeline', async () => {
    setPage({
      title: 'Test on X',
      body: `
        <div data-testid="UserName">
          <div dir="ltr">Test User</div>
          <div dir="ltr">@test</div>
        </div>
        <div data-testid="UserDescription">Bio</div>
        <article data-testid="tweet">
          <span data-testid="socialContext">Pinned</span>
          <div data-testid="User-Name"><a href="/test">test</a></div>
          <div data-testid="tweetText">My pinned tweet</div>
        </article>
      `,
    });

    const page = await captureWithBaseline('https://x.com/test', {
      title: 'Test on X',
      content: '<p>timeline</p>',
      extractorType: 'twitter',
    });

    expect(page.contentHtml).toContain('<em>Pinned</em>');
    expect(page.contentHtml).toContain('My pinned tweet');
    expect(page.siteHints).toEqual({ site: 'x', contentKind: 'profile' });
  });

  it('uses Google Docs export HTML and nests flat list levels', async () => {
    setPage({
      title: 'Research Notes - Google Docs',
    });

    const fetchImpl = vi.fn(async () => new Response(`
      <html>
        <body>
          <p>Intro</p>
          <ol class="lst-kix_abc-0"><li>Top</li></ol>
          <ol class="lst-kix_abc-1"><li>Nested</li></ol>
        </body>
      </html>
    `, { status: 200 }));

    const page = await captureWithBaseline('https://docs.google.com/document/d/doc123/edit', {
      title: 'Broken GDocs',
      content: '<p>fallback</p>',
      description: 'stale description',
    }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(page.title).toBe('Research Notes');
    expect(page.metadata.description).toBeUndefined();
    expect(page.contentHtml).toContain('<p>Intro</p>');
    expect(page.contentHtml).toContain('<ol>');
    expect(page.contentHtml).toContain('<li>Top');
    expect(page.contentHtml).toContain('<li>Nested</li>');
    expect(page.siteHints).toEqual({ site: 'google-docs', contentKind: 'document' });
  });

  it('uses GitHub markdown-body instead of defuddle full-page extraction', async () => {
    setPage({
      title: 'nodex',
      body: `
        <div class="app-shell">nav</div>
        <article class="markdown-body"><h1>README</h1><p>Focused content</p></article>
      `,
    });

    const page = await captureWithBaseline('https://github.com/relixiaobo/nodex', {
      title: 'nodex',
      content: '<p>huge nav dump</p>',
    });

    expect(page.contentHtml).toBe('<h1>README</h1><p>Focused content</p>');
    expect(page.siteHints).toEqual({ site: 'github', contentKind: 'repository' });
  });

  it('extracts GitHub issue body and comments on discussion pages', async () => {
    setPage({
      title: 'Bug: crash on startup · Issue #42',
      body: `
        <div class="js-timeline-item">
          <a class="author" data-hovercard-type="user">alice</a>
          <div class="js-comment-body"><p>App crashes on startup after update.</p></div>
        </div>
        <div class="js-timeline-item">
          <a class="author" data-hovercard-type="user">bob</a>
          <div class="js-comment-body"><p>Can reproduce on macOS.</p></div>
        </div>
      `,
    });

    const page = await captureWithBaseline('https://github.com/relixiaobo/nodex/issues/42', {
      title: 'Bug: crash on startup · Issue #42',
      content: '<p>broken defuddle</p>',
    });

    expect(page.contentHtml).toContain('<p><b>@alice</b></p>');
    expect(page.contentHtml).toContain('App crashes on startup after update.');
    expect(page.contentHtml).toContain('<p><b>@bob</b></p>');
    expect(page.contentHtml).toContain('Can reproduce on macOS.');
    expect(page.siteHints).toEqual({ site: 'github', contentKind: 'discussion' });
  });

  it('corrects YouTube author from page DOM instead of stale defuddle metadata', async () => {
    setPage({
      title: 'Video title',
      body: `
        <div id="owner">
          <div id="channel-name"><a>YouTube Channel</a></div>
        </div>
      `,
    });

    const page = await captureWithBaseline('https://www.youtube.com/watch?v=abc123', {
      title: 'Video title',
      content: '<p>Video body</p>',
      author: 'Random Commenter',
      extractorType: 'youtube',
      schemaOrgData: [],
    });

    expect(page.metadata.author).toBe('YouTube Channel');
    expect(page.siteHints).toEqual({ site: 'youtube', contentKind: 'video' });
  });

  it('keeps the empty-content guard when neither defuddle nor site extractors produce HTML', async () => {
    setPage();

    await expect(captureWithBaseline('https://example.com/empty', {
      title: 'Empty',
      content: '',
    })).rejects.toThrow('Defuddle returned empty content');

    const result = await captureCurrentPageResult(createContext('https://example.com/empty', {
      defuddleParse: () => ({ title: 'Empty', content: '' }),
    }));
    expect(result).toEqual({ ok: false, error: 'Defuddle returned empty content' });
  });

  it('falls back to the baseline capture when a site extractor throws', async () => {
    setPage({
      title: 'Broken x page',
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const context: PageCaptureContext = {
      window,
      document,
      location: {
        href: 'https://x.com/broken',
        hostname: 'x.com',
        get pathname() {
          throw new Error('pathname exploded');
        },
      } as unknown as Location,
      services: {
        now: () => 123456789,
        defuddleParse: () => ({
          title: 'Baseline title',
          content: '<p>Baseline content</p>',
          description: 'Baseline description',
          extractorType: 'twitter',
        }),
      },
    };

    const page = await captureCurrentPage(context);

    expect(page.title).toBe('Baseline title');
    expect(page.contentHtml).toBe('<p>Baseline content</p>');
    expect(page.metadata.description).toBe('Baseline description');
    expect(page.siteHints).toEqual({ site: 'generic' });
    expect(warn).toHaveBeenCalledOnce();
  });
});

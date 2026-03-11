import Defuddle from 'defuddle';
import { extractDuration, extractSchemaOrgType } from './metadata.js';
import {
  applyPageCapturePatch,
  type CapturedPage,
  type DefuddlePageData,
  type PageCaptureContext,
  type PageCaptureRequest,
  type PageCaptureResult,
} from './models.js';
import { matchPageCaptureExtractor } from './registry.js';
import { isXHostname } from './site-utils.js';

function defaultDefuddleParse(document: Document, options: { url: string }): DefuddlePageData {
  return new Defuddle(document, {
    url: options.url,
    markdown: false,
    separateMarkdown: false,
  }).parse() as DefuddlePageData;
}

function getSelectionText(context: PageCaptureContext): string {
  return context.window.getSelection()?.toString() ?? '';
}

function detectHasArticleElement(context: PageCaptureContext): boolean {
  if (isXHostname(context.location.hostname)) return false;
  return !!context.document.querySelector('article');
}

function buildBaselinePage(
  context: PageCaptureContext,
  request: Required<PageCaptureRequest>,
  extracted: DefuddlePageData,
): CapturedPage {
  return {
    url: request.url,
    title: extracted.title?.trim() || context.document.title?.trim() || context.location.hostname,
    selectionText: request.selectionText,
    contentHtml: extracted.content ?? '',
    capturedAt: context.services?.now?.() ?? Date.now(),
    metadata: {
      author: extracted.author ?? undefined,
      published: extracted.published ?? undefined,
      description: extracted.description ?? undefined,
      siteName: extracted.site ?? undefined,
      duration: extractDuration(extracted.schemaOrgData, context.document) ?? undefined,
      extractorType: extracted.extractorType ?? undefined,
      ogType: context.document.querySelector('meta[property="og:type"]')?.getAttribute('content') ?? undefined,
      schemaOrgType: extractSchemaOrgType(extracted.schemaOrgData),
      hasArticleElement: detectHasArticleElement(context),
    },
    siteHints: {
      site: 'generic',
    },
  };
}

export async function captureCurrentPage(
  context: PageCaptureContext,
  request: PageCaptureRequest = {},
): Promise<CapturedPage> {
  const resolvedRequest: Required<PageCaptureRequest> = {
    url: request.url ?? context.location.href,
    selectionText: request.selectionText ?? getSelectionText(context),
  };

  const defuddleParse = context.services?.defuddleParse ?? defaultDefuddleParse;
  const baseline = defuddleParse(context.document, { url: resolvedRequest.url });
  let page = buildBaselinePage(context, resolvedRequest, baseline);

  const extractor = matchPageCaptureExtractor(context);
  if (extractor) {
    const patch = await extractor.enrich({
      baseline,
      context,
      page,
      request: resolvedRequest,
    });
    page = applyPageCapturePatch(page, patch);
  }

  if (!page.contentHtml) {
    throw new Error('Defuddle returned empty content');
  }

  return page;
}

export async function captureCurrentPageResult(
  context: PageCaptureContext,
  request: PageCaptureRequest = {},
): Promise<PageCaptureResult> {
  try {
    return {
      ok: true,
      page: await captureCurrentPage(context, request),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

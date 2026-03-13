/**
 * Web Clip service — orchestrates saving a web clip as a node.
 *
 * Creates a node under today's journal day, tags it with the appropriate
 * clip type tag (#article / #video / #social / #source), and writes fields.
 */
import type { NodexNode } from '../types/index.js';
import { SYSTEM_NODE_IDS, SYS_T, NDX_F, NDX_T, FIELD_TYPES } from '../types/index.js';
import type { WebClipCapturePayload } from './webclip-messaging.js';
import * as loroDoc from './loro-doc.js';
import { ensureTodayNode } from './journal.js';
import { resolveFieldOptions } from './field-utils.js';
import { getWorkspaceTopLevelNodeIds } from './system-node-presets.js';
import { cachePageContent } from './ai-shadow-cache.js';
import { ensureSparkPlaceholder, autoTriggerSpark } from './ai-spark.js';

const CLIP_SCAN_SKIP_IDS: ReadonlySet<string> = new Set([
  SYSTEM_NODE_IDS.JOURNAL,
  SYSTEM_NODE_IDS.TRASH,
  SYSTEM_NODE_IDS.SCHEMA,
  SYSTEM_NODE_IDS.SETTINGS,
]);

// Re-export for convenience
export type { WebClipCapturePayload };

/** Minimal interface for the node store methods we need (testable without full store). */
export interface WebClipNodeStore {
  getNode(id: string): NodexNode | null;
  getChildren(parentId: string): NodexNode[];
  createChild(parentId: string, index?: number, data?: Partial<NodexNode>): NodexNode;
  applyTag(nodeId: string, tagDefId: string): void;
  setFieldValue(nodeId: string, fieldDefId: string, values: string[]): void;
  setOptionsFieldValue(nodeId: string, fieldDefId: string, optionNodeId: string): void;
  autoCollectOption(nodeId: string, fieldDefId: string, name: string): string;
  setNodeName(id: string, name: string): void;
  updateNodeDescription(id: string, description: string): void;
  createTagDef(name: string, options?: { showCheckbox?: boolean; color?: string }): NodexNode;
  createFieldDef(name: string, fieldType: string, tagDefId: string): NodexNode;
}

/**
 * Find a tagDef by name within the SCHEMA container.
 */
export function findTagDefByName(
  _entities: unknown,
  _schemaId: string,
  name: string,
): NodexNode | undefined {
  const schemaChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA);
  const lowerName = name.toLowerCase();
  for (const childId of schemaChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'tagDef' && child.name?.toLowerCase() === lowerName) {
      return child;
    }
  }
  return undefined;
}

/**
 * Find a fieldDef within a tagDef's children.
 */
export function findTemplateAttrDef(
  _entities: unknown,
  tagDefId: string,
  attrName: string,
): NodexNode | undefined {
  const children = loroDoc.getChildren(tagDefId);
  const lowerName = attrName.toLowerCase();
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldDef' && child.name?.toLowerCase() === lowerName) {
      return child;
    }
  }
  return undefined;
}

// ============================================================
// Clip type detection
// ============================================================

export type ClipType = 'article' | 'video' | 'social' | 'source';

const ARTICLE_SCHEMA_TYPES = new Set([
  'article', 'blogposting', 'newsarticle', 'technicalarticle',
  'scholarlyarticle', 'reportagenewsarticle', 'analysisnewsarticle',
]);

/**
 * Detect the clip type from URL and payload metadata.
 * Priority: domain match > extractorType > og:type/Schema.org > fallback.
 */
export function detectClipType(url: string, payload?: Partial<WebClipCapturePayload>): ClipType {
  // 1. URL domain match
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    if (hostname === 'youtube.com' || hostname === 'youtu.be' || hostname.endsWith('.youtube.com')) {
      return 'video';
    }
    if (hostname === 'x.com' || hostname === 'twitter.com') {
      // x.com articles: /username/articles/id OR detected from DOM
      if (/\/articles\/\d/.test(parsed.pathname)) return 'article';
      if (payload?.isXArticle) return 'article';
      return 'social';
    }
  } catch {
    // invalid URL — continue to metadata checks
  }

  if (!payload) return 'source';

  // 2. Defuddle extractorType
  if (payload.extractorType === 'youtube') return 'video';
  if (payload.extractorType === 'twitter') return 'social';

  // 3. og:type / Schema.org @type → article
  if (payload.ogType === 'article') return 'article';
  if (payload.schemaOrgType && ARTICLE_SCHEMA_TYPES.has(payload.schemaOrgType.toLowerCase())) {
    return 'article';
  }

  // 4. <article> element fallback
  if (payload.hasArticleElement) return 'article';

  return 'source';
}

// ============================================================
// Ensure functions (fixed IDs to prevent CRDT duplication)
// ============================================================

/**
 * Ensure #source tagDef exists with fixed ID SYS_T202.
 * Used by both webclip-service and highlight-service.
 */
export function ensureSourceTagDef(): NodexNode {
  let td = loroDoc.toNodexNode(SYS_T.SOURCE);
  if (!td) {
    loroDoc.createNode(SYS_T.SOURCE, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(SYS_T.SOURCE, { type: 'tagDef', name: 'source', color: 'sage' });
    loroDoc.commitDoc();
    td = loroDoc.toNodexNode(SYS_T.SOURCE)!;
  }
  return td;
}

/**
 * Ensure "URL" fieldDef exists with fixed ID NDX_F01 under #source tagDef.
 */
export function ensureSourceUrlFieldDef(): NodexNode {
  ensureSourceTagDef();
  let fd = loroDoc.toNodexNode(NDX_F.SOURCE_URL);
  if (!fd) {
    loroDoc.createNode(NDX_F.SOURCE_URL, SYS_T.SOURCE);
    loroDoc.setNodeDataBatch(NDX_F.SOURCE_URL, {
      type: 'fieldDef',
      name: 'URL',
      fieldType: FIELD_TYPES.URL,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.SOURCE_URL)!;
  }
  const patch: Record<string, unknown> = {};
  if (fd.name !== 'URL') patch.name = 'URL';
  if (fd.fieldType !== FIELD_TYPES.URL) patch.fieldType = FIELD_TYPES.URL;
  if (Object.keys(patch).length > 0) {
    loroDoc.setNodeDataBatch(NDX_F.SOURCE_URL, patch);
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.SOURCE_URL)!;
  }
  return fd;
}

/**
 * Ensure "Author" fieldDef exists with fixed ID NDX_F03 under #source tagDef.
 * Uses OPTIONS type so same-name authors are deduplicated as option nodes.
 */
export function ensureAuthorFieldDef(): NodexNode {
  ensureSourceTagDef();
  let fd = loroDoc.toNodexNode(NDX_F.AUTHOR);
  if (!fd) {
    loroDoc.createNode(NDX_F.AUTHOR, SYS_T.SOURCE);
    loroDoc.setNodeDataBatch(NDX_F.AUTHOR, {
      type: 'fieldDef',
      name: 'Author',
      fieldType: FIELD_TYPES.OPTIONS,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.AUTHOR)!;
  } else if (fd.fieldType === FIELD_TYPES.PLAIN) {
    // Migrate existing PLAIN → OPTIONS
    loroDoc.setNodeData(NDX_F.AUTHOR, 'fieldType', FIELD_TYPES.OPTIONS);
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.AUTHOR)!;
  }
  return fd;
}

/**
 * Ensure "Published" fieldDef exists with fixed ID NDX_F04 under #source tagDef.
 */
export function ensurePublishedFieldDef(): NodexNode {
  ensureSourceTagDef();
  let fd = loroDoc.toNodexNode(NDX_F.PUBLISHED);
  if (!fd) {
    loroDoc.createNode(NDX_F.PUBLISHED, SYS_T.SOURCE);
    loroDoc.setNodeDataBatch(NDX_F.PUBLISHED, {
      type: 'fieldDef',
      name: 'Published',
      fieldType: FIELD_TYPES.DATE,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.PUBLISHED)!;
  }
  return fd;
}

/**
 * Ensure #article tagDef exists with fixed ID NDX_T01, extends #source.
 */
export function ensureArticleTagDef(): NodexNode {
  ensureSourceTagDef();
  ensureSourceUrlFieldDef();
  ensureAuthorFieldDef();
  ensurePublishedFieldDef();
  let td = loroDoc.toNodexNode(NDX_T.ARTICLE);
  if (!td) {
    loroDoc.createNode(NDX_T.ARTICLE, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(NDX_T.ARTICLE, {
      type: 'tagDef',
      name: 'article',
      color: 'slate',
      extends: SYS_T.SOURCE,
    });
    loroDoc.commitDoc();
    td = loroDoc.toNodexNode(NDX_T.ARTICLE)!;
  }
  return td;
}

/**
 * Ensure "Duration" fieldDef exists with fixed ID NDX_F05 under #video tagDef.
 */
export function ensureDurationFieldDef(): NodexNode {
  ensureVideoTagDef();
  let fd = loroDoc.toNodexNode(NDX_F.DURATION);
  if (!fd) {
    loroDoc.createNode(NDX_F.DURATION, NDX_T.VIDEO);
    loroDoc.setNodeDataBatch(NDX_F.DURATION, {
      type: 'fieldDef',
      name: 'Duration',
      fieldType: FIELD_TYPES.PLAIN,
    });
    loroDoc.commitDoc();
    fd = loroDoc.toNodexNode(NDX_F.DURATION)!;
  }
  return fd;
}

/**
 * Ensure #video tagDef exists with fixed ID NDX_T02, extends #source.
 */
export function ensureVideoTagDef(): NodexNode {
  ensureSourceTagDef();
  ensureSourceUrlFieldDef();
  ensureAuthorFieldDef();
  ensurePublishedFieldDef();
  let td = loroDoc.toNodexNode(NDX_T.VIDEO);
  if (!td) {
    loroDoc.createNode(NDX_T.VIDEO, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(NDX_T.VIDEO, {
      type: 'tagDef',
      name: 'video',
      color: 'red',
      extends: SYS_T.SOURCE,
    });
    loroDoc.commitDoc();
    td = loroDoc.toNodexNode(NDX_T.VIDEO)!;
  }
  return td;
}

/**
 * Ensure #social tagDef exists with fixed ID NDX_T03, extends #source.
 */
export function ensureSocialTagDef(): NodexNode {
  ensureSourceTagDef();
  ensureSourceUrlFieldDef();
  ensureAuthorFieldDef();
  ensurePublishedFieldDef();
  let td = loroDoc.toNodexNode(NDX_T.SOCIAL);
  if (!td) {
    loroDoc.createNode(NDX_T.SOCIAL, SYSTEM_NODE_IDS.SCHEMA);
    loroDoc.setNodeDataBatch(NDX_T.SOCIAL, {
      type: 'tagDef',
      name: 'social',
      color: 'blue',
      extends: SYS_T.SOURCE,
    });
    loroDoc.commitDoc();
    td = loroDoc.toNodexNode(NDX_T.SOCIAL)!;
  }
  return td;
}

/**
 * Ensure all tag/field defs needed for a clip type exist.
 * Returns the tagDefId to apply to the clip node.
 */
function ensureClipTypeDefs(clipType: ClipType): string {
  switch (clipType) {
    case 'article':
      ensureArticleTagDef();
      return NDX_T.ARTICLE;
    case 'video':
      ensureVideoTagDef();
      ensureDurationFieldDef();
      return NDX_T.VIDEO;
    case 'social':
      ensureSocialTagDef();
      return NDX_T.SOCIAL;
    case 'source':
    default:
      ensureSourceTagDef();
      ensureSourceUrlFieldDef();
      ensureAuthorFieldDef();
      ensurePublishedFieldDef();
      return SYS_T.SOURCE;
  }
}

// ============================================================
// ISO 8601 Duration formatting
// ============================================================

/**
 * Format an ISO 8601 duration (e.g. "PT12M34S") to human-readable (e.g. "12:34").
 * Returns the original string if parsing fails.
 */
export function formatIsoDuration(iso: string): string {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso);
  if (!match) return iso;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  const parts: string[] = [];
  if (h > 0) parts.push(String(h));
  parts.push(h > 0 ? String(m).padStart(2, '0') : String(m));
  parts.push(String(s).padStart(2, '0'));
  return parts.join(':');
}

// ============================================================
// Title refinement
// ============================================================

/**
 * Refine clip title for social posts.
 * Replaces generic titles like "Thread by @user" with actual post content preview.
 */
export function refineClipTitle(
  title: string,
  payload: WebClipCapturePayload,
  clipType: ClipType,
): string {
  if (clipType !== 'social') return title;

  // Extract a text preview from description or pageText
  const preview = extractTextPreview(payload);
  if (!preview) return title;

  const author = payload.author ? `@${payload.author.replace(/^@/, '')}: ` : '';
  return `${author}${preview}`;
}

/** Get a plain-text preview (≤30 chars) from payload. */
function extractTextPreview(payload: WebClipCapturePayload): string | undefined {
  // og:description usually has the tweet text
  if (payload.description) {
    return truncateText(payload.description, 30);
  }
  // Fallback: strip HTML tags from pageText
  if (payload.pageText) {
    const text = payload.pageText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return truncateText(text, 30);
  }
  return undefined;
}

/** Truncate text to maxLen, breaking at word boundary. */
function truncateText(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.lastIndexOf(' ', maxLen);
  return trimmed.slice(0, cut > 0 ? cut : maxLen) + '…';
}

// ============================================================
// Fill clip fields (shared logic)
// ============================================================

/**
 * Fill Author, Published, and Duration fields on a clip node.
 */
function fillClipFields(
  nodeId: string,
  payload: WebClipCapturePayload,
  clipType: ClipType,
  store: WebClipNodeStore,
): void {
  // Author (OPTIONS field — find-or-create option node for dedup)
  if (payload.author) {
    const authorFd = ensureAuthorFieldDef();
    const existingOptionIds = resolveFieldOptions(authorFd.id);
    const existingOptionId = existingOptionIds.find((optId) => {
      const opt = loroDoc.toNodexNode(optId);
      return opt?.name === payload.author;
    });
    if (existingOptionId) {
      store.setOptionsFieldValue(nodeId, authorFd.id, existingOptionId);
    } else {
      store.autoCollectOption(nodeId, authorFd.id, payload.author!);
    }
  }

  // Published
  if (payload.published) {
    const publishedFd = ensurePublishedFieldDef();
    store.setFieldValue(nodeId, publishedFd.id, [payload.published]);
  }

  // Duration (video only)
  if (clipType === 'video' && payload.duration) {
    const durationFd = ensureDurationFieldDef();
    const formatted = formatIsoDuration(payload.duration);
    store.setFieldValue(nodeId, durationFd.id, [formatted]);
  }
}

// ============================================================
// Shared clip pipeline (single source of truth)
// ============================================================

/**
 * Apply clip data to a node: tag, URL, metadata fields, description, cache, spark.
 * Every clip path funnels through here — add new clip behavior once, not four times.
 *
 * @param spark - 'auto': create placeholder + trigger if API key (active clip);
 *                'placeholder': create placeholder only (passive clip, user triggers later)
 */
function applyClipData(
  nodeId: string,
  url: string,
  title: string,
  payload: WebClipCapturePayload | undefined,
  store: WebClipNodeStore,
  spark: 'auto' | 'placeholder',
): void {
  const clipType = detectClipType(url, payload);
  const tagDefId = ensureClipTypeDefs(clipType);
  ensureSourceUrlFieldDef();

  // Title (refined for social posts when full payload available)
  const finalTitle = payload ? refineClipTitle(title, payload, clipType) : title;
  store.setNodeName(nodeId, finalTitle);

  // Tag + URL
  store.applyTag(nodeId, tagDefId);
  store.setFieldValue(nodeId, NDX_F.SOURCE_URL, [url]);

  // Metadata fields (Author, Published, Duration)
  if (payload) {
    fillClipFields(nodeId, payload, clipType, store);
    if (payload.description && clipType !== 'social') {
      store.updateNodeDescription(nodeId, payload.description);
    }
  }

  // Cache page content for future re-extraction
  if (payload?.pageText) {
    void cachePageContent(url, payload.pageText).catch(() => {});
  }

  // Spark
  if (spark === 'auto') {
    autoTriggerSpark(nodeId, payload?.pageText ?? undefined);
  } else {
    ensureSparkPlaceholder(nodeId);
  }
}

// ============================================================
// Public API — thin wrappers over shared pipeline
// ============================================================

/**
 * Create an empty placeholder node under today's journal (Phase 1 of two-phase clip).
 * The node has no title and no tags — those will be filled asynchronously in Phase 2.
 *
 * @returns The ID of the shell node.
 */
export function createClipShell(store: WebClipNodeStore): string {
  const todayId = ensureTodayNode();
  const shell = store.createChild(todayId, undefined, { name: '' });
  return shell.id;
}

/**
 * Fill an existing shell node with web clip data (Phase 2 of two-phase clip).
 *
 * If a clip for the same URL already exists, upgrades that node in-place
 * and discards the empty shell. Otherwise fills the shell itself.
 */
export async function fillClipShell(
  shellId: string,
  payload: WebClipCapturePayload,
  store: WebClipNodeStore,
): Promise<string> {
  const existing = findClipNodeByUrl(payload.url);
  const targetId = existing ?? shellId;

  applyClipData(targetId, payload.url, payload.title, payload, store, 'auto');

  // Discard unused shell if we upgraded an existing clip
  if (existing) {
    loroDoc.moveNode(shellId, SYSTEM_NODE_IDS.TRASH);
    loroDoc.commitDoc();
  }

  return targetId;
}

/**
 * Save a web clip as a node under today's journal day with appropriate type tag and fields.
 */
export async function saveWebClip(
  payload: WebClipCapturePayload,
  store: WebClipNodeStore,
  _workspaceId?: string,
  _userId?: string,
  parentId?: string,
): Promise<string> {
  const targetParentId = parentId ?? ensureTodayNode();
  const clipNode = store.createChild(targetParentId, undefined, { name: '' });

  applyClipData(clipNode.id, payload.url, payload.title, payload, store, 'auto');

  return clipNode.id;
}

// ── URL Normalization & Clip Node Lookup ──

// Re-export normalizeUrl from dependency-free module (safe for Background SW)
import { normalizeUrl } from './url-utils.js';
export { normalizeUrl };

/** All tag IDs in the #source family (source + subtypes). */
const SOURCE_FAMILY_TAGS = new Set<string>([
  SYS_T.SOURCE,
  NDX_T.ARTICLE,
  NDX_T.VIDEO,
  NDX_T.SOCIAL,
]);

/**
 * Check if a node is a #source-family clip matching the given normalized URL.
 */
function isMatchingClipNode(
  nodeId: string,
  fieldDefId: string,
  normalizedUrl: string,
): boolean {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node || !node.tags?.some(t => SOURCE_FAMILY_TAGS.has(t))) return false;

  const fieldEntryId = findFieldEntryForNode(nodeId, fieldDefId);
  if (!fieldEntryId) return false;

  const fieldChildren = loroDoc.getChildren(fieldEntryId);
  if (fieldChildren.length === 0) return false;

  const valueNode = loroDoc.toNodexNode(fieldChildren[0]);
  return !!(valueNode?.name && normalizeUrl(valueNode.name) === normalizedUrl);
}

/**
 * Find a #source-family node by its URL field value.
 * Searches workspace top-level content containers and JOURNAL day nodes.
 *
 * @returns The node ID of the matching clip node, or null if not found.
 */
export function findClipNodeByUrl(url: string): string | null {
  const normalizedUrl = normalizeUrl(url);

  // URL fieldDef must exist
  const sourceUrlFieldDef = loroDoc.toNodexNode(NDX_F.SOURCE_URL);
  if (!sourceUrlFieldDef) return null;

  // Search through workspace top-level content containers.
  for (const containerId of getWorkspaceTopLevelNodeIds()) {
    if (CLIP_SCAN_SKIP_IDS.has(containerId)) continue;
    const children = loroDoc.getChildren(containerId);
    for (const childId of children) {
      if (isMatchingClipNode(childId, NDX_F.SOURCE_URL, normalizedUrl)) {
        return childId;
      }
    }
  }

  // Search JOURNAL day nodes (Year → Week → Day → clip)
  const yearIds = loroDoc.getChildren(SYSTEM_NODE_IDS.JOURNAL);
  for (const yearId of yearIds) {
    const weekIds = loroDoc.getChildren(yearId);
    for (const weekId of weekIds) {
      const dayIds = loroDoc.getChildren(weekId);
      for (const dayId of dayIds) {
        const clipIds = loroDoc.getChildren(dayId);
        for (const clipId of clipIds) {
          if (isMatchingClipNode(clipId, NDX_F.SOURCE_URL, normalizedUrl)) {
            return clipId;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Find a fieldEntry child node by its fieldDefId.
 */
function findFieldEntryForNode(nodeId: string, fieldDefId: string): string | undefined {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      return childId;
    }
  }
  return undefined;
}

/**
 * Create a lightweight clip node (URL + Title only, no content parsing).
 * Used when a highlight is created on a page that hasn't been clipped yet.
 * Passive clip — spark placeholder only, user triggers manually.
 */
export async function createLightweightClip(
  pageUrl: string,
  pageTitle: string,
  store: WebClipNodeStore,
  pageMeta?: { ogType?: string; schemaOrgType?: string; hasArticleElement?: boolean },
): Promise<string> {
  const clipNode = store.createChild(ensureTodayNode(), undefined, { name: '' });

  // Build minimal payload for type detection (no content / metadata)
  const minPayload: WebClipCapturePayload | undefined = pageMeta ? {
    url: pageUrl,
    title: pageTitle,
    selectionText: '',
    pageText: '',
    capturedAt: 0,
    ogType: pageMeta.ogType,
    schemaOrgType: pageMeta.schemaOrgType,
    hasArticleElement: pageMeta.hasArticleElement,
  } : undefined;

  applyClipData(clipNode.id, pageUrl, pageTitle, minPayload, store, 'placeholder');

  return clipNode.id;
}

/**
 * Apply web clip data to an existing node in-place.
 */
export async function applyWebClipToNode(
  nodeId: string,
  payload: WebClipCapturePayload,
  store: WebClipNodeStore,
  _workspaceId?: string,
  _userId?: string,
): Promise<void> {
  applyClipData(nodeId, payload.url, payload.title, payload, store, 'auto');
}

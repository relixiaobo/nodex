import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import { CONTAINER_IDS, SYS_T } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureCommentTagDef,
  type HighlightNodeStore,
} from '../../src/lib/highlight-service.js';
import { findClipNodeByUrl } from '../../src/lib/webclip-service.js';
import {
  createHighlightFromPayload,
  buildHighlightRestorePayload,
  findOrCreateClipNodeForUrl,
  collectHighlightNodeIdsInLibrary,
  getRemovedHighlightIds,
  upsertHighlightNote,
} from '../../src/lib/highlight-sidepanel.js';
import type { HighlightCreatePayload } from '../../src/lib/highlight-messaging.js';
import * as loroDoc from '../../src/lib/loro-doc.js';

function getStore(): HighlightNodeStore {
  return useNodeStore.getState() as HighlightNodeStore;
}

function makePayload(overrides?: Partial<HighlightCreatePayload>): HighlightCreatePayload {
  return {
    selectedText: 'highlighted text',
    pageUrl: 'https://medium.com/example-article',
    pageTitle: 'Example Article — Medium',
    anchor: {
      version: 1,
      exact: 'highlighted text',
      prefix: 'before ',
      suffix: ' after',
    },
    ...overrides,
  };
}

describe('highlight-sidepanel', () => {
  beforeEach(() => {
    resetAndSeed();
    const store = getStore();
    ensureHighlightTagDef(store);
    ensureCommentTagDef(store);
  });

  it('creates highlight linked to existing clip node when URL already exists', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    expect(result.clipNodeId).toBe('webclip_1');

    const node = store.getNode(result.highlightNodeId);
    expect(node).not.toBeNull();
    expect(node!.tags).toContain(SYS_T.HIGHLIGHT);
  });

  it('creates lightweight clip when URL has no existing clip node', async () => {
    const store = getStore();
    const payload = makePayload({
      pageUrl: 'https://example.com/new-highlight',
      pageTitle: 'Fresh page',
    });

    const result = await createHighlightFromPayload(payload, store);
    expect(result.clipNodeId).not.toBe('webclip_1');

    const clipNode = store.getNode(result.clipNodeId);
    expect(clipNode).not.toBeNull();
    expect(clipNode!.tags).toContain('tagDef_source');
    expect(loroDoc.getParentId(result.clipNodeId)).toBe(CONTAINER_IDS.INBOX);
    expect(findClipNodeByUrl('https://example.com/new-highlight')).toBe(result.clipNodeId);
  });

  it('creates an empty #comment child when withNote is true', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload({ withNote: true }), store);

    const children = store.getChildren(result.highlightNodeId);
    const comment = children.find((n) => n.tags.includes(SYS_T.COMMENT));
    expect(comment).toBeDefined();
    expect(comment!.name).toBe('');
  });

  it('creates #comment child with note text when noteText is provided', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(
      makePayload({ withNote: true, noteText: 'captured note' }),
      store,
    );

    const children = store.getChildren(result.highlightNodeId);
    const comment = children.find((n) => n.tags.includes(SYS_T.COMMENT));
    expect(comment).toBeDefined();
    expect(comment!.name).toBe('captured note');
  });

  it('creates inline reference from clip node to highlight node', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const clipChildren = store.getChildren(result.clipNodeId);
    const ref = clipChildren.find(
      (n) => n.type === 'reference' && n.targetId === result.highlightNodeId,
    );
    expect(ref).toBeDefined();
  });

  it('stores anchor data in node description', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const node = loroDoc.toNodexNode(result.highlightNodeId);
    expect(node!.description).toBeDefined();
    const parsed = JSON.parse(node!.description!);
    expect(parsed.exact).toBe('highlighted text');
  });

  it('builds restore payload with parsed anchor and tagDef color', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item).toBeDefined();
    // Color is derived from tagDef and passed as the base highlight color
    expect(item!.color).toBe('#9B7C38');
    expect(item!.anchor.exact).toBe('highlighted text');
    expect(item!.hasComment).toBe(false);
  });

  it('sets hasComment=true in restore payload when highlight has #comment child', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload(), store);
    upsertHighlightNote(store, result.highlightNodeId, 'note');

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item?.hasComment).toBe(true);
  });

  it('upserts note by updating existing #comment child instead of duplicating', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload({ noteText: 'first' }), store);

    const first = upsertHighlightNote(store, result.highlightNodeId, 'second');
    expect(first?.created).toBe(false);

    const comments = store
      .getChildren(result.highlightNodeId)
      .filter((n) => n.tags.includes(SYS_T.COMMENT));
    expect(comments).toHaveLength(1);
    expect(comments[0].name).toBe('second');
  });

  it('deduplicates concurrent clip creation for the same normalized URL', async () => {
    const store = getStore();
    const urlA = 'https://www.example.com/path/';
    const urlB = 'http://example.com/path';

    const [clipIdA, clipIdB] = await Promise.all([
      findOrCreateClipNodeForUrl(urlA, 'Example A', store),
      findOrCreateClipNodeForUrl(urlB, 'Example B', store),
    ]);

    expect(clipIdA).toBe(clipIdB);
  });

  it('collects library highlight IDs and detects removed IDs', async () => {
    const store = getStore();
    const first = await createHighlightFromPayload(makePayload({ selectedText: 'first' }), store);
    const second = await createHighlightFromPayload(makePayload({ selectedText: 'second' }), store);

    const before = collectHighlightNodeIdsInLibrary();
    expect(before.has(first.highlightNodeId)).toBe(true);
    expect(before.has(second.highlightNodeId)).toBe(true);

    loroDoc.moveNode(first.highlightNodeId, CONTAINER_IDS.TRASH);
    const after = collectHighlightNodeIdsInLibrary();
    const removed = getRemovedHighlightIds(before, after);

    expect(removed).toContain(first.highlightNodeId);
    expect(removed).not.toContain(second.highlightNodeId);
  });
});

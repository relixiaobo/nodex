import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import { CONTAINER_IDS, SYS_T } from '../../src/types/index.js';
import {
  ensureHighlightTagDef,
  ensureCommentTagDef,
  getSourceFieldDefId,
  type HighlightNodeStore,
} from '../../src/lib/highlight-service.js';
import { findClipNodeByUrl } from '../../src/lib/webclip-service.js';
import {
  createHighlightFromPayload,
  buildHighlightRestorePayload,
  getPlainFieldValue,
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
    color: 'yellow',
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

    const sourceValue = getPlainFieldValue(result.highlightNodeId, getSourceFieldDefId());
    expect(sourceValue).toBe('webclip_1');
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
    expect(clipNode!.tags).toContain('tagDef_web_clip');
    expect(loroDoc.getParentId(result.clipNodeId)).toBe(CONTAINER_IDS.INBOX);
    expect(findClipNodeByUrl('https://example.com/new-highlight')).toBe(result.clipNodeId);
    expect(clipNode!.id).not.toBe('webclip_1');
  });

  it('creates an empty #comment child when withNote is true', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload({ withNote: true }), store);

    const children = store.getChildren(result.highlightNodeId);
    const comment = children.find((n) => n.tags.includes(SYS_T.COMMENT));
    expect(comment).toBeDefined();
    expect(comment!.name).toBe('');
  });

  it('builds restore payload from highlight nodes with parsed anchor and color', async () => {
    const store = getStore();
    const result = await createHighlightFromPayload(makePayload({ color: 'green' }), store);

    const payload = buildHighlightRestorePayload(result.clipNodeId);
    const item = payload.highlights.find((h) => h.id === result.highlightNodeId);
    expect(item).toBeDefined();
    expect(item!.color).toBe('green');
    expect(item!.anchor.exact).toBe('highlighted text');
  });
});

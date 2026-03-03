/**
 * webclip-service — Loro model.
 * findTagDefByName: searches CONTAINER_IDS.SCHEMA children (ignores _entities/_schemaId args).
 * findTemplateAttrDef: searches tagDef's fieldDef children by name.
 * saveWebClip: creates clip node in INBOX, applies #source tag, writes Source URL field.
 * applyWebClipToNode: applies web clip data to an existing node in-place.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import {
  findTagDefByName,
  findTemplateAttrDef,
  saveWebClip,
  applyWebClipToNode,
  normalizeUrl,
  findClipNodeByUrl,
  createLightweightClip,
  type WebClipCapturePayload,
} from '../../src/lib/webclip-service.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS, SYS_T, NDX_F } from '../../src/types/index.js';
import { ensureTodayNode } from '../../src/lib/journal.js';

/** Helper: find fieldEntry child with given fieldDefId. */
function findFieldEntry(nodeId: string, fieldDefId: string): string | undefined {
  return loroDoc.getChildren(nodeId).find(cid => {
    const n = loroDoc.toNodexNode(cid);
    return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
  });
}

/** Helper: get name of first value child of a fieldEntry. */
function getFirstFieldValue(fieldEntryId: string): string | undefined {
  const children = loroDoc.getChildren(fieldEntryId);
  if (children.length === 0) return undefined;
  return loroDoc.toNodexNode(children[0])?.name;
}

describe('findTagDefByName', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('finds existing tagDef by name (case-insensitive)', () => {
    const result = findTagDefByName({}, CONTAINER_IDS.SCHEMA, 'source');
    expect(result).toBeDefined();
    expect(result!.id).toBe(SYS_T.SOURCE);
    expect(result!.type).toBe('tagDef');
  });

  it('finds tagDef with different casing', () => {
    const result = findTagDefByName({}, CONTAINER_IDS.SCHEMA, 'Source');
    expect(result).toBeDefined();
    expect(result!.id).toBe(SYS_T.SOURCE);
  });

  it('returns undefined for non-existent tagDef name', () => {
    const result = findTagDefByName({}, CONTAINER_IDS.SCHEMA, 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('ignores _schemaId arg — always reads from CONTAINER_IDS.SCHEMA', () => {
    // New Loro model ignores _schemaId and reads from loroDoc directly.
    // So even a "wrong" schemaId still finds the tagDef in the real SCHEMA.
    const result = findTagDefByName({}, 'ws_missing_SCHEMA', 'source');
    expect(result).toBeDefined();
    expect(result!.id).toBe(SYS_T.SOURCE);
  });
});

describe('findTemplateAttrDef', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('finds template fieldDef by name within tagDef', () => {
    const result = findTemplateAttrDef({}, SYS_T.SOURCE, 'Source URL');
    expect(result).toBeDefined();
    expect(result!.id).toBe(NDX_F.SOURCE_URL);
    expect(result!.type).toBe('fieldDef');
  });

  it('finds fieldDef case-insensitively', () => {
    const result = findTemplateAttrDef({}, SYS_T.SOURCE, 'source url');
    expect(result).toBeDefined();
    expect(result!.id).toBe(NDX_F.SOURCE_URL);
  });

  it('returns undefined for non-existent field name', () => {
    const result = findTemplateAttrDef({}, SYS_T.SOURCE, 'Nonexistent');
    expect(result).toBeUndefined();
  });

  it('returns undefined for non-existent tagDef', () => {
    const result = findTemplateAttrDef({}, 'nonexistent_tag', 'Source URL');
    expect(result).toBeUndefined();
  });

  it('Source URL attrDef has fieldType = URL', () => {
    const result = findTemplateAttrDef({}, SYS_T.SOURCE, 'Source URL');
    expect(result).toBeDefined();
    expect(result!.fieldType).toBe('url');
  });
});

describe('saveWebClip', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  const makePayload = (overrides?: Partial<WebClipCapturePayload>): WebClipCapturePayload => ({
    url: 'https://example.com/article',
    title: 'Test Article',
    selectionText: '',
    pageText: '<p>Article content</p>',
    capturedAt: Date.now(),
    ...overrides,
  });

  it('creates node under today journal day with title (default parentId)', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload();

    const clipId = await saveWebClip(payload, store);
    const todayId = ensureTodayNode();

    const node = loroDoc.toNodexNode(clipId);
    expect(node).toBeDefined();
    expect(node!.name).toBe('Test Article');
    expect(loroDoc.getParentId(clipId)).toBe(todayId);
    expect(loroDoc.getChildren(todayId)).toContain(clipId);
  });

  it('creates node under custom parentId when provided', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ title: 'Custom Parent Clip' });

    const clipId = await saveWebClip(payload, store, undefined, undefined, 'proj_1');

    const node = loroDoc.toNodexNode(clipId);
    expect(node).toBeDefined();
    expect(node!.name).toBe('Custom Parent Clip');
    expect(loroDoc.getParentId(clipId)).toBe('proj_1');
    expect(loroDoc.getChildren('proj_1')).toContain(clipId);
    expect(loroDoc.getChildren(ensureTodayNode())).not.toContain(clipId);
  });

  it('tags node with #source (reuses existing tagDef)', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload();

    const clipId = await saveWebClip(payload, store);

    const node = loroDoc.toNodexNode(clipId);
    expect(node!.tags).toContain(SYS_T.SOURCE);
  });

  it('writes Source URL field value', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ url: 'https://example.com/test' });

    const clipId = await saveWebClip(payload, store);

    // Find the source URL fieldDef (fixed ID)
    const feId = findFieldEntry(clipId, NDX_F.SOURCE_URL);
    expect(feId).toBeDefined();
    expect(getFirstFieldValue(feId!)).toBe('https://example.com/test');
  });

  it('sets description when available', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ description: 'A great article about testing' });

    const clipId = await saveWebClip(payload, store);

    const node = loroDoc.toNodexNode(clipId);
    expect(node!.description).toBe('A great article about testing');
  });

  it('skips description when not provided', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ description: undefined });

    const clipId = await saveWebClip(payload, store);

    const node = loroDoc.toNodexNode(clipId);
    expect(node!.description).toBeUndefined();
  });

  it('uses fixed ID SYS_T202 for #source tagDef', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload();

    const clipId = await saveWebClip(payload, store);

    expect(loroDoc.hasNode(clipId)).toBe(true);

    // #source tagDef should always be SYS_T202
    const node = loroDoc.toNodexNode(clipId);
    expect(node!.tags).toContain(SYS_T.SOURCE);

    // Source URL fieldDef should always be NDX_F01
    const feId = findFieldEntry(clipId, NDX_F.SOURCE_URL);
    expect(feId).toBeDefined();
  });

  it('repeated clips reuse same tagDef (fixed ID)', async () => {
    const store = useNodeStore.getState();
    const payload1 = makePayload({ title: 'First Clip', url: 'https://a.com' });
    const payload2 = makePayload({ title: 'Second Clip', url: 'https://b.com' });

    const clipId1 = await saveWebClip(payload1, store);
    const clipId2 = await saveWebClip(payload2, store);

    // Both clips should reference the same fixed tagDef ID
    const node1 = loroDoc.toNodexNode(clipId1);
    const node2 = loroDoc.toNodexNode(clipId2);
    expect(node1!.tags).toContain(SYS_T.SOURCE);
    expect(node2!.tags).toContain(SYS_T.SOURCE);

    // Only one #source tagDef should exist in SCHEMA
    const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
    const webClipDefs = schemaChildren.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'tagDef' && n.name?.toLowerCase() === 'source';
    });
    expect(webClipDefs).toHaveLength(1);
  });

  it('creates content child nodes from pageText HTML', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({
      pageText: '<h2>Intro</h2><p>First paragraph</p><p>Second paragraph</p>',
    });

    const clipId = await saveWebClip(payload, store);

    // Get all children — includes fieldEntry (from tag) + content nodes
    const children = loroDoc.getChildren(clipId);
    // Should have at least the fieldEntry + the content nodes
    const contentChildren = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === undefined; // plain content nodes
    });
    expect(contentChildren.length).toBeGreaterThanOrEqual(1);

    // "Intro" heading should exist with children
    const introNode = contentChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.name === 'Intro';
    });
    expect(introNode).toBeDefined();

    const introChildren = loroDoc.getChildren(introNode!);
    expect(introChildren.length).toBe(2);
    expect(loroDoc.toNodexNode(introChildren[0])?.name).toBe('First paragraph');
    expect(loroDoc.toNodexNode(introChildren[1])?.name).toBe('Second paragraph');
  });

  it('skips content creation when pageText is empty', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ pageText: '' });

    const clipId = await saveWebClip(payload, store);

    // Only fieldEntry children from tag template, no content nodes
    const children = loroDoc.getChildren(clipId);
    const contentChildren = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === undefined;
    });
    expect(contentChildren).toHaveLength(0);
  });
});

describe('applyWebClipToNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  const makePayload = (overrides?: Partial<WebClipCapturePayload>): WebClipCapturePayload => ({
    url: 'https://example.com/article',
    title: 'Test Article',
    selectionText: '',
    pageText: '<p>Article content</p>',
    capturedAt: Date.now(),
    ...overrides,
  });

  it('renames existing node to page title', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ title: 'Clipped Page Title' });

    await applyWebClipToNode('idea_1', payload, store);

    const node = loroDoc.toNodexNode('idea_1');
    expect(node!.name).toBe('Clipped Page Title');
  });

  it('applies #source tag to existing node', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload();

    await applyWebClipToNode('idea_1', payload, store);

    const node = loroDoc.toNodexNode('idea_1');
    expect(node!.tags).toContain(SYS_T.SOURCE);
  });

  it('writes Source URL field value to existing node', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ url: 'https://example.com/clipped' });

    await applyWebClipToNode('idea_1', payload, store);

    const feId = findFieldEntry('idea_1', NDX_F.SOURCE_URL);
    expect(feId).toBeDefined();
    expect(getFirstFieldValue(feId!)).toBe('https://example.com/clipped');
  });

  it('sets description on existing node', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ description: 'A clipped page description' });

    await applyWebClipToNode('idea_1', payload, store);

    const node = loroDoc.toNodexNode('idea_1');
    expect(node!.description).toBe('A clipped page description');
  });

  it('does not change node ownership (stays in original parent)', async () => {
    const parentBefore = loroDoc.getParentId('idea_1');
    const store = useNodeStore.getState();
    const payload = makePayload({ description: undefined });

    await applyWebClipToNode('idea_1', payload, store);

    expect(loroDoc.hasNode('idea_1')).toBe(true);
    expect(loroDoc.getParentId('idea_1')).toBe(parentBefore);
  });

  it('creates content child nodes from pageText', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({
      pageText: '<p>Content paragraph</p>',
    });

    await applyWebClipToNode('idea_1', payload, store);

    const children = loroDoc.getChildren('idea_1');
    const contentChildren = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === undefined && n?.name === 'Content paragraph';
    });
    expect(contentChildren).toHaveLength(1);
  });

  it('preserves existing children when adding content nodes', async () => {
    // idea_1 currently has no children, but idea_2 is a sibling
    // Use inbox_3 which has children inbox_3a, inbox_3b
    const childrenBefore = loroDoc.getChildren('inbox_3');
    expect(childrenBefore.length).toBeGreaterThan(0);

    const store = useNodeStore.getState();
    const payload = makePayload({
      pageText: '<p>New content</p>',
    });

    await applyWebClipToNode('inbox_3', payload, store);

    const childrenAfter = loroDoc.getChildren('inbox_3');
    // Original children should still be there
    for (const oldChild of childrenBefore) {
      expect(childrenAfter).toContain(oldChild);
    }
    // Plus new content nodes
    expect(childrenAfter.length).toBeGreaterThan(childrenBefore.length);
  });
});

// ── URL Normalization ──

describe('normalizeUrl', () => {
  it('removes fragment hash', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe(
      'https://example.com/page',
    );
  });

  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe(
      'https://example.com/page',
    );
  });

  it('keeps root slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe(
      'https://example.com/',
    );
  });

  it('upgrades http to https', () => {
    expect(normalizeUrl('http://example.com/page')).toBe(
      'https://example.com/page',
    );
  });

  it('removes www prefix', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe(
      'https://example.com/page',
    );
  });

  it('preserves query parameters', () => {
    expect(normalizeUrl('https://example.com/page?a=1&b=2')).toBe(
      'https://example.com/page?a=1&b=2',
    );
  });

  it('handles all transformations together', () => {
    expect(normalizeUrl('http://www.example.com/page/#section')).toBe(
      'https://example.com/page',
    );
  });

  it('returns original for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

// ── findClipNodeByUrl ──

describe('findClipNodeByUrl', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns null when no clip nodes exist for URL', () => {
    const result = findClipNodeByUrl('https://nonexistent.com/page');
    expect(result).toBeNull();
  });

  it('finds clip node by exact URL match', async () => {
    const store = useNodeStore.getState();
    const payload: WebClipCapturePayload = {
      url: 'https://example.com/article',
      title: 'Test Article',
      selectionText: '',
      pageText: '<p>Content</p>',
      capturedAt: Date.now(),
    };
    const clipId = await saveWebClip(payload, store);

    const found = findClipNodeByUrl('https://example.com/article');
    expect(found).toBe(clipId);
  });

  it('finds clip node with URL normalization (http vs https)', async () => {
    const store = useNodeStore.getState();
    const payload: WebClipCapturePayload = {
      url: 'https://example.com/article',
      title: 'Test Article',
      selectionText: '',
      pageText: '<p>Content</p>',
      capturedAt: Date.now(),
    };
    const clipId = await saveWebClip(payload, store);

    // Search with http:// — should match the https:// clip
    const found = findClipNodeByUrl('http://example.com/article');
    expect(found).toBe(clipId);
  });

  it('finds clip node ignoring fragment', async () => {
    const store = useNodeStore.getState();
    const payload: WebClipCapturePayload = {
      url: 'https://example.com/article',
      title: 'Test Article',
      selectionText: '',
      pageText: '<p>Content</p>',
      capturedAt: Date.now(),
    };
    const clipId = await saveWebClip(payload, store);

    const found = findClipNodeByUrl('https://example.com/article#section');
    expect(found).toBe(clipId);
  });
});

// ── createLightweightClip ──

describe('createLightweightClip', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates a clip node under today journal day', async () => {
    const store = useNodeStore.getState();
    const clipId = await createLightweightClip(
      'https://example.com/page',
      'Page Title',
      store,
    );

    expect(loroDoc.hasNode(clipId)).toBe(true);
    expect(loroDoc.getParentId(clipId)).toBe(ensureTodayNode());
  });

  it('sets the node name to page title', async () => {
    const store = useNodeStore.getState();
    const clipId = await createLightweightClip(
      'https://example.com/page',
      'My Page Title',
      store,
    );

    const node = loroDoc.toNodexNode(clipId);
    expect(node!.name).toBe('My Page Title');
  });

  it('applies #source tag', async () => {
    const store = useNodeStore.getState();
    const clipId = await createLightweightClip(
      'https://example.com/page',
      'Page Title',
      store,
    );

    const node = loroDoc.toNodexNode(clipId);
    expect(node!.tags).toContain(SYS_T.SOURCE);
  });

  it('writes Source URL field', async () => {
    const store = useNodeStore.getState();
    const clipId = await createLightweightClip(
      'https://example.com/test-page',
      'Test Page',
      store,
    );

    const feId = findFieldEntry(clipId, NDX_F.SOURCE_URL);
    expect(feId).toBeDefined();
    expect(getFirstFieldValue(feId!)).toBe('https://example.com/test-page');
  });

  it('does not create content children (lightweight)', async () => {
    const store = useNodeStore.getState();
    const clipId = await createLightweightClip(
      'https://example.com/page',
      'Page Title',
      store,
    );

    const children = loroDoc.getChildren(clipId);
    // Only fieldEntry children from tag template, no content nodes
    const contentChildren = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === undefined;
    });
    expect(contentChildren).toHaveLength(0);
  });

  it('is findable by findClipNodeByUrl after creation', async () => {
    const store = useNodeStore.getState();
    const clipId = await createLightweightClip(
      'https://example.com/findme',
      'Findable Page',
      store,
    );

    const found = findClipNodeByUrl('https://example.com/findme');
    expect(found).toBe(clipId);
  });
});

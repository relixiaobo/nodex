/**
 * webclip-service — Loro model.
 * findTagDefByName: searches CONTAINER_IDS.SCHEMA children (ignores _entities/_schemaId args).
 * findTemplateAttrDef: searches tagDef's fieldDef children by name.
 * saveWebClip: creates clip node in INBOX, applies #web_clip tag, writes Source URL field.
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
  type WebClipCapturePayload,
} from '../../src/lib/webclip-service.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';

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
    const result = findTagDefByName({}, CONTAINER_IDS.SCHEMA, 'web_clip');
    expect(result).toBeDefined();
    expect(result!.id).toBe('tagDef_web_clip');
    expect(result!.type).toBe('tagDef');
  });

  it('finds tagDef with different casing', () => {
    const result = findTagDefByName({}, CONTAINER_IDS.SCHEMA, 'Web_Clip');
    expect(result).toBeDefined();
    expect(result!.id).toBe('tagDef_web_clip');
  });

  it('returns undefined for non-existent tagDef name', () => {
    const result = findTagDefByName({}, CONTAINER_IDS.SCHEMA, 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('ignores _schemaId arg — always reads from CONTAINER_IDS.SCHEMA', () => {
    // New Loro model ignores _schemaId and reads from loroDoc directly.
    // So even a "wrong" schemaId still finds the tagDef in the real SCHEMA.
    const result = findTagDefByName({}, 'ws_missing_SCHEMA', 'web_clip');
    expect(result).toBeDefined();
    expect(result!.id).toBe('tagDef_web_clip');
  });
});

describe('findTemplateAttrDef', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('finds template fieldDef by name within tagDef', () => {
    const result = findTemplateAttrDef({}, 'tagDef_web_clip', 'Source URL');
    expect(result).toBeDefined();
    expect(result!.id).toBe('attrDef_source_url');
    expect(result!.type).toBe('fieldDef');
  });

  it('finds fieldDef case-insensitively', () => {
    const result = findTemplateAttrDef({}, 'tagDef_web_clip', 'source url');
    expect(result).toBeDefined();
    expect(result!.id).toBe('attrDef_source_url');
  });

  it('returns undefined for non-existent field name', () => {
    const result = findTemplateAttrDef({}, 'tagDef_web_clip', 'Nonexistent');
    expect(result).toBeUndefined();
  });

  it('returns undefined for non-existent tagDef', () => {
    const result = findTemplateAttrDef({}, 'nonexistent_tag', 'Source URL');
    expect(result).toBeUndefined();
  });

  it('Source URL attrDef has fieldType = URL', () => {
    const result = findTemplateAttrDef({}, 'tagDef_web_clip', 'Source URL');
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

  it('creates node in INBOX with title (default parentId)', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload();

    const clipId = await saveWebClip(payload, store);

    const node = loroDoc.toNodexNode(clipId);
    expect(node).toBeDefined();
    expect(node!.name).toBe('Test Article');
    expect(loroDoc.getParentId(clipId)).toBe(CONTAINER_IDS.INBOX);
    expect(loroDoc.getChildren(CONTAINER_IDS.INBOX)).toContain(clipId);
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
    expect(loroDoc.getChildren(CONTAINER_IDS.INBOX)).not.toContain(clipId);
  });

  it('tags node with #web_clip (reuses existing tagDef)', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload();

    const clipId = await saveWebClip(payload, store);

    const node = loroDoc.toNodexNode(clipId);
    expect(node!.tags).toContain('tagDef_web_clip');
  });

  it('writes Source URL field value', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ url: 'https://example.com/test' });

    const clipId = await saveWebClip(payload, store);

    // Find the source URL fieldDef within tagDef_web_clip
    const sourceUrlFd = findTemplateAttrDef({}, 'tagDef_web_clip', 'Source URL')!;
    expect(sourceUrlFd).toBeDefined();

    const feId = findFieldEntry(clipId, sourceUrlFd.id);
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

  it('creates tagDef if not yet in schema', async () => {
    // Move seed tagDef_web_clip to TRASH so findTagDefByName returns undefined
    loroDoc.moveNode('tagDef_web_clip', CONTAINER_IDS.TRASH);

    const store = useNodeStore.getState();
    const payload = makePayload();

    const clipId = await saveWebClip(payload, store);

    expect(loroDoc.hasNode(clipId)).toBe(true);

    // A new tagDef named 'web_clip' should exist in SCHEMA
    const newTagDef = findTagDefByName({}, CONTAINER_IDS.SCHEMA, 'web_clip');
    expect(newTagDef).toBeDefined();
    expect(newTagDef!.type).toBe('tagDef');
  });

  it('repeated clips reuse same tagDef', async () => {
    const store = useNodeStore.getState();
    const payload1 = makePayload({ title: 'First Clip', url: 'https://a.com' });
    const payload2 = makePayload({ title: 'Second Clip', url: 'https://b.com' });

    await saveWebClip(payload1, store);
    await saveWebClip(payload2, store);

    // Count how many tagDefs named 'web_clip' exist in SCHEMA
    const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
    const webClipDefs = schemaChildren.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'tagDef' && n.name?.toLowerCase() === 'web_clip';
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

  it('applies #web_clip tag to existing node', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload();

    await applyWebClipToNode('idea_1', payload, store);

    const node = loroDoc.toNodexNode('idea_1');
    expect(node!.tags).toContain('tagDef_web_clip');
  });

  it('writes Source URL field value to existing node', async () => {
    const store = useNodeStore.getState();
    const payload = makePayload({ url: 'https://example.com/clipped' });

    await applyWebClipToNode('idea_1', payload, store);

    const sourceUrlFd = findTemplateAttrDef({}, 'tagDef_web_clip', 'Source URL')!;
    const feId = findFieldEntry('idea_1', sourceUrlFd.id);
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

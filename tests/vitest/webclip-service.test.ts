import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import {
  findTagDefByName,
  findTemplateAttrDef,
  saveWebClip,
  applyWebClipToNode,
  type WebClipCapturePayload,
} from '../../src/lib/webclip-service.js';
import { SYS_A, SYS_D } from '../../src/types/index.js';

describe('webclip-service', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  // ─── findTagDefByName ───

  describe('findTagDefByName', () => {
    it('finds existing tagDef by name (case-insensitive)', () => {
      const { entities } = useNodeStore.getState();
      const result = findTagDefByName(entities, 'ws_default_SCHEMA', 'web_clip');
      expect(result).toBeDefined();
      expect(result!.id).toBe('tagDef_web_clip');
      expect(result!.props._docType).toBe('tagDef');
    });

    it('finds tagDef with different casing', () => {
      const { entities } = useNodeStore.getState();
      const result = findTagDefByName(entities, 'ws_default_SCHEMA', 'Web_Clip');
      expect(result).toBeDefined();
      expect(result!.id).toBe('tagDef_web_clip');
    });

    it('returns undefined for non-existent tagDef', () => {
      const { entities } = useNodeStore.getState();
      const result = findTagDefByName(entities, 'ws_default_SCHEMA', 'nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-existent schema', () => {
      const { entities } = useNodeStore.getState();
      const result = findTagDefByName(entities, 'ws_missing_SCHEMA', 'web_clip');
      expect(result).toBeUndefined();
    });
  });

  // ─── findTemplateAttrDef ───

  describe('findTemplateAttrDef', () => {
    it('finds template attrDef by name within tagDef', () => {
      const { entities } = useNodeStore.getState();
      const result = findTemplateAttrDef(entities, 'tagDef_web_clip', 'Source URL');
      expect(result).toBeDefined();
      expect(result!.id).toBe('attrDef_source_url');
      expect(result!.props._docType).toBe('attrDef');
    });

    it('returns undefined for non-existent field name', () => {
      const { entities } = useNodeStore.getState();
      const result = findTemplateAttrDef(entities, 'tagDef_web_clip', 'Nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-existent tagDef', () => {
      const { entities } = useNodeStore.getState();
      const result = findTemplateAttrDef(entities, 'nonexistent_tag', 'Source URL');
      expect(result).toBeUndefined();
    });
  });

  // ─── saveWebClip ───

  describe('saveWebClip', () => {
    const makePayload = (overrides?: Partial<WebClipCapturePayload>): WebClipCapturePayload => ({
      url: 'https://example.com/article',
      title: 'Test Article',
      selectionText: '',
      pageText: '<p>Article content</p>',
      capturedAt: Date.now(),
      ...overrides,
    });

    it('creates node in Inbox with title (default parentId)', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload();

      const clipId = await saveWebClip(payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      const clip = entities[clipId];
      expect(clip).toBeDefined();
      expect(clip!.props.name).toBe('Test Article');
      expect(clip!.props._ownerId).toBe('ws_default_INBOX');
      expect(entities.ws_default_INBOX.children).toContain(clipId);
    });

    it('creates node under custom parentId when provided', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload({ title: 'Custom Parent Clip' });

      const clipId = await saveWebClip(payload, store, 'ws_default', 'user_default', 'proj_1');

      const entities = useNodeStore.getState().entities;
      const clip = entities[clipId];
      expect(clip).toBeDefined();
      expect(clip!.props.name).toBe('Custom Parent Clip');
      expect(clip!.props._ownerId).toBe('proj_1');
      expect(entities.proj_1.children).toContain(clipId);
      // Should NOT be in Inbox
      expect(entities.ws_default_INBOX.children).not.toContain(clipId);
    });

    it('tags node with #web_clip (reuses existing tagDef)', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload();

      const clipId = await saveWebClip(payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      const clip = entities[clipId];
      expect(clip?.meta?.length).toBeGreaterThan(0);

      // Check SYS_A13 tag tuple referencing tagDef_web_clip in node.meta
      const tagTuple = clip!.meta?.find((cid) => {
        const t = entities[cid];
        return t?.props._docType === 'tuple' &&
          t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
          t.children?.[1] === 'tagDef_web_clip';
      });
      expect(tagTuple).toBeDefined();
    });

    it('writes Source URL field value', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload({ url: 'https://example.com/test' });

      const clipId = await saveWebClip(payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      const clip = entities[clipId];

      // Find the Source URL field tuple
      const urlTuple = clip!.children?.find((cid) => {
        const t = entities[cid];
        return t?.props._docType === 'tuple' && t.children?.[0] === 'attrDef_source_url';
      });
      expect(urlTuple).toBeDefined();

      // Check value node in tuple
      const tuple = entities[urlTuple!];
      const valueNodeId = tuple?.children?.[1];
      expect(valueNodeId).toBeDefined();
      expect(entities[valueNodeId!]?.props.name).toBe('https://example.com/test');

      // Check value node is also in associatedData.children (for FieldValueOutliner rendering)
      const assocId = clip!.associationMap?.[urlTuple!];
      expect(assocId).toBeDefined();
      const assoc = entities[assocId!];
      expect(assoc?.children).toContain(valueNodeId);
    });

    it('sets description when available', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload({ description: 'A great article about testing' });

      const clipId = await saveWebClip(payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      expect(entities[clipId]!.props.description).toBe('A great article about testing');
    });

    it('skips description when not provided', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload({ description: undefined });

      const clipId = await saveWebClip(payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      expect(entities[clipId]!.props.description).toBeUndefined();
    });

    it('creates tagDef if not yet in schema', async () => {
      // Remove the seed web_clip tagDef first
      useNodeStore.setState((state) => {
        const schema = state.entities.ws_default_SCHEMA;
        if (schema?.children) {
          schema.children = schema.children.filter(id => id !== 'tagDef_web_clip');
        }
        delete state.entities.tagDef_web_clip;
      });

      const store = useNodeStore.getState();
      const payload = makePayload();

      const clipId = await saveWebClip(payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      expect(entities[clipId]).toBeDefined();

      // A new tagDef named 'web_clip' should exist in schema
      const newTagDef = findTagDefByName(entities, 'ws_default_SCHEMA', 'web_clip');
      expect(newTagDef).toBeDefined();
      expect(newTagDef!.props._docType).toBe('tagDef');
    });

    it('repeated clips reuse same tagDef', async () => {
      const store = useNodeStore.getState();
      const payload1 = makePayload({ title: 'First Clip', url: 'https://a.com' });
      const payload2 = makePayload({ title: 'Second Clip', url: 'https://b.com' });

      await saveWebClip(payload1, store, 'ws_default', 'user_default');
      const store2 = useNodeStore.getState();
      await saveWebClip(payload2, store2, 'ws_default', 'user_default');

      // Count how many tagDefs named 'web_clip' exist in schema
      const entities = useNodeStore.getState().entities;
      const schema = entities.ws_default_SCHEMA;
      const webClipDefs = schema.children?.filter((cid) => {
        const n = entities[cid];
        return n?.props._docType === 'tagDef' && n.props.name?.toLowerCase() === 'web_clip';
      });
      expect(webClipDefs).toHaveLength(1);
    });
  });

  // ─── applyWebClipToNode ───

  describe('applyWebClipToNode', () => {
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

      await applyWebClipToNode('idea_1', payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      expect(entities.idea_1.props.name).toBe('Clipped Page Title');
    });

    it('applies #web_clip tag to existing node', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload();

      await applyWebClipToNode('idea_1', payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      const node = entities.idea_1;
      expect(node.meta?.length).toBeGreaterThan(0);

      const tagTuple = node.meta?.find((cid) => {
        const t = entities[cid];
        return t?.props._docType === 'tuple' &&
          t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
          t.children?.[1] === 'tagDef_web_clip';
      });
      expect(tagTuple).toBeDefined();
    });

    it('writes Source URL field value to existing node', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload({ url: 'https://example.com/clipped' });

      await applyWebClipToNode('idea_1', payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      const node = entities.idea_1;
      const urlTuple = node.children?.find((cid) => {
        const t = entities[cid];
        return t?.props._docType === 'tuple' && t.children?.[0] === 'attrDef_source_url';
      });
      expect(urlTuple).toBeDefined();

      const tuple = entities[urlTuple!];
      const valueNodeId = tuple?.children?.[1];
      expect(entities[valueNodeId!]?.props.name).toBe('https://example.com/clipped');

      // Check value node is also in associatedData.children
      const assocId = node.associationMap?.[urlTuple!];
      expect(assocId).toBeDefined();
      const assoc = entities[assocId!];
      expect(assoc?.children).toContain(valueNodeId);
    });

    it('sets description on existing node', async () => {
      const store = useNodeStore.getState();
      const payload = makePayload({ description: 'A clipped page description' });

      await applyWebClipToNode('idea_1', payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      expect(entities.idea_1.props.description).toBe('A clipped page description');
    });

    it('does not change node ownership (stays in original parent)', async () => {
      const ownerBefore = useNodeStore.getState().entities.idea_1.props._ownerId;
      const store = useNodeStore.getState();
      const payload = makePayload({ description: undefined });

      await applyWebClipToNode('idea_1', payload, store, 'ws_default', 'user_default');

      const entities = useNodeStore.getState().entities;
      expect(entities.idea_1).toBeDefined();
      expect(entities.idea_1.props._ownerId).toBe(ownerBefore);
    });
  });
});

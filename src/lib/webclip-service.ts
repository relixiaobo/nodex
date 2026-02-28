/**
 * Web Clip service — orchestrates saving a web clip as a node.
 *
 * Creates a node in Inbox, tags it with #web_clip, and writes the Source URL field.
 */
import type { NodexNode } from '../types/index.js';
import { SYS_D, CONTAINER_IDS } from '../types/index.js';
import type { WebClipCapturePayload } from './webclip-messaging.js';
import * as loroDoc from './loro-doc.js';
import { parseHtmlToNodes, createContentNodes } from './html-to-nodes.js';

// Re-export for convenience
export type { WebClipCapturePayload };

/** Minimal interface for the node store methods we need (testable without full store). */
export interface WebClipNodeStore {
  getNode(id: string): NodexNode | null;
  getChildren(parentId: string): NodexNode[];
  createChild(parentId: string, index?: number, data?: Partial<NodexNode>): NodexNode;
  applyTag(nodeId: string, tagDefId: string): void;
  setFieldValue(nodeId: string, fieldDefId: string, values: string[]): void;
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
  const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
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

/**
 * Save a web clip as a node in Inbox with #web_clip tag and Source URL field.
 *
 * @returns The ID of the newly created clip node.
 */
export async function saveWebClip(
  payload: WebClipCapturePayload,
  store: WebClipNodeStore,
  _workspaceId?: string,
  _userId?: string,
  parentId?: string,
): Promise<string> {
  const targetParentId = parentId ?? CONTAINER_IDS.INBOX;

  // 1. Find or create #web_clip tagDef
  let tagDef = findTagDefByName(null, CONTAINER_IDS.SCHEMA, 'web_clip');
  if (!tagDef) {
    tagDef = store.createTagDef('web_clip');
  }

  // 2. Ensure tagDef has a "Source URL" template field (type URL)
  let sourceUrlFieldDef = findTemplateAttrDef(null, tagDef.id, 'Source URL');
  if (!sourceUrlFieldDef) {
    sourceUrlFieldDef = store.createFieldDef('Source URL', SYS_D.URL, tagDef.id);
  }

  // 3. Create the clip node under parent (defaults to Inbox)
  const clipNode = store.createChild(targetParentId, undefined, { name: payload.title });

  // 4. Apply #web_clip tag
  store.applyTag(clipNode.id, tagDef.id);

  // 5. Write Source URL field value
  store.setFieldValue(clipNode.id, sourceUrlFieldDef.id, [payload.url]);

  // 6. Set description if available
  if (payload.description) {
    store.updateNodeDescription(clipNode.id, payload.description);
  }

  // 7. Parse and create content child nodes from page HTML
  if (payload.pageText) {
    const { nodes } = parseHtmlToNodes(payload.pageText, { maxNodes: 200 });
    if (nodes.length > 0) {
      createContentNodes(clipNode.id, nodes);
    }
  }

  return clipNode.id;
}

// ── URL Normalization & Clip Node Lookup ──

/**
 * Normalize a URL for comparison.
 * Strips fragment, trailing slash, www prefix, and upgrades http to https.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // http -> https
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }

    // Remove fragment
    parsed.hash = '';

    // Remove trailing slash (but keep root /)
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Remove www. prefix
    let hostname = parsed.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }

    return `${parsed.protocol}//${hostname}${pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * Find a #web_clip node by its Source URL field value.
 * Searches CLIPS, INBOX, and LIBRARY containers.
 *
 * @returns The node ID of the matching clip node, or null if not found.
 */
export function findClipNodeByUrl(url: string): string | null {
  const normalizedUrl = normalizeUrl(url);

  // Find the web_clip tagDef and its Source URL fieldDef
  const tagDef = findTagDefByName(null, CONTAINER_IDS.SCHEMA, 'web_clip');
  if (!tagDef) return null;

  const sourceUrlFieldDef = findTemplateAttrDef(null, tagDef.id, 'Source URL');
  if (!sourceUrlFieldDef) return null;

  // Search through CLIPS, INBOX, and LIBRARY containers
  const containers = [CONTAINER_IDS.CLIPS, CONTAINER_IDS.INBOX, CONTAINER_IDS.LIBRARY];

  for (const containerId of containers) {
    const children = loroDoc.getChildren(containerId);

    for (const childId of children) {
      const node = loroDoc.toNodexNode(childId);
      if (!node || !node.tags?.includes(tagDef.id)) continue;

      // Check Source URL field value
      const fieldEntryId = findFieldEntryForNode(childId, sourceUrlFieldDef.id);
      if (!fieldEntryId) continue;

      const fieldChildren = loroDoc.getChildren(fieldEntryId);
      if (fieldChildren.length === 0) continue;

      const valueNode = loroDoc.toNodexNode(fieldChildren[0]);
      if (valueNode?.name && normalizeUrl(valueNode.name) === normalizedUrl) {
        return childId;
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
 *
 * @returns The ID of the newly created clip node.
 */
export async function createLightweightClip(
  pageUrl: string,
  pageTitle: string,
  store: WebClipNodeStore,
): Promise<string> {
  // 1. Find or create #web_clip tagDef
  let tagDef = findTagDefByName(null, CONTAINER_IDS.SCHEMA, 'web_clip');
  if (!tagDef) {
    tagDef = store.createTagDef('web_clip');
  }

  // 2. Ensure Source URL field exists
  let sourceUrlFieldDef = findTemplateAttrDef(null, tagDef.id, 'Source URL');
  if (!sourceUrlFieldDef) {
    sourceUrlFieldDef = store.createFieldDef('Source URL', SYS_D.URL, tagDef.id);
  }

  // 3. Create clip node in INBOX (same default as saveWebClip)
  const clipNode = store.createChild(CONTAINER_IDS.INBOX, undefined, { name: pageTitle });

  // 4. Apply #web_clip tag
  store.applyTag(clipNode.id, tagDef.id);

  // 5. Write Source URL field value
  store.setFieldValue(clipNode.id, sourceUrlFieldDef.id, [pageUrl]);

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
  // 1. Find or create #web_clip tagDef
  let tagDef = findTagDefByName(null, CONTAINER_IDS.SCHEMA, 'web_clip');
  if (!tagDef) {
    tagDef = store.createTagDef('web_clip');
  }

  // 2. Ensure tagDef has a "Source URL" template field (type URL)
  let sourceUrlFieldDef = findTemplateAttrDef(null, tagDef.id, 'Source URL');
  if (!sourceUrlFieldDef) {
    sourceUrlFieldDef = store.createFieldDef('Source URL', SYS_D.URL, tagDef.id);
  }

  // 3. Rename node to page title
  store.setNodeName(nodeId, payload.title);

  // 4. Apply #web_clip tag
  store.applyTag(nodeId, tagDef.id);

  // 5. Write Source URL field value
  store.setFieldValue(nodeId, sourceUrlFieldDef.id, [payload.url]);

  // 6. Set description if available
  if (payload.description) {
    store.updateNodeDescription(nodeId, payload.description);
  }

  // 7. Parse and create content child nodes from page HTML (appended after existing children)
  if (payload.pageText) {
    const { nodes } = parseHtmlToNodes(payload.pageText, { maxNodes: 200 });
    if (nodes.length > 0) {
      createContentNodes(nodeId, nodes);
    }
  }
}

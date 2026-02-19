/**
 * Web Clip service — orchestrates saving a web clip as a node.
 *
 * Creates a node in Inbox, tags it with #web_clip, and writes the Source URL field.
 */
import type { NodexNode } from '../types/index.js';
import { SYS_D, CONTAINER_IDS } from '../types/index.js';
import type { WebClipCapturePayload } from './webclip-messaging.js';
import * as loroDoc from './loro-doc.js';

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
}

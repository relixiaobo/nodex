/**
 * Web Clip service — orchestrates saving a web clip as a node.
 *
 * Creates a node in Inbox, tags it with #web_clip, and writes the Source URL field.
 */
import type { NodexNode } from '../types/index.js';
import { SYS_A, SYS_D, getContainerId } from '../types/index.js';
import type { WebClipCapturePayload } from './webclip-messaging.js';

// Re-export for convenience
export type { WebClipCapturePayload };

/** Minimal interface for the node store methods we need (testable without full store). */
export interface WebClipNodeStore {
  entities: Record<string, NodexNode>;
  createChild(parentId: string, workspaceId: string, userId: string, name?: string): Promise<NodexNode>;
  applyTag(nodeId: string, tagDefId: string, workspaceId: string, userId: string): Promise<void>;
  setFieldValue(nodeId: string, attrDefId: string, valueText: string, workspaceId: string, userId: string): Promise<void>;
  updateNodeName(id: string, name: string, userId: string): Promise<void>;
  updateNodeDescription(id: string, description: string, userId: string): Promise<void>;
  createTagDef(name: string, workspaceId: string, userId: string): Promise<NodexNode>;
  createAttrDef(name: string, tagDefId: string, dataType: string, workspaceId: string, userId: string): Promise<NodexNode>;
}

/**
 * Find a tagDef by name within the SCHEMA container.
 * Returns the tagDef node or undefined.
 */
export function findTagDefByName(
  entities: Record<string, NodexNode>,
  schemaId: string,
  name: string,
): NodexNode | undefined {
  const schema = entities[schemaId];
  if (!schema?.children) return undefined;

  const lowerName = name.toLowerCase();
  for (const childId of schema.children) {
    const child = entities[childId];
    if (
      child?.props._docType === 'tagDef' &&
      child.props.name?.toLowerCase() === lowerName
    ) {
      return child;
    }
  }
  return undefined;
}

/**
 * Find a template attrDef (field definition) within a tagDef's template tuples.
 * Looks for a tuple whose children[0] is an attrDef with the given name.
 */
export function findTemplateAttrDef(
  entities: Record<string, NodexNode>,
  tagDefId: string,
  attrName: string,
): NodexNode | undefined {
  const tagDef = entities[tagDefId];
  if (!tagDef?.children) return undefined;

  const lowerName = attrName.toLowerCase();
  for (const childId of tagDef.children) {
    const child = entities[childId];
    if (child?.props._docType !== 'tuple') continue;
    const keyId = child.children?.[0];
    if (!keyId) continue;
    const attrDef = entities[keyId];
    if (
      attrDef?.props._docType === 'attrDef' &&
      attrDef.props.name?.toLowerCase() === lowerName
    ) {
      return attrDef;
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
  workspaceId: string,
  userId: string,
  parentId?: string,
): Promise<string> {
  const schemaId = getContainerId(workspaceId, 'SCHEMA');
  const targetParentId = parentId ?? getContainerId(workspaceId, 'INBOX');

  // 1. Find or create #web_clip tagDef
  let tagDef = findTagDefByName(store.entities, schemaId, 'web_clip');
  if (!tagDef) {
    tagDef = await store.createTagDef('web_clip', workspaceId, userId);
  }

  // 2. Ensure tagDef has a "Source URL" template field (type URL)
  let sourceUrlAttrDef = findTemplateAttrDef(store.entities, tagDef.id, 'Source URL');
  if (!sourceUrlAttrDef) {
    sourceUrlAttrDef = await store.createAttrDef('Source URL', tagDef.id, SYS_D.URL, workspaceId, userId);
  }

  // 3. Create the clip node under parent (defaults to Inbox)
  const clipNode = await store.createChild(targetParentId, workspaceId, userId, payload.title);

  // 4. Apply #web_clip tag (creates metanode + instantiates template fields)
  await store.applyTag(clipNode.id, tagDef.id, workspaceId, userId);

  // 5. Write Source URL field value
  await store.setFieldValue(clipNode.id, sourceUrlAttrDef.id, payload.url, workspaceId, userId);

  // 6. Set description if available
  if (payload.description) {
    await store.updateNodeDescription(clipNode.id, payload.description, userId);
  }

  return clipNode.id;
}

/**
 * Apply web clip data to an existing node in-place.
 *
 * Renames the node to the page title, applies #web_clip tag,
 * writes Source URL field, and sets description.
 */
export async function applyWebClipToNode(
  nodeId: string,
  payload: WebClipCapturePayload,
  store: WebClipNodeStore,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const schemaId = getContainerId(workspaceId, 'SCHEMA');

  // 1. Find or create #web_clip tagDef
  let tagDef = findTagDefByName(store.entities, schemaId, 'web_clip');
  if (!tagDef) {
    tagDef = await store.createTagDef('web_clip', workspaceId, userId);
  }

  // 2. Ensure tagDef has a "Source URL" template field (type URL)
  let sourceUrlAttrDef = findTemplateAttrDef(store.entities, tagDef.id, 'Source URL');
  if (!sourceUrlAttrDef) {
    sourceUrlAttrDef = await store.createAttrDef('Source URL', tagDef.id, SYS_D.URL, workspaceId, userId);
  }

  // 3. Rename node to page title
  await store.updateNodeName(nodeId, payload.title, userId);

  // 4. Apply #web_clip tag
  await store.applyTag(nodeId, tagDef.id, workspaceId, userId);

  // 5. Write Source URL field value
  await store.setFieldValue(nodeId, sourceUrlAttrDef.id, payload.url, workspaceId, userId);

  // 6. Set description if available
  if (payload.description) {
    await store.updateNodeDescription(nodeId, payload.description, userId);
  }
}

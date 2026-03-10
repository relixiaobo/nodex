import type { NodeType } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

type ReferenceLikeNode = {
  type?: NodeType;
  targetId?: string;
};

/**
 * Outliner content rows include:
 * - regular nodes (type undefined)
 * - reference nodes (type 'reference')
 * - search nodes (type 'search') — visible in SEARCHES container & as children
 * - codeBlock nodes (type 'codeBlock')
 * - image nodes (type 'image') — inline images from web clips
 * - embed nodes (type 'embed') — embedded media (YouTube etc.)
 * - tagDef nodes — visible in SCHEMA container
 */
export function isOutlinerContentNodeType(type: NodeType | undefined): boolean {
  return type === undefined || type === 'reference' || type === 'search' || type === 'codeBlock'
    || type === 'image' || type === 'embed' || type === 'tagDef';
}

export function resolveEffectiveId(
  nodeId: string,
  getNode: (id: string) => ReferenceLikeNode | null = loroDoc.toNodexNode,
): string {
  const rawNode = getNode(nodeId);
  return rawNode?.type === 'reference' && rawNode.targetId ? rawNode.targetId : nodeId;
}

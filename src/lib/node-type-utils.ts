import type { NodeType } from '../types/index.js';

/**
 * Outliner content rows include:
 * - regular nodes (type undefined)
 * - reference nodes (type 'reference')
 */
export function isOutlinerContentNodeType(type: NodeType | undefined): boolean {
  return type === undefined || type === 'reference';
}

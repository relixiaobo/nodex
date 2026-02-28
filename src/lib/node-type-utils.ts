import type { NodeType } from '../types/index.js';

/**
 * Outliner content rows include:
 * - regular nodes (type undefined)
 * - reference nodes (type 'reference')
 * - search nodes (type 'search') — visible in SEARCHES container & as children
 * - codeBlock nodes (type 'codeBlock')
 */
export function isOutlinerContentNodeType(type: NodeType | undefined): boolean {
  return type === undefined || type === 'reference' || type === 'search' || type === 'codeBlock';
}

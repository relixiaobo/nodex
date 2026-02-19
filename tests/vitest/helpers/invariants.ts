import * as loroDoc from '../../../src/lib/loro-doc.js';

/**
 * Core structural invariants for outliner tree safety (Loro model).
 * Verifies that all node children are in LoroDoc and have the correct parent.
 */
export function collectNodeGraphErrors(): string[] {
  const errors: string[] = [];
  const allIds = loroDoc.getAllNodeIds();

  for (const nodeId of allIds) {
    const children = loroDoc.getChildren(nodeId);
    const seen = new Set<string>();

    for (const childId of children) {
      // Child must exist in LoroDoc
      if (!loroDoc.hasNode(childId)) {
        errors.push(`child missing: parent=${nodeId} child=${childId}`);
      }
      // Parent must match
      const childParent = loroDoc.getParentId(childId);
      if (childParent !== nodeId) {
        errors.push(`parent mismatch: child=${childId} expected parent=${nodeId} actual=${childParent}`);
      }
      // No duplicate children
      if (seen.has(childId)) {
        errors.push(`duplicate child id: parent=${nodeId} child=${childId}`);
      }
      seen.add(childId);
    }
  }

  return errors;
}

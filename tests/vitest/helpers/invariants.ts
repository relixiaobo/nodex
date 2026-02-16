import type { NodexNode } from '../../../src/types/index.js';

/**
 * Core structural invariants for outliner tree safety.
 * These checks catch silent corruption after move/indent/outdent/trash flows.
 */
export function collectNodeGraphErrors(entities: Record<string, NodexNode>): string[] {
  const errors: string[] = [];
  const tupleValueRefs = new Set<string>();

  for (const node of Object.values(entities)) {
    if (node.props._docType !== 'tuple') continue;
    for (const childId of node.children?.slice(1) ?? []) {
      tupleValueRefs.add(childId);
    }
  }

  for (const [nodeId, node] of Object.entries(entities)) {
    const ownerId = node.props._ownerId;
    const docType = node.props._docType;

    // metanode/associatedData are linked via _metaNodeId/associationMap, not parent.children
    const shouldBeInOwnerChildren =
      ownerId &&
      docType !== 'metanode' &&
      docType !== 'associatedData';

    if (shouldBeInOwnerChildren) {
      const owner = entities[ownerId];
      if (!owner) {
        errors.push(`owner missing: node=${nodeId} owner=${ownerId}`);
      } else if (!owner.children?.includes(nodeId) && !tupleValueRefs.has(nodeId)) {
        errors.push(`owner-child mismatch: node=${nodeId} owner=${ownerId}`);
      }
    }

    const children = node.children ?? [];
    const seen = new Set<string>();

    // tuple children are key/value payloads; associatedData children can be
    // raw strings (e.g., color config "emerald"). Neither is guaranteed to be node IDs.
    const shouldValidateChildIds = docType !== 'tuple' && docType !== 'associatedData';
    for (const childId of children) {
      if (shouldValidateChildIds && !entities[childId]) {
        errors.push(`child missing: parent=${nodeId} child=${childId}`);
      }
      if (seen.has(childId)) {
        errors.push(`duplicate child id: parent=${nodeId} child=${childId}`);
      }
      seen.add(childId);
    }

    if (node.associationMap) {
      for (const [tupleId, assocId] of Object.entries(node.associationMap)) {
        if (!entities[tupleId]) {
          errors.push(`association key missing: node=${nodeId} tuple=${tupleId}`);
        }
        if (!entities[assocId]) {
          errors.push(`association value missing: node=${nodeId} assoc=${assocId}`);
        }
      }
    }
  }

  return errors;
}

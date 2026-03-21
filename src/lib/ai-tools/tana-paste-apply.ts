import * as loroDoc from '../loro-doc.js';
import { applyTagMutationsNoCommit, syncTemplateMutationsNoCommit, useNodeStore } from '../../stores/node-store.js';
import {
  ensureTagDefIdByName,
  resolveAndApplyFieldMutationsNoCommit,
  updateCheckedState,
} from './shared.js';
import type { ParsedTanaPasteNode } from './tana-paste-parser.js';

export const MAX_TANA_PASTE_CHILD_DEPTH = 3;

export interface TanaPasteApplySummary {
  nodeId: string;
  parentId: string;
  childrenCreated: number;
  createdFields: string[];
  unresolvedFields: string[];
  isReference?: boolean;
  targetId?: string;
}

function aggregateSummaries(
  target: Pick<TanaPasteApplySummary, 'childrenCreated' | 'createdFields' | 'unresolvedFields'>,
  next: Pick<TanaPasteApplySummary, 'childrenCreated' | 'createdFields' | 'unresolvedFields'>,
): void {
  target.childrenCreated += next.childrenCreated;
  target.createdFields.push(...next.createdFields);
  target.unresolvedFields.push(...next.unresolvedFields);
}

export function applyParsedNodeMutationsNoCommit(
  nodeId: string,
  parsedNode: ParsedTanaPasteNode,
): Pick<TanaPasteApplySummary, 'childrenCreated' | 'createdFields' | 'unresolvedFields'> {
  const summary: Pick<TanaPasteApplySummary, 'childrenCreated' | 'createdFields' | 'unresolvedFields'> = {
    childrenCreated: 0,
    createdFields: [],
    unresolvedFields: [],
  };

  for (const tagName of parsedNode.tags) {
    applyTagMutationsNoCommit(nodeId, ensureTagDefIdByName(tagName));
  }
  if (parsedNode.tags.length > 0) {
    syncTemplateMutationsNoCommit(nodeId);
  }

  if (parsedNode.checked !== null) {
    updateCheckedState(nodeId, parsedNode.checked);
  }

  if (parsedNode.fields.length > 0) {
    const fieldResult = resolveAndApplyFieldMutationsNoCommit(nodeId, parsedNode.fields);
    summary.createdFields.push(...fieldResult.created);
    summary.unresolvedFields.push(...fieldResult.unresolved);
  }

  const childInsertBase = loroDoc.getChildren(nodeId).length;
  parsedNode.children.forEach((child, index) => {
    const childSummary = createParsedNodeNoCommit(nodeId, childInsertBase + index, child, 1);
    aggregateSummaries(summary, childSummary);
  });
  summary.childrenCreated += parsedNode.children.length;

  return summary;
}

export function createParsedNodeNoCommit(
  parentId: string,
  index: number | undefined,
  parsedNode: ParsedTanaPasteNode,
  depth: number,
): TanaPasteApplySummary {
  if (depth > MAX_TANA_PASTE_CHILD_DEPTH) {
    throw new Error(`Nesting depth exceeds the maximum of ${MAX_TANA_PASTE_CHILD_DEPTH} levels.`);
  }

  const summary: TanaPasteApplySummary = {
    nodeId: '',
    parentId,
    childrenCreated: 0,
    createdFields: [],
    unresolvedFields: [],
  };

  if (parsedNode.targetId) {
    const refId = useNodeStore.getState().addReference(parentId, parsedNode.targetId, index);
    summary.nodeId = refId;
    summary.isReference = true;
    summary.targetId = parsedNode.targetId;
    return summary;
  }

  const created = useNodeStore.getState().createChild(parentId, index, {
    name: parsedNode.name,
    inlineRefs: parsedNode.inlineRefs,
  }, { commit: false });

  summary.nodeId = created.id;
  const childMutations = applyParsedNodeMutationsNoCommit(created.id, parsedNode);
  aggregateSummaries(summary, childMutations);
  return summary;
}

export function setParsedNodeNameNoCommit(nodeId: string, parsedNode: ParsedTanaPasteNode): boolean {
  const current = loroDoc.toNodexNode(nodeId);
  if (!current) return false;
  if (!parsedNode.name && parsedNode.inlineRefs.length === 0 && !parsedNode.targetId) {
    return false;
  }

  if (parsedNode.targetId) {
    const target = loroDoc.toNodexNode(parsedNode.targetId);
    loroDoc.setNodeRichTextContent(nodeId, '\uFFFC', [], [{
      offset: 0,
      targetNodeId: parsedNode.targetId,
      displayName: target?.name ?? parsedNode.name,
    }]);
    return true;
  }

  loroDoc.setNodeRichTextContent(nodeId, parsedNode.name, current.marks ?? [], parsedNode.inlineRefs);
  return true;
}

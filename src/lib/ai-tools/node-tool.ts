import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { StringEnum, Type } from '@mariozechner/pi-ai';
import { ensureTodayNode } from '../journal.js';
import { fuzzySort } from '../fuzzy-search.js';
import { AI_COMMIT_ORIGIN, commitDoc, withCommitOrigin } from '../loro-doc.js';
import * as loroDoc from '../loro-doc.js';
import { isNodeInTrash, isWorkspaceHomeNode } from '../node-capabilities.js';
import { getAncestorChain, getNavigableParentId } from '../tree-utils.js';
import { isOutlinerContentNodeType } from '../node-type-utils.js';
import { computeNodeFields } from '../../hooks/use-node-fields.js';
import { SYSTEM_NODE_IDS } from '../../types/index.js';
import { applyTagMutationsNoCommit, useNodeStore } from '../../stores/node-store.js';

const MAX_READ_DEPTH = 3;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

const nodeToolParameters = Type.Object({
  action: StringEnum(['create', 'read', 'update', 'delete', 'search']),
  name: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.String()),
  position: Type.Optional(Type.Integer({ minimum: 0 })),
  tags: Type.Optional(Type.Array(Type.String())),
  content: Type.Optional(Type.String()),
  nodeId: Type.Optional(Type.String()),
  depth: Type.Optional(Type.Integer({ minimum: 0, maximum: MAX_READ_DEPTH, default: 1 })),
  childOffset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  childLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })),
  addTags: Type.Optional(Type.Array(Type.String())),
  removeTags: Type.Optional(Type.Array(Type.String())),
  checked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  query: Type.Optional(Type.String()),
  searchTags: Type.Optional(Type.Array(Type.String())),
  dateRange: Type.Optional(Type.Object({
    from: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
  })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});

type NodeToolParams = typeof nodeToolParameters.static;

interface ChildSummary {
  id: string;
  name: string;
  hasChildren: boolean;
  childCount: number;
  tags: string[];
  checked: boolean | null;
  children?: {
    total: number;
    offset: number;
    limit: number;
    items: ChildSummary[];
  };
}

function normalizeTagName(tagName: string): string {
  return tagName.replace(/^#/, '').trim().toLowerCase();
}

function stripReferenceMarkup(text: string): string {
  return text.replace(/<(ref|cite)\s+id="[^"]+">([\s\S]*?)<\/\1>/g, '$2');
}

function toCheckedValue(nodeId: string): boolean | null {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return null;
  if (node.completedAt == null) return null;
  return node.completedAt > 0;
}

function isSearchCandidate(nodeId: string): boolean {
  if (isWorkspaceHomeNode(nodeId)) return false;
  if (isNodeInTrash(nodeId)) return false;
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return false;
  if (node.locked) return false;
  return isOutlinerContentNodeType(node.type);
}

function getTagDisplayNames(tagIds: string[]): string[] {
  return tagIds
    .map((tagId) => loroDoc.toNodexNode(tagId)?.name?.trim() ?? '')
    .filter(Boolean);
}

function findTagDefIdByName(tagName: string): string | null {
  const normalized = normalizeTagName(tagName);
  const candidates = loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)
    .map((childId) => loroDoc.toNodexNode(childId))
    .filter((node): node is NonNullable<ReturnType<typeof loroDoc.toNodexNode>> => node !== null && node.type === 'tagDef');

  const exact = candidates.find((node) => normalizeTagName(node.name ?? '') === normalized);
  if (exact) return exact.id;

  const fuzzy = fuzzySort(
    candidates.map((node) => ({ id: node.id, name: node.name ?? '' })),
    normalized,
    (item) => item.name,
    1,
  )[0];

  if (fuzzy && fuzzy._fuzzyScore >= 10) {
    return fuzzy.id;
  }

  return null;
}

function ensureTagDefIdByName(tagName: string): string {
  const existing = findTagDefIdByName(tagName);
  if (existing) return existing;

  const created = withCommitOrigin(AI_COMMIT_ORIGIN, () =>
    useNodeStore.getState().createTagDef(normalizeTagName(tagName)),
  );
  return created.id;
}

function summarizeChildren(nodeId: string, depth: number, offset: number, limit: number): {
  total: number;
  offset: number;
  limit: number;
  items: ChildSummary[];
} {
  const childIds = loroDoc.getChildren(nodeId).filter((childId) => {
    const child = loroDoc.toNodexNode(childId);
    return !!child && isOutlinerContentNodeType(child.type);
  });

  const pagedIds = childIds.slice(offset, offset + limit);
  const items = pagedIds.map((childId) => {
    const child = loroDoc.toNodexNode(childId)!;
    const contentChildren = loroDoc.getChildren(childId).filter((grandId) => {
      const grandchild = loroDoc.toNodexNode(grandId);
      return !!grandchild && isOutlinerContentNodeType(grandchild.type);
    });

    const summary: ChildSummary = {
      id: child.id,
      name: child.name ?? '',
      hasChildren: contentChildren.length > 0,
      childCount: contentChildren.length,
      tags: getTagDisplayNames(child.tags),
      checked: toCheckedValue(child.id),
    };

    if (depth > 1 && contentChildren.length > 0) {
      summary.children = summarizeChildren(child.id, depth - 1, 0, DEFAULT_PAGE_SIZE);
    }

    return summary;
  });

  return {
    total: childIds.length,
    offset,
    limit,
    items,
  };
}

function readNode(nodeId: string, params: NodeToolParams) {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const store = useNodeStore.getState();
  const fields = computeNodeFields(store.getNode, store.getChildren, nodeId)
    .filter((field) => !field.isEmpty)
    .map((field) => ({
      name: field.attrDefName,
      value: field.valueName ?? '',
    }));

  const depth = Math.min(params.depth ?? 1, MAX_READ_DEPTH);
  const childOffset = params.childOffset ?? 0;
  const childLimit = Math.min(params.childLimit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const parentId = getNavigableParentId(nodeId);
  const parentNode = parentId ? loroDoc.toNodexNode(parentId) : null;
  const { ancestors, workspaceRootId } = getAncestorChain(nodeId);

  return {
    id: node.id,
    name: node.name ?? '',
    description: node.description ?? '',
    tags: getTagDisplayNames(node.tags),
    fields,
    checked: toCheckedValue(node.id),
    parent: parentNode ? { id: parentNode.id, name: parentNode.name ?? parentNode.id } : null,
    breadcrumb: ancestors
      .filter((ancestor) => ancestor.id !== workspaceRootId)
      .map((ancestor) => ancestor.name),
    children: summarizeChildren(nodeId, depth, childOffset, childLimit),
  };
}

function updateCheckedState(nodeId: string, checked: boolean | null): boolean {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return false;

  const nextCompletedAt = checked === null ? undefined : (checked ? Date.now() : 0);
  if (nextCompletedAt === undefined) {
    loroDoc.deleteNodeData(nodeId, 'completedAt');
  } else {
    loroDoc.setNodeData(nodeId, 'completedAt', nextCompletedAt);
  }
  return true;
}

function createNodeAction(params: NodeToolParams) {
  const parentId = params.parentId ?? ensureTodayNode();
  const name = params.name?.trim();
  if (!name) throw new Error('name is required for node.create');

  const created = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();
    const nextNode = store.createChild(parentId, params.position, {
      name,
      description: params.content ? stripReferenceMarkup(params.content) : undefined,
    }, { commit: false });

    for (const tagName of params.tags ?? []) {
      const tagDefId = ensureTagDefIdByName(tagName);
      applyTagMutationsNoCommit(nextNode.id, tagDefId);
    }

    commitDoc();
    return nextNode;
  });

  const parentNode = loroDoc.toNodexNode(parentId);
  return {
    id: created.id,
    name: created.name ?? name,
    parentId,
    parentName: parentNode?.name ?? parentId,
    tags: getTagDisplayNames(loroDoc.toNodexNode(created.id)?.tags ?? []),
  };
}

function updateNodeAction(params: NodeToolParams) {
  if (!params.nodeId) throw new Error('nodeId is required for node.update');
  const node = loroDoc.toNodexNode(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  const updated = new Set<string>();

  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();

    if (params.name !== undefined) {
      loroDoc.setNodeRichTextContent(params.nodeId!, params.name, node.marks ?? [], node.inlineRefs ?? []);
      updated.add('name');
    }

    if (params.content !== undefined) {
      loroDoc.setNodeData(params.nodeId!, 'description', stripReferenceMarkup(params.content) || undefined);
      updated.add('content');
    }

    if (params.checked !== undefined && updateCheckedState(params.nodeId!, params.checked)) {
      updated.add('checked');
    }

    if ((params.addTags?.length ?? 0) > 0) {
      for (const tagName of params.addTags ?? []) {
        const tagDefId = ensureTagDefIdByName(tagName);
        applyTagMutationsNoCommit(params.nodeId!, tagDefId);
      }
      updated.add('tags');
    }

    if ((params.removeTags?.length ?? 0) > 0) {
      for (const tagName of params.removeTags ?? []) {
        const tagDefId = findTagDefIdByName(tagName);
        if (!tagDefId) continue;
        store.removeTag(params.nodeId!, tagDefId, { commit: false });
        updated.add('tags');
      }
    }

    if (params.parentId) {
      store.moveNodeTo(params.nodeId!, params.parentId!, params.position, { commit: false });
      updated.add('position');
    }

    if (updated.size > 0) {
      commitDoc();
    }
  });

  return {
    id: params.nodeId,
    name: loroDoc.toNodexNode(params.nodeId)?.name ?? '',
    updated: Array.from(updated),
  };
}

function deleteNodeAction(nodeId: string) {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    useNodeStore.getState().trashNode(nodeId, { commit: false });
    commitDoc();
  });

  return {
    id: nodeId,
    name: node.name ?? '',
    movedToTrash: true,
  };
}

function toRangeStart(dateText?: string): number | null {
  if (!dateText) return null;
  const value = new Date(`${dateText}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function toRangeEnd(dateText?: string): number | null {
  if (!dateText) return null;
  const value = new Date(`${dateText}T23:59:59.999`).getTime();
  return Number.isFinite(value) ? value : null;
}

function searchNodesAction(params: NodeToolParams) {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = params.offset ?? 0;
  const query = params.query?.trim() ?? '';
  const requiredTagIds = (params.searchTags ?? [])
    .map((tagName) => findTagDefIdByName(tagName))
    .filter((tagId): tagId is string => !!tagId);
  const hasMissingTag = (params.searchTags?.length ?? 0) > requiredTagIds.length;
  if (hasMissingTag) {
    return { total: 0, offset, limit, items: [] };
  }

  const fromTs = toRangeStart(params.dateRange?.from);
  const toTs = toRangeEnd(params.dateRange?.to);

  const candidates = loroDoc.getAllNodeIds()
    .filter(isSearchCandidate)
    .map((nodeId) => loroDoc.toNodexNode(nodeId)!)
    .filter((node) => requiredTagIds.every((tagId) => node.tags.includes(tagId)))
    .filter((node) => fromTs === null || node.createdAt >= fromTs)
    .filter((node) => toTs === null || node.createdAt <= toTs);

  const ranked = query
    ? fuzzySort(
      candidates.map((node) => ({
        ...node,
        _haystack: `${node.name ?? ''}\n${node.description ?? ''}`,
      })),
      query,
      (item) => item._haystack,
      candidates.length,
    )
    : candidates
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((node) => ({ ...node, _fuzzyScore: 0, _fuzzyRanges: [] }));

  const items = ranked.slice(offset, offset + limit).map((node) => {
    const snippetSource = [node.name ?? '', node.description ?? ''].filter(Boolean).join(' — ');
    const parentId = getNavigableParentId(node.id);
    const parentName = parentId ? (loroDoc.toNodexNode(parentId)?.name ?? parentId) : '';
    return {
      id: node.id,
      name: node.name ?? '',
      tags: getTagDisplayNames(node.tags),
      snippet: snippetSource.length > 180 ? `${snippetSource.slice(0, 177)}...` : snippetSource,
      createdAt: new Date(node.createdAt).toISOString(),
      parentName,
    };
  });

  return {
    total: ranked.length,
    offset,
    limit,
    items,
  };
}

function formatResultText(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

async function executeNodeTool(params: NodeToolParams): Promise<AgentToolResult<unknown>> {
  const action = params.action;
  const result = (() => {
    switch (action) {
      case 'create':
        return createNodeAction(params);
      case 'read':
        if (!params.nodeId) throw new Error('nodeId is required for node.read');
        return readNode(params.nodeId, params);
      case 'update':
        return updateNodeAction(params);
      case 'delete':
        if (!params.nodeId) throw new Error('nodeId is required for node.delete');
        return deleteNodeAction(params.nodeId);
      case 'search':
        return searchNodesAction(params);
      default:
        throw new Error(`Unsupported node action: ${action}`);
    }
  })();

  return {
    content: [{ type: 'text', text: formatResultText(result) }],
    details: result,
  };
}

export const nodeTool: AgentTool<typeof nodeToolParameters, unknown> = {
  name: 'node',
  label: 'Node',
  description: [
    'Create, read, update, delete, or search nodes in the knowledge graph.',
    'Use tag display names instead of internal IDs.',
    'Write operations are committed with ai:chat and can be undone with the undo tool.',
  ].join(' '),
  parameters: nodeToolParameters,
  execute: async (_toolCallId, params) => executeNodeTool(params),
};

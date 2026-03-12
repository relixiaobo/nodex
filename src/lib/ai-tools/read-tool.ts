/**
 * node_read — Read a node's content, fields, and children.
 *
 * Fields show type and available options. Field entries appear in the fields
 * array, not in children — children only lists content nodes and references.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import * as loroDoc from '../loro-doc.js';
import { isOutlinerContentNodeType } from '../node-type-utils.js';
import { computeNodeFields } from '../../hooks/use-node-fields.js';
import { resolveDataType } from '../field-utils.js';
import { getAncestorChain, getNavigableParentId } from '../tree-utils.js';
import { useNodeStore } from '../../stores/node-store.js';
import {
  MAX_READ_DEPTH,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  getTagDisplayNames,
  toCheckedValue,
  formatResultText,
} from './shared.js';

const readToolParameters = Type.Object({
  nodeId: Type.String(),
  depth: Type.Optional(Type.Integer({ minimum: 0, maximum: MAX_READ_DEPTH, default: 1 })),
  childOffset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  childLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })),
});

type ReadToolParams = typeof readToolParameters.static;

interface ChildSummary {
  id: string;
  name: string;
  hasChildren: boolean;
  childCount: number;
  tags: string[];
  checked: boolean | null;
  isReference?: boolean;
  targetId?: string;
  children?: {
    total: number;
    offset: number;
    limit: number;
    items: ChildSummary[];
  };
}

interface EnhancedField {
  name: string;
  type: string;
  value: string;
  fieldEntryId: string;
  valueNodeId: string | null;
  options?: string[];
}

const TOP_LEVEL_DATA_KEYS = new Set([
  'id',
  'type',
  'name',
  'description',
  'tags',
  'createdAt',
  'updatedAt',
  'richText',
]);

/**
 * Get available options for an options-type field.
 */
function getFieldOptions(fieldDefId: string): string[] | undefined {
  const dataType = resolveDataType(fieldDefId);
  if (dataType !== 'options' && dataType !== 'options_from_supertag') return undefined;

  const children = loroDoc.getChildren(fieldDefId);
  const options: string[] = [];
  for (const cid of children) {
    const child = loroDoc.toNodexNode(cid);
    if (child?.name) {
      options.push(child.name);
    }
  }
  return options;
}

/**
 * Check if a child node is a content node (not a fieldEntry).
 */
function isContentChild(childId: string): boolean {
  const child = loroDoc.toNodexNode(childId);
  return !!child && isOutlinerContentNodeType(child.type);
}

/**
 * Build the children summary, filtering out fieldEntry nodes and marking references.
 */
function summarizeChildren(nodeId: string, depth: number, offset: number, limit: number): {
  total: number;
  offset: number;
  limit: number;
  items: ChildSummary[];
} {
  const childIds = loroDoc.getChildren(nodeId).filter(isContentChild);
  const pagedIds = childIds.slice(offset, offset + limit);

  const items = pagedIds.map((childId) => {
    const child = loroDoc.toNodexNode(childId)!;
    const contentChildren = loroDoc.getChildren(childId).filter(isContentChild);

    const summary: ChildSummary = {
      id: child.id,
      name: child.name ?? '',
      hasChildren: contentChildren.length > 0,
      childCount: contentChildren.length,
      tags: getTagDisplayNames(child.tags),
      checked: toCheckedValue(child.id),
    };

    // Mark reference nodes
    if (child.type === 'reference' && child.targetId) {
      summary.isReference = true;
      summary.targetId = child.targetId;
      // For references, resolve the target's name
      const target = loroDoc.toNodexNode(child.targetId);
      if (target?.name) {
        summary.name = target.name;
      }
    }

    if (depth > 1 && contentChildren.length > 0) {
      summary.children = summarizeChildren(child.id, depth - 1, 0, DEFAULT_PAGE_SIZE);
    }

    return summary;
  });

  return { total: childIds.length, offset, limit, items };
}

/**
 * Build enhanced field list with type, options, entryId, valueNodeId.
 */
function buildEnhancedFields(nodeId: string): EnhancedField[] {
  const store = useNodeStore.getState();
  const fields = computeNodeFields(store.getNode, store.getChildren, nodeId);

  return fields
    .filter((f) => !f.isSystemConfig)
    .map((f) => {
      const dataType = resolveDataType(f.fieldDefId);
      const options = getFieldOptions(f.fieldDefId);

      // For options fields, resolve display name from targetId
      let displayValue = f.valueName ?? '';
      if (!displayValue && f.valueNodeId) {
        const valueNode = loroDoc.toNodexNode(f.valueNodeId);
        if (valueNode?.targetId) {
          const target = loroDoc.toNodexNode(valueNode.targetId);
          displayValue = target?.name ?? '';
        }
      }

      return {
        name: f.attrDefName,
        type: dataType,
        value: displayValue,
        fieldEntryId: f.fieldEntryId,
        valueNodeId: f.valueNodeId ?? null,
        ...(options ? { options } : {}),
      };
    });
}

function buildNodeData(nodeId: string): Record<string, unknown> {
  const rawData = loroDoc.getNodeData(nodeId) ?? {};

  return Object.fromEntries(
    Object.entries(rawData).filter(([key, value]) => !TOP_LEVEL_DATA_KEYS.has(key) && value !== undefined),
  );
}

async function executeReadTool(params: ReadToolParams): Promise<AgentToolResult<unknown>> {
  const node = loroDoc.toNodexNode(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  const depth = Math.min(params.depth ?? 1, MAX_READ_DEPTH);
  const childOffset = params.childOffset ?? 0;
  const childLimit = Math.min(params.childLimit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const parentId = getNavigableParentId(params.nodeId);
  const parentNode = parentId ? loroDoc.toNodexNode(parentId) : null;
  const { ancestors, workspaceRootId } = getAncestorChain(params.nodeId);

  const result = {
    id: node.id,
    type: node.type ?? null,
    name: node.name ?? '',
    description: node.description ?? '',
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    tags: getTagDisplayNames(node.tags),
    nodeData: buildNodeData(params.nodeId),
    fields: buildEnhancedFields(params.nodeId),
    checked: toCheckedValue(node.id),
    parent: parentNode ? { id: parentNode.id, name: parentNode.name ?? parentNode.id } : null,
    breadcrumb: ancestors
      .filter((ancestor) => ancestor.id !== workspaceRootId)
      .map((ancestor) => ancestor.name),
    children: summarizeChildren(params.nodeId, depth, childOffset, childLimit),
  };

  return {
    content: [{ type: 'text', text: formatResultText(result) }],
    details: result,
  };
}

export const readTool: AgentTool<typeof readToolParameters, unknown> = {
  name: 'node_read',
  label: 'Read Node',
  description: [
    'Read a node\'s raw type/data, content, fields, and children. Fields show type',
    'and available options. Field entries are in the fields array, not in children',
    '— children only lists content nodes and references.',
    '',
    'Use node_read to inspect raw nodeData like fieldType/color/cardinality before',
    'editing, or to discover field entry IDs for direct manipulation.',
  ].join('\n'),
  parameters: readToolParameters,
  execute: async (_toolCallId, params) => executeReadTool(params),
};

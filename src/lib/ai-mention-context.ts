/**
 * Build a <mentioned-nodes> context block for @ mentions in chat.
 *
 * Reads pendingMentions from ui-store, resolves each nodeId to a
 * text summary (name, tags, fields, children), and formats for
 * injection into the system reminder.
 *
 * Does NOT clear pendingMentions — they persist until the next
 * user message overwrites them (see ChatInput handleSend).
 */
import type { InlineRefEntry } from '../types/index.js';
import * as loroDoc from './loro-doc.js';
import { isOutlinerContentNodeType } from './node-type-utils.js';
import { computeNodeFields } from '../hooks/use-node-fields.js';
import { useNodeStore } from '../stores/node-store.js';
import { useUIStore } from '../stores/ui-store.js';
import { getTagDisplayNames } from './ai-tools/shared.js';

// ─── Limits ───

const MAX_MENTION_NODES = 5;
const MAX_MENTION_CHARS = 3000;

function getChildrenLimit(mentionCount: number): number {
  if (mentionCount <= 1) return 10;
  if (mentionCount <= 3) return 5;
  return 3;
}

// ─── Helpers ───

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isContentChild(childId: string): boolean {
  const child = loroDoc.toNodexNode(childId);
  return !!child && isOutlinerContentNodeType(child.type);
}

function getContentChildIds(nodeId: string): string[] {
  return loroDoc.getChildren(nodeId).filter(isContentChild);
}

// ─── Field summary ───

interface FieldSummary {
  name: string;
  value: string;
}

function buildFieldSummaries(nodeId: string): FieldSummary[] {
  const store = useNodeStore.getState();
  const fields = computeNodeFields(store.getNode, store.getChildren, nodeId);

  const result: FieldSummary[] = [];
  for (const f of fields) {
    if (f.isSystemConfig) continue;

    let displayValue = f.valueName ?? '';
    if (!displayValue && f.valueNodeId) {
      const valueNode = loroDoc.toNodexNode(f.valueNodeId);
      if (valueNode?.targetId) {
        const target = loroDoc.toNodexNode(valueNode.targetId);
        displayValue = target?.name ?? '';
      }
    }

    if (displayValue) {
      result.push({ name: f.attrDefName, value: displayValue });
    }
  }
  return result;
}

// ─── Child summary ───

interface ChildLine {
  id: string;
  name: string;
  childCount: number;
  tags: string[];
}

function buildChildLines(nodeId: string, limit: number): { lines: ChildLine[]; total: number } {
  const childIds = getContentChildIds(nodeId);
  const sliced = childIds.slice(0, limit);

  const lines: ChildLine[] = [];
  for (const cid of sliced) {
    const child = loroDoc.toNodexNode(cid);
    if (!child) continue;

    let name = child.name ?? '';
    if (child.type === 'reference' && child.targetId) {
      const target = loroDoc.toNodexNode(child.targetId);
      if (target?.name) name = target.name;
    }

    lines.push({
      id: cid,
      name,
      childCount: getContentChildIds(cid).length,
      tags: getTagDisplayNames(child.tags),
    });
  }

  return { lines, total: childIds.length };
}

// ─── Format single node ───

function formatNodeSummary(nodeId: string, childrenLimit: number): string | null {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) return null;

  const name = node.name ?? nodeId;
  const parts: string[] = [];

  // Header
  parts.push(`"${escapeXml(name)}" (id: ${nodeId})`);

  // Tags
  const tags = getTagDisplayNames(node.tags);
  if (tags.length > 0) {
    parts.push(`Tags: ${tags.map((t) => `#${escapeXml(t)}`).join(', ')}`);
  }

  // Fields
  const fields = buildFieldSummaries(nodeId);
  if (fields.length > 0) {
    parts.push('Fields:');
    for (const f of fields) {
      parts.push(`  ${escapeXml(f.name)}: ${escapeXml(f.value)}`);
    }
  }

  // Children
  const { lines, total } = buildChildLines(nodeId, childrenLimit);
  if (total > 0) {
    const showing = lines.length < total ? `${lines.length} of ${total}` : `${total}`;
    parts.push(`Children (${showing}):`);
    for (const child of lines) {
      const tagSuffix = child.tags.length > 0 ? `, ${child.tags.map((t) => `#${escapeXml(t)}`).join(', ')}` : '';
      parts.push(`  - "${escapeXml(child.name)}" (id: ${child.id}, ${child.childCount} children${tagSuffix})`);
    }
  }

  return parts.join('\n');
}

// ─── Public API ───

/**
 * De-duplicate mentions by targetNodeId, preserving first occurrence order.
 */
function deduplicateMentions(mentions: InlineRefEntry[]): InlineRefEntry[] {
  const seen = new Set<string>();
  const result: InlineRefEntry[] = [];
  for (const m of mentions) {
    if (!seen.has(m.targetNodeId)) {
      seen.add(m.targetNodeId);
      result.push(m);
    }
  }
  return result;
}

/**
 * Build the <mentioned-nodes> context block for system reminder injection.
 * Returns null if no pending mentions.
 */
export function buildMentionContext(): string | null {
  const mentions = useUIStore.getState().pendingMentions;
  if (mentions.length === 0) return null;

  const unique = deduplicateMentions(mentions);
  const total = unique.length;

  // Split into detailed (up to MAX_MENTION_NODES) and overflow
  const detailed = unique.slice(0, MAX_MENTION_NODES);
  const overflow = unique.slice(MAX_MENTION_NODES);

  const childrenLimit = getChildrenLimit(detailed.length);
  const sections: string[] = [];

  // Preamble
  sections.push(
    'The user referenced these nodes with @. Content shown below — use node_read only if you need deeper children or full details.',
  );

  // Detailed summaries
  for (let i = 0; i < detailed.length; i++) {
    const summary = formatNodeSummary(detailed[i].targetNodeId, childrenLimit);
    if (!summary) continue;
    sections.push(`\n[${i + 1}/${total}] ${summary}`);
  }

  // Overflow list
  if (overflow.length > 0) {
    const overflowLines = overflow
      .map((m) => {
        const node = loroDoc.toNodexNode(m.targetNodeId);
        const name = node?.name ?? m.displayName ?? m.targetNodeId;
        return `"${escapeXml(name)}" (id: ${m.targetNodeId})`;
      })
      .join(', ');
    sections.push(`\nAlso mentioned: ${overflowLines}. Use node_read to inspect.`);
  }

  let body = sections.join('\n');

  // Budget enforcement: progressively reduce children until under limit
  let currentLimit = childrenLimit;
  while (body.length > MAX_MENTION_CHARS && currentLimit > 0) {
    currentLimit = Math.max(0, Math.floor(currentLimit / 2));
    const reduced: string[] = [sections[0]];
    for (let i = 0; i < detailed.length; i++) {
      const summary = formatNodeSummary(detailed[i].targetNodeId, currentLimit);
      if (!summary) continue;
      reduced.push(`\n[${i + 1}/${total}] ${summary}`);
    }
    if (overflow.length > 0) {
      reduced.push(sections[sections.length - 1]);
    }
    body = reduced.join('\n');
  }

  return `<mentioned-nodes>\n${body}\n</mentioned-nodes>`;
}

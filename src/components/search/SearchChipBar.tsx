/**
 * SearchChipBar — read-only chip display for search node queryConditions.
 * @see docs/plans/search-node-design.md § 5.2
 */
import { useMemo } from 'react';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import * as loroDoc from '../../lib/loro-doc.js';
import type { NodexNode } from '../../types/node.js';

interface SearchChipBarProps { searchNodeId: string; }

export function getChipTextForCondition(condition: NodexNode): string {
  if (condition.queryLogic) {
    const childTexts = condition.children
      .map((id) => loroDoc.toNodexNode(id))
      .filter((n): n is NodexNode => n !== null && n.type === 'queryCondition')
      .map((c) => getChipTextForCondition(c));
    if (condition.queryLogic === 'NOT') return `Exclude: ${childTexts.join(', ')}`;
    return childTexts.join(condition.queryLogic === 'OR' ? ' | ' : ', ');
  }
  return getLeafChipText(condition);
}

function getLeafChipText(condition: NodexNode): string {
  const op = condition.queryOp;
  if (!op) return '?';
  switch (op) {
    case 'HAS_TAG': {
      const tagDefId = condition.queryTagDefId;
      if (!tagDefId) return '#?';
      const tagDef = loroDoc.toNodexNode(tagDefId);
      return `#${tagDef?.name?.replace(/<[^>]+>/g, '').trim() ?? tagDefId}`;
    }
    case 'NOT_DONE': return 'Not done';
    case 'DONE': return 'Done';
    case 'TODO': return 'Has checkbox';
    default: return op as string;
  }
}

export function collectChipEntries(searchNodeId: string): { id: string; text: string }[] {
  const searchNode = loroDoc.toNodexNode(searchNodeId);
  if (!searchNode || searchNode.type !== 'search') return [];
  const conditions = searchNode.children
    .map((id) => loroDoc.toNodexNode(id))
    .filter((n): n is NodexNode => n !== null && n.type === 'queryCondition');
  const chips: { id: string; text: string }[] = [];
  for (const cond of conditions) {
    if (cond.queryLogic === 'AND') {
      for (const leafId of cond.children) {
        const leaf = loroDoc.toNodexNode(leafId);
        if (!leaf || leaf.type !== 'queryCondition') continue;
        chips.push({ id: leafId, text: getChipTextForCondition(leaf) });
      }
    } else {
      chips.push({ id: cond.id, text: getChipTextForCondition(cond) });
    }
  }
  return chips;
}

export function SearchChipBar({ searchNodeId }: SearchChipBarProps) {
  const _version = useNodeStore((s) => s._version);
  const node = useNode(searchNodeId);
  const chips = useMemo(() => {
    if (!node || node.type !== 'search') return [];
    return collectChipEntries(searchNodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchNodeId, node?.children, _version]);
  const resultCount = useMemo(() => {
    if (!node) return 0;
    return node.children.filter((id) => {
      const child = loroDoc.toNodexNode(id);
      return child?.type === 'reference';
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.children, _version]);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
      {chips.map((chip) => (
        <span key={chip.id} className="inline-flex items-center rounded-md bg-foreground/[0.06] px-2 py-0.5 text-xs text-foreground-secondary select-none">
          {chip.text}
        </span>
      ))}
      <span className="text-xs text-foreground-tertiary ml-1">{resultCount} {resultCount === 1 ? 'result' : 'results'}</span>
    </div>
  );
}

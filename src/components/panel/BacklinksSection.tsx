/**
 * BacklinksSection — collapsible references panel at the bottom of NodePanel.
 *
 * Shows "N references" header that expands to reveal:
 *   - "Mentioned in..." group: tree references + inline references with breadcrumbs
 *   - "Appears as [Field] in..." groups: field value references by field name
 *
 * Matches Tana's backlinks UI behavior:
 *   - Default collapsed, resets on nodeId change
 *   - Breadcrumb paths are clickable (navigate to ancestor)
 *   - Reference entries are clickable (navigate to referencing node)
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ChevronDown } from '../../lib/icons.js';
import { useBacklinks } from '../../hooks/use-backlinks';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { resolveTagColor } from '../../lib/tag-colors.js';
import type { MentionedInRef, FieldValueRef, BacklinksResult } from '../../lib/backlinks.js';
import type { AncestorInfo } from '../../lib/tree-utils.js';

interface BacklinksSectionProps {
  nodeId: string;
}

export function BacklinksSection({ nodeId }: BacklinksSectionProps) {
  const result = useBacklinks(nodeId);
  const [expanded, setExpanded] = useState(false);

  // Reset collapse state when navigating to a different node
  useEffect(() => {
    setExpanded(false);
  }, [nodeId]);

  if (result.totalCount === 0) return null;

  return (
    <div className="mt-12 pl-[21px] pr-4 pb-4">
      {/* Header: "N references" toggle */}
      <button
        className="flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded
          ? <ChevronDown size={14} className="shrink-0" />
          : <ChevronRight size={14} className="shrink-0" />
        }
        <span className="tabular-nums">{result.totalCount}</span>
        <span>{result.totalCount === 1 ? 'reference' : 'references'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {/* Mentioned in... */}
          {result.mentionedIn.length > 0 && (
            <MentionedInGroup items={result.mentionedIn} />
          )}

          {/* Appears as [Field] in... */}
          {Object.entries(result.fieldValueRefs).map(([fieldName, refs]) => (
            <FieldValueGroup key={fieldName} fieldName={fieldName} items={refs} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mentioned in... ───

function MentionedInGroup({ items }: { items: MentionedInRef[] }) {
  return (
    <div>
      <div className="text-xs text-foreground-tertiary mb-2">Mentioned in...</div>
      <div className="space-y-2">
        {items.map((ref) => (
          <MentionedInItem key={`${ref.refType}:${ref.refNodeId}`} item={ref} />
        ))}
      </div>
    </div>
  );
}

function MentionedInItem({ item }: { item: MentionedInRef }) {
  const navigateTo = useUIStore(s => s.navigateTo);

  const handleNavigate = useCallback(() => {
    navigateTo(item.referencingNodeId);
  }, [navigateTo, item.referencingNodeId]);

  return (
    <div>
      {/* Breadcrumb */}
      {item.breadcrumb.length > 0 && (
        <BreadcrumbPath ancestors={item.breadcrumb} />
      )}
      {/* Content box */}
      <div
        className="mt-1 py-1 px-2.5 bg-muted/50 border-l-2 border-primary/20 rounded-r-sm cursor-pointer hover:bg-muted/80 transition-colors"
        onClick={handleNavigate}
      >
        <div className="flex items-start gap-1.5">
          <span className="mt-[5px] shrink-0 w-1.5 h-1.5 rounded-full bg-foreground-tertiary" />
          <span className="text-sm leading-[21px] min-w-0 break-words">
            {item.refNodeName || <span className="text-foreground-tertiary italic">Untitled</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Breadcrumb ───

function BreadcrumbPath({ ancestors }: { ancestors: AncestorInfo[] }) {
  const navigateTo = useUIStore(s => s.navigateTo);

  return (
    <div className="flex items-center gap-0.5 text-xs text-foreground-tertiary overflow-hidden">
      {ancestors.map((a, i) => (
        <span key={a.id} className="flex items-center gap-0.5 shrink min-w-0">
          {i > 0 && <span className="mx-0.5">/</span>}
          <button
            className="hover:text-foreground-secondary transition-colors truncate max-w-[120px] cursor-pointer"
            onClick={() => navigateTo(a.id)}
            title={a.name}
          >
            {a.name}
          </button>
        </span>
      ))}
    </div>
  );
}

// ─── Appears as [Field] in... ───

function FieldValueGroup({ fieldName, items }: { fieldName: string; items: FieldValueRef[] }) {
  return (
    <div>
      <div className="text-xs text-foreground-tertiary mb-2">
        Appears as <span className="font-medium text-foreground-secondary">{fieldName}</span> in...
      </div>
      <div className="space-y-1">
        {items.map((ref) => (
          <FieldValueItem key={ref.ownerNodeId} item={ref} />
        ))}
      </div>
    </div>
  );
}

function FieldValueItem({ item }: { item: FieldValueRef }) {
  const navigateTo = useUIStore(s => s.navigateTo);

  const handleNavigate = useCallback(() => {
    navigateTo(item.ownerNodeId);
  }, [navigateTo, item.ownerNodeId]);

  return (
    <div
      className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-accent/50 rounded-sm px-1 transition-colors"
      onClick={handleNavigate}
    >
      {/* Reference bullet ◎ */}
      <span className="shrink-0 w-[15px] h-[15px] flex items-center justify-center">
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-foreground-tertiary">
          <circle cx="4" cy="4" r="3" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="4" cy="4" r="1.2" fill="currentColor" />
        </svg>
      </span>
      <span className="text-sm leading-[21px] truncate min-w-0">
        {item.ownerNodeName || <span className="text-foreground-tertiary italic">Untitled</span>}
      </span>
      {/* Tag badges */}
      {item.ownerTags.length > 0 && (
        <span className="flex items-center gap-1 shrink-0 ml-auto">
          {item.ownerTags.slice(0, 2).map(tagId => (
            <FieldValueTagBadge key={tagId} tagDefId={tagId} />
          ))}
        </span>
      )}
    </div>
  );
}

/** Minimal inline tag badge for field value refs (read-only, no context menu). */
function FieldValueTagBadge({ tagDefId }: { tagDefId: string }) {
  const tagName = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(tagDefId);
    return node?.name ?? tagDefId;
  });
  const color = useNodeStore((s) => {
    void s._version;
    return resolveTagColor(tagDefId);
  });

  return (
    <span
      className="inline-flex items-center text-[11px] font-medium leading-4 px-1 rounded"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      <span className="text-[10px] mr-0.5">#</span>
      {tagName}
    </span>
  );
}

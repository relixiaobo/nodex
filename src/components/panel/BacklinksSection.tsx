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
    <div className="mt-16 pl-[21px] pr-4 pb-4">
      {/* Header: "N references ∨" — ml-[15px] skips chevron column so text aligns with node text */}
      <button
        className="flex items-center gap-1 ml-[15px] text-sm text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="tabular-nums">{result.totalCount}</span>
        <span>{result.totalCount === 1 ? 'reference' : 'references'}</span>
        {expanded
          ? <ChevronDown size={14} className="shrink-0" />
          : <ChevronRight size={14} className="shrink-0" />
        }
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

// ─── Row chevron (matches OutlinerItem ChevronButton visual) ───

/** Static chevron that appears on row hover, matching the outliner's expand/collapse button style. */
function RowChevron() {
  return (
    <span className="flex shrink-0 h-[21px] w-[15px] items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
      <span className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-background outline outline-1 outline-border-emphasis">
        <svg width="10" height="10" viewBox="0 0 12 12" className="text-foreground-secondary">
          <path d="M4.5 2.5L8 6L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}

// ─── Mentioned in... ───

function MentionedInGroup({ items }: { items: MentionedInRef[] }) {
  return (
    <div>
      <div className="text-xs text-foreground-tertiary mb-2 ml-[15px]">Mentioned in...</div>
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
    <div className="group/row">
      {/* Breadcrumb — indented past chevron column to align with text */}
      {item.breadcrumb.length > 0 && (
        <div className="ml-[15px]">
          <BreadcrumbPath ancestors={item.breadcrumb} />
        </div>
      )}
      {/* Content box with chevron + bullet (matches outliner row layout) */}
      <div
        className="mt-1 flex items-start bg-foreground/[0.03] border-l-2 border-primary/20 rounded-r-sm cursor-pointer hover:bg-foreground/[0.06] transition-colors"
        onClick={handleNavigate}
      >
        <RowChevron />
        <span className="shrink-0 h-[21px] w-[15px] flex items-center justify-center">
          <span className="w-[5px] h-[5px] rounded-full bg-foreground/50" />
        </span>
        <span className="text-sm leading-[21px] min-w-0 break-words py-1 pr-2">
          {item.refNodeName || <span className="text-foreground-tertiary italic">Untitled</span>}
        </span>
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
      <div className="text-xs text-foreground-tertiary mb-2 ml-[15px]">
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
      className="group/row flex items-center cursor-pointer hover:bg-foreground/5 rounded-sm transition-colors"
      onClick={handleNavigate}
    >
      <RowChevron />
      {/* Reference bullet — same as BulletChevron isReference style */}
      <span className="shrink-0 w-[15px] h-[21px] flex items-center justify-center">
        <span className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-dashed border-foreground/40">
          <span className="h-[5px] w-[5px] rounded-full bg-foreground/50" />
        </span>
      </span>
      <span className="text-sm leading-[21px] truncate min-w-0 ml-2">
        {item.ownerNodeName || <span className="text-foreground-tertiary italic">Untitled</span>}
      </span>
      {/* Tag badges */}
      {item.ownerTags.length > 0 && (
        <span className="flex items-center gap-1 shrink-0 ml-auto pr-1">
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

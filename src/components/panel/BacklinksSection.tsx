/**
 * BacklinksSection — collapsible references panel at the bottom of NodePanel.
 *
 * Shows "N references" header that expands to reveal:
 *   - "Mentioned in..." group: tree references + inline references with breadcrumbs
 *   - "Appears as [Field] in..." groups: field value references by field name
 *
 * Reuses existing outliner components (BulletChevron, ChevronButton, TagBadge)
 * for visual consistency with the main outliner.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ChevronDown } from '../../lib/icons.js';
import { useBacklinks } from '../../hooks/use-backlinks';
import { useUIStore } from '../../stores/ui-store';
import { BulletChevron, ChevronButton } from '../outliner/BulletChevron';
import { TagBadge } from '../tags/TagBadge';
import type { MentionedInRef, FieldValueRef } from '../../lib/backlinks.js';
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
      {/* Content box with real ChevronButton + BulletChevron */}
      <div
        className="mt-1 flex items-start bg-foreground/[0.03] border-l-2 border-primary/20 rounded-r-sm cursor-pointer hover:bg-foreground/[0.06] transition-colors"
        onClick={handleNavigate}
      >
        <ChevronButton
          isExpanded={false}
          onToggle={handleNavigate}
          onDrillDown={handleNavigate}
        />
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onBulletClick={handleNavigate}
        />
        <span className="text-sm leading-[21px] min-w-0 break-words py-1 pr-2 ml-2">
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
      <ChevronButton
        isExpanded={false}
        onToggle={handleNavigate}
        onDrillDown={handleNavigate}
      />
      <BulletChevron
        hasChildren={false}
        isExpanded={false}
        isReference={true}
        onBulletClick={handleNavigate}
      />
      <span className="text-sm leading-[21px] truncate min-w-0 ml-2">
        {item.ownerNodeName || <span className="text-foreground-tertiary italic">Untitled</span>}
      </span>
      {/* Tag badges — reuse real TagBadge (read-only, no remove handler) */}
      {item.ownerTags.length > 0 && (
        <span className="flex items-center gap-1 shrink-0 ml-auto pr-1">
          {item.ownerTags.slice(0, 2).map(tagId => (
            <TagBadge key={tagId} tagDefId={tagId} />
          ))}
        </span>
      )}
    </div>
  );
}

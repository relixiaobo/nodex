/**
 * BacklinksSection — collapsible references panel at the bottom of NodePanel.
 *
 * Shows "N references" header that expands to reveal:
 *   - "Mentioned in..." group: tree references + inline references with breadcrumbs
 *   - "Appears as [Field] in..." groups: field value references by field name
 *
 * Reuses existing outliner components (BulletChevron, ChevronButton, TagBadge)
 * for visual consistency with the main outliner.
 *
 * Layout matches OutlinerItem depth-0:
 *   paddingLeft: 6  →  flex gap-1 py-1  →  [ChevronButton 15px] + flex gap-2 → [Bullet 15px][text]
 *   Selection/mention highlight covers bullet+text only (same as node-selected-ref).
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ChevronDown } from '../../lib/icons.js';
import { useBacklinks } from '../../hooks/use-backlinks';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { BulletChevron, ChevronButton } from '../outliner/BulletChevron';
import { TagBadge } from '../tags/TagBadge';
import type { MentionedInRef, FieldValueRef } from '../../lib/backlinks.js';
import type { AncestorInfo } from '../../lib/tree-utils.js';

// Layout constants matching OutlinerItem depth-0
const ROW_PADDING_LEFT = 6; // depth * 28 + 6, depth=0
// Labels align with bullet column: 6 (pad) + 15 (chevron) + 4 (gap-1) = 25
const LABEL_PADDING_LEFT = 25;

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
    <div className="mt-12 pr-4 pb-4">
      {/* Header: "N references ∨" — paddingLeft aligns text with node text column */}
      <button
        className="flex items-center gap-1 text-sm text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
        style={{ paddingLeft: LABEL_PADDING_LEFT }}
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
      <div
        className="text-xs text-foreground-tertiary mb-2"
        style={{ paddingLeft: LABEL_PADDING_LEFT }}
      >
        Mentioned in...
      </div>
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
      {/* Breadcrumb — aligned with text column */}
      {item.breadcrumb.length > 0 && (
        <div style={{ paddingLeft: LABEL_PADDING_LEFT }}>
          <BreadcrumbPath ancestors={item.breadcrumb} />
        </div>
      )}
      {/* Row: same structure as OutlinerItem depth-0 */}
      <div
        className="mt-1 relative flex gap-1 min-h-6 items-start cursor-pointer"
        style={{ paddingLeft: ROW_PADDING_LEFT }}
        onClick={handleNavigate}
      >
        {/* Highlight overlay — same left offset as OutlinerItem selection: starts after chevron */}
        <div
          className="absolute right-0 bg-foreground/4 border-l-2 border-primary/30 rounded-r-sm pointer-events-none group-hover/row:bg-foreground/8 transition-colors"
          style={{ left: ROW_PADDING_LEFT + 15, top: 1, bottom: 1 }}
        />
        <ChevronButton
          isExpanded={false}
          onToggle={handleNavigate}
          onDrillDown={handleNavigate}
        />
        <div className="flex items-start gap-2 min-w-0 flex-1 relative">
          <BulletChevron
            hasChildren={false}
            isExpanded={false}
            onBulletClick={handleNavigate}
          />
          <span className="text-sm leading-[21px] min-w-0 break-words pr-2">
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
  const wsId = useWorkspaceStore(s => s.currentWorkspaceId);
  const filtered = ancestors.filter(a => a.id !== wsId);

  if (filtered.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 text-xs text-foreground-tertiary overflow-hidden">
      {filtered.map((a, i) => (
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
      <div
        className="text-xs text-foreground-tertiary mb-2"
        style={{ paddingLeft: LABEL_PADDING_LEFT }}
      >
        Appears as <span className="font-medium text-foreground-secondary">{fieldName}</span> in...
      </div>
      <div className="space-y-2">
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
      className="group/row relative flex gap-1 min-h-6 items-start cursor-pointer"
      style={{ paddingLeft: ROW_PADDING_LEFT }}
      onClick={handleNavigate}
    >
      {/* Hover highlight — same left offset as OutlinerItem selection: starts after chevron */}
      <div
        className="absolute right-0 rounded-sm pointer-events-none opacity-0 group-hover/row:opacity-100 bg-foreground/4 transition-opacity"
        style={{ left: ROW_PADDING_LEFT + 15, top: 1, bottom: 1 }}
      />
      <ChevronButton
        isExpanded={false}
        onToggle={handleNavigate}
        onDrillDown={handleNavigate}
      />
      <div className="flex items-start gap-2 min-w-0 flex-1 relative">
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          isReference={true}
          onBulletClick={handleNavigate}
        />
        {/* Text + inline tags (same pattern as OutlinerItem: TagBar follows text inline) */}
        <span className="text-sm leading-[21px] min-w-0">
          <span className="break-words">
            {item.ownerNodeName || <span className="text-foreground-tertiary italic">Untitled</span>}
          </span>
          {item.ownerTags.length > 0 && (
            <span className="inline-flex align-[0.125em] ml-1.5">
              {item.ownerTags.slice(0, 2).map(tagId => (
                <TagBadge key={tagId} tagDefId={tagId} />
              ))}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Breadcrumb navigation bar for zoomed-in node pages.
 *
 * Layout: [← Parent] [W avatar] / ancestor1 / ancestor2 / ... / [currentName?]
 *
 * - Workspace root is represented by a circular avatar (first char of workspace name)
 * - ← button navigates to parent node (not history back)
 * - Containers appear as normal ancestors in the chain
 * - At workspace root view, breadcrumb content is hidden (toolbar only)
 *
 * Folding rules (applied to ancestor chain):
 * - 0 ancestors: [←] [W]
 * - 1 ancestor: [←] [W] › parent
 * - 2 ancestors: [←] [W] › grandparent › parent
 * - 3+ ancestors: [←] [W] › [...] › parent
 *
 * [...] expands in-place (no navigation). Resets when nodeId changes.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, MoreHorizontal } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useAncestors } from '../../hooks/use-ancestors';
import { getNavigableParentId } from '../../lib/tree-utils';
import { CONTAINER_IDS } from '../../types/index.js';
import { ensureWorkspaceHomeNode } from '../../lib/workspace-root.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';
import { ensureUndoFocusAfterNavigation } from '../../lib/focus-utils.js';
import { t } from '../../i18n/strings.js';

interface BreadcrumbProps {
  nodeId: string;
  showCurrentName?: boolean;
  compact?: boolean;
}

export function resolveWorkspaceRootTargetId(params: {
  workspaceId: string | null;
  workspaceRootId: string | null;
}): string {
  const { workspaceId, workspaceRootId } = params;
  if (workspaceId) return workspaceId;
  if (workspaceRootId) return workspaceRootId;
  return CONTAINER_IDS.LIBRARY;
}

export function Breadcrumb({ nodeId, showCurrentName, compact }: BreadcrumbProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);

  const { ancestors, workspaceRootId } = useAncestors(nodeId);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  // Ellipsis expansion state — reset when nodeId changes
  const [expanded, setExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setExpanded(false), [nodeId]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [expanded]);

  // isRootView: true when viewing the workspace root node itself.
  // Container nodes (Library, Inbox, etc.) are NOT treated as root view — they still show
  // the workspace [W] avatar, just with no ancestor chain.
  const isRootView = (!!workspaceRootId && nodeId === workspaceRootId) || (!!wsId && nodeId === wsId);

  // Get parent ID for ← button (navigate to first non-structural parent)
  const parentId = useNodeStore((s) => { void s._version; return getNavigableParentId(nodeId); });
  const workspaceRootTargetId = resolveWorkspaceRootTargetId({
    workspaceId: wsId,
    workspaceRootId,
  });
  const wsInitial = useNodeStore((s) => {
    void s._version;
    if (!wsId) return 'W';
    const wsNode = loroDoc.toNodexNode(wsId);
    const raw = wsNode?.name ?? '';
    const clean = raw.replace(/<[^>]+>/g, '').trim();
    return clean.charAt(0).toUpperCase() || 'W';
  });

  // Show ← when current node has a parent (not at workspace root)
  const canGoUp = !!parentId;

  const handleGoUp = useCallback(() => {
    if (parentId) {
      navigateTo(parentId);
      ensureUndoFocusAfterNavigation();
    }
  }, [parentId, navigateTo]);

  const handleNavigateToWorkspaceRoot = useCallback(() => {
    if (wsId && workspaceRootTargetId === wsId) {
      ensureWorkspaceHomeNode(wsId);
    }
    navigateTo(workspaceRootTargetId);
    ensureUndoFocusAfterNavigation();
  }, [workspaceRootTargetId, navigateTo, wsId]);

  // Filter out workspace root from ancestors — [W] avatar already represents it
  const filteredAncestors = ancestors.filter(
    (a) => a.id !== wsId && a.id !== workspaceRootId,
  );

  // Determine which ancestors to show
  const needsFolding = filteredAncestors.length >= 3;
  const visibleAncestors = needsFolding
    ? [filteredAncestors[filteredAncestors.length - 1]] // only the immediate parent
    : filteredAncestors;
  const hiddenAncestors = needsFolding
    ? filteredAncestors.slice(0, -1)
    : [];

  return (
    <div className={`flex flex-1 min-w-0 items-center gap-1 pl-4 pr-3 text-[13px] text-foreground-tertiary ${compact ? '' : 'h-8 mt-1'}`}>

      {/* Root view: only show toolbar (sidebar toggle + search), no breadcrumb content */}
      {!isRootView && (
        <>
          {/* Workspace avatar — shown whenever workspace is initialized.
              For container nodes (Library, Inbox…) workspaceRootId is null because they
              have no parent; we still show [W] to indicate workspace context. */}
          {!!wsId && (
            <button
              onClick={handleNavigateToWorkspaceRoot}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-primary/15 text-[11px] font-semibold text-primary hover:bg-primary/20"
              title={t('breadcrumb.goToWorkspaceRoot')}
            >
              {wsInitial}
            </button>
          )}

          {/* Ellipsis for folded ancestors */}
          {needsFolding && (
            <>
              <span className="shrink-0 text-foreground-tertiary/50 mx-0.5">/</span>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className={`flex shrink-0 items-center justify-center rounded-md px-1 py-0.5 hover:bg-accent hover:text-foreground transition-colors ${expanded ? 'bg-accent text-accent-foreground' : ''}`}
                  title={t('breadcrumb.showHiddenAncestors')}
                >
                  <MoreHorizontal size={14} />
                </button>
                {expanded && (
                  <div className="absolute top-full left-0 mt-1 w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg z-50">
                    <div className="flex flex-col max-h-64 overflow-y-auto">
                      {hiddenAncestors.map((ancestor) => (
                        <button
                          key={ancestor.id}
                          className="flex items-center w-full rounded-md px-2 py-1.5 text-[14px] hover:bg-accent hover:text-accent-foreground text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(false);
                            if (ancestor.id === workspaceRootId) {
                              handleNavigateToWorkspaceRoot();
                              return;
                            }
                            navigateTo(ancestor.id);
                            ensureUndoFocusAfterNavigation();
                          }}
                        >
                          <span className="truncate">{resolveBreadcrumbLabel(ancestor.id, ancestor.name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Visible ancestors */}
          {visibleAncestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center shrink min-w-0">
              <span className="shrink-0 text-foreground-tertiary/50 mx-0.5">/</span>
              <button
                onClick={() => {
                  if (ancestor.id === workspaceRootId) {
                    handleNavigateToWorkspaceRoot();
                    return;
                  }
                  navigateTo(ancestor.id);
                  ensureUndoFocusAfterNavigation();
                }}
                className="truncate max-w-[120px] rounded px-0.5 hover:text-foreground"
              >
                {resolveBreadcrumbLabel(ancestor.id, ancestor.name)}
              </button>
            </span>
          ))}

          {/* Conditional current node name (when title scrolled out of view) */}
          {showCurrentName && (
            <span className="flex items-center shrink min-w-0">
              <span className="shrink-0 text-foreground-tertiary/50 mx-0.5">/</span>
              <BreadcrumbCurrentName nodeId={nodeId} />
            </span>
          )}
        </>
      )}

    </div>
  );
}

/**
 * Resolve display label for a breadcrumb segment.
 * If the node is today's day node, prefix with "Today, ".
 */
function resolveBreadcrumbLabel(nodeId: string, name: string): string {
  if (!isDayNode(nodeId)) return name;
  // Find year from ancestor chain: day → week → year
  const weekId = loroDoc.getParentId(nodeId);
  if (!weekId) return name;
  const yearId = loroDoc.getParentId(weekId);
  if (!yearId) return name;
  const yearNode = loroDoc.toNodexNode(yearId);
  const year = yearNode?.name ? parseYearNodeName(yearNode.name) : null;
  if (year === null) return name;
  const date = parseDayNodeName(name, year);
  if (date && isToday(date)) return t('common.todayPrefix', { name });
  return name;
}

/** Subscribes to node name for the conditional breadcrumb display. */
function BreadcrumbCurrentName({ nodeId }: { nodeId: string }) {
  const name = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(nodeId);
    const raw = node?.name ?? '';
    const clean = raw.replace(/<[^>]+>/g, '') || t('common.untitled');
    return resolveBreadcrumbLabel(nodeId, clean);
  });

  return <span className="truncate max-w-[100px] px-0.5 text-xs text-foreground">{name}</span>;
}

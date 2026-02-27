import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, RotateCcw } from '../../lib/icons.js';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { CONTAINER_IDS } from '../../types/index.js';
import * as loroDoc from '../../lib/loro-doc.js';

import { NodeHeader } from './NodeHeader';
import { OutlinerView } from '../outliner/OutlinerView';
import { FieldList } from '../fields/FieldList';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { isDayNode } from '../../lib/journal.js';
import { isJournalSystemTagId } from '../../types/index.js';
import { DateNavigationBar } from '../journal/DateNavigationBar';
import { BacklinksSection } from './BacklinksSection';
import { SearchChipBar } from '../search/SearchChipBar';

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const node = useNode(nodeId);
  const goBack = useUIStore((s) => s.goBack);

  if (!node) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">This page is unavailable.</div>
          <button
            type="button"
            onClick={goBack}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const isFieldDef = node?.type === 'fieldDef';
  const isTagDef = node?.type === 'tagDef';
  const isProtectedDateTagDef = isTagDef && isJournalSystemTagId(nodeId);
  const isDefinitionNode = isFieldDef || isTagDef;

  const isTrashContainer = nodeId === CONTAINER_IDS.TRASH;

  const isInTrash = useNodeStore((s) => {
    void s._version;
    return loroDoc.getParentId(nodeId) === CONTAINER_IDS.TRASH;
  });

  const trashChildCount = useNodeStore((s) => {
    if (!isTrashContainer) return 0;
    void s._version;
    return loroDoc.getChildren(CONTAINER_IDS.TRASH).length;
  });

  const showDateNav = useNodeStore((s) => {
    void s._version;
    return isDayNode(nodeId);
  });

  const tagDefColor = useNodeStore((s) => {
    void s._version;
    return isTagDef ? resolveTagColor(nodeId) : null;
  });

  const setPanelTitleVisible = useUIStore((s) => s.setPanelTitleVisible);
  const titleElRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleTitleRef = useCallback((el: HTMLElement | null) => {
    titleElRef.current = el;
  }, []);

  useEffect(() => {
    const el = titleElRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPanelTitleVisible(entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setPanelTitleVisible(true);
    };
  }, [nodeId, setPanelTitleVisible]);

  const [confirmHardDelete, setConfirmHardDelete] = useState(false);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);

  useEffect(() => {
    setConfirmHardDelete(false);
    setConfirmEmptyTrash(false);
  }, [nodeId]);

  const handleDelete = useCallback(() => {
    if (isProtectedDateTagDef) return;
    useNodeStore.getState().trashNode(nodeId);
    goBack();
  }, [isProtectedDateTagDef, nodeId, goBack]);

  const handleRestore = useCallback(() => {
    useNodeStore.getState().restoreNode(nodeId);
    goBack();
  }, [nodeId, goBack]);

  const handleHardDelete = useCallback(() => {
    if (!confirmHardDelete) {
      setConfirmHardDelete(true);
      return;
    }
    useNodeStore.getState().hardDeleteNode(nodeId);
    goBack();
  }, [confirmHardDelete, nodeId, goBack]);

  const handleEmptyTrash = useCallback(() => {
    if (!confirmEmptyTrash) {
      setConfirmEmptyTrash(true);
      return;
    }
    useNodeStore.getState().emptyTrash();
    setConfirmEmptyTrash(false);
  }, [confirmEmptyTrash]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-pb-[40vh] pt-12">
        {isTagDef && tagDefColor && (
          <div
            className="h-28 -mb-28 pointer-events-none"
            style={{
              background: `linear-gradient(to bottom, ${tagDefColor.text}20, transparent)`,
            }}
          />
        )}
        <NodeHeader nodeId={nodeId} onTitleRef={handleTitleRef} />
        {showDateNav && <DateNavigationBar dayNodeId={nodeId} />}
        {isDefinitionNode && (
          <div className="mb-2 ml-4 px-2">
            <FieldList nodeId={nodeId} />
          </div>
        )}
        {!isDefinitionNode && node?.type === 'search' && <SearchChipBar searchNodeId={nodeId} />}
        {!isDefinitionNode && <OutlinerView rootNodeId={nodeId} />}
        {!isDefinitionNode && <BacklinksSection nodeId={nodeId} />}

        {isTrashContainer && trashChildCount > 0 && (
          <div className="ml-4 px-2 pb-4 border-t border-border-subtle">
            <button
              onClick={handleEmptyTrash}
              className="flex items-center gap-1 min-h-6 py-1 text-foreground-secondary hover:text-destructive transition-colors"
            >
              <span className="shrink-0 w-[15px] flex items-center justify-center">
                <Trash2 size={12} />
              </span>
              <span className="text-[15px] leading-6">
                {confirmEmptyTrash
                  ? `Confirm: permanently delete ${trashChildCount} item${trashChildCount === 1 ? '' : 's'}?`
                  : `Empty Trash (${trashChildCount})`}
              </span>
            </button>
          </div>
        )}

        {isInTrash && (
          <div className="ml-4 px-2 pb-4 border-t border-border-subtle flex flex-col gap-0">
            <button
              onClick={handleRestore}
              className="flex items-center gap-1 min-h-6 py-1 text-foreground-secondary hover:text-primary transition-colors"
            >
              <span className="shrink-0 w-[15px] flex items-center justify-center">
                <RotateCcw size={12} />
              </span>
              <span className="text-[15px] leading-6">Restore</span>
            </button>
            <button
              onClick={handleHardDelete}
              className="flex items-center gap-1 min-h-6 py-1 text-foreground-secondary hover:text-destructive transition-colors"
            >
              <span className="shrink-0 w-[15px] flex items-center justify-center">
                <Trash2 size={12} />
              </span>
              <span className="text-[15px] leading-6">
                {confirmHardDelete ? 'Confirm: delete permanently?' : 'Delete permanently'}
              </span>
            </button>
          </div>
        )}

        {isDefinitionNode && !isProtectedDateTagDef && !isInTrash && (
          <div className="ml-4 px-2 pb-4 border-t border-border-subtle">
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 min-h-6 py-1 text-foreground-secondary hover:text-destructive transition-colors"
            >
              <span className="shrink-0 w-[15px] flex items-center justify-center">
                <Trash2 size={12} />
              </span>
              <span className="text-[15px] leading-6">{isFieldDef ? 'Delete field' : 'Delete tag'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

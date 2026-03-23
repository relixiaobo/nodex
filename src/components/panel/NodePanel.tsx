import { useCallback, useEffect, useState } from 'react';
import { Trash2, RotateCcw } from '../../lib/icons.js';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { SYSTEM_NODE_IDS } from '../../types/index.js';
import * as loroDoc from '../../lib/loro-doc.js';

import { NodeHeader } from './NodeHeader';
import { OutlinerView } from '../outliner/OutlinerView';
import { FieldList } from '../fields/FieldList';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { isDayNode } from '../../lib/journal.js';
import { DateNavigationBar } from '../journal/DateNavigationBar';
import { BacklinksSection } from './BacklinksSection';
import { SearchChipBar } from '../search/SearchChipBar';
import { getNodeCapabilities, isNodeInTrash } from '../../lib/node-capabilities.js';

interface NodePanelProps {
  nodeId: string;
  panelId: string;
}

export function NodePanel({ nodeId, panelId }: NodePanelProps) {
  const node = useNode(nodeId);
  const goBackNode = useUIStore((s) => s.goBackNode);

  if (!node) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <div className="text-sm text-foreground-tertiary">This page is unavailable.</div>
          <button
            type="button"
            onClick={goBackNode}
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
  const isDefinitionNode = isFieldDef || isTagDef;

  const isTrashContainer = nodeId === SYSTEM_NODE_IDS.TRASH;
  const canDeleteNode = getNodeCapabilities(nodeId).canDelete;

  const isInTrash = useNodeStore((s) => {
    void s._version;
    return isNodeInTrash(nodeId);
  });

  const trashChildCount = useNodeStore((s) => {
    if (!isTrashContainer) return 0;
    void s._version;
    return loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH).length;
  });

  const showDateNav = useNodeStore((s) => {
    void s._version;
    return isDayNode(nodeId);
  });

  const tagDefColor = useNodeStore((s) => {
    void s._version;
    return isTagDef ? resolveTagColor(nodeId) : null;
  });

  const handleTitleRef = useCallback((_el: HTMLElement | null) => {}, []);

  const [confirmHardDelete, setConfirmHardDelete] = useState(false);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);

  useEffect(() => {
    setConfirmHardDelete(false);
    setConfirmEmptyTrash(false);
  }, [nodeId]);

  const handleDelete = useCallback(() => {
    useNodeStore.getState().trashNode(nodeId);
    goBackNode();
  }, [nodeId, goBackNode]);

  const handleRestore = useCallback(() => {
    useNodeStore.getState().restoreNode(nodeId);
    goBackNode();
  }, [nodeId, goBackNode]);

  const handleHardDelete = useCallback(() => {
    if (!confirmHardDelete) {
      setConfirmHardDelete(true);
      return;
    }
    useNodeStore.getState().hardDeleteNode(nodeId);
    goBackNode();
  }, [confirmHardDelete, nodeId, goBackNode]);

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
      <div className="flex-1 overflow-y-auto scroll-pb-[40vh] pb-20">
        {isTagDef && tagDefColor && (
          <div
            className="h-28 -mb-28 pointer-events-none"
            style={{
              background: `linear-gradient(to bottom, ${tagDefColor.text}20, transparent)`,
            }}
          />
        )}
        <NodeHeader nodeId={nodeId} panelId={panelId} onTitleRef={handleTitleRef} />
        {showDateNav && <DateNavigationBar dayNodeId={nodeId} />}
        {isDefinitionNode && (
          <div className="mb-2 ml-4 px-2">
            <FieldList nodeId={nodeId} panelId={panelId} />
          </div>
        )}
        {!isDefinitionNode && node?.type === 'search' && <SearchChipBar searchNodeId={nodeId} />}
        {!isDefinitionNode && <OutlinerView rootNodeId={nodeId} panelId={panelId} />}
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

        {isDefinitionNode && canDeleteNode && !isInTrash && (
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

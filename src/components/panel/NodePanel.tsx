import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { NodePanelHeader } from './NodePanelHeader';
import { PanelTitle } from './PanelTitle';
import { OutlinerView } from '../outliner/OutlinerView';
import { FieldList } from '../fields/FieldList';

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const node = useNode(nodeId);
  const goBack = useUIStore((s) => s.goBack);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId) ?? '';
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const isAttrDef = node?.props._docType === 'attrDef';
  const isTagDef = node?.props._docType === 'tagDef';
  const isDefinitionNode = isAttrDef || isTagDef;

  // IntersectionObserver: detect when title scrolls out of view
  const [titleVisible, setTitleVisible] = useState(true);
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
      ([entry]) => setTitleVisible(entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nodeId]);

  const handleDelete = useCallback(() => {
    useNodeStore.getState().trashNode(nodeId, wsId, userId);
    goBack();
  }, [nodeId, wsId, userId, goBack]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanelHeader nodeId={nodeId} showCurrentName={!titleVisible} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <PanelTitle nodeId={nodeId} onTitleRef={handleTitleRef} />
        {isDefinitionNode && (
          <div className="mb-2 ml-4 px-2">
            <FieldList nodeId={nodeId} />
          </div>
        )}
        {/* tagDef: show default content (template fields + regular nodes) */}
        {isTagDef && (
          <>
            <div className="ml-4 px-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Default content
              </span>
            </div>
            <OutlinerView rootNodeId={nodeId} showTemplateTuples />
          </>
        )}
        {/* Non-definition: OutlinerView handles field/content interleaved rendering */}
        {!isDefinitionNode && <OutlinerView rootNodeId={nodeId} />}
        {isDefinitionNode && (
          <div className="mt-4 ml-4 px-2 pb-4">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80"
            >
              <Trash2 size={14} />
              <span>{isAttrDef ? 'Delete field' : 'Delete tag'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

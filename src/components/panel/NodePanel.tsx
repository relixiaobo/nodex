import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from '../../lib/icons.js';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { NodePanelHeader } from './NodePanelHeader';
import { NodeHeader } from './NodeHeader';
import { OutlinerView } from '../outliner/OutlinerView';
import { FieldList } from '../fields/FieldList';
import { resolveTagColor } from '../../lib/tag-colors.js';

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const node = useNode(nodeId);
  const goBack = useUIStore((s) => s.goBack);

  const isFieldDef = node?.type === 'fieldDef';
  const isTagDef = node?.type === 'tagDef';
  const isDefinitionNode = isFieldDef || isTagDef;

  // TagDef: colored gradient at top reflecting configured color
  const tagDefColor = useNodeStore((s) => {
    void s._version;
    return isTagDef ? resolveTagColor(nodeId) : null;
  });

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
    useNodeStore.getState().trashNode(nodeId);
    goBack();
  }, [nodeId, goBack]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanelHeader nodeId={nodeId} showCurrentName={!titleVisible} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isTagDef && tagDefColor && (
          <div
            className="h-28 -mb-28 pointer-events-none"
            style={{
              background: `linear-gradient(to bottom, ${tagDefColor.text}20, transparent)`,
            }}
          />
        )}
        <NodeHeader nodeId={nodeId} onTitleRef={handleTitleRef} />
        {isDefinitionNode && (
          <div className="mb-2 ml-4 px-2">
            <FieldList nodeId={nodeId} />
          </div>
        )}
        {/* tagDef: default content is now rendered as a FieldRow inside FieldList */}
        {/* Non-definition: OutlinerView handles field/content interleaved rendering */}
        {!isDefinitionNode && <OutlinerView rootNodeId={nodeId} />}
        {isDefinitionNode && (
          <div className="mt-4 ml-4 px-2 pb-4">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-destructive transition-colors"
            >
              <Trash2 size={14} />
              <span>{isFieldDef ? 'Delete field' : 'Delete tag'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

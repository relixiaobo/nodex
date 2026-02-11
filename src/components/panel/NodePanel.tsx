import { useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { useNode } from '../../hooks/use-node';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useHasFields } from '../../hooks/use-has-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { resolveDataType } from '../../lib/field-utils.js';
import { SYS_D } from '../../types/index.js';
import { NodePanelHeader } from './NodePanelHeader';
import { OutlinerView } from '../outliner/OutlinerView';
import { FieldList } from '../fields/FieldList';

interface NodePanelProps {
  nodeId: string;
}

export function NodePanel({ nodeId }: NodePanelProps) {
  const node = useNode(nodeId);
  const tagIds = useNodeTags(nodeId);
  const hasFields = useHasFields(nodeId);
  const popPanel = useUIStore((s) => s.popPanel);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId) ?? '';
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const isAttrDef = node?.props._docType === 'attrDef';
  const isOptionsType = useNodeStore((s) => {
    if (!isAttrDef) return false;
    return resolveDataType(s.entities, nodeId) === SYS_D.OPTIONS;
  });

  const handleDelete = useCallback(() => {
    useNodeStore.getState().trashNode(nodeId, wsId, userId);
    popPanel();
  }, [nodeId, wsId, userId, popPanel]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NodePanelHeader nodeId={nodeId} />
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {(tagIds.length > 0 || hasFields) && (
          <div className="mb-2 ml-4">
            <FieldList nodeId={nodeId} />
          </div>
        )}
        {isAttrDef && isOptionsType && (
          <div className="ml-4 mt-3 mb-1">
            <span className="text-sm font-medium text-muted-foreground">Pre-determined options</span>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Each node above will become an option</p>
          </div>
        )}
        <OutlinerView rootNodeId={nodeId} />
        {isAttrDef && (
          <div className="mt-4 ml-4 pb-4">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80"
            >
              <Trash2 size={14} />
              <span>Delete field</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

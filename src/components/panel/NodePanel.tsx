import { useCallback, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useNode } from '../../hooks/use-node';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useHasFields } from '../../hooks/use-has-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { resolveDataType, ATTRDEF_SECTION_LABELS } from '../../lib/field-utils.js';
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

  // Resolve current data type (primitive string — stable reference)
  const currentDataType = useNodeStore((s) =>
    isAttrDef ? resolveDataType(s.entities, nodeId) : '',
  );

  // Derive visible section labels (filter on static array — no new objects)
  const sectionLabels = useMemo(() => {
    if (!isAttrDef) return [];
    return ATTRDEF_SECTION_LABELS.filter((f) => {
      if (f.appliesTo === '*') return true;
      return f.appliesTo.includes(currentDataType);
    });
  }, [isAttrDef, currentDataType]);

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
        {sectionLabels.map((label) => (
          <div key={label.key} className="ml-4 mt-3 mb-1">
            <span className="text-sm font-medium text-muted-foreground">{label.name}</span>
            {label.description && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">{label.description}</p>
            )}
          </div>
        ))}
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

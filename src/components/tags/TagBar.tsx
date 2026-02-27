/**
 * Inline tag bar: shows tag badges next to node text.
 * Tags are added only via # trigger in the editor (no + button).
 */
import { useCallback } from 'react';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { TagBadge } from './TagBadge';

interface TagBarProps {
  nodeId: string;
}

export function TagBar({ nodeId }: TagBarProps) {
  const tagIds = useNodeTags(nodeId);
  const removeTag = useNodeStore((s) => s.removeTag);
  const navigateTo = useUIStore((s) => s.navigateTo);

  const handleRemove = useCallback(
    (tagDefId: string) => {
      removeTag(nodeId, tagDefId);
    },
    [nodeId, removeTag],
  );

  const handleSearch = useCallback(
    (tagDefId: string) => {
      // Create or find existing search node for this tag, then navigate to it
      const searchNodeId = useNodeStore.getState().createSearchNode(tagDefId);
      if (searchNodeId) {
        navigateTo(searchNodeId);
      }
    },
    [navigateTo],
  );

  const handleConfigure = useCallback(
    (tagDefId: string) => {
      // Navigate to the tagDef config page
      navigateTo(tagDefId);
    },
    [navigateTo],
  );

  if (tagIds.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {tagIds.map((tagId) => (
        <TagBadge
          key={tagId}
          tagDefId={tagId}
          onRemove={() => handleRemove(tagId)}
          onSearch={() => handleSearch(tagId)}
          onNavigate={() => handleConfigure(tagId)}
        />
      ))}
    </span>
  );
}

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

  if (tagIds.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {tagIds.map((tagId) => (
        <TagBadge
          key={tagId}
          tagDefId={tagId}
          onRemove={() => handleRemove(tagId)}
          onNavigate={() => navigateTo(tagId)}
        />
      ))}
    </span>
  );
}

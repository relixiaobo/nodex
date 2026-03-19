/**
 * ChatNodeIdentity — lightweight read-only node header for chat context.
 *
 * Shows node name + tags above OutlinerView in popover and embed.
 * No editing, no icons, no description — just enough to identify the node.
 */
import { useNode } from '../../hooks/use-node.js';
import { useNodeTags } from '../../hooks/use-node-tags.js';
import { useNodeStore } from '../../stores/node-store.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { marksToHtml } from '../../lib/editor-marks.js';

interface ChatNodeIdentityProps {
  nodeId: string;
}

function InlineTag({ tagDefId }: { tagDefId: string }) {
  const tagName = useNodeStore((s) => {
    void s._version;
    return s.getNode(tagDefId)?.name ?? 'Untitled';
  });
  const color = useNodeStore((s) => {
    void s._version;
    return resolveTagColor(tagDefId);
  });

  return (
    <span className="text-sm font-medium whitespace-nowrap" style={{ color: color.text }}>
      <span className="text-foreground-tertiary">#</span>{tagName}
    </span>
  );
}

export function ChatNodeIdentity({ nodeId }: ChatNodeIdentityProps) {
  const node = useNode(nodeId);
  const tagIds = useNodeTags(nodeId);

  if (!node) return null;

  const displayHtml = marksToHtml(node.name ?? '', node.marks ?? [], node.inlineRefs ?? []);

  return (
    <div className="flex items-baseline gap-2 px-3 pt-2 pb-1 min-w-0">
      <span className="text-sm font-medium text-foreground truncate min-w-0">
        {displayHtml
          ? <span className="node-content" dangerouslySetInnerHTML={{ __html: displayHtml }} />
          : <span className="text-foreground-tertiary">Untitled</span>
        }
      </span>
      {tagIds.length > 0 && (
        <span className="inline-flex items-center gap-1 shrink-0">
          {tagIds.map((tagId) => (
            <InlineTag key={tagId} tagDefId={tagId} />
          ))}
        </span>
      )}
    </div>
  );
}

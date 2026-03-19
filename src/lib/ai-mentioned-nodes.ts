/**
 * Tracks nodes mentioned by the AI in chat responses.
 *
 * Session-level in-memory store — cleared when the session changes or the
 * extension restarts. Used to detect nodes edited since the AI last
 * referenced them, so the system reminder can prompt the AI to re-read.
 */
import * as loroDoc from './loro-doc.js';

// ── Regex for scanning AI response content ──

const REF_RE = /<ref\s+id="([^"]+)">/g;
const CITE_RE = /<cite\s+id="([^"]+)">/g;
const NODE_RE = /<node\s+id="([^"]+)"\s*\/>/g;

/** nodeId → timestamp when AI last mentioned it */
const mentionedNodes = new Map<string, number>();

/**
 * Scan an AI response for <ref>, <cite>, and <node /> tags.
 * Records each referenced nodeId with the current timestamp.
 */
export function scanAndTrackMentionedNodes(responseText: string): void {
  const now = Date.now();
  for (const re of [REF_RE, CITE_RE, NODE_RE]) {
    re.lastIndex = 0;
    let m = re.exec(responseText);
    while (m) {
      mentionedNodes.set(m[1], now);
      m = re.exec(responseText);
    }
  }
}

/**
 * Build a system reminder section for nodes that were edited since the AI
 * last mentioned them. Returns null if no edits detected.
 */
export function buildMentionedNodeEditReminder(): string | null {
  if (mentionedNodes.size === 0) return null;

  const editedEntries: Array<{ nodeId: string; name: string; agoMs: number }> = [];
  const now = Date.now();

  for (const [nodeId, mentionedAt] of mentionedNodes) {
    const node = loroDoc.toNodexNode(nodeId);
    if (!node) continue;

    const updatedAt = node.updatedAt ?? 0;
    if (updatedAt > mentionedAt) {
      editedEntries.push({
        nodeId,
        name: node.name ?? nodeId,
        agoMs: now - updatedAt,
      });
    }
  }

  if (editedEntries.length === 0) return null;

  const lines = editedEntries.map((e) => {
    const ago = formatAgo(e.agoMs);
    return `- "${e.name}" (id: ${e.nodeId}) — edited ${ago}`;
  });

  return [
    '<mentioned-node-edits>',
    'Nodes mentioned in this conversation that were edited since you last referenced them:',
    ...lines,
    'Consider using node_read to check the latest content before referencing these nodes.',
    '</mentioned-node-edits>',
  ].join('\n');
}

/** Clear all tracked mentions (call on session change). */
export function clearMentionedNodes(): void {
  mentionedNodes.clear();
}

function formatAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

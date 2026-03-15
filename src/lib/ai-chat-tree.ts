import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { nanoid } from 'nanoid';

export interface BridgeEntry {
  afterNodeId: string;
  content: string;
  timestamp: number;
}

export interface MessageNode {
  id: string;
  parentId: string | null;
  children: string[];
  currentChild: string | null;
  level: number;
  message: AgentMessage | null;
}

export interface ChatSession {
  id: string;
  title: string | null;
  mapping: Record<string, MessageNode>;
  currentNode: string;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
  revision: number;
  bridges: BridgeEntry[];
}

export type TreeOp = 'cut' | 'link' | 'relink';

function getNodeOrThrow(session: ChatSession, nodeId: string): MessageNode {
  const node = session.mapping[nodeId];
  if (!node) {
    throw new Error(`[ai-chat-tree] Missing node: ${nodeId}`);
  }
  return node;
}

function touchSession(session: ChatSession): void {
  session.updatedAt = Date.now();
}

function getPendingLeafPlaceholder(session: ChatSession): MessageNode | null {
  const node = session.mapping[session.currentNode];
  if (!node) return null;
  if (node.message !== null) return null;
  if (node.parentId === null) return null;
  if (node.children.length > 0) return null;
  return node;
}

function updateSubtreeLevels(session: ChatSession, nodeId: string, level: number): void {
  const node = getNodeOrThrow(session, nodeId);
  node.level = level;

  for (const childId of node.children) {
    updateSubtreeLevels(session, childId, level + 1);
  }
}

function getMessageTitle(message: AgentMessage): string | null {
  if (message.role !== 'user') return null;

  const rawContent = typeof message.content === 'string'
    ? message.content
    : message.content
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join(' ');

  const normalized = rawContent.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 30) : null;
}

export function createMessageNode(
  message: AgentMessage | null,
  parentId: string | null,
  level: number,
): MessageNode {
  return {
    id: nanoid(),
    parentId,
    children: [],
    currentChild: null,
    level,
    message,
  };
}

export function createSession(id?: string): ChatSession {
  const now = Date.now();
  const rootNode = createMessageNode(null, null, 0);

  return {
    id: id ?? nanoid(),
    title: null,
    mapping: {
      [rootNode.id]: rootNode,
    },
    currentNode: rootNode.id,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    revision: 0,
    bridges: [],
  };
}

export function performOp(
  session: ChatSession,
  child: MessageNode,
  op: TreeOp,
  newParentId?: string,
): void {
  const existingChild = session.mapping[child.id];
  const childNode = existingChild ?? child;
  const oldParent = childNode.parentId !== null ? getNodeOrThrow(session, childNode.parentId) : null;
  let newParent: MessageNode | null = null;

  if (op === 'relink' && childNode.parentId === newParentId) {
    return;
  }

  if (op === 'link' || op === 'relink') {
    if (!newParentId) {
      throw new Error('[ai-chat-tree] link requires newParentId');
    }

    newParent = getNodeOrThrow(session, newParentId);
    const visited = new Set<string>();
    let cursor: MessageNode | undefined = newParent;

    while (cursor) {
      if (cursor.id === childNode.id) {
        throw new Error('[ai-chat-tree] Cannot create cycle while linking node');
      }
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      cursor = cursor.parentId ? session.mapping[cursor.parentId] : undefined;
    }
  }

  if (!existingChild && (op === 'link' || op === 'relink')) {
    session.mapping[childNode.id] = childNode;
  }

  if (op === 'cut' || op === 'relink') {
    if (oldParent) {
      oldParent.children = oldParent.children.filter((childId) => childId !== childNode.id);

      if (oldParent.currentChild === childNode.id) {
        oldParent.currentChild = oldParent.children.at(-1) ?? null;
      }
    }

    childNode.parentId = null;

    if (op === 'cut') {
      touchSession(session);
      return;
    }
  }

  if (newParent) {
    if (!newParent.children.includes(childNode.id)) {
      newParent.children = [...newParent.children, childNode.id];
    }

    childNode.parentId = newParent.id;
    newParent.currentChild = childNode.id;
    updateSubtreeLevels(session, childNode.id, newParent.level + 1);
    touchSession(session);
  }
}

export function appendMessage(session: ChatSession, message: AgentMessage): MessageNode {
  const parent = getNodeOrThrow(session, session.currentNode);
  const node = createMessageNode(message, parent.id, parent.level + 1);

  performOp(session, node, 'link', parent.id);
  session.currentNode = node.id;

  return node;
}

export function getLinearPath(session: ChatSession): MessageNode[] {
  const head = session.mapping[session.currentNode];
  if (!head) return [];

  const path: Array<MessageNode | undefined> = [];
  const visited = new Set<string>();

  for (
    let cursor: MessageNode | undefined = head;
    cursor;
    cursor = cursor.parentId ? session.mapping[cursor.parentId] : undefined
  ) {
    if (visited.has(cursor.id)) break;
    visited.add(cursor.id);

    if (cursor.message !== null) {
      path[cursor.level] = cursor;
    }
  }

  if (import.meta.env.DEV) {
    const filledLevels = path.flatMap((node, level) => (node ? [level] : []));
    if (filledLevels.length > 0) {
      const firstLevel = filledLevels[0];
      const lastLevel = filledLevels[filledLevels.length - 1];
      if (firstLevel > 1) {
        console.warn('[ai-chat-tree] getLinearPath: path has gaps, tree may be malformed');
      } else {
        for (let level = firstLevel; level <= lastLevel; level += 1) {
          if (!path[level]) {
            console.warn('[ai-chat-tree] getLinearPath: path has gaps, tree may be malformed');
            break;
          }
        }
      }
    }
  }

  return path.filter((node): node is MessageNode => node !== undefined);
}

export function findLatestLeaf(session: ChatSession, nodeId: string): MessageNode {
  let cursor = getNodeOrThrow(session, nodeId);
  const visited = new Set<string>();

  while (cursor.currentChild) {
    if (visited.has(cursor.id)) break;
    visited.add(cursor.id);

    const next = session.mapping[cursor.currentChild];
    if (!next) break;
    cursor = next;
  }

  return cursor;
}

export function syncAgentToTree(session: ChatSession, agentMessages: AgentMessage[]): void {
  const linearPath = getLinearPath(session);
  const existingCount = linearPath.length;

  if (existingCount > 0 && existingCount <= agentMessages.length) {
    const treeMessage = linearPath[existingCount - 1]?.message;
    const agentMessage = agentMessages[existingCount - 1];

    if (!treeMessage || treeMessage.role !== agentMessage.role) {
      console.error(
        '[ai-chat-tree] syncAgentToTree: position mismatch - tree last role=%s, agent role=%s',
        treeMessage?.role ?? 'null',
        agentMessage.role,
      );
      return;
    }
  }

  let nextIndex = existingCount;
  const placeholder = getPendingLeafPlaceholder(session);
  if (placeholder && nextIndex < agentMessages.length) {
    placeholder.message = agentMessages[nextIndex];
    touchSession(session);
    nextIndex += 1;
  }

  for (let index = nextIndex; index < agentMessages.length; index += 1) {
    appendMessage(session, agentMessages[index]);
  }
}

export function editMessage(
  session: ChatSession,
  nodeId: string,
  newMessage: AgentMessage,
): MessageNode {
  const target = getNodeOrThrow(session, nodeId);
  if (!target.parentId) {
    throw new Error('[ai-chat-tree] Cannot edit synthetic root');
  }

  const sibling = createMessageNode(newMessage, target.parentId, target.level);
  performOp(session, sibling, 'link', target.parentId);
  session.currentNode = sibling.id;

  return sibling;
}

export function regenerate(session: ChatSession, nodeId: string): MessageNode {
  const target = getNodeOrThrow(session, nodeId);
  if (!target.parentId) {
    throw new Error('[ai-chat-tree] Cannot regenerate synthetic root');
  }

  const sibling = createMessageNode(null, target.parentId, target.level);
  performOp(session, sibling, 'link', target.parentId);
  session.currentNode = sibling.id;

  return sibling;
}

export function switchBranch(session: ChatSession, nodeId: string): void {
  const node = getNodeOrThrow(session, nodeId);

  if (!node.parentId) {
    session.currentNode = node.id;
    touchSession(session);
    return;
  }

  const parent = getNodeOrThrow(session, node.parentId);
  parent.currentChild = node.id;
  session.currentNode = findLatestLeaf(session, node.id).id;
  touchSession(session);
}

export function getBranches(session: ChatSession, nodeId: string): string[] {
  const node = session.mapping[nodeId];
  if (!node?.parentId) return [];

  return getNodeOrThrow(session, node.parentId).children.slice();
}

export function linearToTree(messages: AgentMessage[]): ChatSession {
  const session = createSession();

  for (const message of messages) {
    appendMessage(session, message);
  }

  session.title = messages.map(getMessageTitle).find((title) => title !== null) ?? null;

  return session;
}

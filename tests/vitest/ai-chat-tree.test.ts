import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendMessage,
  createMessageNode,
  createSession,
  editMessage,
  findLatestLeaf,
  getBranches,
  getLinearPath,
  linearToTree,
  performOp,
  regenerate,
  switchBranch,
  syncAgentToTree,
  type ChatSession,
  type MessageNode,
} from '../../src/lib/ai-chat-tree.js';

function createUserMessage(content: string, timestamp: number): AgentMessage {
  return {
    role: 'user',
    content,
    timestamp,
  };
}

function createAssistantMessage(text: string, timestamp: number): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: 'stop',
    timestamp,
  };
}

function getRootNode(session: ChatSession): MessageNode {
  const root = Object.values(session.mapping).find((node) => node.parentId === null);
  if (!root) {
    throw new Error('expected synthetic root node');
  }
  return root;
}

function linkSibling(session: ChatSession, parentId: string, message: AgentMessage | null): MessageNode {
  const parent = session.mapping[parentId];
  if (!parent) {
    throw new Error(`missing parent ${parentId}`);
  }

  const node = createMessageNode(message, parentId, parent.level + 1);
  performOp(session, node, 'link', parentId);
  return node;
}

function countMessageNodes(session: ChatSession): number {
  return Object.values(session.mapping).filter((node) => node.message !== null).length;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ai chat tree', () => {
  it('createSession creates an empty session with a synthetic root node', () => {
    const session = createSession();
    const root = getRootNode(session);

    expect(session.title).toBeNull();
    expect(session.currentNode).toBe(root.id);
    expect(session.syncedAt).toBeNull();
    expect(session.revision).toBe(0);
    expect(session.bridges).toEqual([]);
    expect(root).toMatchObject({
      parentId: null,
      children: [],
      currentChild: null,
      level: 0,
      message: null,
    });
  });

  it('appendMessage appends under currentNode and updates currentNode/currentChild', () => {
    const session = createSession();
    const root = getRootNode(session);
    const node = appendMessage(session, createUserMessage('hello', 1));

    expect(session.currentNode).toBe(node.id);
    expect(root.children).toEqual([node.id]);
    expect(root.currentChild).toBe(node.id);
    expect(node.parentId).toBe(root.id);
    expect(node.level).toBe(1);
  });

  it('getLinearPath returns the active path in order and skips the synthetic root', () => {
    const session = createSession();
    appendMessage(session, createUserMessage('user-1', 1));
    appendMessage(session, createAssistantMessage('assistant-1', 2));
    appendMessage(session, createUserMessage('user-2', 3));

    expect(getLinearPath(session).map((node) => node.message?.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
  });

  it('getLinearPath breaks out of parent cycles instead of looping forever', () => {
    const session = createSession();
    const root = getRootNode(session);
    const first = linkSibling(session, root.id, createUserMessage('first', 1));
    const second = createMessageNode(createAssistantMessage('second', 2), first.id, first.level + 1);
    performOp(session, second, 'link', first.id);

    first.parentId = second.id;
    second.parentId = first.id;
    session.currentNode = second.id;

    expect(getLinearPath(session).map((node) => node.id)).toEqual([first.id, second.id]);
  });

  it('getLinearPath warns in DEV when there are gaps in message levels', () => {
    const session = createSession();
    const root = getRootNode(session);
    const user = createMessageNode(createUserMessage('user', 1), root.id, 1);
    const assistant = createMessageNode(createAssistantMessage('assistant', 2), user.id, 3);

    session.mapping[user.id] = user;
    session.mapping[assistant.id] = assistant;
    root.children = [user.id];
    root.currentChild = user.id;
    user.children = [assistant.id];
    user.currentChild = assistant.id;
    session.currentNode = assistant.id;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getLinearPath(session).map((node) => node.id)).toEqual([user.id, assistant.id]);
    if (import.meta.env.DEV) {
      expect(warn).toHaveBeenCalledWith(
        '[ai-chat-tree] getLinearPath: path has gaps, tree may be malformed',
      );
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it('syncAgentToTree appends only the missing agent messages', () => {
    const session = createSession();
    const messages = [
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4),
    ];

    appendMessage(session, messages[0]);
    appendMessage(session, messages[1]);
    syncAgentToTree(session, messages);

    expect(getLinearPath(session).map((node) => node.message)).toEqual(messages);
  });

  it('syncAgentToTree bails out when the last role does not match the tree path', () => {
    const session = createSession();
    appendMessage(session, createUserMessage('user-1', 1));
    appendMessage(session, createAssistantMessage('assistant-1', 2));
    const beforeIds = Object.keys(session.mapping);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    syncAgentToTree(session, [
      createUserMessage('user-1', 1),
      createUserMessage('wrong-role', 2),
      createAssistantMessage('assistant-2', 3),
    ]);

    expect(Object.keys(session.mapping)).toEqual(beforeIds);
    expect(error).toHaveBeenCalledOnce();
  });

  it('syncAgentToTree is idempotent for the same message array', () => {
    const session = createSession();
    const messages = [
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
    ];

    syncAgentToTree(session, messages);
    const firstIds = Object.keys(session.mapping);
    syncAgentToTree(session, messages);

    expect(Object.keys(session.mapping)).toEqual(firstIds);
    expect(countMessageNodes(session)).toBe(messages.length);
  });

  it('performOp cut removes a node and falls back currentChild to the previous sibling', () => {
    const session = createSession();
    const root = getRootNode(session);
    const first = linkSibling(session, root.id, createUserMessage('first', 1));
    const second = linkSibling(session, root.id, createUserMessage('second', 2));

    performOp(session, second, 'cut');

    expect(root.children).toEqual([first.id]);
    expect(root.currentChild).toBe(first.id);
    expect(second.parentId).toBeNull();
  });

  it('performOp cut sets currentChild to null when the last child is removed', () => {
    const session = createSession();
    const root = getRootNode(session);
    const only = linkSibling(session, root.id, createUserMessage('only', 1));

    performOp(session, only, 'cut');

    expect(root.children).toEqual([]);
    expect(root.currentChild).toBeNull();
  });

  it('performOp link throws when linking a node under its own descendant', () => {
    const session = createSession();
    const root = getRootNode(session);
    const parent = linkSibling(session, root.id, createUserMessage('parent', 1));
    const child = createMessageNode(createAssistantMessage('child', 2), parent.id, parent.level + 1);
    performOp(session, child, 'link', parent.id);

    expect(() => performOp(session, parent, 'link', child.id)).toThrow(/cycle/i);
  });

  it('performOp relink validates before mutating the existing tree', () => {
    const session = createSession();
    const root = getRootNode(session);
    const parent = linkSibling(session, root.id, createUserMessage('parent', 1));
    const child = createMessageNode(createAssistantMessage('child', 2), parent.id, parent.level + 1);
    performOp(session, child, 'link', parent.id);

    expect(() => performOp(session, parent, 'relink', child.id)).toThrow(/cycle/i);
    expect(root.children).toEqual([parent.id]);
    expect(root.currentChild).toBe(parent.id);
    expect(parent.parentId).toBe(root.id);
    expect(parent.children).toEqual([child.id]);
    expect(child.parentId).toBe(parent.id);
  });

  it('performOp link does not register a new node when validation fails', () => {
    const session = createSession();
    const orphan = createMessageNode(createUserMessage('orphan', 1), 'missing-parent', 1);

    expect(() => performOp(session, orphan, 'link', 'missing-parent')).toThrow(/Missing node/);
    expect(session.mapping[orphan.id]).toBeUndefined();
  });

  it('performOp link updates subtree levels recursively', () => {
    const session = createSession();
    const root = getRootNode(session);
    const a = linkSibling(session, root.id, createUserMessage('a', 1));
    const b = createMessageNode(createAssistantMessage('b', 2), a.id, a.level + 1);
    performOp(session, b, 'link', a.id);
    const c = createMessageNode(createUserMessage('c', 3), b.id, b.level + 1);
    performOp(session, c, 'link', b.id);

    const p = linkSibling(session, root.id, createUserMessage('p', 4));
    const q = createMessageNode(createAssistantMessage('q', 5), p.id, p.level + 1);
    performOp(session, q, 'link', p.id);

    performOp(session, b, 'relink', q.id);

    expect(a.children).toEqual([]);
    expect(q.children).toEqual([b.id]);
    expect(q.currentChild).toBe(b.id);
    expect(b.parentId).toBe(q.id);
    expect(b.level).toBe(3);
    expect(c.level).toBe(4);
  });

  it('editMessage creates a sibling branch under the same parent', () => {
    const session = createSession();
    const root = getRootNode(session);
    const original = linkSibling(session, root.id, createUserMessage('original', 1));

    const edited = editMessage(session, original.id, createUserMessage('edited', 2));

    expect(root.children).toEqual([original.id, edited.id]);
    expect(root.currentChild).toBe(edited.id);
    expect(session.currentNode).toBe(edited.id);
    expect(edited.message).toEqual(createUserMessage('edited', 2));
  });

  it('regenerate creates a sibling placeholder node under the same parent', () => {
    const session = createSession();
    const root = getRootNode(session);
    const user = linkSibling(session, root.id, createUserMessage('user', 1));
    const assistant = createMessageNode(createAssistantMessage('assistant', 2), user.id, user.level + 1);
    performOp(session, assistant, 'link', user.id);

    const placeholder = regenerate(session, assistant.id);

    expect(user.children).toEqual([assistant.id, placeholder.id]);
    expect(user.currentChild).toBe(placeholder.id);
    expect(session.currentNode).toBe(placeholder.id);
    expect(placeholder.parentId).toBe(user.id);
    expect(placeholder.message).toBeNull();
  });

  it('syncAgentToTree fills a regenerate placeholder before appending deeper messages', () => {
    const session = createSession();
    const root = getRootNode(session);
    const user = linkSibling(session, root.id, createUserMessage('user', 1));
    const original = createMessageNode(createAssistantMessage('original', 2), user.id, user.level + 1);
    performOp(session, original, 'link', user.id);
    const placeholder = regenerate(session, original.id);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getLinearPath(session).map((node) => node.id)).toEqual([user.id]);
    expect(warn).not.toHaveBeenCalled();

    syncAgentToTree(session, [
      createUserMessage('user', 1),
      createAssistantMessage('regenerated', 3),
      {
        role: 'toolResult',
        toolCallId: 'call_4',
        toolName: 'browser',
        content: [{ type: 'text', text: 'tool output' }],
        isError: false,
        timestamp: 4,
      },
      createAssistantMessage('final', 5),
    ]);

    expect(placeholder.message).toEqual(createAssistantMessage('regenerated', 3));
    expect(user.children).toEqual([original.id, placeholder.id]);
    expect(placeholder.children).toHaveLength(1);
    const toolResultId = placeholder.children[0];
    expect(session.mapping[toolResultId]?.message).toMatchObject({ role: 'toolResult' });
    expect(getLinearPath(session).map((node) => node.message?.role)).toEqual([
      'user',
      'assistant',
      'toolResult',
      'assistant',
    ]);
  });

  it('switchBranch updates currentChild and follows currentChild pointers to the latest leaf', () => {
    const session = createSession();
    const root = getRootNode(session);
    const branchA = linkSibling(session, root.id, createUserMessage('branch-a', 1));
    const leafA = createMessageNode(createAssistantMessage('leaf-a', 2), branchA.id, branchA.level + 1);
    performOp(session, leafA, 'link', branchA.id);

    const branchB = linkSibling(session, root.id, createUserMessage('branch-b', 3));
    const leafB = createMessageNode(createAssistantMessage('leaf-b', 4), branchB.id, branchB.level + 1);
    performOp(session, leafB, 'link', branchB.id);
    session.currentNode = leafB.id;

    expect(findLatestLeaf(session, branchB.id).id).toBe(leafB.id);

    switchBranch(session, branchA.id);

    expect(root.currentChild).toBe(branchA.id);
    expect(session.currentNode).toBe(leafA.id);
  });

  it('getBranches returns sibling ids from the node parent', () => {
    const session = createSession();
    const root = getRootNode(session);
    const first = linkSibling(session, root.id, createUserMessage('first', 1));
    const second = linkSibling(session, root.id, createUserMessage('second', 2));

    expect(getBranches(session, first.id)).toEqual([first.id, second.id]);
  });

  it('linearToTree converts a linear array into a tree session and derives a title', () => {
    const messages = [
      createUserMessage('abcdefghijklmnopqrstuvwxyz1234567890', 1),
      createAssistantMessage('assistant', 2),
      createUserMessage('follow-up', 3),
    ];

    const session = linearToTree(messages);
    const root = getRootNode(session);
    const path = getLinearPath(session);

    expect(session.title).toBe('abcdefghijklmnopqrstuvwxyz1234');
    expect(root.children).toEqual([path[0].id]);
    expect(path.map((node) => node.message)).toEqual(messages);
    expect(session.currentNode).toBe(path[2].id);
  });
});

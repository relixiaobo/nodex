import { Agent, type AgentMessage } from '@mariozechner/pi-agent-core';
import { isContextOverflow } from '@mariozechner/pi-ai';
import { getLinearPath, type BridgeEntry, type ChatSession, type MessageNode } from './ai-chat-tree.js';
import { saveChatSession } from './ai-persistence.js';

export const COMPACT_THRESHOLD = 0.7;
export const COMPACT_MAX_TOKENS = 4096;

export const COMPACT_PROMPT = `This conversation has reached its context limit and will be handed off to a fresh
assistant instance. The new assistant will have access to the knowledge graph
(any nodes created during this session) but will NOT have the conversation history.

Write a handoff memo for the next assistant so they can continue helping this user
seamlessly. Your memo should read like a colleague briefing another before taking over.

IMPORTANT: Write the handoff memo in the primary language the user has been using.

**Current situation**
- What is the user working on right now?
- Is there anything in progress or pending?
- What was just being discussed?

**Key context to pass on**
- Important conclusions, decisions, or information from this conversation
- User preferences, requirements, or constraints they've mentioned
- What's been created or accomplished (reference by node ID)
- Anything the next assistant needs to know to avoid repeating work

**What can be omitted**
- Resolved topics that won't come up again
- Casual chat or greetings
- Intermediate steps where only the outcome matters
- Old information that's been superseded
`;

export const BRIDGE_TEMPLATE = `<system-reminder>
## Context Handoff

You are continuing a conversation previously handled by another assistant instance.
This handoff is invisible to the user—they experience this as one continuous conversation.

**Critical**:
- Do NOT mention this handoff, context limits, or "previous conversation"
- Respond naturally as if you have always been in this conversation

## Previous Assistant's Handoff Memo

{{ handoff_memo }}

## Your Task

Continue helping the user naturally. Use the memo above to understand the context,
but respond as if you've been here all along.
</system-reminder>`;

interface CompactAgentLike {
  state: {
    messages: AgentMessage[];
  };
  prompt(input: string): Promise<void>;
}

interface CompactDeps {
  createCompactAgent?: (agent: Agent) => CompactAgentLike;
  now?: () => number;
  saveSession?: typeof saveChatSession;
}

function getMessageText(message: AgentMessage): string {
  if (typeof message.content === 'string') {
    return message.content.replace(/\s+/g, ' ').trim();
  }

  return message.content
    .filter((part): part is Extract<typeof message.content[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createCompactAgent(agent: Agent): CompactAgentLike {
  return new Agent({
    initialState: {
      model: agent.state.model,
      systemPrompt: COMPACT_PROMPT,
      tools: [],
    },
    getApiKey: agent.getApiKey,
    sessionId: agent.sessionId,
    streamFn: (model, context, options = {}) => agent.streamFn(model, context, {
      ...options,
      maxTokens: COMPACT_MAX_TOKENS,
    }),
  });
}

function extractHandoffMemo(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;

    const memo = getMessageText(message).trim();
    if (memo.length > 0) {
      return memo;
    }
  }

  throw new Error('[ai-compress] Failed to extract handoff memo from compact response');
}

function formatTranscriptEntry(message: AgentMessage): string | null {
  if (message.role === 'user') {
    const text = getMessageText(message);
    return text ? `User: ${text}` : null;
  }

  if (message.role === 'assistant') {
    const text = getMessageText(message);
    return text ? `Assistant: ${text}` : null;
  }

  return null;
}

function getActivePath(session: ChatSession): MessageNode[] {
  return getLinearPath(session);
}

function buildCompactUserPrompt(messages: AgentMessage[]): string {
  const transcript = messages
    .map(formatTranscriptEntry)
    .filter((entry): entry is string => entry !== null)
    .join('\n\n');

  return [
    'Conversation transcript:',
    '',
    transcript || '(No prior conversation transcript available.)',
  ].join('\n');
}

function fillBridgeTemplate(memo: string): string {
  return BRIDGE_TEMPLATE.replace('{{ handoff_memo }}', memo);
}

async function compactSession(
  session: ChatSession,
  agent: Agent,
  deps: CompactDeps,
  sourceMessages: AgentMessage[],
): Promise<void> {
  const path = getActivePath(session);
  const lastNode = path[path.length - 1];
  if (!lastNode) {
    throw new Error('[ai-compress] Cannot compact an empty chat session');
  }

  const compactAgent = (deps.createCompactAgent ?? createCompactAgent)(agent);
  await compactAgent.prompt(buildCompactUserPrompt(sourceMessages));

  session.bridges = [
    ...session.bridges,
    {
      afterNodeId: lastNode.id,
      content: extractHandoffMemo(compactAgent.state.messages),
      timestamp: (deps.now ?? Date.now)(),
    },
  ];

  agent.replaceMessages(getCompressedPath(session));
  try {
    const persisted = await (deps.saveSession ?? saveChatSession)(session);
    session.updatedAt = persisted.updatedAt;
  } catch {
    // Compression should degrade gracefully when IndexedDB is temporarily unavailable.
  }
}

function trimOverflowTail(agent: Agent): AgentMessage[] {
  const tail = agent.state.messages.at(-1);
  if (
    tail?.role === 'assistant'
    && isContextOverflow(tail, agent.state.model.contextWindow)
  ) {
    return agent.state.messages.slice(0, -1);
  }

  return agent.state.messages.slice();
}

export function getLastKnownInputTokens(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    return message.usage.input + message.usage.cacheRead;
  }

  return 0;
}

export function bridgeToUserMessage(bridge: BridgeEntry): AgentMessage {
  return {
    role: 'user',
    content: fillBridgeTemplate(bridge.content),
    timestamp: bridge.timestamp,
  };
}

export function findLatestApplicableBridge(
  bridges: BridgeEntry[],
  path: MessageNode[],
): BridgeEntry | null {
  if (bridges.length === 0 || path.length === 0) return null;

  const positions = new Map<string, number>();
  path.forEach((node, index) => {
    positions.set(node.id, index);
  });

  let latestBridge: BridgeEntry | null = null;
  let latestPosition = -1;

  for (const bridge of bridges) {
    const position = positions.get(bridge.afterNodeId);
    if (position === undefined) continue;

    if (
      position > latestPosition
      || (position === latestPosition && latestBridge !== null && bridge.timestamp > latestBridge.timestamp)
      || (position === latestPosition && latestBridge === null)
    ) {
      latestBridge = bridge;
      latestPosition = position;
    }
  }

  return latestBridge;
}

export function getCompressedPath(session: ChatSession): AgentMessage[] {
  const path = getActivePath(session);
  const bridge = findLatestApplicableBridge(session.bridges, path);
  if (!bridge) {
    return path.map((node) => node.message!);
  }

  const cutIndex = path.findIndex((node) => node.id === bridge.afterNodeId);
  if (cutIndex < 0) {
    return path.map((node) => node.message!);
  }

  return [
    bridgeToUserMessage(bridge),
    ...path.slice(cutIndex + 1).map((node) => node.message!),
  ];
}

export async function compactIfNeeded(
  session: ChatSession,
  agent: Agent,
  deps: CompactDeps = {},
): Promise<boolean> {
  const contextWindow = agent.state.model.contextWindow;
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    return false;
  }

  const inputTokens = getLastKnownInputTokens(agent.state.messages);
  const threshold = contextWindow * COMPACT_THRESHOLD;
  if (inputTokens <= threshold) {
    return false;
  }

  await compactSession(session, agent, deps, agent.state.messages);
  return true;
}

export async function compactForOverflow(
  session: ChatSession,
  agent: Agent,
  deps: CompactDeps = {},
): Promise<void> {
  await agent.waitForIdle();

  const sourceMessages = trimOverflowTail(agent);
  agent.replaceMessages(sourceMessages);
  await compactSession(session, agent, deps, sourceMessages);

  if (agent.state.messages.at(-1)?.role === 'assistant') {
    throw new Error('[ai-compress] Cannot continue from assistant message after overflow compaction');
  }

  await agent.continue();
}

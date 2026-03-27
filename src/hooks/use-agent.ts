import { startTransition, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Message, ThinkingLevel, ToolResultMessage, UserMessage } from '@mariozechner/pi-ai';
import { getCompressedPath } from '../lib/ai-compress.js';
import { getBranches, getLinearPath } from '../lib/ai-chat-tree.js';
import type { ChatTurnDebugRecord } from '../lib/ai-debug.js';
import {
  createNewChatSession,
  getCurrentDebugTurns,
  editAndResend,
  getCurrentSession,
  getAIAgent,
  getThinkingLevel,
  hasSteering,
  isChatSessionBodyReady,
  isChatSessionShellReady,
  prepareChatSessionById,
  prepareLatestChatSession,
  regenerateResponse,
  setSteeringNote,
  stopStreaming,
  streamChat,
  switchMessageBranch,
  updateSessionTitle,
  waitForChatSessionBody,
} from '../lib/ai-service.js';

export type ChatConversationMessage = UserMessage | AssistantMessage;

export interface ChatMessageEntry {
  nodeId: string | null;
  message: ChatConversationMessage;
  branches: { ids: string[]; currentIndex: number } | null;
  displayKind?: 'message' | 'active_assistant_placeholder';
}

export type ChatTurnPhase = 'idle' | 'streaming_text' | 'waiting_for_tool' | 'resuming_after_tool';

export interface AgentDebugState {
  revision: number;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AgentTool<any>[];
  modelId: string;
  provider: string;
  reasoning: boolean;
  thinkingLevel: ThinkingLevel | null;
  turns: ChatTurnDebugRecord[];
}

/** Extract a map of toolCallId → result text from all messages. */
function buildToolResultMap(messages: Message[]): Map<string, ToolResultMessage> {
  const map = new Map<string, ToolResultMessage>();
  for (const m of messages) {
    if (m.role === 'toolResult') {
      map.set(m.toolCallId, m);
    }
  }
  return map;
}

function isConversationMessage(message: unknown): message is ChatConversationMessage {
  return !!message
    && typeof message === 'object'
    && 'role' in message
    && ((message as { role: string }).role === 'user'
      || (message as { role: string }).role === 'assistant');
}

function sameConversationMessage(a: ChatConversationMessage | null | undefined, b: ChatConversationMessage | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.role !== b.role) return false;
  return a.timestamp === b.timestamp;
}

function assistantHasVisibleText(message: AssistantMessage): boolean {
  return message.content.some((block) => block.type === 'text' && block.text.trim().length > 0);
}

function assistantHasPendingToolCalls(
  message: AssistantMessage,
  toolResults: Map<string, ToolResultMessage>,
): boolean {
  let sawToolCall = false;

  for (const block of message.content) {
    if (block.type !== 'toolCall') continue;
    sawToolCall = true;
    if (!toolResults.has(block.id)) {
      return true;
    }
  }

  return sawToolCall ? false : false;
}

export function shouldAppendActiveAssistantPlaceholder(
  messages: ChatMessageEntry[],
  turnPhase: ChatTurnPhase,
): boolean {
  if (turnPhase === 'idle' || messages.length === 0) {
    return false;
  }

  return messages[messages.length - 1]!.message.role !== 'assistant';
}

function createActiveAssistantPlaceholderEntry(
  timestamp: number,
  provider: string,
  modelId: string,
): ChatMessageEntry {
  return {
    nodeId: null,
    branches: null,
    displayKind: 'active_assistant_placeholder',
    message: {
      role: 'assistant',
      content: [],
      api: 'anthropic-messages',
      provider,
      model: modelId,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp,
    },
  };
}

function appendActiveAssistantPlaceholder(
  messages: ChatMessageEntry[],
  turnPhase: ChatTurnPhase,
  agent: Agent,
): ChatMessageEntry[] {
  if (!shouldAppendActiveAssistantPlaceholder(messages, turnPhase)) {
    return messages;
  }

  const lastTimestamp = messages[messages.length - 1]?.message.timestamp ?? 0;
  return [
    ...messages,
    createActiveAssistantPlaceholderEntry(
      lastTimestamp,
      agent.state.model?.provider ?? 'anthropic',
      agent.state.model?.id ?? 'pending',
    ),
  ];
}

function getConversationState(
  agent: Agent,
  toolResults: Map<string, ToolResultMessage>,
): { messages: ChatMessageEntry[]; turnPhase: ChatTurnPhase } {
  const session = getCurrentSession(agent);
  const pathEntries = session
    ? getLinearPath(session)
      .flatMap((node) => {
        if (!isConversationMessage(node.message)) {
          return [];
        }

        const branchIds = getBranches(session, node.id);
        const currentIndex = branchIds.indexOf(node.id);

        return [{
          nodeId: node.id,
          message: node.message,
          branches: branchIds.length > 1 && currentIndex >= 0
            ? { ids: branchIds, currentIndex }
            : null,
          displayKind: 'message',
        } satisfies ChatMessageEntry];
      })
    : [];

  const streamingMessage = agent.state.streamMessage;
  const compressedPath = session ? getCompressedPath(session) : [];
  const transientEntries = agent.state.messages
    .slice(compressedPath.length)
    .flatMap((message) =>
      isConversationMessage(message)
        ? [{
          nodeId: null,
          message,
          branches: null,
          displayKind: 'message',
        } satisfies ChatMessageEntry]
        : [],
    );

  const lastPersisted = pathEntries[pathEntries.length - 1]?.message ?? null;
  const lastTransient = transientEntries[transientEntries.length - 1]?.message ?? null;
  const entries = [
    ...pathEntries,
    ...transientEntries,
  ];

  if (isConversationMessage(streamingMessage) && !sameConversationMessage(streamingMessage, lastTransient ?? lastPersisted)) {
    entries.push({
      nodeId: null,
      message: streamingMessage,
      branches: null,
      displayKind: 'message',
    });
  }

  let turnPhase: ChatTurnPhase;
  if (!agent.state.isStreaming) {
    turnPhase = 'idle';
  } else if (streamingMessage?.role === 'assistant') {
    turnPhase = assistantHasVisibleText(streamingMessage) ? 'streaming_text' : 'resuming_after_tool';
  } else {
    const latestAssistant = [...entries].reverse().find((entry) => entry.message.role === 'assistant')?.message as AssistantMessage | undefined;
    turnPhase = latestAssistant && assistantHasPendingToolCalls(latestAssistant, toolResults)
      ? 'waiting_for_tool'
      : 'resuming_after_tool';
  }

  return {
    messages: appendActiveAssistantPlaceholder(entries, turnPhase, agent),
    turnPhase,
  };
}

export function useAgent(agent: Agent = getAIAgent(), sessionId?: string) {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(() => isChatSessionShellReady(agent));
  const [messagesReady, setMessagesReady] = useState(() => isChatSessionBodyReady(agent));

  useLayoutEffect(() => {
    setReady(false);
    setMessagesReady(false);
  }, [agent, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const restoreShell = sessionId
      ? prepareChatSessionById(sessionId, agent)
      : prepareLatestChatSession(agent);

    void restoreShell.finally(() => {
      if (cancelled) return;
      setReady(true);
      startTransition(() => {
        setRevision((value) => value + 1);
      });

      void waitForChatSessionBody(agent).finally(() => {
        if (cancelled) return;
        setMessagesReady(true);
        startTransition(() => {
          setRevision((value) => value + 1);
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [agent, sessionId]);

  useEffect(() => {
    return agent.subscribe(() => {
      setRevision((value) => value + 1);
    });
  }, [agent]);

  return useMemo(() => {
    void revision;

    const toolResults = buildToolResultMap(agent.state.messages);
    const { messages, turnPhase } = getConversationState(agent, toolResults);
    const lastMessage = messages[messages.length - 1]?.message;
    const error = lastMessage?.role === 'assistant' && lastMessage.stopReason === 'aborted'
      ? undefined
      : agent.state.error;

    return {
      agent,
      ready,
      messagesReady,
      sessionId: agent.sessionId ?? null,
      sessionTitle: getCurrentSession(agent)?.title ?? null,
      messages,
      toolResults,
      isStreaming: agent.state.isStreaming,
      turnPhase,
      error,
      debug: {
        revision,
        systemPrompt: agent.state.systemPrompt,
        messages: agent.state.messages,
        tools: agent.state.tools,
        modelId: agent.state.model?.id ?? '',
        provider: agent.state.model?.provider ?? '',
        reasoning: agent.state.model?.reasoning ?? false,
        thinkingLevel: getThinkingLevel(agent),
        turns: getCurrentDebugTurns(agent),
      } satisfies AgentDebugState,
      sendMessage: (prompt: string) => streamChat(prompt, agent),
      editMessage: (nodeId: string, newContent: string) => editAndResend(nodeId, newContent, agent),
      regenerateMessage: (nodeId: string) => regenerateResponse(nodeId, agent),
      switchBranch: (nodeId: string) => {
        switchMessageBranch(nodeId, agent);
        startTransition(() => {
          setRevision((value) => value + 1);
        });
      },
      stopStreaming: () => stopStreaming(agent),
      setSteeringNote: (text: string | null) => {
        setSteeringNote(text, agent);
        startTransition(() => setRevision((v) => v + 1));
      },
      hasSteering: hasSteering(agent),
      updateTitle: (title: string) => {
        updateSessionTitle(agent, title);
        startTransition(() => setRevision((v) => v + 1));
      },
      newChat: async () => {
        await createNewChatSession(agent);
        setReady(true);
        setMessagesReady(true);
        startTransition(() => {
          setRevision((value) => value + 1);
        });
      },
    };
  }, [agent, messagesReady, ready, revision]);
}

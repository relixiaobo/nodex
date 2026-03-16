import { startTransition, useEffect, useMemo, useState } from 'react';
import type { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from '@mariozechner/pi-ai';
import { getBranches, getLinearPath } from '../lib/ai-chat-tree.js';
import type { ChatTurnDebugRecord } from '../lib/ai-debug.js';
import {
  createNewChatSession,
  getCurrentDebugTurns,
  editAndResend,
  getCurrentSession,
  getAIAgent,
  regenerateResponse,
  restoreChatSessionById,
  restoreLatestChatSession,
  stopStreaming,
  streamChat,
  switchMessageBranch,
} from '../lib/ai-service.js';

export type ChatConversationMessage = UserMessage | AssistantMessage;

export interface ChatMessageEntry {
  nodeId: string | null;
  message: ChatConversationMessage;
  branches: { ids: string[]; currentIndex: number } | null;
}

export interface AgentDebugState {
  revision: number;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AgentTool<any>[];
  modelId: string;
  provider: string;
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

function getConversationMessages(agent: Agent): ChatMessageEntry[] {
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
        } satisfies ChatMessageEntry];
      })
    : [];

  const streamingMessage = agent.state.streamMessage;
  if (!isConversationMessage(streamingMessage)) {
    return pathEntries;
  }

  return [
    ...pathEntries,
    {
      nodeId: null,
      message: streamingMessage,
      branches: null,
    },
  ];
}

export function useAgent(agent: Agent = getAIAgent(), sessionId?: string) {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    const restore = sessionId
      ? restoreChatSessionById(sessionId, agent)
      : restoreLatestChatSession(agent);

    void restore.finally(() => {
      if (cancelled) return;
      setReady(true);
      startTransition(() => {
        setRevision((value) => value + 1);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [agent, sessionId]);

  useEffect(() => {
    return agent.subscribe(() => {
      startTransition(() => {
        setRevision((value) => value + 1);
      });
    });
  }, [agent]);

  return useMemo(() => {
    void revision;

    const messages = getConversationMessages(agent);
    const toolResults = buildToolResultMap(agent.state.messages);
    const lastMessage = messages[messages.length - 1]?.message;
    const error = lastMessage?.role === 'assistant' && lastMessage.stopReason === 'aborted'
      ? undefined
      : agent.state.error;

    return {
      agent,
      ready,
      sessionId: agent.sessionId ?? null,
      sessionTitle: getCurrentSession(agent)?.title ?? null,
      messages,
      toolResults,
      isStreaming: agent.state.isStreaming,
      error,
      debug: {
        revision,
        systemPrompt: agent.state.systemPrompt,
        messages: agent.state.messages,
        tools: agent.state.tools,
        modelId: agent.state.model.id,
        provider: agent.state.model.provider,
        turns: getCurrentDebugTurns(agent),
      } satisfies AgentDebugState,
      sendMessage: (prompt: string) => streamChat(prompt, agent),
      editMessage: (nodeId: string, newContent: string) => editAndResend(nodeId, newContent, agent),
      regenerateMessage: (nodeId: string) => regenerateResponse(nodeId, agent),
      switchBranch: (nodeId: string) => switchMessageBranch(nodeId, agent),
      stopStreaming: () => stopStreaming(agent),
      newChat: async () => {
        await createNewChatSession(agent);
        startTransition(() => {
          setRevision((value) => value + 1);
        });
      },
    };
  }, [agent, ready, revision]);
}

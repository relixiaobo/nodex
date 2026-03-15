import { startTransition, useEffect, useMemo, useState } from 'react';
import type { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from '@mariozechner/pi-ai';
import {
  createNewChatSession,
  getCurrentSession,
  getAIAgent,
  restoreLatestChatSession,
  stopStreaming,
  streamChat,
} from '../lib/ai-service.js';

export type ChatConversationMessage = UserMessage | AssistantMessage;

export interface AgentDebugState {
  revision: number;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AgentTool<any>[];
  modelId: string;
  provider: string;
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

function getConversationMessages(agent: Agent): ChatConversationMessage[] {
  const visibleMessages = agent.state.streamMessage
    ? [...agent.state.messages, agent.state.streamMessage]
    : agent.state.messages;

  return visibleMessages.filter(isConversationMessage);
}

export function useAgent(agent: Agent = getAIAgent()) {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void restoreLatestChatSession(agent).finally(() => {
      if (cancelled) return;
      setReady(true);
      startTransition(() => {
        setRevision((value) => value + 1);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [agent]);

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
    const lastMessage = messages[messages.length - 1];
    const error = lastMessage?.role === 'assistant' && lastMessage.stopReason === 'aborted'
      ? undefined
      : agent.state.error;

    return {
      agent,
      ready,
      sessionId: agent.sessionId ?? null,
      sessionTitle: getCurrentSession()?.title ?? null,
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
      } satisfies AgentDebugState,
      sendMessage: (prompt: string) => streamChat(prompt, agent),
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

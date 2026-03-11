import { startTransition, useEffect, useMemo, useState } from 'react';
import type { Agent } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, UserMessage } from '@mariozechner/pi-ai';
import { getAIAgent, stopStreaming, streamChat } from '../lib/ai-service.js';

export type ChatConversationMessage = UserMessage | AssistantMessage;

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
    const lastMessage = messages[messages.length - 1];
    const error = lastMessage?.role === 'assistant' && lastMessage.stopReason === 'aborted'
      ? undefined
      : agent.state.error;

    return {
      agent,
      messages,
      isStreaming: agent.state.isStreaming,
      error,
      sendMessage: (prompt: string) => streamChat(prompt, agent),
      stopStreaming: () => stopStreaming(agent),
    };
  }, [agent, revision]);
}

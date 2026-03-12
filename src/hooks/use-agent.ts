import { startTransition, useEffect, useMemo, useState } from 'react';
import type { Agent } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, UserMessage } from '@mariozechner/pi-ai';
import {
  createNewChatSession,
  getAIAgent,
  persistChatSession,
  restoreLatestChatSession,
  stopStreaming,
  streamChat,
} from '../lib/ai-service.js';

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

function getPersistedMessageSignature(agent: Agent): string {
  return JSON.stringify(agent.state.messages);
}

export function useAgent(agent: Agent = getAIAgent()) {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const persistedMessageSignature = useMemo(() => {
    void revision;
    return getPersistedMessageSignature(agent);
  }, [agent, revision]);

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

  useEffect(() => {
    if (!ready) return;

    const timer = window.setTimeout(() => {
      void persistChatSession(agent);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [agent, ready, persistedMessageSignature]);

  return useMemo(() => {
    void revision;

    const messages = getConversationMessages(agent);
    const lastMessage = messages[messages.length - 1];
    const error = lastMessage?.role === 'assistant' && lastMessage.stopReason === 'aborted'
      ? undefined
      : agent.state.error;

    return {
      agent,
      ready,
      sessionId: agent.sessionId ?? null,
      messages,
      isStreaming: agent.state.isStreaming,
      error,
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

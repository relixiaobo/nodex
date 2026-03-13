import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { ImageContent, ToolResultMessage, UserMessage } from '@mariozechner/pi-ai';

type ImageBearingMessage = UserMessage | ToolResultMessage<unknown>;

function isImageBearingMessage(message: AgentMessage): message is ImageBearingMessage {
  return message.role === 'user' || message.role === 'toolResult';
}

export function messageHasImage(message: AgentMessage): boolean {
  if (!isImageBearingMessage(message) || typeof message.content === 'string') {
    return false;
  }

  return message.content.some((part) => part.type === 'image');
}

export function replaceMessageImages(
  message: AgentMessage,
  createPlaceholder: (image: ImageContent) => string,
): AgentMessage {
  if (!isImageBearingMessage(message) || typeof message.content === 'string') {
    return message;
  }

  let nextContent: typeof message.content | null = null;

  for (let index = 0; index < message.content.length; index += 1) {
    const part = message.content[index];
    if (part.type !== 'image') continue;

    if (!nextContent) {
      nextContent = message.content.slice();
    }

    nextContent[index] = {
      type: 'text',
      text: createPlaceholder(part),
    };
  }

  if (!nextContent) return message;

  return {
    ...message,
    content: nextContent,
  };
}

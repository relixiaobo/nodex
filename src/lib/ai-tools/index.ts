import type { AgentTool } from '@mariozechner/pi-agent-core';
import { createTool } from './create-tool.js';
import { readTool } from './read-tool.js';
import { editTool } from './edit-tool.js';
import { deleteTool } from './delete-tool.js';
import { searchTool } from './search-tool.js';
import { undoTool } from './undo-tool.js';
import { browserTool } from './browser-tool.js';
import { createPastChatsTool, type PastChatsToolRuntime } from './past-chats-tool.js';

export interface AIToolRuntime extends PastChatsToolRuntime {}

export function getAITools(runtime: AIToolRuntime = {}): AgentTool<any>[] {
  return [
    createTool,
    readTool,
    editTool,
    deleteTool,
    searchTool,
    undoTool,
    browserTool,
    createPastChatsTool(runtime),
  ];
}

export { createTool, readTool, editTool, deleteTool, searchTool, undoTool, browserTool, createPastChatsTool };

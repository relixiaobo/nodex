import type { AgentTool } from '@mariozechner/pi-agent-core';
import { createTool } from './create-tool.js';
import { readTool } from './read-tool.js';
import { editTool } from './edit-tool.js';
import { deleteTool } from './delete-tool.js';
import { searchTool } from './search-tool.js';
import { undoTool } from './undo-tool.js';

export function getAITools(): AgentTool<any>[] {
  return [createTool, readTool, editTool, deleteTool, searchTool, undoTool];
}

export { createTool, readTool, editTool, deleteTool, searchTool, undoTool };

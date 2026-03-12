import type { AgentTool } from '@mariozechner/pi-agent-core';
import { nodeTool } from './node-tool.js';
import { undoTool } from './undo-tool.js';

export function getAITools(): AgentTool<any>[] {
  return [nodeTool, undoTool];
}

export { nodeTool, undoTool };

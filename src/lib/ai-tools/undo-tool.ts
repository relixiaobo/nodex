import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import { canUndoAiDoc, undoAiDoc } from '../loro-doc.js';

const undoToolParameters = Type.Object({
  steps: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, default: 1 })),
});

type UndoToolResult = {
  undone: number;
  remaining: number;
};

export const undoTool: AgentTool<typeof undoToolParameters, UndoToolResult> = {
  name: 'undo',
  label: 'Undo',
  description: 'Undo recent AI operations on the knowledge graph without affecting the user\'s own edits.',
  parameters: undoToolParameters,
  execute: async (_toolCallId, params) => {
    const requestedSteps = params.steps ?? 1;
    let undone = 0;

    while (undone < requestedSteps && canUndoAiDoc()) {
      if (!undoAiDoc()) break;
      undone += 1;
    }

    const result: UndoToolResult = {
      undone,
      remaining: canUndoAiDoc() ? 1 : 0,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

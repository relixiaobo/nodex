import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import { canUndoAiDoc, undoAiDoc } from '../loro-doc.js';
import { popAiOp } from './shared.js';

const undoToolParameters = Type.Object({
  steps: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, default: 1, description: 'Number of AI operations to undo (each step = one tool call). Default: 1.' })),
});

interface UndoToolResult {
  undone: number;
  hasMore: boolean;
  reverted: string[];
}

export const undoTool: AgentTool<typeof undoToolParameters, UndoToolResult> = {
  name: 'undo',
  label: 'Undo',
  description: [
    'Undo recent AI operations without affecting the user\'s own edits.',
    'Each step reverts one entire tool call (e.g. a full node_create or node_edit).',
    'Undo is not granular — it cannot revert a single property within an operation.',
    '',
    'To restructure a node (e.g. move description into children), do NOT undo then recreate.',
    'Instead: create the new children first, then edit the node to remove the old value.',
  ].join('\n'),
  parameters: undoToolParameters,
  execute: async (_toolCallId, params) => {
    const requestedSteps = params.steps ?? 1;
    let undone = 0;
    const reverted: string[] = [];

    while (undone < requestedSteps && canUndoAiDoc()) {
      const op = popAiOp();
      if (!undoAiDoc()) break;
      undone += 1;
      reverted.push(op ? `${op.tool}(${op.nodeId}, "${op.name}")` : 'unknown');
    }

    const hasMore = canUndoAiDoc();
    const output: Record<string, unknown> = { undone, hasMore, reverted };

    if (undone === 0) {
      output.hint = 'Nothing to undo — the AI operation stack is empty. Only AI tool calls can be undone, not user edits.';
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      details: { undone, hasMore, reverted },
    };
  },
};

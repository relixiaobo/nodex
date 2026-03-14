import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import { buildAgentDebugSnapshot } from '../../src/lib/ai-debug.js';
import type { PreparedAgentContext } from '../../src/lib/ai-context.js';

const TOOL_SCHEMA = Type.Object({
  query: Type.String(),
});

describe('ai-debug', () => {
  it('builds a sanitized snapshot with reminder sections, tool schemas, and token estimates', () => {
    const messages: AgentMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect the page' },
          { type: 'image', data: 'base64-image', mimeType: 'image/png' },
        ],
        timestamp: 1,
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call_1',
            name: 'browser',
            arguments: { action: 'observe' },
          },
        ],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: 'toolUse',
        timestamp: 2,
      },
      {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'browser',
        content: [
          { type: 'image', data: 'base64-result', mimeType: 'image/jpeg' },
          { type: 'text', text: 'Observed page' },
        ],
        isError: false,
        timestamp: 3,
      },
    ];

    const preparedContext: PreparedAgentContext = {
      reminder: '<system-reminder>\n<panel-context>\nPanel\n</panel-context>\n\n<page-context>\nPage\n</page-context>\n\n<time-context>\nTime\n</time-context>\n</system-reminder>',
      messages,
    };

    const snapshot = buildAgentDebugSnapshot(
      {
        systemPrompt: 'Base prompt\n\n<available-skills>\n<skill id="skill_1" name="Skill" description="Test" />\n</available-skills>',
        messages,
        tools: [
          {
            name: 'browser',
            label: 'Browser',
            description: 'Inspect the active page',
            parameters: TOOL_SCHEMA,
            execute: async () => ({
              content: [{ type: 'text', text: 'ok' }],
              details: null,
            }),
          },
        ],
        modelId: 'claude-sonnet-4-5',
        provider: 'anthropic',
      },
      preparedContext,
    );

    expect(snapshot.reminder.panelContext).toContain('<panel-context>');
    expect(snapshot.reminder.pageContext).toContain('<page-context>');
    expect(snapshot.reminder.timeContext).toContain('<time-context>');
    expect(snapshot.messageInspectors).toHaveLength(3);
    expect(snapshot.messageInspectors[0].json).toContain('[image: image/png]');
    expect(snapshot.messageInspectors[1].kind).toBe('tool_use');
    expect(snapshot.messageInspectors[2].kind).toBe('tool_result');
    expect(snapshot.messageInspectors[2].json).toContain('[image: image/jpeg]');
    expect(snapshot.tools[0].schema).toContain('"query"');
    expect(snapshot.tokenEstimate.systemPrompt).toBeGreaterThan(0);
    expect(snapshot.tokenEstimate.messages).toBeGreaterThan(0);
    expect(snapshot.tokenEstimate.tools).toBeGreaterThan(0);
    expect(snapshot.tokenEstimate.total).toBe(
      snapshot.tokenEstimate.systemPrompt
      + snapshot.tokenEstimate.messages
      + snapshot.tokenEstimate.tools,
    );
    expect(snapshot.tokenEstimate.contextWindow).toBe(200000);
    expect(snapshot.provider).toBe('anthropic');
  });
});

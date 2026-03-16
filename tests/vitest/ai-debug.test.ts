import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { Type, getModel } from '@mariozechner/pi-ai';
import { buildAgentDebugSnapshot, createChatTurnDebugRecord, finalizeChatTurnDebugRecord } from '../../src/lib/ai-debug.js';
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

  it('creates and finalizes turn-level debug records with redacted request secrets and response usage', () => {
    const model = getModel('anthropic', 'claude-sonnet-4-5');

    const turn = createChatTurnDebugRecord({
      id: 'turn_1',
      model,
      context: {
        systemPrompt: 'You are soma',
        messages: [
          {
            role: 'user',
            content: 'Inspect the current page',
            timestamp: 1,
          },
        ],
        tools: [
          {
            name: 'browser',
            description: 'Inspect the active tab',
            parameters: TOOL_SCHEMA,
          },
        ],
      },
      options: {
        temperature: 0.2,
        apiKey: 'sk-secret',
        authToken: 'auth-secret',
        metadata: { panel: 'chat' },
      },
      startedAt: 1000,
    });

    expect(turn.status).toBe('running');
    expect(turn.request.json).toContain('"systemPrompt": "You are soma"');
    expect(turn.request.json).toContain('"metadata"');
    expect(turn.request.json).toContain('[redacted]');
    expect(turn.request.json).not.toContain('sk-secret');
    expect(turn.request.json).not.toContain('auth-secret');

    const finalized = finalizeChatTurnDebugRecord(turn, {
      assistantMessage: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Observed page state' }],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usage: {
          input: 1234,
          output: 321,
          cacheRead: 10,
          cacheWrite: 0,
          totalTokens: 1565,
          cost: {
            input: 0.001,
            output: 0.002,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0.003,
          },
        },
        stopReason: 'stop',
        timestamp: 2000,
      },
      toolResults: [
        {
          role: 'toolResult',
          toolCallId: 'call_1',
          toolName: 'browser',
          content: [{ type: 'text', text: 'Page title: soma' }],
          isError: false,
          timestamp: 1500,
        },
      ],
      finishedAt: 2500,
    });

    expect(finalized.status).toBe('completed');
    expect(finalized.durationMs).toBe(1500);
    expect(finalized.response.stopReason).toBe('stop');
    expect(finalized.response.usage?.totalTokens).toBe(1565);
    expect(finalized.response.json).toContain('"assistantMessage"');
    expect(finalized.response.json).toContain('"toolResults"');
  });
});

import { Agent, type AgentEvent, type AgentMessage } from '@mariozechner/pi-agent-core';
import { getModel, isContextOverflow } from '@mariozechner/pi-ai';
import type { AssistantMessage, Message, Model, StopReason, ThinkingLevel, ToolResultMessage } from '@mariozechner/pi-ai';
import { nanoid } from 'nanoid';
import { getStoredToken } from './auth.js';
import { buildAgentSystemPrompt, DEFAULT_AGENT_MODEL_ID, DEFAULT_AGENT_MAX_TOKENS, DEFAULT_AGENT_TEMPERATURE, readAgentNodeConfig, writeAgentModelSelection, type AgentNodeConfig } from './ai-agent-node.js';
import type { ChatTurnDebugRecord, DebugTurnStatus } from './ai-debug.js';
import { createChatTurnDebugRecord, finalizeChatTurnDebugRecord, normalizeRestoredDebugTurns, readChatDebugEnabled } from './ai-debug.js';
import { getApiKeyForProvider, getAvailableModels, getFeaturedModelIds, getProviderConfigs, normalizeProviderId, saveProviderApiKey } from './ai-provider-config.js';
import {
  createSession,
  editMessage as editTreeMessage,
  getLinearPath,
  regenerate as regenerateTree,
  switchBranch as switchTreeBranch,
  syncAgentToTree,
} from './ai-chat-tree.js';
import { compactForOverflow, compactIfNeeded, getCompressedPath } from './ai-compress.js';
import { prepareAgentContext } from './ai-context.js';
import { type ProxyStreamRequestPayload, streamProxyWithApiKey } from './ai-proxy.js';
import {
  getChatDebugTurns,
  type ChatSession,
  type ChatSessionShell,
  getChatSession,
  getChatSessionShell,
  getLatestChatSession,
  getLatestChatSessionShell,
  saveChatDebugTurns,
  saveChatSession,
  saveChatSessionShellPatch,
  type UpdateChatSessionShellInput,
} from './ai-persistence.js';
import { getAITools } from './ai-tools/index.js';
import * as loroDoc from './loro-doc.js';
import { withCommitOrigin } from './loro-doc.js';
import { SYSTEM_NODE_IDS } from '../types/index.js';
import { scanAndTrackMentionedNodes, clearMentionedNodes } from './ai-mentioned-nodes.js';
import { measureChatAsync } from './chat-profiler.js';

const AI_SETTINGS_KEY = 'soma-ai-settings';
const MAX_SESSION_DEBUG_TURNS = 12;

// ── Reactive chat title store ────────────────────────────────────
// PanelLabel lives outside ChatPanel and cannot use useAgent, so it
// subscribes to this module-level store via useSyncExternalStore.

const chatTitleListeners = new Set<() => void>();
const chatTitleMap = new Map<string, string>();

export function getChatTitle(sessionId: string): string | null {
  return chatTitleMap.get(sessionId) ?? null;
}

export function subscribeChatTitles(listener: () => void): () => void {
  chatTitleListeners.add(listener);
  return () => { chatTitleListeners.delete(listener); };
}

function notifyChatTitleChange(sessionId: string, title: string): void {
  chatTitleMap.set(sessionId, title);
  chatTitleListeners.forEach((l) => l());
}

const DEFAULT_CHAT_MODEL = getModel('anthropic', 'claude-sonnet-4-5');

interface LegacyStoredAISettings {
  provider: 'anthropic';
  apiKey: string;
}

interface AgentRuntimeState {
  createdAt: number;
  currentSession: ChatSession | null;
  debugTurns: ChatTurnDebugRecord[];
  shellHydrated: boolean;
  bodyHydrated: boolean;
  shellRestorePromise: Promise<void> | null;
  bodyRestorePromise: Promise<void> | null;
  restoreKey: string | null;
  temperature: number;
  maxTokens: number;
  thinkingLevel: ThinkingLevel | null;
  activeDebugTurnId: string | null;
  pendingShellPatch: UpdateChatSessionShellInput | null;
  pendingShellPatchTimer: ReturnType<typeof setTimeout> | null;
}

let agentSingleton: Agent | null = null;
const agentRuntimeState = new WeakMap<Agent, AgentRuntimeState>();
const allAgents = new Set<Agent>();
export const agentRegistry = new Map<string, Agent>();
let migrationPromise: Promise<void> | null = null;

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function getSyncApiUrl(): string {
  return import.meta.env.VITE_SYNC_API_URL ?? 'http://localhost:8787';
}

async function readSettings(): Promise<LegacyStoredAISettings | null> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(AI_SETTINGS_KEY);
    return (result[AI_SETTINGS_KEY] as LegacyStoredAISettings | undefined) ?? null;
  }

  const raw = localStorage.getItem(AI_SETTINGS_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LegacyStoredAISettings;
  } catch {
    return null;
  }
}

async function writeSettings(settings: LegacyStoredAISettings | null): Promise<void> {
  if (hasChromeStorage()) {
    if (settings) {
      await chrome.storage.local.set({ [AI_SETTINGS_KEY]: settings });
    } else {
      await chrome.storage.local.remove(AI_SETTINGS_KEY);
    }
    return;
  }

  if (settings) {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } else {
    localStorage.removeItem(AI_SETTINGS_KEY);
  }
}

function getAgentRuntimeState(agent: Agent): AgentRuntimeState {
  let state = agentRuntimeState.get(agent);
  if (!state) {
    state = {
      createdAt: Date.now(),
      currentSession: null,
      debugTurns: [],
      shellHydrated: false,
      bodyHydrated: false,
      shellRestorePromise: null,
      bodyRestorePromise: null,
      restoreKey: null,
      temperature: DEFAULT_AGENT_TEMPERATURE,
      maxTokens: DEFAULT_AGENT_MAX_TOKENS,
      thinkingLevel: null,
      activeDebugTurnId: null,
      pendingShellPatch: null,
      pendingShellPatchTimer: null,
    };
    agentRuntimeState.set(agent, state);
  }
  return state;
}

function hasNodeBackedAISettings(): boolean {
  try {
    return loroDoc.hasNode(SYSTEM_NODE_IDS.SETTINGS);
  } catch {
    return false;
  }
}

function hasAnthropicProviderConfig(configs: ReturnType<typeof getProviderConfigs>): boolean {
  return configs.some((config) => config.provider === 'anthropic' && config.apiKey.length > 0);
}

function getBuiltInAgentSystemPrompt(): string {
  return buildAgentSystemPrompt({
    nodeId: SYSTEM_NODE_IDS.AGENT,
    userInstructions: '',
    modelId: DEFAULT_AGENT_MODEL_ID,
    temperature: DEFAULT_AGENT_TEMPERATURE,
    maxTokens: DEFAULT_AGENT_MAX_TOKENS,
    skillIds: [],
  });
}

function findAvailableModel(
  availableModels: Model<any>[],
  modelId: string,
  provider?: string,
): Model<any> | null {
  const normalizedProvider = normalizeProviderId(provider);
  return availableModels.find((model) => (
    model.id === modelId
      && (normalizedProvider.length === 0 || normalizeProviderId(model.provider) === normalizedProvider)
  )) ?? null;
}

function resolveModel(session: ChatSession | null, modelId: string): Model<any> {
  const availableModels = getAvailableModels();
  const sessionModel = session?.selectedModelId
    ? findAvailableModel(availableModels, session.selectedModelId, session.selectedProvider)
    : null;
  if (sessionModel) return sessionModel;

  const configuredModel = findAvailableModel(availableModels, modelId);
  if (configuredModel) return configuredModel;

  if (availableModels.length > 0) {
    // Prefer the first featured model as default
    const featuredIds = getFeaturedModelIds();
    const featured = availableModels.find((m) => featuredIds.has(m.id));
    return featured ?? availableModels[0];
  }

  try {
    return getModel('anthropic', modelId as never);
  } catch {
    return DEFAULT_CHAT_MODEL;
  }
}

function applyAgentConfiguration(
  agent: Agent,
  session: ChatSession | null,
  agentConfig: AgentNodeConfig | null,
  resolvedModel: Model<any>,
): void {
  const runtime = getAgentRuntimeState(agent);
  runtime.temperature = agentConfig?.temperature ?? DEFAULT_AGENT_TEMPERATURE;
  runtime.maxTokens = agentConfig?.maxTokens ?? DEFAULT_AGENT_MAX_TOKENS;

  agent.setTools(getAITools({
    getCurrentSessionId: () => agent.sessionId ?? getAgentRuntimeState(agent).currentSession?.id ?? null,
  }));
  agent.setSystemPrompt(agentConfig ? buildAgentSystemPrompt(agentConfig) : getBuiltInAgentSystemPrompt());
  agent.setModel(resolvedModel);

  if (session) {
    session.selectedModelId = resolvedModel.id;
    session.selectedProvider = normalizeProviderId(resolvedModel.provider);
  }
}

async function ensureAISettingsMigrated(): Promise<void> {
  if (!hasNodeBackedAISettings()) return;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const legacySettings = await readSettings();
    if (!legacySettings?.apiKey) return;
    const existingConfigs = getProviderConfigs();
    if (hasAnthropicProviderConfig(existingConfigs)) {
      await writeSettings(null);
      return;
    }

    withCommitOrigin('system:ai-settings-migration', () => {
      saveProviderApiKey(legacySettings.provider, legacySettings.apiKey);
    });

    await writeSettings(null);
  })().finally(() => {
    migrationPromise = null;
  });

  return migrationPromise;
}

function readAgentConfigSafely() {
  try {
    return readAgentNodeConfig();
  } catch {
    return null;
  }
}

function supportsDynamicAgentConfiguration(agent: Agent): boolean {
  const candidate = agent as Partial<Agent>;
  return typeof candidate.setTools === 'function'
    && typeof candidate.setSystemPrompt === 'function'
    && typeof candidate.setModel === 'function'
    && typeof candidate.replaceMessages === 'function';
}

export async function configureAgent(agent: Agent): Promise<{
  provider: string;
}> {
  await ensureAISettingsMigrated();

  const runtime = getAgentRuntimeState(agent);
  const agentConfig = readAgentConfigSafely();
  const resolvedModel = resolveModel(
    runtime.currentSession,
    agentConfig?.modelId ?? DEFAULT_AGENT_MODEL_ID,
  );
  applyAgentConfiguration(agent, runtime.currentSession, agentConfig, resolvedModel);

  return { provider: resolvedModel.provider };
}

export async function selectChatModel(
  modelId: string,
  provider: string,
  agent: Agent = getAIAgent(),
): Promise<Model<any>> {
  return measureChatAsync('model-switch', {
    requestedModelId: modelId,
    requestedProvider: provider,
  }, async () => {
    await ensureAISettingsMigrated();

    const runtime = getAgentRuntimeState(agent);
    const session = runtime.currentSession;
    if (!session) {
      throw new Error('Chat session is not ready yet.');
    }

    const resolvedModel = findAvailableModel(getAvailableModels(), modelId, provider);
    if (!resolvedModel) {
      throw new Error(`Model ${provider}/${modelId} is not available.`);
    }

    if (!resolvedModel.reasoning) {
      runtime.thinkingLevel = null;
      if (session) {
        session.selectedThinkingLevel = null;
      }
    }

    const agentConfig = readAgentConfigSafely();
    applyAgentConfiguration(agent, session, agentConfig, resolvedModel);
    writeAgentModelSelection(resolvedModel.id);
    await persistSessionShellPatch(agent, {
      selectedModelId: resolvedModel.id,
      selectedProvider: normalizeProviderId(resolvedModel.provider),
      selectedThinkingLevel: resolvedModel.reasoning ? session.selectedThinkingLevel ?? null : null,
    }, {
      debounceMs: 500,
      touchUpdatedAt: false,
    });
    return resolvedModel;
  });
}

export async function selectThinkingLevel(
  level: ThinkingLevel | null,
  agent: Agent = getAIAgent(),
): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  runtime.thinkingLevel = level;

  const session = runtime.currentSession;
  if (session) {
    session.selectedThinkingLevel = level;
    await persistSessionShellPatch(agent, {
      selectedThinkingLevel: level,
    }, {
      debounceMs: 500,
      touchUpdatedAt: false,
    });
  }
}

export function getThinkingLevel(agent: Agent = getAIAgent()): ThinkingLevel | null {
  return getAgentRuntimeState(agent).thinkingLevel;
}

function isLlmCompatibleMessage(message: AgentMessage): message is Message {
  return message.role === 'user'
    || message.role === 'assistant'
    || message.role === 'toolResult';
}

function canContinueFromMessage(message: AgentMessage | undefined): boolean {
  return message?.role === 'user' || message?.role === 'toolResult';
}

function getMessageText(message: AgentMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter((part): part is Extract<typeof message.content[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

function deriveSessionTitle(messages: AgentMessage[]): string | null {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) return null;

  const normalized = getMessageText(firstUserMessage).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 30) : null;
}

async function generateSessionTitle(session: ChatSession, agent: Agent): Promise<string | null> {
  try {
    // Collect last 3 turns of user + assistant text (no tool calls)
    const messages = agent.state.messages;
    const turns: string[] = [];
    for (let i = messages.length - 1; i >= 0 && turns.length < 6; i--) {
      const m = messages[i];
      if (m.role === 'user' || m.role === 'assistant') {
        const text = getMessageText(m).slice(0, 200);
        if (text) turns.unshift(`${m.role === 'user' ? 'User' : 'Assistant'}: ${text}`);
      }
    }
    if (turns.length === 0) return null;
    const summary = turns.join('\n\n');

    const resolvedModel = resolveModel(session, agent.state.model.id);
    const normalizedProvider = normalizeProviderId(resolvedModel.provider);
    const apiKey = getApiKeyForProvider(normalizedProvider);
    const authToken = await getStoredToken();
    if (!authToken || !apiKey) return null;

    const proxyUrl = getSyncApiUrl();
    const stream = streamProxyWithApiKey(resolvedModel, {
      systemPrompt: 'Generate a short title (3-8 words) for the following conversation. Return only the title text, nothing else.',
      messages: [{
        role: 'user' as const,
        content: [{ type: 'text' as const, text: summary }],
        timestamp: Date.now(),
      }],
      tools: [],
    }, {
      apiKey,
      authToken,
      proxyUrl,
      temperature: 0.3,
      maxTokens: 60,
    });

    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'text_delta') {
        fullText += event.delta;
      }
      if (event.type === 'error') {
        return null;
      }
    }

    // Clean up: remove surrounding quotes, trim, truncate
    let title = fullText.trim().replace(/^["']+|["']+$/g, '').trim();
    if (title.length > 60) title = title.slice(0, 57) + '...';
    return title || null;
  } catch {
    return null;
  }
}

export function updateSessionTitle(agent: Agent, title: string): void {
  const session = getCurrentSession(agent);
  if (!session) return;
  session.title = title;
  notifyChatTitleChange(session.id, title);
  void persistSessionShellPatch(agent, { title }, { touchUpdatedAt: true });
}

/**
 * Regenerate a chat session title using AI.
 * Loads the session, generates a title, and persists it.
 */
export async function regenerateChatTitle(sessionId: string): Promise<string | null> {
  const agent = agentRegistry.get(sessionId);
  if (!agent) return null;
  const session = getCurrentSession(agent);
  if (!session) return null;
  const title = await generateSessionTitle(session, agent);
  if (title) {
    updateSessionTitle(agent, title);
  }
  return title;
}

function setCurrentSession(agent: Agent, session: ChatSession): ChatSession {
  const runtime = getAgentRuntimeState(agent);
  runtime.currentSession = session;
  runtime.debugTurns = [];
  runtime.createdAt = session.createdAt;
  runtime.thinkingLevel = session.selectedThinkingLevel ?? null;
  runtime.activeDebugTurnId = null;
  agent.sessionId = session.id;

  // Hydrate reactive title store so PanelLabel picks up persisted titles
  if (session.title) {
    notifyChatTitleChange(session.id, session.title);
  }

  return session;
}

function setRuntimeRestoreKey(runtime: AgentRuntimeState, key: string): void {
  if (runtime.restoreKey === key) {
    return;
  }

  runtime.shellHydrated = false;
  runtime.bodyHydrated = false;
  runtime.shellRestorePromise = null;
  runtime.bodyRestorePromise = null;
  runtime.restoreKey = key;
}

function createSessionFromShell(shell: ChatSessionShell): ChatSession {
  const session = createSession(shell.id);
  session.title = shell.title;
  session.createdAt = shell.createdAt;
  session.updatedAt = shell.updatedAt;
  session.selectedModelId = shell.selectedModelId ?? undefined;
  session.selectedProvider = shell.selectedProvider ?? undefined;
  session.selectedThinkingLevel = shell.selectedThinkingLevel ?? null;
  return session;
}

function clearPendingShellPatch(runtime: AgentRuntimeState): UpdateChatSessionShellInput | null {
  if (runtime.pendingShellPatchTimer !== null) {
    clearTimeout(runtime.pendingShellPatchTimer);
    runtime.pendingShellPatchTimer = null;
  }

  const pendingPatch = runtime.pendingShellPatch;
  runtime.pendingShellPatch = null;
  return pendingPatch;
}

async function persistSessionShellPatch(
  agent: Agent,
  patch: UpdateChatSessionShellInput,
  options: {
    debounceMs?: number;
    touchUpdatedAt?: boolean;
  } = {},
): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  const session = runtime.currentSession;
  if (!runtime.shellHydrated || !session) {
    return;
  }

  if (patch.title !== undefined) {
    session.title = patch.title;
    if (patch.title) {
      notifyChatTitleChange(session.id, patch.title);
    }
  }
  if (patch.selectedModelId !== undefined) {
    session.selectedModelId = patch.selectedModelId ?? undefined;
  }
  if (patch.selectedProvider !== undefined) {
    session.selectedProvider = patch.selectedProvider ?? undefined;
  }
  if (patch.selectedThinkingLevel !== undefined) {
    session.selectedThinkingLevel = patch.selectedThinkingLevel;
  }

  const writePatch = async (nextPatch: UpdateChatSessionShellInput) => {
    try {
      const persistedShell = await measureChatAsync('persist-chat-shell', {
        sessionId: session.id,
        patchKeys: Object.keys(nextPatch),
        touchUpdatedAt: options.touchUpdatedAt ?? false,
      }, () => saveChatSessionShellPatch(session.id, nextPatch, {
        touchUpdatedAt: options.touchUpdatedAt,
      }));
      if (!persistedShell || getAgentRuntimeState(agent).currentSession !== session) {
        return;
      }
      session.updatedAt = persistedShell.updatedAt;
    } catch {
      // Ignore persistence failures; chat should still function.
    }
  };

  if ((options.debounceMs ?? 0) > 0) {
    runtime.pendingShellPatch = {
      ...(runtime.pendingShellPatch ?? {}),
      ...patch,
    };
    if (runtime.pendingShellPatchTimer !== null) {
      clearTimeout(runtime.pendingShellPatchTimer);
    }
    runtime.pendingShellPatchTimer = setTimeout(() => {
      const pendingPatch = clearPendingShellPatch(runtime);
      if (!pendingPatch) return;
      void writePatch(pendingPatch);
    }, options.debounceMs);
    return;
  }

  clearPendingShellPatch(runtime);
  await writePatch(patch);
}

function ensureCurrentSession(agent: Agent): ChatSession {
  const runtime = getAgentRuntimeState(agent);
  return runtime.currentSession ?? setCurrentSession(agent, createSession());
}

function isAssistantDebugMessage(message: AgentMessage | null | undefined): message is AssistantMessage {
  return message?.role === 'assistant';
}

function readCurrentDebugTurns(agent: Agent): ChatTurnDebugRecord[] {
  return getAgentRuntimeState(agent).debugTurns;
}

function setCurrentDebugTurns(agent: Agent, turns: ChatTurnDebugRecord[]): void {
  const runtime = getAgentRuntimeState(agent);
  runtime.debugTurns = turns.slice(-MAX_SESSION_DEBUG_TURNS);
}

function appendDebugTurn(agent: Agent, turn: ChatTurnDebugRecord): void {
  setCurrentDebugTurns(agent, [...readCurrentDebugTurns(agent), turn]);
}

function startDebugTurn(
  agent: Agent,
  requestBody: ProxyStreamRequestPayload,
): void {
  const runtime = getAgentRuntimeState(agent);
  const session = runtime.currentSession;
  if (!session) return;

  const turn = createChatTurnDebugRecord({
    id: nanoid(),
    model: requestBody.model,
    context: requestBody.context,
    options: requestBody.options,
  });
  appendDebugTurn(agent, turn);
  runtime.activeDebugTurnId = turn.id;
}

async function restoreDebugTurns(sessionId: string, agent: Agent): Promise<void> {
  const restoredTurns = await getChatDebugTurns(sessionId);
  const normalized = normalizeRestoredDebugTurns(restoredTurns);
  setCurrentDebugTurns(agent, normalized.turns);

  if (normalized.changed) {
    await saveChatDebugTurns(sessionId, normalized.turns);
  }
}

function finalizeDebugTurn(
  agent: Agent,
  args: {
    assistantMessage?: AssistantMessage | null;
    toolResults?: ToolResultMessage[];
    stopReason?: StopReason | null;
    errorMessage?: string | null;
    status?: Exclude<DebugTurnStatus, 'running'>;
  } = {},
): void {
  const runtime = getAgentRuntimeState(agent);
  const activeDebugTurnId = runtime.activeDebugTurnId;
  if (!activeDebugTurnId) return;

  const turns = readCurrentDebugTurns(agent);
  const turnIndex = turns.findIndex((turn) => turn.id === activeDebugTurnId);
  runtime.activeDebugTurnId = null;
  if (turnIndex < 0) return;

  const nextTurns = turns.slice();
  nextTurns[turnIndex] = finalizeChatTurnDebugRecord(nextTurns[turnIndex], args);
  setCurrentDebugTurns(agent, nextTurns);
}

function getLatestAssistantMessage(agent: Agent): AssistantMessage | null {
  if (isAssistantDebugMessage(agent.state.streamMessage)) {
    return agent.state.streamMessage;
  }

  const lastAssistantMessage = [...agent.state.messages].reverse().find(isAssistantDebugMessage);
  return lastAssistantMessage ?? null;
}

function getAssistantContentLength(message: AgentMessage): number | null {
  return message.role === 'assistant' ? message.content.length : null;
}

function trimIncompleteTrail(session: ChatSession): void {
  const path = getLinearPath(session);
  let trimCount = 0;

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const message = path[index].message!;
    if (message.role === 'toolResult' || getAssistantContentLength(message) === 0) {
      trimCount += 1;
      continue;
    }
    break;
  }

  if (trimCount > 0 && path.length - trimCount > 0) {
    session.currentNode = path[path.length - 1 - trimCount].id;
  }
}

function syncSessionFromAgent(session: ChatSession, agentMessages: AgentMessage[]): void {
  const fullPath = getLinearPath(session);
  const compressedPath = getCompressedPath(session);

  if (compressedPath.length > agentMessages.length) {
    console.error(
      '[ai-service] syncSessionFromAgent: compressed path is longer than agent state (%d > %d)',
      compressedPath.length,
      agentMessages.length,
    );
    return;
  }

  for (let index = 0; index < compressedPath.length; index += 1) {
    if (compressedPath[index]?.role !== agentMessages[index]?.role) {
      console.error(
        '[ai-service] syncSessionFromAgent: prefix mismatch at %d - path role=%s, agent role=%s',
        index,
        compressedPath[index]?.role ?? 'null',
        agentMessages[index]?.role ?? 'null',
      );
      return;
    }
  }

  syncAgentToTree(session, [
    ...fullPath.map((node) => node.message!),
    ...agentMessages.slice(compressedPath.length),
  ]);
}

function createOverflowRecoveryCoordinator(session: ChatSession, agent: Agent) {
  const recoveries: Promise<void>[] = [];
  let queue = Promise.resolve();
  let suppressTurnSync = false;

  return {
    shouldSkipTurnSync(): boolean {
      return suppressTurnSync;
    },
    handleAssistantMessage(message: AgentMessage): void {
      if (message.role !== 'assistant') return;
      if (!isContextOverflow(message, agent.state.model.contextWindow)) return;

      suppressTurnSync = true;
      const recovery = queue.then(async () => {
        await agent.waitForIdle();
        try {
          await compactForOverflow(session, agent);
        } finally {
          suppressTurnSync = false;
        }
      });
      queue = recovery.catch(() => {});
      recoveries.push(recovery);
    },
    async waitForAll(): Promise<void> {
      for (const recovery of recoveries) {
        await recovery;
      }
    },
  };
}

async function ensureAgentHydrated(agent: Agent): Promise<void> {
  if (!supportsDynamicAgentConfiguration(agent)) return;
  const runtime = getAgentRuntimeState(agent);
  if (runtime.bodyHydrated) return;
  if (agent.sessionId) {
    await restoreChatSessionById(agent.sessionId, agent);
    return;
  }
  await restoreLatestChatSession(agent);
}

type AgentTurnInput =
  | { mode: 'prompt'; prompt: string }
  | { mode: 'continue' };

async function runAgentTurn(session: ChatSession, agent: Agent, input: AgentTurnInput): Promise<void> {
  if (supportsDynamicAgentConfiguration(agent)) {
    await configureAgent(agent);
  }

  await compactIfNeeded(session, agent);
  const overflowRecovery = createOverflowRecoveryCoordinator(session, agent);

  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    if (getCurrentSession(agent) !== session) return;

    if (event.type === 'message_end') {
      if (event.message.role === 'assistant') {
        overflowRecovery.handleAssistantMessage(event.message);
        syncSessionFromAgent(session, agent.state.messages);
        return;
      }

      syncSessionFromAgent(session, agent.state.messages);
      return;
    }

    if (event.type === 'turn_end') {
      finalizeDebugTurn(agent, {
        assistantMessage: isAssistantDebugMessage(event.message) ? event.message : null,
        toolResults: event.toolResults,
      });
      if (overflowRecovery.shouldSkipTurnSync()) return;
      syncSessionFromAgent(session, agent.state.messages);
      void persistChatSession(agent);
    }
  });

  try {
    if (input.mode === 'prompt') {
      await agent.prompt(input.prompt);
    } else {
      if (!canContinueFromMessage(agent.state.messages.at(-1))) {
        throw new Error('[ai-service] Cannot continue without a trailing user or toolResult message');
      }
      await agent.continue();
    }
    await overflowRecovery.waitForAll();
    finalizeDebugTurn(agent, {
      assistantMessage: getLatestAssistantMessage(agent),
    });
    syncSessionFromAgent(session, agent.state.messages);
    if (session.title === null) {
      // Immediate fallback — truncated first message as temporary title
      session.title = deriveSessionTitle(agent.state.messages);
      if (session.title) notifyChatTitleChange(session.id, session.title);

      // Fire-and-forget — LLM generates a better title to replace the fallback
      void generateSessionTitle(session, agent).then((title) => {
        if (title && getCurrentSession(agent) === session) {
          session.title = title;
          notifyChatTitleChange(session.id, title);
          void persistChatSession(agent);
        }
      });
    }
    await persistChatSession(agent);

    // Track nodes mentioned in the AI response for edit-detection in system reminder
    const lastAssistant = getLatestAssistantMessage(agent);
    if (lastAssistant) {
      const text = typeof lastAssistant.content === 'string'
        ? lastAssistant.content
        : lastAssistant.content.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('');
      if (text) scanAndTrackMentionedNodes(text);
    }
  } catch (error) {
    const latestAssistantMessage = getLatestAssistantMessage(agent);
    finalizeDebugTurn(agent, {
      assistantMessage: latestAssistantMessage,
      stopReason: latestAssistantMessage?.stopReason ?? 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    await persistChatSession(agent);
    throw error;
  } finally {
    unsubscribe();
  }
}

export async function getApiKey(): Promise<string | null> {
  if (!hasNodeBackedAISettings()) {
    return (await readSettings())?.apiKey ?? null;
  }

  await ensureAISettingsMigrated();
  return getApiKeyForProvider('anthropic');
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

export function createAgent(model: Model<any> = DEFAULT_CHAT_MODEL): Agent {
  let agent: Agent;

  agent = new Agent({
    initialState: {
      model,
    },
    steeringMode: 'all',
    getApiKey: async (provider) => {
      if (!hasNodeBackedAISettings()) {
        const apiKey = (await readSettings())?.apiKey;
        return apiKey ?? undefined;
      }

      await ensureAISettingsMigrated();
      const apiKey = getApiKeyForProvider(provider);
      return apiKey ?? undefined;
    },
    transformContext: async (messages) => (await prepareAgentContext(messages)).messages,
    convertToLlm: (messages) => messages.filter(isLlmCompatibleMessage),
    streamFn: async (activeModel, context, options = {}) => {
      const authToken = await getStoredToken();
      if (!authToken) {
        throw new Error('Please sign in to use Chat');
      }

      const legacyApiKey = !hasNodeBackedAISettings()
        ? (await readSettings())?.apiKey ?? null
        : null;
      await ensureAISettingsMigrated();
      const resolvedApiKey = options.apiKey
        ?? legacyApiKey
        ?? getApiKeyForProvider(activeModel.provider);
      if (!resolvedApiKey) {
        throw new Error(`No API key configured for ${activeModel.provider}. Open Settings to add one.`);
      }

      const runtime = getAgentRuntimeState(agent);
      const debugEnabled = await readChatDebugEnabled();

      const reasoning = options.reasoning ?? runtime.thinkingLevel ?? undefined;

      return streamProxyWithApiKey(activeModel, context, {
        ...options,
        apiKey: resolvedApiKey,
        temperature: reasoning ? 1 : (options.temperature ?? runtime.temperature),
        maxTokens: options.maxTokens ?? runtime.maxTokens,
        reasoning,
        authToken,
        proxyUrl: getSyncApiUrl(),
        onRequestBody: debugEnabled
          ? (requestBody) => {
            startDebugTurn(agent, requestBody);
          }
          : undefined,
      });
    },
  });

  agent.setTools(getAITools({
    getCurrentSessionId: () => agent.sessionId ?? getAgentRuntimeState(agent).currentSession?.id ?? null,
  }));
  agent.setSystemPrompt(getBuiltInAgentSystemPrompt());
  getAgentRuntimeState(agent);
  allAgents.add(agent);
  return agent;
}

export function getAIAgent(): Agent {
  if (!agentSingleton) {
    agentSingleton = createAgent();
  }
  return agentSingleton;
}

export function getAgentForSession(sessionId: string): Agent {
  const existing = agentRegistry.get(sessionId);
  if (existing) {
    return existing;
  }

  const agent = createAgent();
  agentRegistry.set(sessionId, agent);
  return agent;
}

async function hydrateSessionBody(agent: Agent, sessionId: string): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  await measureChatAsync('hydrate-chat-body', { sessionId }, async () => {
    try {
      const session = await getChatSession(sessionId);
      if (session) {
        trimIncompleteTrail(session);
        setCurrentSession(agent, session);
        await restoreDebugTurns(session.id, agent);
        agent.replaceMessages(getCompressedPath(session));
        try {
          await configureAgent(agent);
        } catch {
          // Keep default prompt/tools when config hydration fails.
        }
        runtime.bodyHydrated = true;
        return;
      }
    } catch {
      // IndexedDB is unavailable in some test/browser contexts.
    }

    const currentSession = runtime.currentSession;
    if (currentSession?.id === sessionId) {
      setCurrentDebugTurns(agent, []);
      agent.replaceMessages([]);
      runtime.bodyHydrated = true;
    }
  });
}

async function prepareSessionShell(
  agent: Agent,
  options: {
    key: string;
    shellLoader: () => Promise<ChatSessionShell | null>;
    fallbackSession: () => ChatSession;
  },
): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  setRuntimeRestoreKey(runtime, options.key);
  if (runtime.shellHydrated) return;

  if (!runtime.shellRestorePromise) {
    runtime.shellRestorePromise = measureChatAsync('hydrate-chat-shell', { restoreKey: options.key }, async () => {
      let shell: ChatSessionShell | null = null;
      try {
        shell = await options.shellLoader();
      } catch {
        shell = null;
      }

      const session = shell ? createSessionFromShell(shell) : options.fallbackSession();
      setCurrentSession(agent, session);
      setCurrentDebugTurns(agent, []);
      agent.replaceMessages([]);
      try {
        await configureAgent(agent);
      } catch {
        // Keep default prompt/tools when config hydration fails.
      }
      runtime.shellHydrated = true;
      runtime.bodyHydrated = !shell;
      runtime.bodyRestorePromise = shell
        ? hydrateSessionBody(agent, shell.id)
        : Promise.resolve();
    });
  }

  return runtime.shellRestorePromise;
}

export function prepareChatSessionById(sessionId: string, agent: Agent): Promise<void> {
  return prepareSessionShell(agent, {
    key: `session:${sessionId}`,
    shellLoader: () => getChatSessionShell(sessionId),
    fallbackSession: () => createSession(sessionId),
  });
}

export function prepareLatestChatSession(agent: Agent = getAIAgent()): Promise<void> {
  return prepareSessionShell(agent, {
    key: 'latest',
    shellLoader: () => getLatestChatSessionShell(),
    fallbackSession: () => createSession(),
  });
}

export async function waitForChatSessionBody(agent: Agent = getAIAgent()): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  await runtime.bodyRestorePromise;
}

export async function restoreChatSessionById(sessionId: string, agent: Agent): Promise<void> {
  await prepareChatSessionById(sessionId, agent);
  await waitForChatSessionBody(agent);
}

export async function restoreLatestChatSession(agent: Agent = getAIAgent()): Promise<void> {
  await prepareLatestChatSession(agent);
  await waitForChatSessionBody(agent);
}

let chatSyncNudgeTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced nudge — waits 2s after last persist before triggering sync.
 *  During streaming, turn_end fires rapidly; this batches into one sync. */
function debouncedSyncNudge(): void {
  if (chatSyncNudgeTimer !== null) clearTimeout(chatSyncNudgeTimer);
  chatSyncNudgeTimer = setTimeout(() => {
    chatSyncNudgeTimer = null;
    import('./sync/sync-manager.js').then(({ syncManager }) => syncManager.nudge()).catch(() => {});
  }, 2000);
}

export async function persistChatSession(agent: Agent = getAIAgent()): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  if (!runtime.shellHydrated || !runtime.bodyHydrated) return;
  if (!runtime.currentSession) return;

  try {
    clearPendingShellPatch(runtime);
    const [persistedSession, persistedTurns] = await measureChatAsync('persist-chat-session', {
      sessionId: runtime.currentSession.id,
      messageCount: getLinearPath(runtime.currentSession).length,
    }, async () => Promise.all([
      saveChatSession(runtime.currentSession!),
      saveChatDebugTurns(runtime.currentSession!.id, runtime.debugTurns),
    ]));
    runtime.currentSession.updatedAt = persistedSession.updatedAt;
    runtime.debugTurns = persistedTurns;

    debouncedSyncNudge();
  } catch {
    // Ignore persistence failures; chat should still function.
  }
}

export async function createNewChatSession(agent: Agent = getAIAgent()): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  agent.abort();
  agent.reset();
  setCurrentSession(agent, createSession());
  runtime.shellHydrated = true;
  runtime.bodyHydrated = true;
  runtime.shellRestorePromise = Promise.resolve();
  runtime.bodyRestorePromise = Promise.resolve();
  runtime.restoreKey = agent.sessionId ? `session:${agent.sessionId}` : 'latest';
  clearMentionedNodes();
  await configureAgent(agent);
  await persistChatSession(agent);
}

export async function streamChat(prompt: string, agent: Agent = getAIAgent()): Promise<void> {
  const normalized = prompt.trim();
  if (!normalized) return;

  await ensureAgentHydrated(agent);

  const session = ensureCurrentSession(agent);
  await runAgentTurn(session, agent, {
    mode: 'prompt',
    prompt: normalized,
  });
}

export async function editAndResend(
  nodeId: string,
  newContent: string,
  agent: Agent = getAIAgent(),
): Promise<void> {
  const normalized = newContent.trim();
  if (!normalized) return;

  await ensureAgentHydrated(agent);

  const session = ensureCurrentSession(agent);
  editTreeMessage(session, nodeId, {
    role: 'user',
    content: normalized,
    timestamp: Date.now(),
  });

  agent.replaceMessages(getCompressedPath(session));
  await runAgentTurn(session, agent, { mode: 'continue' });
}

export async function regenerateResponse(
  nodeId: string,
  agent: Agent = getAIAgent(),
): Promise<void> {
  await ensureAgentHydrated(agent);

  const session = ensureCurrentSession(agent);

  // Walk up to find the first assistant message in this agent turn.
  // Chain: User → Asst → ToolResult → Asst → ... → Asst (target)
  // We regenerate from the earliest Asst whose ancestor is the User message.
  let regenerateTarget = nodeId;
  let cursor = nodeId;
  while (cursor) {
    const parentId = session.mapping[cursor]?.parentId;
    if (!parentId) break;
    const parent = session.mapping[parentId];
    if (!parent?.message) break;
    if (parent.message.role === 'assistant') { regenerateTarget = parentId; cursor = parentId; }
    else if (parent.message.role === 'toolResult') { cursor = parentId; }
    else break; // hit user message
  }

  regenerateTree(session, regenerateTarget);

  const messagesForAgent = getCompressedPath(session);
  agent.replaceMessages(messagesForAgent);

  if (!canContinueFromMessage(messagesForAgent.at(-1))) {
    throw new Error('[ai-service] Cannot regenerate without a trailing user or toolResult message');
  }

  await runAgentTurn(session, agent, { mode: 'continue' });
}

export function switchMessageBranch(nodeId: string, agent: Agent = getAIAgent()): void {
  const session = ensureCurrentSession(agent);
  switchTreeBranch(session, nodeId);
  agent.replaceMessages(getCompressedPath(session));
  void persistChatSession(agent);
}

export function stopStreaming(agent: Agent = getAIAgent()): void {
  agent.abort();
}

export function setSteeringNote(text: string | null, agent: Agent = getAIAgent()): void {
  agent.clearSteeringQueue();
  if (text) {
    const normalized = text.trim();
    if (normalized) {
      agent.steer({
        role: 'user',
        content: normalized,
        timestamp: Date.now(),
      });
    }
  }
}

export function hasSteering(agent: Agent = getAIAgent()): boolean {
  return agent.hasQueuedMessages();
}

export function isChatSessionShellReady(agent: Agent = getAIAgent()): boolean {
  return getAgentRuntimeState(agent).shellHydrated;
}

export function isChatSessionBodyReady(agent: Agent = getAIAgent()): boolean {
  return getAgentRuntimeState(agent).bodyHydrated;
}

export function resetAIAgentForTests(): void {
  for (const agent of allAgents) {
    clearPendingShellPatch(getAgentRuntimeState(agent));
  }
  allAgents.clear();
  agentSingleton = null;
  agentRegistry.clear();
  migrationPromise = null;
}

export function getCurrentSession(agent: Agent = getAIAgent()): ChatSession | null {
  return getAgentRuntimeState(agent).currentSession;
}

export function getCurrentDebugTurns(agent: Agent = getAIAgent()): ChatTurnDebugRecord[] {
  return readCurrentDebugTurns(agent);
}

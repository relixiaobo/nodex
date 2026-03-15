import { Agent, type AgentEvent, type AgentMessage } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import type { Message, Model } from '@mariozechner/pi-ai';
import { getStoredToken } from './auth.js';
import { buildAgentSystemPrompt, DEFAULT_AGENT_MODEL_ID, DEFAULT_AGENT_MAX_TOKENS, DEFAULT_AGENT_SYSTEM_PROMPT, DEFAULT_AGENT_TEMPERATURE, readAgentNodeConfig } from './ai-agent-node.js';
import { createSession, getLinearPath, syncAgentToTree } from './ai-chat-tree.js';
import { prepareAgentContext } from './ai-context.js';
import { streamProxyWithApiKey } from './ai-proxy.js';
import { type ChatSession, getLatestChatSession, saveChatSession } from './ai-persistence.js';
import { getAITools } from './ai-tools/index.js';
import * as loroDoc from './loro-doc.js';
import { withCommitOrigin } from './loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';
import { useNodeStore } from '../stores/node-store.js';
import { NDX_F, SYSTEM_NODE_IDS } from '../types/index.js';

const AI_SETTINGS_KEY = 'soma-ai-settings';

const DEFAULT_CHAT_MODEL = getModel('anthropic', 'claude-sonnet-4-5');

export interface StoredAISettings {
  provider: 'anthropic';
  apiKey: string;
}

interface AgentRuntimeState {
  createdAt: number;
  hydrated: boolean;
  restorePromise: Promise<void> | null;
  temperature: number;
  maxTokens: number;
}

let agentSingleton: Agent | null = null;
const agentRuntimeState = new WeakMap<Agent, AgentRuntimeState>();
let migrationPromise: Promise<void> | null = null;
let currentSession: ChatSession | null = null;

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function getSyncApiUrl(): string {
  return import.meta.env.VITE_SYNC_API_URL ?? 'http://localhost:8787';
}

async function readSettings(): Promise<StoredAISettings | null> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(AI_SETTINGS_KEY);
    return (result[AI_SETTINGS_KEY] as StoredAISettings | undefined) ?? null;
  }

  const raw = localStorage.getItem(AI_SETTINGS_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredAISettings;
  } catch {
    return null;
  }
}

async function writeSettings(settings: StoredAISettings | null): Promise<void> {
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
      hydrated: false,
      restorePromise: null,
      temperature: DEFAULT_AGENT_TEMPERATURE,
      maxTokens: DEFAULT_AGENT_MAX_TOKENS,
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

function getSettingValueNode(fieldEntryId: string) {
  if (!hasNodeBackedAISettings()) return null;
  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  return valueNodeId ? loroDoc.toNodexNode(valueNodeId) : null;
}

function readProviderFromSettingsNode(): 'anthropic' {
  const valueNode = getSettingValueNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDER_FIELD_ENTRY);
  const providerName = valueNode?.targetId
    ? loroDoc.toNodexNode(valueNode.targetId)?.name
    : valueNode?.name;
  return providerName?.trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'anthropic';
}

function readApiKeyFromSettingsNode(): string | null {
  const valueNode = getSettingValueNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_API_KEY_FIELD_ENTRY);
  const apiKey = valueNode?.name?.trim() ?? '';
  return apiKey.length > 0 ? apiKey : null;
}

function resolveProviderOptionId(provider: StoredAISettings['provider']): string {
  switch (provider) {
    case 'anthropic':
    default:
      return SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDER_ANTHROPIC;
  }
}

function resolveModel(provider: StoredAISettings['provider'], modelId: string): Model<any> {
  try {
    return getModel(provider, modelId as never);
  } catch {
    return getModel('anthropic', DEFAULT_AGENT_MODEL_ID);
  }
}

async function ensureAISettingsMigrated(): Promise<void> {
  if (!hasNodeBackedAISettings()) return;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const legacySettings = await readSettings();
    if (!legacySettings?.apiKey) return;
    if (readApiKeyFromSettingsNode()) {
      await writeSettings(null);
      return;
    }

    withCommitOrigin('system:ai-settings-migration', () => {
      const store = useNodeStore.getState();
      store.setOptionsFieldValue(
        SYSTEM_NODE_IDS.SETTINGS,
        NDX_F.SETTING_AI_PROVIDER,
        resolveProviderOptionId(legacySettings.provider),
      );
      store.setFieldValue(
        SYSTEM_NODE_IDS.SETTINGS,
        NDX_F.SETTING_AI_API_KEY,
        [legacySettings.apiKey],
      );
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

async function configureAgent(agent: Agent): Promise<{
  provider: StoredAISettings['provider'];
}> {
  await ensureAISettingsMigrated();

  const runtime = getAgentRuntimeState(agent);
  const fallbackSettings = !hasNodeBackedAISettings() ? await readSettings() : null;
  const provider = hasNodeBackedAISettings()
    ? readProviderFromSettingsNode()
    : (fallbackSettings?.provider ?? 'anthropic');
  const agentConfig = readAgentConfigSafely();

  runtime.temperature = agentConfig?.temperature ?? DEFAULT_AGENT_TEMPERATURE;
  runtime.maxTokens = agentConfig?.maxTokens ?? DEFAULT_AGENT_MAX_TOKENS;

  agent.setTools(getAITools());
  agent.setSystemPrompt(agentConfig ? buildAgentSystemPrompt(agentConfig) : DEFAULT_AGENT_SYSTEM_PROMPT);
  agent.setModel(resolveModel(provider, agentConfig?.modelId ?? DEFAULT_AGENT_MODEL_ID));

  return { provider };
}

function isLlmCompatibleMessage(message: AgentMessage): message is Message {
  return message.role === 'user'
    || message.role === 'assistant'
    || message.role === 'toolResult';
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

function trimIncompleteTrail(session: ChatSession): void {
  const path = getLinearPath(session);
  let trimCount = 0;

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const message = path[index].message!;
    if (message.role === 'toolResult' || (message.role === 'assistant' && !message.content)) {
      trimCount += 1;
      continue;
    }
    break;
  }

  if (trimCount > 0 && path.length - trimCount > 0) {
    session.currentNode = path[path.length - 1 - trimCount].id;
  }
}

export async function getAISettings(): Promise<StoredAISettings | null> {
  if (!hasNodeBackedAISettings()) {
    return readSettings();
  }

  await ensureAISettingsMigrated();
  const apiKey = readApiKeyFromSettingsNode();
  if (!apiKey) return null;

  return {
    provider: readProviderFromSettingsNode(),
    apiKey,
  };
}

export async function getApiKey(): Promise<string | null> {
  const settings = await getAISettings();
  return settings?.apiKey ?? null;
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

export async function setApiKey(apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized || !normalized.startsWith('sk-ant-')) {
    throw new Error('Anthropic API key must start with sk-ant-');
  }

  if (!hasNodeBackedAISettings()) {
    await writeSettings({
      provider: 'anthropic',
      apiKey: normalized,
    });
    return;
  }

  const store = useNodeStore.getState();
  store.setOptionsFieldValue(
    SYSTEM_NODE_IDS.SETTINGS,
    NDX_F.SETTING_AI_PROVIDER,
    SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDER_ANTHROPIC,
  );
  store.setFieldValue(
    SYSTEM_NODE_IDS.SETTINGS,
    NDX_F.SETTING_AI_API_KEY,
    [normalized],
  );
  await writeSettings(null);
}

export async function clearApiKey(): Promise<void> {
  if (!hasNodeBackedAISettings()) {
    await writeSettings(null);
    return;
  }

  useNodeStore.getState().clearFieldValue(
    SYSTEM_NODE_IDS.SETTINGS,
    NDX_F.SETTING_AI_API_KEY,
  );
  await writeSettings(null);
}

export function createAgent(model: Model<any> = DEFAULT_CHAT_MODEL): Agent {
  let agent: Agent;

  agent = new Agent({
    initialState: {
      model,
    },
    getApiKey: async () => {
      const apiKey = await getApiKey();
      return apiKey ?? undefined;
    },
    transformContext: async (messages) => (await prepareAgentContext(messages)).messages,
    convertToLlm: (messages) => messages.filter(isLlmCompatibleMessage),
    streamFn: async (activeModel, context, options = {}) => {
      const authToken = await getStoredToken();
      if (!authToken) {
        throw new Error('Please sign in to use Chat');
      }

      const runtime = getAgentRuntimeState(agent);
      return streamProxyWithApiKey(activeModel, context, {
        ...options,
        temperature: runtime.temperature,
        maxTokens: runtime.maxTokens,
        authToken,
        proxyUrl: getSyncApiUrl(),
      });
    },
  });

  agent.setTools(getAITools());
  agent.setSystemPrompt(DEFAULT_AGENT_SYSTEM_PROMPT);
  getAgentRuntimeState(agent);
  return agent;
}

export function getAIAgent(): Agent {
  if (!agentSingleton) {
    agentSingleton = createAgent();
  }
  return agentSingleton;
}

export function restoreLatestChatSession(agent: Agent = getAIAgent()): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  if (runtime.hydrated) return Promise.resolve();

  // Share a single restore promise so React StrictMode's double-invoked
  // effects await the same IndexedDB read instead of the second call
  // resolving immediately with an empty agent.
  if (!runtime.restorePromise) {
    runtime.restorePromise = (async () => {
      try {
        const latestSession = await getLatestChatSession();
        if (latestSession) {
          trimIncompleteTrail(latestSession);
          currentSession = latestSession;
          agent.sessionId = latestSession.id;
          runtime.createdAt = latestSession.createdAt;
          agent.replaceMessages(getLinearPath(latestSession).map((node) => node.message!));
          try {
            await configureAgent(agent);
          } catch {
            // Keep default prompt/tools when config hydration fails.
          }
          runtime.hydrated = true;
          return;
        }
      } catch {
        // IndexedDB is unavailable in some test/browser contexts.
      }

      currentSession = createSession();
      agent.sessionId = currentSession.id;
      runtime.createdAt = currentSession.createdAt;
      agent.replaceMessages([]);
      try {
        await configureAgent(agent);
      } catch {
        // Keep default prompt/tools when config hydration fails.
      }
      runtime.hydrated = true;
    })();
  }

  return runtime.restorePromise;
}

export async function persistChatSession(agent: Agent = getAIAgent()): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  if (!runtime.hydrated) return;
  if (!currentSession) return;

  try {
    const persisted = await saveChatSession(currentSession);
    currentSession.updatedAt = persisted.updatedAt;
  } catch {
    // Ignore persistence failures; chat should still function.
  }
}

export async function createNewChatSession(agent: Agent = getAIAgent()): Promise<void> {
  const runtime = getAgentRuntimeState(agent);
  agent.abort();
  agent.reset();
  currentSession = createSession();
  agent.sessionId = currentSession.id;
  runtime.createdAt = currentSession.createdAt;
  runtime.hydrated = true;
  runtime.restorePromise = null;
  await configureAgent(agent);
  await persistChatSession(agent);
}

export async function streamChat(prompt: string, agent: Agent = getAIAgent()): Promise<void> {
  const normalized = prompt.trim();
  if (!normalized) return;

  if (supportsDynamicAgentConfiguration(agent)) {
    await configureAgent(agent);
    const runtime = getAgentRuntimeState(agent);
    if (!runtime.hydrated) {
      await restoreLatestChatSession(agent);
    }
  }

  if (!currentSession) {
    currentSession = createSession();
    agent.sessionId = currentSession.id;
    getAgentRuntimeState(agent).createdAt = currentSession.createdAt;
  }

  let unsubscribed = false;
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    if (!currentSession) return;

    if (event.type === 'turn_end') {
      syncAgentToTree(currentSession, agent.state.messages);
      void persistChatSession(agent);
      return;
    }

    if (event.type === 'agent_end') {
      syncAgentToTree(currentSession, event.messages);
      if (currentSession.title === null) {
        currentSession.title = deriveSessionTitle(event.messages);
      }
      void persistChatSession(agent);
      unsubscribe();
      unsubscribed = true;
    }
  });

  try {
    await agent.prompt(normalized);
  } finally {
    if (!unsubscribed) {
      unsubscribe();
    }
  }
}

export function stopStreaming(agent: Agent = getAIAgent()): void {
  agent.abort();
}

export function resetAIAgentForTests(): void {
  agentSingleton = null;
  currentSession = null;
  migrationPromise = null;
}

export function getCurrentSession(): ChatSession | null {
  return currentSession;
}

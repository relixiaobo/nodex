import { Agent, streamProxy } from '@mariozechner/pi-agent-core';
import { getModel, type Context } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';
import { getStoredToken } from './auth.js';

const AI_SETTINGS_KEY = 'soma-ai-settings';

const DEFAULT_CHAT_MODEL = getModel('anthropic', 'claude-sonnet-4-5');

export interface StoredAISettings {
  provider: 'anthropic';
  apiKey: string;
}

let agentSingleton: Agent | null = null;

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

export async function getAISettings(): Promise<StoredAISettings | null> {
  return readSettings();
}

export async function getApiKey(): Promise<string | null> {
  const settings = await readSettings();
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

  await writeSettings({
    provider: 'anthropic',
    apiKey: normalized,
  });
}

export async function clearApiKey(): Promise<void> {
  await writeSettings(null);
}

export function createAgent(model: Model<any> = DEFAULT_CHAT_MODEL): Agent {
  return new Agent({
    initialState: {
      model,
    },
    streamFn: async (activeModel, context, options = {}) => {
      const authToken = await getStoredToken();
      if (!authToken) {
        throw new Error('Please sign in to use Chat');
      }

      const apiKey = options.apiKey ?? await getApiKey();
      if (!apiKey) {
        throw new Error('API key required');
      }

      const proxyContext = {
        ...context,
        _apiKey: apiKey,
      } as Context & { _apiKey: string };

      return streamProxy(activeModel, proxyContext, {
        ...options,
        authToken,
        proxyUrl: getSyncApiUrl(),
      });
    },
  });
}

export function getAIAgent(): Agent {
  if (!agentSingleton) {
    agentSingleton = createAgent();
  }
  return agentSingleton;
}

export async function streamChat(prompt: string, agent: Agent = getAIAgent()): Promise<void> {
  const normalized = prompt.trim();
  if (!normalized) return;
  await agent.prompt(normalized);
}

export function stopStreaming(agent: Agent = getAIAgent()): void {
  agent.abort();
}

export function resetAIAgentForTests(): void {
  agentSingleton = null;
}


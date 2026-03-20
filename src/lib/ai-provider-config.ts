import { getModels, getProviders } from '@mariozechner/pi-ai';
import type { Api, Model } from '@mariozechner/pi-ai';
import { NDX_F, NDX_T, SYS_V } from '../types/index.js';
import { useNodeStore } from '../stores/node-store.js';
import * as loroDoc from './loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';

// ---------------------------------------------------------------------------
// Featured models — shown prominently in the model selector
// ---------------------------------------------------------------------------

const FEATURED_MODELS: Record<string, { id: string; description: string }[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-6', description: 'Fast and intelligent' },
    { id: 'claude-opus-4-6', description: 'Most capable' },
  ],
  openai: [
    { id: 'gpt-5.4', description: 'Latest GPT' },
    { id: 'gpt-5.4-pro', description: 'Most capable' },
  ],
  google: [
    { id: 'gemini-2.5-flash', description: 'Fast and free' },
    { id: 'gemini-3.1-pro-preview', description: 'Most capable' },
  ],
  xai: [
    { id: 'grok-4', description: 'Most capable' },
    { id: 'grok-4-1-fast', description: 'Fast reasoning' },
  ],
  mistral: [
    { id: 'mistral-medium-latest', description: 'Best balance' },
    { id: 'magistral-medium-latest', description: 'Reasoning' },
  ],
  groq: [
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', description: 'Latest Llama' },
    { id: 'llama-3.3-70b-versatile', description: 'Fast open-source' },
  ],
};

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  featured: boolean;
}

export interface ProviderConfig {
  provider: string;
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
  nodeId: string;
}

export function guessProviderFromApiKey(apiKey: string): string | null {
  const trimmed = apiKey.trim();
  if (trimmed.startsWith('sk-ant-')) return 'anthropic';
  if (trimmed.startsWith('sk-')) return 'openai';
  return null;
}

export function normalizeProviderId(provider: string | null | undefined): string {
  return provider?.trim().toLowerCase() ?? '';
}

function getProviderDisplayName(provider: string): string {
  const providerOptionNodeId = findProviderOptionNodeId(provider);
  if (!providerOptionNodeId) return provider;
  return loroDoc.toNodexNode(providerOptionNodeId)?.name?.trim() || provider;
}

function findFieldEntry(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      return childId;
    }
  }
  return null;
}

function readTextFieldValue(nodeId: string, fieldDefId: string): string {
  const fieldEntryId = findFieldEntry(nodeId, fieldDefId);
  if (!fieldEntryId) return '';

  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  const value = valueNodeId ? loroDoc.toNodexNode(valueNodeId)?.name?.trim() : '';
  return value ?? '';
}

function readTargetFieldValue(nodeId: string, fieldDefId: string): string {
  const fieldEntryId = findFieldEntry(nodeId, fieldDefId);
  if (!fieldEntryId) return '';

  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  if (!valueNodeId) return '';

  const valueNode = loroDoc.toNodexNode(valueNodeId);
  if (valueNode?.targetId) {
    return normalizeProviderId(loroDoc.toNodexNode(valueNode.targetId)?.name);
  }
  return normalizeProviderId(valueNode?.name);
}

function readBooleanFieldValue(nodeId: string, fieldDefId: string): boolean {
  return readTextFieldValue(nodeId, fieldDefId) === SYS_V.YES;
}

function readListFieldValues(nodeId: string, fieldDefId: string): string[] {
  const fieldEntryId = findFieldEntry(nodeId, fieldDefId);
  if (!fieldEntryId) return [];

  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  if (!fieldEntry?.children?.length) return [];

  return fieldEntry.children
    .map((childId) => loroDoc.toNodexNode(childId)?.name?.trim())
    .filter((name): name is string => !!name);
}

function getProviderConfigPriority(config: ProviderConfig): number {
  if (config.enabled && config.apiKey.length > 0) return 2;
  if (config.enabled) return 1;
  return 0;
}

function getCanonicalProviderConfigs(configs: ProviderConfig[]): ProviderConfig[] {
  const result = new Map<string, ProviderConfig>();

  for (const config of configs) {
    const provider = normalizeProviderId(config.provider);
    if (!provider) continue;

    const existing = result.get(provider);
    if (!existing || getProviderConfigPriority(config) > getProviderConfigPriority(existing)) {
      result.set(provider, config);
    }
  }

  return [...result.values()];
}

function getCanonicalProviderConfig(provider: string): ProviderConfig | null {
  const normalizedProvider = normalizeProviderId(provider);
  if (!normalizedProvider) return null;

  return getCanonicalProviderConfigs(getProviderConfigs()).find(
    (candidate) => normalizeProviderId(candidate.provider) === normalizedProvider,
  ) ?? null;
}

export function findProviderOptionNodeId(provider: string): string | null {
  try {
    const normalizedProvider = normalizeProviderId(provider);
    if (!normalizedProvider) return null;

    const optionNodeIds = loroDoc.getChildren(NDX_F.PROVIDER_ID);
    for (const optionNodeId of optionNodeIds) {
      const optionNode = loroDoc.toNodexNode(optionNodeId);
      if (normalizeProviderId(optionNode?.name) === normalizedProvider) {
        return optionNodeId;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getProviderConfigs(): ProviderConfig[] {
  try {
    const fieldEntry = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY);
    if (!fieldEntry?.children?.length) return [];

    return fieldEntry.children
      .map<ProviderConfig | null>((nodeId) => {
        const node = loroDoc.toNodexNode(nodeId);
        if (!node) return null;
        if (!node.tags.includes(NDX_T.AI_PROVIDER) && !findFieldEntry(nodeId, NDX_F.PROVIDER_ID)) {
          return null;
        }

        const provider = readTargetFieldValue(nodeId, NDX_F.PROVIDER_ID);
        if (!provider) return null;

        const apiKey = readTextFieldValue(nodeId, NDX_F.PROVIDER_API_KEY);
        const baseUrl = readTextFieldValue(nodeId, NDX_F.PROVIDER_BASE_URL);

        return {
          provider,
          enabled: readBooleanFieldValue(nodeId, NDX_F.PROVIDER_ENABLED),
          apiKey,
          baseUrl: baseUrl || undefined,
          nodeId,
        };
      })
      .filter((config): config is ProviderConfig => config !== null);
  } catch {
    return [];
  }
}

export function saveProviderApiKey(provider: string, apiKey: string): ProviderConfig {
  const normalizedProvider = normalizeProviderId(provider);
  const trimmedApiKey = apiKey.trim();
  if (!normalizedProvider) {
    throw new Error('Choose a provider first.');
  }
  if (!trimmedApiKey) {
    throw new Error('Paste an API key to continue.');
  }

  const providerOptionNodeId = findProviderOptionNodeId(normalizedProvider);
  if (!providerOptionNodeId) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const store = useNodeStore.getState();
  const existingConfig = getProviderConfigs().find(
    (config) => normalizeProviderId(config.provider) === normalizedProvider,
  );
  const nodeId = existingConfig?.nodeId
    ?? store.createChild(
      SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY,
      undefined,
      { name: getProviderDisplayName(normalizedProvider) },
      { commit: false },
    ).id;

  store.setOptionsFieldValue(nodeId, NDX_F.PROVIDER_ID, providerOptionNodeId);
  store.setFieldValue(nodeId, NDX_F.PROVIDER_ENABLED, [SYS_V.YES]);
  store.setFieldValue(nodeId, NDX_F.PROVIDER_API_KEY, [trimmedApiKey]);

  return {
    provider: normalizedProvider,
    enabled: true,
    apiKey: trimmedApiKey,
    nodeId,
  };
}

export function getEnabledProviderConfigs(): ProviderConfig[] {
  return getCanonicalProviderConfigs(getProviderConfigs())
    .filter((config) => config.enabled && config.apiKey.length > 0);
}

export function getApiKeyForProvider(provider: string): string | null {
  const config = getCanonicalProviderConfig(provider);
  if (!config?.enabled || config.apiKey.length === 0) return null;
  return config.apiKey;
}

// ---------------------------------------------------------------------------
// Custom model marker — distinguishes user-added models from SDK built-in
// models so getAvailableModelsWithMeta() can force featured: false regardless
// of whether a custom model ID coincidentally matches a featured model name.
// Uses a WeakSet so we never mutate external Model objects.
// ---------------------------------------------------------------------------

/** @internal Tracks Model instances created by buildCustomModel(). */
const customModelSet = new WeakSet<Model<Api>>();

/** Check whether a Model was created by buildCustomModel(). */
function isCustomModel(model: Model<Api>): boolean {
  return customModelSet.has(model);
}

// ---------------------------------------------------------------------------
// Provider → API type mapping for custom models
// ---------------------------------------------------------------------------

/** Default API type for known providers (first model's api from pi-ai registry). */
const PROVIDER_API_DEFAULTS: Record<string, Api> = {};

function getProviderApiType(provider: string): Api {
  const normalizedProvider = normalizeProviderId(provider);

  // Return cached value if available
  if (PROVIDER_API_DEFAULTS[normalizedProvider]) {
    return PROVIDER_API_DEFAULTS[normalizedProvider];
  }

  // Try to derive from pi-ai's built-in model registry
  const knownProviders = getProviders();
  for (const known of knownProviders) {
    if (normalizeProviderId(known) === normalizedProvider) {
      const models = getModels(known);
      if (models.length > 0) {
        PROVIDER_API_DEFAULTS[normalizedProvider] = models[0].api;
        return models[0].api;
      }
    }
  }

  // Fallback: most custom/compatible providers use openai-completions
  return 'openai-completions';
}

function buildCustomModel(
  modelId: string,
  provider: string,
  api: Api,
  baseUrl: string,
): Model<Api> {
  const model: Model<Api> = {
    id: modelId,
    name: modelId,
    api,
    provider,
    baseUrl,
    reasoning: false,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  } as Model<Api>;
  customModelSet.add(model);
  return model;
}

export function getAvailableModels(): Model<Api>[] {
  const knownProviders = new Set(getProviders().map((provider) => normalizeProviderId(provider)));
  const enabledConfigs = getCanonicalProviderConfigs(getProviderConfigs())
    .filter((config) => config.enabled);

  return enabledConfigs.flatMap((config) => {
    const provider = normalizeProviderId(config.provider);

    // SDK built-in models (only for known providers)
    const sdkModels: Model<Api>[] = knownProviders.has(provider)
      ? getModels(provider as Parameters<typeof getModels>[0]).map((model) => (
          config.baseUrl
            ? { ...model, baseUrl: config.baseUrl }
            : model
        ))
      : [];

    // Custom models from the provider's Models field
    // Always use openai-completions for custom models — it's the universal
    // OpenAI-compatible format. openai-responses is OpenAI-specific and
    // third-party providers (DeepSeek, Qwen, Ollama, etc.) don't support it.
    const customModelIds = readListFieldValues(config.nodeId, NDX_F.PROVIDER_MODELS);
    const sdkModelIdSet = new Set(sdkModels.map((m) => m.id));
    const baseUrl = config.baseUrl ?? sdkModels[0]?.baseUrl ?? '';

    const customModels = customModelIds
      .filter((modelId) => !sdkModelIdSet.has(modelId))
      .map((modelId) => buildCustomModel(modelId, provider, 'openai-completions' as Api, baseUrl));

    return [...sdkModels, ...customModels];
  });
}

export function hasAnyEnabledProvider(): boolean {
  return getCanonicalProviderConfigs(getProviderConfigs())
    .some((config) => config.enabled && config.apiKey.length > 0);
}

/** Return the set of featured model IDs across all providers. */
export function getFeaturedModelIds(): Set<string> {
  const ids = new Set<string>();
  for (const models of Object.values(FEATURED_MODELS)) {
    for (const m of models) ids.add(m.id);
  }
  return ids;
}

export function getAvailableModelsWithMeta(): AvailableModel[] {
  return getAvailableModels().map((model) => {
    // Custom models are never featured, even if their ID coincidentally
    // matches a featured model name.
    const custom = isCustomModel(model);
    const featured = FEATURED_MODELS[normalizeProviderId(model.provider)];
    const entry = custom ? undefined : featured?.find((f) => f.id === model.id);
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      reasoning: model.reasoning,
      featured: !!entry,
    };
  });
}

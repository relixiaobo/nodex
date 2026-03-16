import { beforeEach, describe, expect, it } from 'vitest';
import {
  findProviderOptionNodeId,
  getApiKeyForProvider,
  getAvailableModels,
  getEnabledProviderConfigs,
  getProviderConfigs,
  hasAnyEnabledProvider,
} from '../../src/lib/ai-provider-config.js';
import { ensureSystemNodes } from '../../src/lib/bootstrap-system-nodes.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { NDX_F, SYS_V } from '../../src/types/index.js';

function seedProviderConfig({
  provider,
  enabled,
  apiKey,
  baseUrl,
  name,
}: {
  provider: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  name: string;
}): string {
  const store = useNodeStore.getState();
  const node = store.createChild(
    SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY,
    undefined,
    { name },
    { commit: false },
  );

  const providerOptionNodeId = findProviderOptionNodeId(provider);
  if (providerOptionNodeId) {
    store.setOptionsFieldValue(node.id, NDX_F.PROVIDER_ID, providerOptionNodeId);
  }

  store.setFieldValue(node.id, NDX_F.PROVIDER_ENABLED, [enabled ? SYS_V.YES : SYS_V.NO]);
  if (apiKey !== undefined) {
    store.setFieldValue(node.id, NDX_F.PROVIDER_API_KEY, apiKey ? [apiKey] : []);
  }
  if (baseUrl !== undefined) {
    store.setFieldValue(node.id, NDX_F.PROVIDER_BASE_URL, baseUrl ? [baseUrl] : []);
  }

  return node.id;
}

describe('ai-provider-config', () => {
  beforeEach(() => {
    loroDoc.resetLoroDoc();
    loroDoc.initLoroDocForTest('ws_ai_provider');
    ensureSystemNodes('ws_ai_provider');
  });

  it('getProviderConfigs reads multiple provider nodes from Settings', () => {
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-primary',
      name: 'OpenAI Primary',
    });
    seedProviderConfig({
      provider: 'openrouter',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://openrouter.example/v1',
      name: 'OpenRouter',
    });

    const configs = getProviderConfigs();

    expect(configs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'anthropic',
        enabled: false,
        apiKey: '',
        nodeId: SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
      }),
      expect.objectContaining({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai-primary',
      }),
      expect.objectContaining({
        provider: 'openrouter',
        enabled: false,
        apiKey: '',
        baseUrl: 'https://openrouter.example/v1',
      }),
    ]));
  });

  it('getEnabledProviderConfigs filters out disabled and keyless providers', () => {
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-primary',
      name: 'OpenAI Primary',
    });
    seedProviderConfig({
      provider: 'openrouter',
      enabled: true,
      apiKey: '',
      name: 'OpenRouter',
    });
    seedProviderConfig({
      provider: 'groq',
      enabled: false,
      apiKey: 'sk-groq-disabled',
      name: 'Groq',
    });

    expect(getEnabledProviderConfigs()).toEqual([
      expect.objectContaining({
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-openai-primary',
      }),
    ]);
  });

  it('getApiKeyForProvider matches the first enabled provider config by provider id', () => {
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-primary',
      name: 'OpenAI Primary',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-secondary',
      name: 'OpenAI Secondary',
    });

    expect(getApiKeyForProvider('openai')).toBe('sk-openai-primary');
    expect(getApiKeyForProvider('groq')).toBeNull();
  });

  it('getAvailableModels aggregates enabled provider models and applies baseUrl overrides', () => {
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-primary',
      name: 'Anthropic',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: '',
      baseUrl: 'https://custom-openai.example/v1',
      name: 'OpenAI',
    });

    const availableModels = getAvailableModels();

    expect(availableModels.some((model) => model.provider === 'anthropic' && model.id === 'claude-sonnet-4-5')).toBe(true);
    expect(availableModels.some((model) => model.provider === 'openai' && model.id === 'gpt-4o')).toBe(true);
    expect(
      availableModels.find((model) => model.provider === 'openai' && model.id === 'gpt-4o')?.baseUrl,
    ).toBe('https://custom-openai.example/v1');
  });

  it('hasAnyEnabledProvider only returns true when an enabled provider also has a key', () => {
    expect(hasAnyEnabledProvider()).toBe(false);

    const openAiNodeId = seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: '',
      name: 'OpenAI',
    });

    expect(hasAnyEnabledProvider()).toBe(false);

    useNodeStore.getState().setFieldValue(openAiNodeId, NDX_F.PROVIDER_API_KEY, ['sk-openai-primary']);

    expect(hasAnyEnabledProvider()).toBe(true);
  });
});

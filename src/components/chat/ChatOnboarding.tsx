import { getProviders } from '@mariozechner/pi-ai';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  guessProviderFromApiKey,
  normalizeProviderId,
  saveProviderApiKey,
} from '../../lib/ai-provider-config.js';

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function ChatOnboarding() {
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const providerOptions = useMemo(
    () => getProviders().map((entry) => normalizeProviderId(entry)).filter((entry) => entry.length > 0),
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      saveProviderApiKey(provider, apiKey);
      setApiKey('');
    } catch (error) {
      toast.error(getActionErrorMessage(error, 'Failed to save API key'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-6">
      <div className="flex w-full max-w-[300px] flex-col gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">Connect an AI provider</p>
          <p className="text-xs text-foreground-tertiary">
            Add an API key to start chatting.
          </p>
        </div>

        <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
          <select
            aria-label="Select provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground outline-none transition-colors focus:border-foreground/20"
          >
            {providerOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <input
            aria-label="API key"
            type="password"
            value={apiKey}
            onChange={(event) => {
              const nextValue = event.target.value;
              setApiKey(nextValue);
              const detectedProvider = guessProviderFromApiKey(nextValue);
              if (detectedProvider) setProvider(detectedProvider);
            }}
            placeholder="Paste your API key"
            className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-tertiary focus:border-foreground/20"
          />

          <button
            type="submit"
            disabled={submitting || !apiKey.trim()}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}

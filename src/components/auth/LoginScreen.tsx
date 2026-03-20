import { useState } from 'react';
import { GoogleIcon } from '../ui/GoogleIcon.js';
import { useWorkspaceStore } from '../../stores/workspace-store';

interface LoginScreenProps {
  message?: string;
}

export function LoginScreen({ message = 'Sign in to continue' }: LoginScreenProps) {
  const continueInOfflineMode = useWorkspaceStore((s) => s.continueInOfflineMode);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const [pendingAction, setPendingAction] = useState<'sign-in' | 'offline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSigningIn = pendingAction === 'sign-in';
  const isContinuingOffline = pendingAction === 'offline';
  const isBusy = pendingAction !== null;

  async function handleSignIn() {
    if (isBusy) return;
    setPendingAction('sign-in');
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleContinueOffline() {
    if (isBusy) return;
    setPendingAction('offline');
    setError(null);
    try {
      await continueInOfflineMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue offline');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-1">
        <span className="text-2xl font-bold tracking-tight">soma</span>
        <span className="text-xs text-foreground-secondary">
          {message}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSignIn}
        disabled={isBusy}
        className="flex w-full max-w-[240px] items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/4 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSigningIn ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
        ) : (
          <GoogleIcon />
        )}
        {isSigningIn ? 'Signing in…' : 'Sign in with Google'}
      </button>

      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={handleContinueOffline}
          disabled={isBusy}
          className="text-xs text-foreground-tertiary transition-colors hover:text-foreground disabled:opacity-50"
        >
          {isContinuingOffline ? 'Opening offline workspace…' : 'Continue offline (dev only)'}
        </button>
      )}

      {error && (
        <p className="max-w-[240px] text-center text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

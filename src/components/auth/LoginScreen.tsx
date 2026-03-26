import { useState } from 'react';
import { GoogleIcon } from '../ui/GoogleIcon.js';
import { useWorkspaceStore } from '../../stores/workspace-store';

interface LoginScreenProps {
  message?: string;
}

export function LoginScreen({ message }: LoginScreenProps) {
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
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-[280px] flex-col items-center gap-8">
        {/* Logo + brand */}
        <div className="flex flex-col items-center gap-3">
          <img src="/icon/128.png" alt="soma" className="h-14 w-14" />
          <span className="text-2xl font-semibold tracking-tight">soma</span>
        </div>

        {/* Value proposition */}
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-[15px] font-medium text-foreground">
            Notes that think with you.
          </p>
          <p className="text-xs leading-relaxed text-foreground-tertiary">
            A structured notebook and AI thinking partner in your browser sidebar. Capture ideas, organize them into structure, and think with AI.
          </p>
        </div>

        {/* Sign in */}
        <div className="flex w-full flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/4 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigningIn ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
            ) : (
              <GoogleIcon />
            )}
            {isSigningIn ? 'Signing in…' : 'Sign in with Google'}
          </button>

          <p className="text-[10px] text-foreground-tertiary">
            {message || 'Sign in to sync your notes across devices.'}
          </p>
        </div>

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
    </div>
  );
}

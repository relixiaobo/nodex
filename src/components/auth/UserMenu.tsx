import { useState, useRef, useEffect } from 'react';
import { LogOut } from '../../lib/icons.js';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { t } from '../../i18n/strings.js';

export function UserMenu() {
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOut = useWorkspaceStore((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    setOpen(false);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function handleSignIn() {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigningIn(false);
    }
  }

  // Show sign-in button when not authenticated
  if (!authUser) {
    return (
      <div className="px-2 pb-2 pt-1">
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {signingIn ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
          ) : (
            <GoogleIcon />
          )}
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {signInError && (
          <p className="mt-1 text-center text-[10px] text-red-500">{signInError}</p>
        )}
      </div>
    );
  }

  const initials = getInitials(authUser.name ?? authUser.email ?? '?');

  return (
    <div ref={menuRef} className="relative px-2 pb-2 pt-1">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={signingOut}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-foreground/5 disabled:opacity-50"
        aria-label={t('userMenu.ariaLabel')}
      >
        <Avatar src={authUser.avatarUrl} initials={initials} />
        <span className="flex-1 truncate text-foreground-secondary">
          {authUser.name ?? authUser.email ?? t('userMenu.signedInFallback')}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 rounded-md border border-border bg-popover py-1 shadow-md">
          {/* User info row */}
          <div className="flex items-center gap-2 px-3 py-2">
            <Avatar src={authUser.avatarUrl} initials={initials} size="lg" />
            <div className="min-w-0 flex-1">
              {authUser.name && (
                <p className="truncate text-xs font-medium">{authUser.name}</p>
              )}
              {authUser.email && (
                <p className="truncate text-[11px] text-foreground-secondary">
                  {authUser.email}
                </p>
              )}
            </div>
          </div>

          <div className="mx-2 my-1 border-t border-border" />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-foreground/5"
          >
            <LogOut size={13} className="shrink-0" />
            {t('userMenu.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AvatarProps {
  src?: string;
  initials: string;
  size?: 'sm' | 'lg';
}

function Avatar({ src, initials, size = 'sm' }: AvatarProps) {
  const dim = size === 'lg' ? 'h-7 w-7 text-[11px]' : 'h-5 w-5 text-[10px]';

  if (src) {
    return (
      <img
        src={src}
        alt={t('userMenu.avatarAlt')}
        referrerPolicy="no-referrer"
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-accent font-medium text-accent-foreground`}
    >
      {initials}
    </span>
  );
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return value.slice(0, 2).toUpperCase();
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

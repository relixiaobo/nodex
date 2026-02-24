/**
 * Compact user avatar for the toolbar.
 * - Signed in: avatar circle, click opens dropdown with user info + sign out
 * - Not signed in: generic user icon, click triggers Google sign-in
 */
import { useState, useRef, useEffect } from 'react';
import { LogOut, User } from '../../lib/icons.js';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { t } from '../../i18n/strings.js';

export function ToolbarUserMenu() {
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOut = useWorkspaceStore((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
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

  async function handleSignIn() {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error handled by workspace store
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  // Not signed in: show generic user icon
  if (!authUser) {
    return (
      <button
        onClick={handleSignIn}
        disabled={signingIn}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 disabled:opacity-50"
        title="Sign in with Google"
      >
        {signingIn ? (
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-foreground/30 border-t-foreground" />
        ) : (
          <User size={14} />
        )}
      </button>
    );
  }

  const initials = getInitials(authUser.name ?? authUser.email ?? '?');

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden"
        aria-label={t('userMenu.ariaLabel')}
      >
        {authUser.avatarUrl ? (
          <img
            src={authUser.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-foreground">
            {initials}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg z-50">
          {/* User info */}
          <div className="px-2 py-1.5">
            {authUser.name && (
              <p className="truncate text-sm font-medium">{authUser.name}</p>
            )}
            {authUser.email && (
              <p className="truncate text-xs text-foreground-secondary">
                {authUser.email}
              </p>
            )}
          </div>

          <div className="mx-1 my-1 border-t border-border" />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-foreground/5"
          >
            <LogOut size={14} className="shrink-0" />
            {t('userMenu.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return value.slice(0, 2).toUpperCase();
}

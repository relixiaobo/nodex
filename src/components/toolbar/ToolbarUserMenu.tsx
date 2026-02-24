/**
 * Compact user avatar for the toolbar with integrated sync status badge.
 * - Signed in: avatar circle with sync dot badge, click opens dropdown
 *   with user info + sync status + sign out
 * - Not signed in: generic user icon, click triggers Google sign-in
 */
import { useState, useRef, useEffect } from 'react';
import { LogOut, User } from '../../lib/icons.js';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useSyncStore } from '../../stores/sync-store';
import { t } from '../../i18n/strings.js';

const BADGE_CLASSES: Record<string, string> = {
  synced: 'bg-success',
  syncing: 'bg-primary animate-pulse',
  pending: 'bg-warning',
  error: 'bg-destructive',
  offline: 'bg-foreground-tertiary',
};

const SYNC_LABELS: Record<string, string> = {
  synced: 'Synced',
  syncing: 'Syncing\u2026',
  pending: 'Pending changes',
  error: 'Sync error',
  offline: 'Offline',
};

export function ToolbarUserMenu() {
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOut = useWorkspaceStore((s) => s.signOut);
  const syncStatus = useSyncStore((s) => s.status);
  const syncError = useSyncStore((s) => s.error);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const [open, setOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const showSyncBadge = syncStatus !== 'local-only';
  const badgeClass = BADGE_CLASSES[syncStatus] ?? 'bg-gray-400';

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

  // Sync status detail line for dropdown
  function syncDetail(): string | null {
    if (syncStatus === 'error' && syncError) return syncError;
    if (syncStatus === 'pending' && pendingCount > 0) return `${pendingCount} updates`;
    return null;
  }

  // Not signed in: show generic user icon (no sync badge needed)
  if (!authUser) {
    return (
      <button
        onClick={handleSignIn}
        disabled={signingIn}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground-secondary transition-colors hover:bg-foreground/5 disabled:opacity-50"
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
  const detail = syncDetail();

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger with sync badge */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        aria-label={t('userMenu.ariaLabel')}
      >
        {authUser.avatarUrl ? (
          <img
            src={authUser.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-foreground">
            {initials}
          </span>
        )}
        {/* Sync status badge */}
        {showSyncBadge && (
          <span
            className={`absolute bottom-0 right-0 h-2 w-2 rounded-full ring-[1.5px] ring-background ${badgeClass}`}
          />
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

          {/* Sync status row */}
          {showSyncBadge && (
            <>
              <div className="mx-1 my-1 border-t border-border" />
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${badgeClass}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground-secondary">
                    {SYNC_LABELS[syncStatus] ?? syncStatus}
                  </span>
                  {detail && (
                    <span className="ml-1 text-xs text-foreground-tertiary">
                      {detail}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

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

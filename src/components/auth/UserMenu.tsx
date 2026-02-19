import { useState, useRef, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspace-store';

export function UserMenu() {
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signOut = useWorkspaceStore((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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

  // Don't render if not authenticated via Google (offline/demo mode)
  if (!authUser) return null;

  const initials = getInitials(authUser.name ?? authUser.email ?? '?');

  return (
    <div ref={menuRef} className="relative px-2 pb-2 pt-1">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={signingOut}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-foreground/5 disabled:opacity-50"
        aria-label="User menu"
      >
        <Avatar src={authUser.avatarUrl} initials={initials} />
        <span className="flex-1 truncate text-foreground-secondary">
          {authUser.name ?? authUser.email ?? 'Signed in'}
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
            Sign out
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
        alt="avatar"
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

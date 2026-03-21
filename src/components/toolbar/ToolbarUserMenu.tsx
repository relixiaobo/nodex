/**
 * Compact user avatar for the toolbar with integrated sync status badge.
 * - Signed in: avatar circle with sync dot badge, click opens dropdown
 *  with user info + sync status + sign out
 * - Not signed in: generic user icon, click triggers Google sign-in
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { LogOut, Settings, Info, User, MessageSquare, Search, ExternalLink, Gem } from '../../lib/icons.js';
import { GoogleIcon } from '../ui/GoogleIcon.js';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useSyncStore } from '../../stores/sync-store';
import { useUIStore } from '../../stores/ui-store';
import { SYSTEM_NODE_IDS, APP_PANELS } from '../../types/index.js';
import { CHANGELOG } from '../../lib/changelog.js';
import { t } from '../../i18n/strings.js';
import { Kbd } from '../ui/Kbd.js';

const TALLY_FORM_ID = '0QMVD9';

function parseBrowser(): string {
    const ua = navigator.userAgent;
    const chrome = ua.match(/Chrome\/([\d.]+)/);
    const os = ua.includes('Mac') ? 'macOS' : ua.includes('Windows') ? 'Windows' : ua.includes('Linux') ? 'Linux' : 'Unknown';
    return chrome ? `Chrome ${chrome[1]} · ${os}` : ua.slice(0, 80);
}

function buildFeedbackUrl(signedIn: boolean): string {
    const params = new URLSearchParams({
        version: CHANGELOG[0]?.version ?? 'unknown',
        browser: parseBrowser(),
        signed_in: signedIn ? 'yes' : 'no',
    });
    return `https://tally.so/r/${TALLY_FORM_ID}?${params.toString()}`;
}

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

    const initials = authUser ? getInitials(authUser.name ?? authUser.email ?? '?') : '';
    const detail = syncDetail();
    const feedbackUrl = useMemo(() => buildFeedbackUrl(!!authUser), [authUser]);

    return (
        <div ref={menuRef} className="relative">
            {/* Avatar trigger with sync badge */}
            <button
                onClick={() => setOpen((v) => !v)}
                className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/6"
                aria-label={t('userMenu.ariaLabel')}
            >
                <div className="relative flex items-center justify-center">
                    {authUser?.avatarUrl ? (
                        <img
                            src={authUser.avatarUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-6 w-6 rounded-full object-cover"
                        />
                    ) : authUser ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/[0.06] text-[9px] font-medium text-foreground">
                            {initials}
                        </span>
                    ) : (
                        <User size={15} strokeWidth={1.5} className="text-foreground-tertiary" />
                    )}
                    {/* Sync status badge */}
                    {showSyncBadge && (
                        <span
                            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-[1.5px] ring-background ${badgeClass}`}
                        />
                    )}
                </div>
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg bg-background shadow-paper p-1 z-50">
                    {/* ── Account section ── */}
                    {authUser ? (
                        <>
                            {/* User info */}
                            <div className="flex items-start gap-2.5 px-2 py-1.5">
                                <div className="flex w-4 shrink-0 items-center justify-center mt-0.5">
                                    {authUser.avatarUrl ? (
                                        <img
                                            src={authUser.avatarUrl}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            className="h-4 w-4 rounded-full object-cover"
                                        />
                                    ) : (
                                        <User size={14} strokeWidth={1.5} className="text-foreground-tertiary" />
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                    {authUser.name && (
                                        <p className="truncate text-sm font-medium text-foreground">{authUser.name}</p>
                                    )}
                                    {authUser.email && (
                                        <p className="truncate text-xs text-foreground-tertiary">
                                            {authUser.email}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Sync status (same group, no divider) */}
                            {showSyncBadge && (
                                <div className="flex items-center gap-2.5 px-2 py-1">
                                    <div className="flex w-4 shrink-0 items-center justify-center">
                                        <span className={`h-2 w-2 rounded-full ${badgeClass}`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="text-xs text-foreground-tertiary">
                                            {SYNC_LABELS[syncStatus] ?? syncStatus}
                                        </span>
                                        {detail && (
                                            <span className="ml-1 text-xs text-foreground-tertiary">
                                                · {detail}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <button
                            onClick={() => { setOpen(false); handleSignIn(); }}
                            disabled={signingIn}
                            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground disabled:opacity-50"
                        >
                            <div className="flex w-4 shrink-0 items-center justify-center">
                                <GoogleIcon size={14} />
                            </div>
                            {signingIn ? 'Signing in\u2026' : t('toolbar.signIn')}
                        </button>
                    )}

                    <div className="mx-1 my-1 border-t border-border-subtle" />

                    {/* ── Navigation group ── */}
                    <button
                        onClick={() => {
                            setOpen(false);
                            useUIStore.getState().openSearch();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                    >
                        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
                            <Search size={14} strokeWidth={1.5} />
                        </div>
                        <span className="flex-1 text-left">Search</span>
                        <Kbd keys="⌘K" />
                    </button>

                    <button
                        onClick={() => {
                            setOpen(false);
                            useUIStore.getState().switchToNode(SYSTEM_NODE_IDS.SETTINGS);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                    >
                        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
                            <Settings size={14} strokeWidth={1.5} />
                        </div>
                        Settings
                    </button>

                    <button
                        onClick={() => {
                            setOpen(false);
                            useUIStore.getState().switchToNode(APP_PANELS.ABOUT);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                    >
                        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
                            <Info size={14} strokeWidth={1.5} />
                        </div>
                        About
                    </button>

                    <a
                        href={feedbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                    >
                        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
                            <MessageSquare size={14} strokeWidth={1.5} />
                        </div>
                        Feedback
                        <ExternalLink size={10} className="ml-auto text-foreground-tertiary" />
                    </a>

                    <div className="mx-1 my-1 border-t border-border-subtle" />

                    {/* ── Footer section ── */}
                    {authUser ? (
                        <button
                            onClick={handleSignOut}
                            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
                        >
                            <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
                                <LogOut size={14} strokeWidth={1.5} />
                            </div>
                            {t('userMenu.signOut')}
                        </button>
                    ) : (
                        <div className="flex items-center gap-2.5 px-2 py-1.5">
                            <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
                                <Gem size={14} strokeWidth={1.5} />
                            </div>
                            <span className="text-xs text-foreground-tertiary">Early Access · Free</span>
                        </div>
                    )}
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

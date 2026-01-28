'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { HomeIcon, SearchIcon, BellIcon, UserIcon, ShieldIcon, SettingsIcon, BotIcon } from './Icons';
import { formatFullHandle } from '@/lib/utils/handle';
import { LogOut, Settings2, Lock, Unlock } from 'lucide-react';
import { IdentityUnlockPrompt } from './IdentityUnlockPrompt';

export function Sidebar() {
    const { user, isAdmin, logout, isIdentityUnlocked } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [customLogoUrl, setCustomLogoUrl] = useState<string | null | undefined>(undefined);
    const [unreadCount, setUnreadCount] = useState(0);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [loggingOut, setLoggingOut] = useState(false);
    const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

    useEffect(() => {
        fetch('/api/node')
            .then(res => res.json())
            .then(data => {
                setCustomLogoUrl(data.logoUrl || null);
            })
            .catch(() => {
                setCustomLogoUrl(null);
            });
    }, []);

    // Fetch unread notification count
    useEffect(() => {
        if (!user) return;

        const fetchUnread = () => {
            fetch('/api/notifications?unread=true&limit=50')
                .then(res => res.json())
                .then(data => {
                    setUnreadCount(data.notifications?.length || 0);
                })
                .catch(() => { });
        };

        fetchUnread();
        // Poll every 30 seconds
        const interval = setInterval(fetchUnread, 30000);
        return () => clearInterval(interval);
    }, [user]);

    // Fetch unread chat count
    useEffect(() => {
        if (!user) return;

        const fetchUnreadChats = () => {
            fetch('/api/chat/unread')
                .then(res => res.json())
                .then(data => {
                    setUnreadChatCount(data.unreadCount || 0);
                })
                .catch(() => { });
        };

        fetchUnreadChats();
        // Poll every 10 seconds
        const interval = setInterval(fetchUnreadChats, 10000);
        return () => clearInterval(interval);
    }, [user]);

    // Home is exact match
    const isHome = pathname === '/';

    const handleLogout = async () => {
        if (loggingOut) return;

        setLoggingOut(true);
        try {
            await logout();
            window.location.href = '/explore';
        } catch (error) {
            console.error('Logout failed:', error);
            setLoggingOut(false);
        }
    };

    return (
        <aside className="sidebar">
            <Link href={user ? "/" : "/explore"} className="logo" style={{ minHeight: '42px' }}>
                {customLogoUrl === undefined ? null : customLogoUrl ? (
                    <img src={customLogoUrl} alt="Logo" style={{ maxWidth: '200px', maxHeight: '50px', objectFit: 'contain' }} />
                ) : (
                    <Image src="/logotext.svg" alt="Synapsis" width={185} height={42} priority />
                )}
            </Link>
            <nav>
                {user && (
                    <Link href="/" className={`nav-item ${isHome ? 'active' : ''}`}>
                        <HomeIcon />
                        <span>Home</span>
                    </Link>
                )}
                <Link href="/explore" className={`nav-item ${pathname?.startsWith('/explore') ? 'active' : ''}`}>
                    <SearchIcon />
                    <span>Explore</span>
                </Link>
                {user && (
                    <Link href="/notifications" className={`nav-item ${pathname?.startsWith('/notifications') ? 'active' : ''}`}>
                        <BellIcon />
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Notifications
                            {unreadCount > 0 && (
                                <span style={{
                                    width: '8px',
                                    height: '8px',
                                    background: 'var(--error)',
                                    borderRadius: '50%',
                                }} />
                            )}
                        </span>
                    </Link>
                )}
                {user && (
                    <Link href="/chat" className={`nav-item ${pathname?.startsWith('/chat') ? 'active' : ''}`}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Chat
                            {unreadChatCount > 0 && (
                                <span style={{
                                    width: '8px',
                                    height: '8px',
                                    background: 'var(--error)',
                                    borderRadius: '50%',
                                }} />
                            )}
                        </span>
                    </Link>
                )}
                {user && (
                    <Link href="/settings/bots" className={`nav-item ${pathname?.startsWith('/settings/bots') ? 'active' : ''}`}>
                        <BotIcon />
                        <span>Bots</span>
                    </Link>
                )}
                {user ? (
                    <Link href={`/u/${user.handle}`} className={`nav-item ${pathname === '/u/' + user.handle ? 'active' : ''}`}>
                        <UserIcon />
                        <span>Profile</span>
                    </Link>
                ) : (
                    <Link href="/login" className={`nav-item ${pathname === '/login' ? 'active' : ''}`}>
                        <UserIcon />
                        <span>Login</span>
                    </Link>
                )}
                {isAdmin && (
                    <Link href="/moderation" className={`nav-item ${pathname?.startsWith('/moderation') ? 'active' : ''}`}>
                        <ShieldIcon />
                        <span>Moderation</span>
                    </Link>
                )}
                {isAdmin && (
                    <Link href="/admin" className={`nav-item ${pathname?.startsWith('/admin') ? 'active' : ''}`}>
                        <Settings2 size={24} />
                        <span>Admin</span>
                    </Link>
                )}
                {user && (
                    <Link href="/settings" className={`nav-item ${pathname?.startsWith('/settings') ? 'active' : ''}`}>
                        <SettingsIcon />
                        <span>Settings</span>
                    </Link>
                )}
            </nav>
            {user && (
                <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, marginBottom: '12px' }}>
                        <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                (user.displayName?.charAt(0) || user.handle.charAt(0)).toUpperCase()
                            )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName}</div>
                            <div style={{ color: 'var(--foreground-tertiary)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatFullHandle(user.handle)}</div>
                        </div>
                    </div>
                    
                    {/* Identity Status Indicator */}
                    <div
                        onClick={() => {
                            if (!isIdentityUnlocked) {
                                setShowUnlockPrompt(true);
                            }
                        }}
                        title={isIdentityUnlocked ? 'Identity unlocked - you can perform actions' : 'Identity locked - click to unlock'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 12px',
                            marginBottom: '12px',
                            borderRadius: '8px',
                            background: isIdentityUnlocked 
                                ? 'rgba(34, 197, 94, 0.1)' 
                                : 'rgba(251, 191, 36, 0.1)',
                            border: isIdentityUnlocked
                                ? '1px solid rgba(34, 197, 94, 0.2)'
                                : '1px solid rgba(251, 191, 36, 0.2)',
                            cursor: isIdentityUnlocked ? 'default' : 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            if (!isIdentityUnlocked) {
                                e.currentTarget.style.background = 'rgba(251, 191, 36, 0.15)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isIdentityUnlocked) {
                                e.currentTarget.style.background = 'rgba(251, 191, 36, 0.1)';
                            }
                        }}
                    >
                        {isIdentityUnlocked ? (
                            <Unlock size={16} style={{ color: 'rgb(34, 197, 94)', flexShrink: 0 }} />
                        ) : (
                            <Lock size={16} style={{ color: 'rgb(251, 191, 36)', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ 
                                fontSize: '13px', 
                                fontWeight: 500,
                                color: isIdentityUnlocked ? 'rgb(34, 197, 94)' : 'rgb(251, 191, 36)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {isIdentityUnlocked ? 'Identity Unlocked' : 'Identity Locked'}
                            </div>
                            <div style={{ 
                                fontSize: '11px', 
                                color: 'var(--foreground-tertiary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {isIdentityUnlocked 
                                    ? 'You can perform actions' 
                                    : 'Click to unlock'}
                            </div>
                        </div>
                    </div>
                    
                    <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="btn btn-ghost"
                        style={{
                            width: '100%',
                            justifyContent: 'flex-start',
                            gap: '12px',
                            padding: '10px 12px',
                            fontSize: '14px',
                        }}
                    >
                        <LogOut size={20} />
                        <span>{loggingOut ? 'Signing out...' : 'Sign out'}</span>
                    </button>
                </div>
            )}
            
            {/* Identity Unlock Prompt Modal */}
            {showUnlockPrompt && (
                <IdentityUnlockPrompt
                    onUnlock={() => setShowUnlockPrompt(false)}
                    onCancel={() => setShowUnlockPrompt(false)}
                />
            )}
        </aside>
    );
}

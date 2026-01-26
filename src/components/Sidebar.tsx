'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { HomeIcon, SearchIcon, BellIcon, UserIcon, ShieldIcon, SettingsIcon, BotIcon } from './Icons';
import { formatFullHandle } from '@/lib/utils/handle';

export function Sidebar() {
    const { user, isAdmin } = useAuth();
    const pathname = usePathname();
    const [customLogoUrl, setCustomLogoUrl] = useState<string | null | undefined>(undefined);
    const [unreadCount, setUnreadCount] = useState(0);

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
                .catch(() => {});
        };

        fetchUnread();
        // Poll every 30 seconds
        const interval = setInterval(fetchUnread, 30000);
        return () => clearInterval(interval);
    }, [user]);

    // Home is exact match
    const isHome = pathname === '/';

    return (
        <aside className="sidebar">
            <Link href="/" className="logo" style={{ minHeight: '42px' }}>
                {customLogoUrl === undefined ? null : customLogoUrl ? (
                    <img src={customLogoUrl} alt="Logo" style={{ maxWidth: '200px', maxHeight: '50px', objectFit: 'contain' }} />
                ) : (
                    <Image src="/logotext.svg" alt="Synapsis" width={185} height={42} priority />
                )}
            </Link>
            <nav>
                <Link href="/" className={`nav-item ${isHome ? 'active' : ''}`}>
                    <HomeIcon />
                    <span>Home</span>
                </Link>
                <Link href="/explore" className={`nav-item ${pathname?.startsWith('/explore') ? 'active' : ''}`}>
                    <SearchIcon />
                    <span>Explore</span>
                </Link>
                {user && (
                    <Link href="/notifications" className={`nav-item ${pathname?.startsWith('/notifications') ? 'active' : ''}`} style={{ position: 'relative' }}>
                        <BellIcon />
                        <span>Notifications</span>
                        {unreadCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '8px',
                                left: '24px',
                                width: '8px',
                                height: '8px',
                                background: 'var(--error)',
                                borderRadius: '50%',
                            }} />
                        )}
                    </Link>
                )}
                {user && (
                    <Link href="/settings/bots" className={`nav-item ${pathname?.startsWith('/settings/bots') ? 'active' : ''}`}>
                        <BotIcon />
                        <span>Bots</span>
                    </Link>
                )}
                {user ? (
                    <Link href={`/${user.handle}`} className={`nav-item ${pathname === '/' + user.handle ? 'active' : ''}`}>
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
                    <Link href="/admin" className={`nav-item ${pathname?.startsWith('/admin') ? 'active' : ''}`}>
                        <ShieldIcon />
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                (user.displayName?.charAt(0) || user.handle.charAt(0)).toUpperCase()
                            )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName}</div>
                            <div style={{ color: 'var(--foreground-tertiary)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatFullHandle(user.handle)}</div>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}

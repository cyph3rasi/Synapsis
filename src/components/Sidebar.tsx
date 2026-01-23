'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { HomeIcon, SearchIcon, BellIcon, UserIcon, ShieldIcon, SynapsisLogo, BookOpenIcon, SettingsIcon } from './Icons';
import { formatFullHandle } from '@/lib/utils/handle';

export function Sidebar() {
    const { user, isAdmin } = useAuth();
    const pathname = usePathname();

    // Home is exact match
    const isHome = pathname === '/';

    return (
        <aside className="sidebar">
            <Link href="/" className="logo">
                <SynapsisLogo />
                <span>Synapsis</span>
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
                <Link href="/notifications" className={`nav-item ${pathname?.startsWith('/notifications') ? 'active' : ''}`}>
                    <BellIcon />
                    <span>Notifications</span>
                </Link>
                <Link href="/guide" className={`nav-item ${pathname?.startsWith('/guide') ? 'active' : ''}`}>
                    <BookOpenIcon />
                    <span>Guide</span>
                </Link>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="avatar avatar-sm">
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                (user.displayName?.charAt(0) || user.handle.charAt(0)).toUpperCase()
                            )}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{user.displayName}</div>
                            <div style={{ color: 'var(--foreground-tertiary)', fontSize: '13px' }}>{formatFullHandle(user.handle)}</div>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}

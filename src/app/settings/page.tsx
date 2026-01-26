'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/Icons';
import { Rocket, Shield, Bell, Bot, Eye, UserX } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 64px' }}>
            <header style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '32px',
            }}>
                <Link href="/" style={{ color: 'var(--foreground)' }}>
                    <ArrowLeftIcon />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Settings</h1>
                    <p style={{ color: 'var(--foreground-tertiary)', fontSize: '14px' }}>
                        Manage your account
                    </p>
                </div>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Link href="/settings/bots" className="card" style={{
                    display: 'block',
                    padding: '20px',
                    textDecoration: 'none',
                    color: 'var(--foreground)',
                    transition: 'border-color 0.15s ease',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bot size={18} />
                        Bots
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Create and manage automated bots
                    </div>
                </Link>

                <Link href="/settings/content" className="card" style={{
                    display: 'block',
                    padding: '20px',
                    textDecoration: 'none',
                    color: 'var(--foreground)',
                    transition: 'border-color 0.15s ease',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Eye size={18} />
                        Content Settings
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        NSFW preferences and content visibility
                    </div>
                </Link>

                <Link href="/settings/moderation" className="card" style={{
                    display: 'block',
                    padding: '20px',
                    textDecoration: 'none',
                    color: 'var(--foreground)',
                    transition: 'border-color 0.15s ease',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserX size={18} />
                        Moderation
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Blocked users and muted nodes
                    </div>
                </Link>

                <Link href="/settings/migration" className="card" style={{
                    display: 'block',
                    padding: '20px',
                    textDecoration: 'none',
                    color: 'var(--foreground)',
                    transition: 'border-color 0.15s ease',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Rocket size={18} />
                        Export Account
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Download a backup of your account and content
                    </div>
                </Link>

                <Link href="/settings/security" className="card" style={{
                    display: 'block',
                    padding: '20px',
                    textDecoration: 'none',
                    color: 'var(--foreground)',
                    transition: 'border-color 0.15s ease',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={18} />
                        Security
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Change password
                    </div>
                </Link>

                <div className="card" style={{
                    display: 'block',
                    padding: '20px',
                    opacity: 0.5,
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bell size={18} />
                        Notifications
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Notification preferences (coming soon)
                    </div>
                </div>
            </div>
        </div>
    );
}

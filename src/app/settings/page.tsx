'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/Icons';

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
                <Link href="/settings/migration" className="card" style={{
                    display: 'block',
                    padding: '20px',
                    textDecoration: 'none',
                    color: 'var(--foreground)',
                    transition: 'border-color 0.15s ease',
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        🚀 Account Migration
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Export your account or import from another Synapsis node
                    </div>
                </Link>

                <div className="card" style={{
                    display: 'block',
                    padding: '20px',
                    opacity: 0.5,
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        🔐 Security
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Change password, manage sessions (coming soon)
                    </div>
                </div>

                <div className="card" style={{
                    display: 'block',
                    padding: '20px',
                    opacity: 0.5,
                }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        🔔 Notifications
                    </div>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                        Notification preferences (coming soon)
                    </div>
                </div>
            </div>
        </div>
    );
}

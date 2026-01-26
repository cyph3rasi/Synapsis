'use client';

import { BellIcon } from '@/components/Icons';

export default function NotificationsPage() {
    return (
        <div className="notifications-page">
            <header style={{
                padding: '16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--background)',
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backdropFilter: 'blur(12px)',
            }}>
                <h1 style={{ fontSize: '18px', fontWeight: 600 }}>Notifications</h1>
            </header>

            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 40, height: 40, background: 'var(--background-secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BellIcon />
                    </div>
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: 'var(--foreground)' }}>No notifications yet</h3>
                <p style={{ fontSize: '14px' }}>When you get interactions, they'll show up here.</p>
            </div>
        </div>
    );
}

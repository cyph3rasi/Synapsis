'use client';

import { Lock } from 'lucide-react';

interface IdentityLockScreenProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
}

export function IdentityLockScreen({
    title = 'Session Expired',
    description = 'Your session has expired. Please log in again to continue.',
    icon
}: IdentityLockScreenProps) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px'
        }}>
            {icon || <Lock size={48} style={{ color: 'var(--accent)' }} />}

            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
                {title}
            </h2>

            <p style={{
                color: 'var(--foreground-secondary)',
                maxWidth: '400px',
                textAlign: 'center'
            }}>
                {description}
            </p>

            <button
                onClick={() => window.location.href = '/login'}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
                Go to Login
            </button>
        </div>
    );
}

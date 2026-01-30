'use client';

import { useAuth } from '@/lib/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const { isIdentityUnlocked, isRestoring, loading } = useAuth();

    // Show loading while restoring or initial load
    if (loading || isRestoring) {
        return (
            <div style={{
                minHeight: '60vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--foreground-tertiary)'
            }}>
                <Loader2 className="animate-spin" size={24} />
            </div>
        );
    }

    // If not unlocked after restoration, user needs to re-login
    // (This is rare - only happens if browser was closed or session expired)
    if (!isIdentityUnlocked) {
        return (
            <div style={{
                minHeight: '60vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                padding: '24px',
                textAlign: 'center'
            }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
                    Session Expired
                </h2>
                <p style={{ color: 'var(--foreground-secondary)', maxWidth: '400px' }}>
                    Your session has expired. Please log out and log back in to access settings.
                </p>
                <button
                    onClick={() => window.location.href = '/login'}
                    className="btn btn-primary"
                >
                    Go to Login
                </button>
            </div>
        );
    }

    return <>{children}</>;
}

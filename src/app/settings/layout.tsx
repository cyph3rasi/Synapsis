'use client';

import { useAuth } from '@/lib/contexts/AuthContext';
import { IdentityLockScreen } from '@/components/IdentityLockScreen';
import { Loader2 } from 'lucide-react';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const { isIdentityUnlocked, loading } = useAuth();

    if (loading) {
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

    if (!isIdentityUnlocked) {
        return (
            <IdentityLockScreen
                title="Settings Locked"
                description="To view or change your settings, you must unlock your identity. Your private keys are required to sign any changes you make."
            />
        );
    }

    return <>{children}</>;
}

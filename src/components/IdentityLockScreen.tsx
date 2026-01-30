'use client';

import { Lock, Shield } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

interface IdentityLockScreenProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
}

export function IdentityLockScreen({
    title = 'Identity Required',
    description = 'Accessing settings requires your identity to be unlocked. Your private keys are used to sign changes to prove they came from you.',
    icon
}: IdentityLockScreenProps) {
    const { setShowUnlockPrompt } = useAuth();

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
                onClick={() => setShowUnlockPrompt(true)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
                <Shield size={16} />
                Unlock Identity
            </button>
        </div>
    );
}

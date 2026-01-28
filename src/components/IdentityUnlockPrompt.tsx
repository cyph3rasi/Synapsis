'use client';

import { useState } from 'react';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

interface IdentityUnlockPromptProps {
    onUnlock?: () => void;
    onCancel?: () => void;
}

/**
 * IdentityUnlockPrompt Modal Component
 * 
 * Prompts the user to unlock their cryptographic identity by entering their password.
 * This is required when the user's private key is not available in memory (e.g., after
 * page refresh or when the session expires).
 * 
 * Requirements: US-2.3, US-5.1
 */
export function IdentityUnlockPrompt({ onUnlock, onCancel }: IdentityUnlockPromptProps) {
    const { unlockIdentity } = useAuth();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isUnlocking, setIsUnlocking] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!password.trim()) {
            setError('Please enter your password');
            return;
        }

        setError(null);
        setIsUnlocking(true);

        try {
            await unlockIdentity(password);

            // Success! Call the onUnlock callback if provided
            if (onUnlock) {
                onUnlock();
            }
        } catch (err) {
            console.error('[IdentityUnlockPrompt] Failed to unlock identity:', err);
            setError('Incorrect password. Please try again.');
        } finally {
            setIsUnlocking(false);
        }
    };

    const handleCancel = () => {
        setPassword('');
        setError(null);
        if (onCancel) {
            onCancel();
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                zIndex: 99999,
                padding: 0
            }}
            onClick={handleCancel}
        >
            <div
                className="identity-unlock-sheet"
                style={{
                    width: '100%',
                    maxWidth: '100%',
                    background: 'var(--background-secondary)',
                    borderTopLeftRadius: '20px',
                    borderTopRightRadius: '20px',
                    padding: '24px',
                    paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
                    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
                    animation: 'slideUp 0.3s ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <style jsx>{`
                    @keyframes slideUp {
                        from {
                            transform: translateY(100%);
                        }
                        to {
                            transform: translateY(0);
                        }
                    }
                `}</style>

                {/* Drag indicator */}
                <div style={{
                    width: '40px',
                    height: '4px',
                    background: 'var(--border)',
                    borderRadius: '2px',
                    margin: '0 auto 20px'
                }} />

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        <Lock size={28} style={{ color: 'var(--accent)' }} />
                    </div>
                    <h2 style={{ fontSize: '22px', fontWeight: 600, margin: '0 0 8px 0' }}>
                        Identity Required
                    </h2>
                    <p style={{ color: 'var(--foreground-secondary)', margin: 0, lineHeight: 1.5, fontSize: '15px' }}>
                        Enter your password to unlock your identity
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label
                            htmlFor="unlock-password"
                            style={{
                                display: 'block',
                                marginBottom: '8px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: 'var(--foreground)'
                            }}
                        >
                            Password
                        </label>
                        <input
                            id="unlock-password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError(null);
                            }}
                            disabled={isUnlocking}
                            placeholder="Enter your password"
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                borderRadius: '12px',
                                border: error ? '2px solid var(--error)' : '2px solid var(--border)',
                                background: 'var(--background)',
                                color: 'var(--foreground)',
                                fontSize: '16px',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => {
                                if (!error) {
                                    e.target.style.borderColor = 'var(--accent)';
                                }
                            }}
                            onBlur={(e) => {
                                if (!error) {
                                    e.target.style.borderColor = 'var(--border)';
                                }
                            }}
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: 'var(--error)',
                            fontSize: '14px',
                            marginBottom: '16px'
                        }}>
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                        <button
                            type="submit"
                            disabled={isUnlocking || !password.trim()}
                            className="btn btn-primary"
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                minHeight: '52px',
                                padding: '14px 20px',
                                fontSize: '16px',
                                fontWeight: 600,
                                borderRadius: '12px'
                            }}
                        >
                            {isUnlocking ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    <span>Unlocking...</span>
                                </>
                            ) : (
                                <>
                                    <Lock size={18} />
                                    <span>Unlock Identity</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isUnlocking}
                            className="btn btn-ghost"
                            style={{ 
                                width: '100%',
                                minHeight: '52px',
                                padding: '14px 20px',
                                fontSize: '16px',
                                fontWeight: 500,
                                borderRadius: '12px'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </form>

                {/* Info Note */}
                <p style={{
                    fontSize: '13px',
                    color: 'var(--foreground-tertiary)',
                    marginTop: '20px',
                    marginBottom: 0,
                    lineHeight: 1.5,
                    textAlign: 'center'
                }}>
                    Your password never leaves this device
                </p>
            </div>
        </div>
    );
}

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
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                padding: '16px'
            }}
            onClick={handleCancel}
        >
            <div
                className="card"
                style={{
                    maxWidth: '400px',
                    width: '100%',
                    padding: '24px'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'rgba(59, 130, 246, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Lock size={20} style={{ color: 'var(--accent)' }} />
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                        Unlock Identity
                    </h2>
                </div>

                {/* Description */}
                <p style={{ color: 'var(--foreground-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
                    Enter your password to unlock your cryptographic identity and perform actions.
                </p>

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
                                setError(null); // Clear error when user types
                            }}
                            disabled={isUnlocking}
                            placeholder="Enter your password"
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: error ? '1px solid var(--error)' : '1px solid var(--border)',
                                background: 'var(--background)',
                                color: 'var(--foreground)',
                                fontSize: '14px',
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
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: 'var(--error)',
                            fontSize: '14px',
                            marginBottom: '16px'
                        }}>
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="submit"
                            disabled={isUnlocking || !password.trim()}
                            className="btn btn-primary"
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            {isUnlocking ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    <span>Unlocking...</span>
                                </>
                            ) : (
                                'Unlock'
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isUnlocking}
                            className="btn btn-ghost"
                            style={{ flex: 1 }}
                        >
                            Cancel
                        </button>
                    </div>
                </form>

                {/* Info Note */}
                <p style={{
                    fontSize: '12px',
                    color: 'var(--foreground-tertiary)',
                    marginTop: '16px',
                    marginBottom: 0,
                    lineHeight: 1.4
                }}>
                    You can browse without unlocking, but you'll need to unlock to like, post, or follow.
                </p>
            </div>
        </div>
    );
}

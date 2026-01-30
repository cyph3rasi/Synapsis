'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/Icons';
import { Shield, Lock, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function SecuritySettingsPage() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const { isIdentityUnlocked, setShowUnlockPrompt, signUserAction } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        // Validation
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters long');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        if (currentPassword === newPassword) {
            setError('New password cannot be the same as the current password');
            return;
        }

        // If identity is locked, prompt to unlock and return
        // Note: It seems redundant since they entered the password,
        // but this ensures the KEY is loaded in memory.
        if (!isIdentityUnlocked) {
            setShowUnlockPrompt(true);
            return;
        }

        setIsSubmitting(true);

        try {
            // Sign the password change action
            // This proves we have the key unlocked (which required knowing the password)
            const signedPayload = await signUserAction('change_password', { currentPassword, newPassword });

            const res = await fetch('/api/account/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(signedPayload),
            });

            const data = await res.json();

            if (!res.ok) {
                // If error due to identity lock
                if (data.error === 'Invalid signature or identity' || data.error === 'User not found') {
                    setShowUnlockPrompt(true);
                    throw new Error('Identity verification failed. Please unlock your identity.');
                }
                throw new Error(data.error || 'Failed to change password');
            }

            setSuccess('Password updated successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 64px' }}>
            <header style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '32px',
            }}>
                <Link href="/settings" style={{ color: 'var(--foreground)' }}>
                    <ArrowLeftIcon />
                </Link>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Security</h1>
                    <p style={{ color: 'var(--foreground-tertiary)', fontSize: '14px' }}>
                        Manage your password and security settings
                    </p>
                </div>
            </header>

            <div className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'var(--background-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Lock size={20} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Change Password</h2>
                        <p style={{ color: 'var(--foreground-secondary)', fontSize: '14px' }}>
                            Update your password to keep your account secure
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', display: 'block', marginBottom: '6px' }}>
                            Current Password
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', display: 'block', marginBottom: '6px' }}>
                            New Password
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password (min. 8 characters)"
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', display: 'block', marginBottom: '6px' }}>
                            Confirm New Password
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            required
                        />
                    </div>

                    {error && (
                        <div style={{
                            padding: '12px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '8px',
                            color: 'var(--error)',
                            fontSize: '14px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}>
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div style={{
                            padding: '12px',
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.2)',
                            borderRadius: '8px',
                            color: 'var(--success)',
                            fontSize: '14px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}>
                            <Check size={16} />
                            {success}
                        </div>
                    )}

                    <div style={{
                        marginTop: '20px',
                        padding: '12px',
                        background: 'var(--background-tertiary)',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        fontSize: '13px',
                        color: 'var(--foreground-secondary)'
                    }}>
                        <strong>Note:</strong> Changing your password will re-encrypt your identity keys.
                        Your DID and followers remain unchanged.
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        {isSubmitting ? (
                            'Updating...'
                        ) : (
                            <>
                                <Shield size={16} /> Update Password
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}

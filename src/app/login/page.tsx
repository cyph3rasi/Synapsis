'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SynapsisLogo } from '@/components/Icons';

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [handle, setHandle] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [nodeInfo, setNodeInfo] = useState({ name: '', description: '' });
    const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

    // Fetch node info
    useEffect(() => {
        fetch('/api/node')
            .then(res => res.json())
            .then(data => {
                setNodeInfo({
                    name: data.name || '',
                    description: data.description || 'Federated social network infrastructure'
                });
            })
            .catch(() => { });
    }, []);

    // Handle availability check
    useEffect(() => {
        if (mode !== 'register' || !handle || handle.length < 3) {
            setHandleStatus('idle');
            return;
        }

        const timer = setTimeout(async () => {
            setHandleStatus('checking');
            try {
                const res = await fetch(`/api/auth/check-handle?handle=${handle}`);
                const data = await res.json();
                if (data.available) {
                    setHandleStatus('available');
                } else {
                    setHandleStatus('taken');
                }
            } catch {
                setHandleStatus('idle');
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [handle, mode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (mode === 'register' && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
            const body = mode === 'login'
                ? { email, password }
                : { email, password, handle, displayName };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            router.push('/');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
        }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
                {/* Logo */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
                    <div className="logo" style={{ marginBottom: '4px', fontSize: '32px' }}>
                        <SynapsisLogo />
                        <span>Synapsis</span>
                    </div>
                    {nodeInfo.name && nodeInfo.name !== 'Synapsis' && (
                        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>
                            {nodeInfo.name}
                        </div>
                    )}
                    <p style={{ color: 'var(--foreground-secondary)', marginTop: '0', textAlign: 'center' }}>
                        {nodeInfo.description}
                    </p>
                </div>

                {/* Mode Switcher */}
                <div style={{
                    display: 'flex',
                    marginBottom: '24px',
                    background: 'var(--background-secondary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '4px',
                }}>
                    <button
                        onClick={() => setMode('login')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            background: mode === 'login' ? 'var(--background-tertiary)' : 'transparent',
                            color: mode === 'login' ? 'var(--foreground)' : 'var(--foreground-secondary)',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => setMode('register')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            background: mode === 'register' ? 'var(--background-tertiary)' : 'transparent',
                            color: mode === 'register' ? 'var(--foreground)' : 'var(--foreground-secondary)',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        Register
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="card" style={{ padding: '24px' }}>
                    {error && (
                        <div style={{
                            padding: '12px',
                            marginBottom: '16px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid var(--error)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--error)',
                            fontSize: '14px',
                        }}>
                            {error}
                        </div>
                    )}

                    {mode === 'register' && (
                        <>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                                    Handle
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <span style={{
                                        position: 'absolute',
                                        left: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--foreground-tertiary)',
                                    }}>@</span>
                                    <input
                                        type="text"
                                        className="input"
                                        value={handle}
                                        onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                        style={{ paddingLeft: '28px' }}
                                        placeholder="yourhandle"
                                        required
                                        minLength={3}
                                        maxLength={20}
                                    />
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    marginTop: '4px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ color: 'var(--foreground-tertiary)' }}>
                                        3-20 characters, alphanumeric and underscores
                                    </span>
                                    {handleStatus === 'checking' && (
                                        <span style={{ color: 'var(--foreground-tertiary)' }}>Checking...</span>
                                    )}
                                    {handleStatus === 'available' && (
                                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>Available</span>
                                    )}
                                    {handleStatus === 'taken' && (
                                        <span style={{ color: 'var(--error)', fontWeight: 600 }}>Taken</span>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="Your Name"
                                />
                            </div>
                        </>
                    )}

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                            Email
                        </label>
                        <input
                            type="email"
                            className="input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                            Password
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={8}
                        />
                    </div>

                    {mode === 'register' && (
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                className="input"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                minLength={8}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%' }}
                        disabled={loading}
                    >
                        {loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Create Account')}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: '24px', color: 'var(--foreground-tertiary)', fontSize: '14px' }}>
                    <Link href="/">← Back to home</Link>
                </p>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/Icons';
import { useAuth } from '@/lib/contexts/AuthContext';
import { TriangleAlert, ShieldAlert } from 'lucide-react';

interface ExportStats {
    posts: number;
    following: number;
    mediaFiles: number;
}

export default function MigrationPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

    // Export state
    const [exportPassword, setExportPassword] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [exportData, setExportData] = useState<object | null>(null);
    const [exportStats, setExportStats] = useState<ExportStats | null>(null);

    // Import state
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importPassword, setImportPassword] = useState('');
    const [importHandle, setImportHandle] = useState('');
    const [acceptedCompliance, setAcceptedCompliance] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);
    const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

    // Handle availability check
    useEffect(() => {
        if (activeTab !== 'import' || !importHandle || importHandle.length < 3) {
            setHandleStatus('idle');
            return;
        }

        const timer = setTimeout(async () => {
            setHandleStatus('checking');
            try {
                const res = await fetch(`/api/auth/check-handle?handle=${importHandle}`);
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
    }, [importHandle, activeTab]);

    const handleExport = async () => {
        if (!exportPassword) {
            setExportError('Please enter your password');
            return;
        }

        setIsExporting(true);
        setExportError(null);

        try {
            const res = await fetch('/api/account/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: exportPassword }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Export failed');
            }

            setExportData(data.export);
            setExportStats(data.stats);

            // Trigger download
            const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `synapsis-export-${user?.handle}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            setExportError(error instanceof Error ? error.message : 'Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async () => {
        if (!importFile) {
            setImportError('Please select an export file');
            return;
        }
        if (!importPassword) {
            setImportError('Please enter your password');
            return;
        }
        if (!importHandle) {
            setImportError('Please enter a handle for this node');
            return;
        }
        if (!acceptedCompliance) {
            setImportError('Please accept the content compliance agreement');
            return;
        }

        setIsImporting(true);
        setImportError(null);
        setImportSuccess(null);

        try {
            const fileContent = await importFile.text();
            const exportData = JSON.parse(fileContent);

            const res = await fetch('/api/account/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exportData,
                    password: importPassword,
                    newHandle: importHandle,
                    acceptedCompliance,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Import failed');
            }

            setImportSuccess(data.message);

        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'Import failed');
        } finally {
            setIsImporting(false);
        }
    };

    if (!user && activeTab === 'export') {
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
                        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Account Migration</h1>
                    </div>
                </header>
                <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
                    <p style={{ marginBottom: '16px' }}>Please log in to export your account, or switch to Import to migrate an account here.</p>
                    <button className="btn" onClick={() => setActiveTab('import')}>Switch to Import</button>
                </div>
            </div>
        );
    }

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
                    <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Account Migration</h1>
                    <p style={{ color: 'var(--foreground-tertiary)', fontSize: '14px' }}>
                        Move your identity between Synapsis nodes
                    </p>
                </div>
            </header>

            {/* Tabs */}
            <div style={{ display: 'flex', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                <button
                    onClick={() => setActiveTab('export')}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'export' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === 'export' ? 'var(--foreground)' : 'var(--foreground-tertiary)',
                        fontWeight: activeTab === 'export' ? 600 : 400,
                        cursor: 'pointer',
                    }}
                >
                    Export Account
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'import' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === 'import' ? 'var(--foreground)' : 'var(--foreground-tertiary)',
                        fontWeight: activeTab === 'import' ? 600 : 400,
                        cursor: 'pointer',
                    }}
                >
                    Import Account
                </button>
            </div>

            {/* Export Tab */}
            {activeTab === 'export' && user && (
                <div className="card" style={{ padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                        Export Your Account
                    </h2>

                    <p style={{ color: 'var(--foreground-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
                        Download a complete backup of your account including your identity, posts, and media.
                        You can use this file to migrate to another Synapsis node.
                    </p>

                    <div style={{
                        background: 'var(--background-tertiary)',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                    }}>
                        <div style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', marginBottom: '8px' }}>
                            Your export will include:
                        </div>
                        <ul style={{
                            listStyle: 'disc',
                            paddingLeft: '20px',
                            color: 'var(--foreground-secondary)',
                            fontSize: '14px',
                            lineHeight: 1.6,
                        }}>
                            <li>Your DID (Decentralized Identifier)</li>
                            <li>Your cryptographic keys (encrypted with your password)</li>
                            <li>Your profile information</li>
                            <li>All your posts</li>
                            <li>Your following list</li>
                        </ul>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', display: 'block', marginBottom: '6px' }}>
                            Confirm your password
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={exportPassword}
                            onChange={(e) => setExportPassword(e.target.value)}
                            placeholder="Enter your password"
                        />
                    </div>

                    {exportError && (
                        <div style={{ color: 'var(--error)', fontSize: '14px', marginBottom: '16px' }}>
                            {exportError}
                        </div>
                    )}

                    {exportStats && (
                        <div style={{
                            background: 'var(--success)',
                            color: '#000',
                            padding: '16px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                        }}>
                            Export successful! Downloaded {exportStats.posts} posts and {exportStats.mediaFiles} media references.
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleExport}
                        disabled={isExporting || !exportPassword}
                        style={{ width: '100%' }}
                    >
                        {isExporting ? 'Exporting...' : 'Download Export File'}
                    </button>

                    <div style={{
                        marginTop: '20px',
                        padding: '16px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                    }}>
                        <div style={{ fontWeight: 600, color: 'var(--error)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldAlert size={18} /> Security Warning
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--foreground-secondary)', margin: 0 }}>
                            The export file contains your encrypted private key. Keep this file secure
                            and never share it with anyone. Anyone with this file and your password
                            can access your account.
                        </p>
                    </div>
                </div>
            )}

            {/* Import Tab */}
            {activeTab === 'import' && (
                <div className="card" style={{ padding: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                        Import an Account
                    </h2>

                    <p style={{ color: 'var(--foreground-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
                        Migrate an account from another Synapsis node. Your DID will be preserved,
                        and followers on other Synapsis nodes will be automatically migrated.
                    </p>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', display: 'block', marginBottom: '6px' }}>
                            Export file
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="file"
                                id="import-file-input"
                                accept=".json"
                                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                style={{ display: 'none' }}
                            />
                            <label
                                htmlFor="import-file-input"
                                className="input"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    color: importFile ? 'var(--foreground)' : 'var(--foreground-tertiary)'
                                }}
                            >
                                <span>{importFile ? importFile.name : 'Select export file...'}</span>
                                <span className="btn btn-ghost btn-sm" style={{ pointerEvents: 'none' }}>
                                    Browse
                                </span>
                            </label>
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', display: 'block', marginBottom: '6px' }}>
                            Password (from your old account)
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={importPassword}
                            onChange={(e) => setImportPassword(e.target.value)}
                            placeholder="Enter the password for this account"
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', display: 'block', marginBottom: '6px' }}>
                            Handle on this node
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
                                value={importHandle}
                                onChange={(e) => setImportHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
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

                    {/* Compliance Agreement */}
                    <div style={{
                        marginBottom: '20px',
                        padding: '16px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '8px',
                    }}>
                        <label style={{ display: 'flex', gap: '12px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={acceptedCompliance}
                                onChange={(e) => setAcceptedCompliance(e.target.checked)}
                                style={{ marginTop: '4px' }}
                            />
                            <span style={{ fontSize: '14px', color: 'var(--foreground-secondary)', lineHeight: 1.6 }}>
                                <strong style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <TriangleAlert size={14} /> Content Compliance:
                                </strong> All of your post history
                                and content will be migrated to this node. It is your responsibility to ensure your content
                                complies with this node's rules. If you migrate content that violates this node's rules,
                                you may be subject to any moderation action the node operator sees fit.
                            </span>
                        </label>
                    </div>

                    {importError && (
                        <div style={{ color: 'var(--error)', fontSize: '14px', marginBottom: '16px' }}>
                            {importError}
                        </div>
                    )}

                    {importSuccess && (
                        <div style={{
                            background: 'var(--success)',
                            color: '#000',
                            padding: '16px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                        }}>
                            {importSuccess}
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleImport}
                        disabled={isImporting || !importFile || !importPassword || !importHandle || !acceptedCompliance}
                        style={{ width: '100%' }}
                    >
                        {isImporting ? 'Importing...' : 'Import Account'}
                    </button>
                </div>
            )}
        </div>
    );
}

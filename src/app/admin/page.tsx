'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type AdminUser = {
    id: string;
    handle: string;
    displayName?: string | null;
    email?: string | null;
    isSuspended: boolean;
    isSilenced: boolean;
    suspensionReason?: string | null;
    silenceReason?: string | null;
    createdAt: string;
};

type AdminPost = {
    id: string;
    content: string;
    createdAt: string;
    isRemoved: boolean;
    removedReason?: string | null;
    author: {
        id: string;
        handle: string;
        displayName?: string | null;
    };
};

type Report = {
    id: string;
    targetType: 'post' | 'user';
    targetId: string;
    reason: string;
    status: 'open' | 'resolved';
    createdAt: string;
    reporter?: {
        id: string;
        handle: string;
    } | null;
    target?: AdminPost | AdminUser | null;
};

const formatDate = (value: string) => {
    const date = new Date(value);
    return date.toLocaleString();
};

export default function AdminPage() {
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [tab, setTab] = useState<'reports' | 'posts' | 'users' | 'settings'>('reports');
    const [reports, setReports] = useState<Report[]>([]);
    const [posts, setPosts] = useState<AdminPost[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [reportStatus, setReportStatus] = useState<'open' | 'resolved' | 'all'>('open');
    const [nodeSettings, setNodeSettings] = useState({
        name: '',
        description: '',
        longDescription: '',
        rules: '',
        bannerUrl: '',
        accentColor: '#00D4AA',
    });
    const [savingSettings, setSavingSettings] = useState(false);
    const [isUploadingBanner, setIsUploadingBanner] = useState(false);
    const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/admin/me')
            .then((res) => res.json())
            .then((data) => setIsAdmin(!!data.isAdmin))
            .catch(() => setIsAdmin(false));
    }, []);

    const loadReports = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/reports?status=${reportStatus}`);
            const data = await res.json();
            setReports(data.reports || []);
        } catch {
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    const loadPosts = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/posts?status=all');
            const data = await res.json();
            setPosts(data.posts || []);
        } catch {
            setPosts([]);
        } finally {
            setLoading(false);
        }
    };

    const loadUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            setUsers(data.users || []);
        } catch {
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    const loadNodeSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/node');
            const data = await res.json();
            setNodeSettings({
                name: data.name || '',
                description: data.description || '',
                longDescription: data.longDescription || '',
                rules: data.rules || '',
                bannerUrl: data.bannerUrl || '',
                accentColor: data.accentColor || '#00D4AA',
            });
        } catch {
            // error
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        if (tab === 'reports') loadReports();
        if (tab === 'posts') loadPosts();
        if (tab === 'users') loadUsers();
        if (tab === 'settings') loadNodeSettings();
    }, [tab, isAdmin, reportStatus]);

    const handleReportResolve = async (id: string, status: 'open' | 'resolved') => {
        const note = status === 'resolved' ? window.prompt('Resolution note (optional):') || '' : '';
        await fetch(`/api/admin/reports/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, note }),
        });
        loadReports();
    };

    const handlePostAction = async (id: string, action: 'remove' | 'restore') => {
        const reason = action === 'remove' ? window.prompt('Reason (optional):') || '' : '';
        await fetch(`/api/admin/posts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, reason }),
        });
        if (tab === 'reports') {
            loadReports();
        } else {
            loadPosts();
        }
    };

    const handleSaveSettings = async (override?: typeof nodeSettings) => {
        const payload = override ?? nodeSettings;
        setSavingSettings(true);
        try {
            const res = await fetch('/api/admin/node', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                alert('Settings saved!');
            } else {
                alert('Failed to save settings.');
            }
        } catch {
            alert('Failed to save settings.');
        } finally {
            setSavingSettings(false);
        }
    };

    const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setBannerUploadError(null);
        setIsUploadingBanner(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/media/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (!res.ok || !data.url) {
                throw new Error(data.error || 'Upload failed');
            }

            const nextSettings = {
                ...nodeSettings,
                bannerUrl: data.media?.url || data.url,
            };
            setNodeSettings(nextSettings);
            await handleSaveSettings(nextSettings);
        } catch (error) {
            console.error('Banner upload failed', error);
            setBannerUploadError('Upload failed. Please try again.');
        } finally {
            setIsUploadingBanner(false);
        }
    };

    const handleUserAction = async (id: string, action: 'suspend' | 'unsuspend' | 'silence' | 'unsilence') => {
        const needsReason = action === 'suspend' || action === 'silence';
        const reason = needsReason ? window.prompt('Reason (optional):') || '' : '';
        await fetch(`/api/admin/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, reason }),
        });
        loadUsers();
    };

    const reportCounts = useMemo(() => {
        return {
            open: reports.filter((r) => r.status === 'open').length,
            resolved: reports.filter((r) => r.status === 'resolved').length,
        };
    }, [reports]);

    if (isAdmin === null) {
        return (
            <div className="admin-shell">
                <div className="admin-card">Checking permissions...</div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="admin-shell">
                <div className="admin-card">
                    <h1>Moderation</h1>
                    <p>You do not have access to this page.</p>
                    <Link href="/" className="btn btn-primary" style={{ marginTop: '12px' }}>
                        Back to home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-shell">
            <div className="admin-header">
                <div>
                    <h1>Moderation Dashboard</h1>
                    <p>Manage reports, posts, and user actions.</p>
                </div>
                <Link href="/" className="btn btn-ghost">
                    Return to feed
                </Link>
            </div>

            <div className="admin-tabs">
                <button className={`admin-tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>
                    Reports
                </button>
                <button className={`admin-tab ${tab === 'posts' ? 'active' : ''}`} onClick={() => setTab('posts')}>
                    Posts
                </button>
                <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
                    Users
                </button>
                <button className={`admin-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
                    Settings
                </button>
            </div>

            {tab === 'reports' && (
                <div className="admin-card">
                    <div className="admin-toolbar">
                        <div className="admin-filters">
                            {(['open', 'resolved', 'all'] as const).map((status) => (
                                <button
                                    key={status}
                                    className={`pill ${reportStatus === status ? 'active' : ''}`}
                                    onClick={() => setReportStatus(status)}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                        <div className="admin-stats">
                            <span>Open: {reportCounts.open}</span>
                            <span>Resolved: {reportCounts.resolved}</span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="admin-empty">Loading reports...</div>
                    ) : reports.length === 0 ? (
                        <div className="admin-empty">No reports found.</div>
                    ) : (
                        <div className="admin-list">
                            {reports.map((report) => (
                                <div key={report.id} className="admin-row">
                                    <div className="admin-row-main">
                                        <div className="admin-row-title">
                                            <span className={`status-pill ${report.status}`}>
                                                {report.status}
                                            </span>
                                            <span className="admin-row-meta">
                                                {report.targetType.toUpperCase()} report
                                            </span>
                                        </div>
                                        <div className="admin-row-body">
                                            {report.reason}
                                        </div>
                                        <div className="admin-row-sub">
                                            Reported by {report.reporter?.handle || 'anonymous'} • {formatDate(report.createdAt)}
                                        </div>
                                        {report.targetType === 'post' && report.target && 'content' in report.target && (
                                            <div className="admin-row-target">
                                                <strong>@{report.target.author.handle}:</strong> {report.target.content || '[repost]'}
                                            </div>
                                        )}
                                        {report.targetType === 'user' && report.target && 'handle' in report.target && (
                                            <div className="admin-row-target">
                                                User: @{report.target.handle}
                                            </div>
                                        )}
                                    </div>
                                    <div className="admin-row-actions">
                                        {report.targetType === 'post' && report.target && 'content' in report.target && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                    const target = report.target as AdminPost;
                                                    handlePostAction(target.id, target.isRemoved ? 'restore' : 'remove');
                                                }}
                                            >
                                                {(report.target as AdminPost).isRemoved ? 'Restore post' : 'Remove post'}
                                            </button>
                                        )}
                                        {report.status === 'open' ? (
                                            <button className="btn btn-primary btn-sm" onClick={() => handleReportResolve(report.id, 'resolved')}>
                                                Resolve
                                            </button>
                                        ) : (
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleReportResolve(report.id, 'open')}>
                                                Reopen
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'posts' && (
                <div className="admin-card">
                    {loading ? (
                        <div className="admin-empty">Loading posts...</div>
                    ) : posts.length === 0 ? (
                        <div className="admin-empty">No posts found.</div>
                    ) : (
                        <div className="admin-list">
                            {posts.map((post) => (
                                <div key={post.id} className="admin-row">
                                    <div className="admin-row-main">
                                        <div className="admin-row-title">
                                            <span className={`status-pill ${post.isRemoved ? 'removed' : 'active'}`}>
                                                {post.isRemoved ? 'removed' : 'active'}
                                            </span>
                                            <span className="admin-row-meta">
                                                @{post.author.handle} • {formatDate(post.createdAt)}
                                            </span>
                                        </div>
                                        <div className="admin-row-body">{post.content || '[repost]'}</div>
                                        {post.removedReason && (
                                            <div className="admin-row-sub">Reason: {post.removedReason}</div>
                                        )}
                                    </div>
                                    <div className="admin-row-actions">
                                        {post.isRemoved ? (
                                            <button className="btn btn-ghost btn-sm" onClick={() => handlePostAction(post.id, 'restore')}>
                                                Restore
                                            </button>
                                        ) : (
                                            <button className="btn btn-primary btn-sm" onClick={() => handlePostAction(post.id, 'remove')}>
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'users' && (
                <div className="admin-card">
                    {loading ? (
                        <div className="admin-empty">Loading users...</div>
                    ) : users.length === 0 ? (
                        <div className="admin-empty">No users found.</div>
                    ) : (
                        <div className="admin-list">
                            {users.map((user) => (
                                <div key={user.id} className="admin-row">
                                    <div className="admin-row-main">
                                        <div className="admin-row-title">
                                            <span className={`status-pill ${user.isSuspended ? 'suspended' : 'active'}`}>
                                                {user.isSuspended ? 'suspended' : 'active'}
                                            </span>
                                            <span className={`status-pill ${user.isSilenced ? 'silenced' : 'visible'}`}>
                                                {user.isSilenced ? 'silenced' : 'visible'}
                                            </span>
                                            <span className="admin-row-meta">
                                                @{user.handle} • {formatDate(user.createdAt)}
                                            </span>
                                        </div>
                                        <div className="admin-row-body">
                                            {user.displayName || user.handle}
                                        </div>
                                        {user.suspensionReason && (
                                            <div className="admin-row-sub">Suspension: {user.suspensionReason}</div>
                                        )}
                                        {user.silenceReason && (
                                            <div className="admin-row-sub">Silence: {user.silenceReason}</div>
                                        )}
                                    </div>
                                    <div className="admin-row-actions">
                                        <Link href={`/@${user.handle}`} className="btn btn-ghost btn-sm">
                                            View
                                        </Link>
                                        {user.isSuspended ? (
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleUserAction(user.id, 'unsuspend')}>
                                                Unsuspend
                                            </button>
                                        ) : (
                                            <button className="btn btn-primary btn-sm" onClick={() => handleUserAction(user.id, 'suspend')}>
                                                Suspend
                                            </button>
                                        )}
                                        {user.isSilenced ? (
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleUserAction(user.id, 'unsilence')}>
                                                Unsilence
                                            </button>
                                        ) : (
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleUserAction(user.id, 'silence')}>
                                                Silence
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {tab === 'settings' && (
                <div className="admin-card">
                    <div style={{ fontWeight: 600, marginBottom: '16px', fontSize: '16px' }}>Node Settings</div>

                    {loading ? (
                        <div className="admin-empty">Loading settings...</div>
                    ) : (
                        <div style={{ display: 'grid', gap: '16px', maxWidth: '600px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Node Name</label>
                                <input
                                    className="input"
                                    value={nodeSettings.name}
                                    onChange={e => setNodeSettings({ ...nodeSettings, name: e.target.value })}
                                    placeholder="My Synapsis Node"
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Short Description</label>
                                <textarea
                                    className="input"
                                    value={nodeSettings.description}
                                    onChange={e => setNodeSettings({ ...nodeSettings, description: e.target.value })}
                                    placeholder="A brief tagline for your node."
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Accent Color</label>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={nodeSettings.accentColor}
                                        onChange={(e) => setNodeSettings({ ...nodeSettings, accentColor: e.target.value })}
                                        style={{ width: '44px', height: '36px', padding: 0, border: '1px solid var(--border)', background: 'transparent', borderRadius: '8px' }}
                                    />
                                    <input
                                        className="input"
                                        value={nodeSettings.accentColor}
                                        onChange={(e) => setNodeSettings({ ...nodeSettings, accentColor: e.target.value })}
                                        placeholder="#00D4AA"
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Banner image</label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <label className="btn btn-ghost btn-sm">
                                        {isUploadingBanner ? 'Uploading...' : 'Upload banner'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleBannerUpload}
                                            disabled={isUploadingBanner}
                                            style={{ display: 'none' }}
                                        />
                                    </label>
                                    {bannerUploadError && (
                                        <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{bannerUploadError}</span>
                                    )}
                                </div>
                                {nodeSettings.bannerUrl && (
                                    <div style={{ marginTop: '8px', height: '120px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                                        <div style={{
                                            position: 'absolute', inset: 0,
                                            background: `url(${nodeSettings.bannerUrl}) center/cover no-repeat`
                                        }} />
                                        <div style={{
                                            position: 'absolute', inset: 0,
                                            background: 'linear-gradient(to bottom, transparent, var(--background-secondary))'
                                        }} />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Long Description (About)</label>
                                <textarea
                                    className="input"
                                    value={nodeSettings.longDescription}
                                    onChange={e => setNodeSettings({ ...nodeSettings, longDescription: e.target.value })}
                                    placeholder="Detailed information about your node/community."
                                    rows={5}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Rules</label>
                                <textarea
                                    className="input"
                                    value={nodeSettings.rules}
                                    onChange={e => setNodeSettings({ ...nodeSettings, rules: e.target.value })}
                                    placeholder="Community rules and guidelines."
                                    rows={5}
                                />
                            </div>

                            <div style={{ paddingTop: '8px' }}>
                                <button className="btn btn-primary" onClick={() => handleSaveSettings()} disabled={savingSettings}>
                                    {savingSettings ? 'Saving...' : 'Save Settings'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

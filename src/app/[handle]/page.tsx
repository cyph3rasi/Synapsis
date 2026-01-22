'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, CalendarIcon, HeartIcon, RepeatIcon, MessageIcon, FlagIcon } from '@/components/Icons';
import AutoTextarea from '@/components/AutoTextarea';

interface User {
    id: string;
    handle: string;
    displayName: string;
    bio?: string;
    avatarUrl?: string;
    headerUrl?: string;
    followersCount: number;
    followingCount: number;
    postsCount: number;
    createdAt: string;
    movedTo?: string; // New actor URL if account has migrated
}

interface UserSummary {
    id: string;
    handle: string;
    displayName?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
}

interface MediaItem {
    id: string;
    url: string;
    altText?: string | null;
}

interface Post {
    id: string;
    content: string;
    createdAt: string;
    likesCount: number;
    repostsCount: number;
    repliesCount: number;
    author: User;
    media?: MediaItem[];
}

// Icons


function UserRow({ user }: { user: UserSummary }) {
    return (
        <Link href={`/${user.handle}`} className="user-row">
            <div className="avatar">
                {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName || user.handle} />
                ) : (
                    (user.displayName || user.handle).charAt(0).toUpperCase()
                )}
            </div>
            <div className="user-row-content">
                <div style={{ fontWeight: 600 }}>{user.displayName || user.handle}</div>
                <div style={{ color: 'var(--foreground-tertiary)', fontSize: '13px' }}>@{user.handle}</div>
                {user.bio && (
                    <div className="user-row-bio">{user.bio}</div>
                )}
            </div>
        </Link>
    );
}

function PostCard({ post }: { post: Post }) {
    const [liked, setLiked] = useState(false);
    const [reposted, setReposted] = useState(false);
    const [reporting, setReporting] = useState(false);

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m`;
        if (hours < 24) return `${hours}h`;
        if (days < 7) return `${days}d`;
        return date.toLocaleDateString();
    };

    return (
        <article className="post">
            <div className="post-header">
                <div className="avatar">
                    {post.author.avatarUrl ? (
                        <img src={post.author.avatarUrl} alt={post.author.displayName} />
                    ) : (
                        post.author.displayName?.charAt(0).toUpperCase() || post.author.handle.charAt(0).toUpperCase()
                    )}
                </div>
                <div className="post-author">
                    <Link href={`/${post.author.handle}`} className="post-handle">
                        {post.author.displayName || post.author.handle}
                    </Link>
                    <span className="post-time">@{post.author.handle} · {formatTime(post.createdAt)}</span>
                </div>
            </div>
            <div className="post-content">{post.content}</div>
            {post.media && post.media.length > 0 && (
                <div className="post-media-grid">
                    {post.media.map((item) => (
                        <div className="post-media-item" key={item.id}>
                            <img src={item.url} alt={item.altText || 'Post media'} loading="lazy" />
                        </div>
                    ))}
                </div>
            )}
            <div className="post-actions">
                <button className="post-action">
                    <MessageIcon />
                    <span>{post.repliesCount || ''}</span>
                </button>
                <button className={`post-action ${reposted ? 'reposted' : ''}`} onClick={() => setReposted(!reposted)}>
                    <RepeatIcon />
                    <span>{post.repostsCount + (reposted ? 1 : 0) || ''}</span>
                </button>
                <button className={`post-action ${liked ? 'liked' : ''}`} onClick={() => setLiked(!liked)}>
                    <HeartIcon filled={liked} />
                    <span>{post.likesCount + (liked ? 1 : 0) || ''}</span>
                </button>
                <button
                    className="post-action"
                    onClick={async () => {
                        if (reporting) return;
                        const reason = window.prompt('Why are you reporting this post?');
                        if (!reason) return;
                        setReporting(true);
                        try {
                            const res = await fetch('/api/reports', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ targetType: 'post', targetId: post.id, reason }),
                            });
                            if (!res.ok) {
                                if (res.status === 401) {
                                    alert('Please log in to report.');
                                } else {
                                    alert('Report failed. Please try again.');
                                }
                            } else {
                                alert('Report submitted. Thank you.');
                            }
                        } catch {
                            alert('Report failed. Please try again.');
                        } finally {
                            setReporting(false);
                        }
                    }}
                    disabled={reporting}
                >
                    <FlagIcon />
                    <span>{reporting ? '...' : ''}</span>
                </button>
            </div>
        </article>
    );
}

export default function ProfilePage() {
    const params = useParams();
    const handle = (params.handle as string)?.replace(/^@/, '') || '';

    const [user, setUser] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [currentUser, setCurrentUser] = useState<{ id: string; handle: string } | null>(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'posts' | 'followers' | 'following'>('posts');
    const [followers, setFollowers] = useState<UserSummary[]>([]);
    const [following, setFollowing] = useState<UserSummary[]>([]);
    const [followersLoading, setFollowersLoading] = useState(false);
    const [followingLoading, setFollowingLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [profileForm, setProfileForm] = useState({
        displayName: '',
        bio: '',
        avatarUrl: '',
        headerUrl: '',
    });
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setIsEditing(false);
        setSaveError(null);
        setFollowers([]);
        setFollowing([]);
        // Get current user
        fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => setCurrentUser(data.user))
            .catch(() => { });

        // Get profile
        fetch(`/api/users/${handle}`)
            .then(res => res.json())
            .then(data => {
                setUser(data.user);
                setLoading(false);
            })
            .catch(() => setLoading(false));

        // Get posts
        fetch(`/api/users/${handle}/posts`)
            .then(res => res.json())
            .then(data => setPosts(data.posts || []))
            .catch(() => { });
    }, [handle]);

    useEffect(() => {
        if (user && currentUser?.handle === user.handle) {
            setProfileForm({
                displayName: user.displayName || '',
                bio: user.bio || '',
                avatarUrl: user.avatarUrl || '',
                headerUrl: user.headerUrl || '',
            });
        }
    }, [user, currentUser]);

    useEffect(() => {
        if (!currentUser || !user || currentUser.handle === user.handle) {
            setIsFollowing(false);
            return;
        }

        fetch(`/api/users/${handle}/follow`)
            .then(res => res.json())
            .then(data => setIsFollowing(!!data.following))
            .catch(() => setIsFollowing(false));
    }, [currentUser, user, handle]);

    useEffect(() => {
        if (activeTab === 'followers') {
            setFollowersLoading(true);
            fetch(`/api/users/${handle}/followers`)
                .then(res => res.json())
                .then(data => setFollowers(data.followers || []))
                .catch(() => setFollowers([]))
                .finally(() => setFollowersLoading(false));
        }

        if (activeTab === 'following') {
            setFollowingLoading(true);
            fetch(`/api/users/${handle}/following`)
                .then(res => res.json())
                .then(data => setFollowing(data.following || []))
                .catch(() => setFollowing([]))
                .finally(() => setFollowingLoading(false));
        }
    }, [activeTab, handle]);

    const handleFollow = async () => {
        if (!currentUser) return;

        const method = isFollowing ? 'DELETE' : 'POST';
        const res = await fetch(`/api/users/${handle}/follow`, { method });

        if (res.ok) {
            setIsFollowing(!isFollowing);
            if (user) {
                setUser({
                    ...user,
                    followersCount: isFollowing ? user.followersCount - 1 : user.followersCount + 1,
                });
            }
        }
    };

    const handleSaveProfile = async () => {
        if (!isOwnProfile) return;
        setIsSaving(true);
        setSaveError(null);

        try {
            const res = await fetch('/api/auth/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileForm),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update profile');
            }

            setUser(data.user);
            setIsEditing(false);
        } catch (error) {
            console.error('Profile update failed', error);
            setSaveError('Unable to update profile. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
        });
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--foreground-tertiary)',
            }}>
                Loading...
            </div>
        );
    }

    if (!user) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
            }}>
                <h1 style={{ fontSize: '24px', fontWeight: 600 }}>User not found</h1>
                <Link href="/" className="btn btn-primary">Go home</Link>
            </div>
        );
    }

    const isOwnProfile = currentUser?.handle === user.handle;

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', minHeight: '100vh' }}>
            {/* Header */}
            <header style={{
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'var(--background)',
                zIndex: 10,
            }}>
                <Link href="/" style={{ color: 'var(--foreground)' }}>
                    <ArrowLeftIcon />
                </Link>
                <div>
                    <h1 style={{ fontSize: '18px', fontWeight: 600 }}>{user.displayName || user.handle}</h1>
                    <p style={{ fontSize: '13px', color: 'var(--foreground-tertiary)' }}>{user.postsCount} posts</p>
                </div>
            </header>

            {/* Account Moved Banner */}
            {user.movedTo && (
                <div style={{
                    padding: '16px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                }}>
                    <span style={{ fontSize: '20px' }}>🚀</span>
                    <div>
                        <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: '4px' }}>
                            This account has moved
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--foreground-secondary)' }}>
                            This user has migrated to a new node:{' '}
                            <a
                                href={user.movedTo}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent)' }}
                            >
                                {user.movedTo.replace('https://', '').replace('/users/', '/@')}
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Header */}
            <div style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Banner */}
                <div style={{
                    height: '150px',
                    background: user.headerUrl
                        ? `url(${user.headerUrl}) center/cover`
                        : 'linear-gradient(135deg, var(--accent-muted) 0%, var(--background-tertiary) 100%)',
                }} />

                {/* Avatar & Actions */}
                <div style={{ padding: '0 16px' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                    }}>
                        <div className="avatar avatar-lg" style={{
                            width: '96px',
                            height: '96px',
                            fontSize: '36px',
                            border: '4px solid var(--background)',
                            marginTop: '-48px',
                        }}>
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.displayName || user.handle} />
                            ) : (
                                (user.displayName || user.handle).charAt(0).toUpperCase()
                            )}
                        </div>

                        <div style={{ paddingTop: '12px' }}>
                            {!isOwnProfile && currentUser && (
                                <button
                                    className={`btn ${isFollowing ? '' : 'btn-primary'}`}
                                    onClick={handleFollow}
                                >
                                    {isFollowing ? 'Following' : 'Follow'}
                                </button>
                            )}

                            {isOwnProfile && (
                                <button className="btn" onClick={() => setIsEditing(!isEditing)}>
                                    {isEditing ? 'Close' : 'Edit Profile'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* User Info */}
                    <div style={{ padding: '12px 0' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>{user.displayName || user.handle}</h2>
                        <p style={{ color: 'var(--foreground-tertiary)' }}>@{user.handle}</p>

                        {user.bio && (
                            <p style={{ marginTop: '12px', lineHeight: 1.5 }}>{user.bio}</p>
                        )}

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '12px',
                            color: 'var(--foreground-tertiary)',
                            fontSize: '14px',
                        }}>
                            <CalendarIcon />
                            <span>Joined {formatDate(user.createdAt)}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                            <button
                                onClick={() => setActiveTab('following')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--foreground)',
                                    cursor: 'pointer',
                                }}
                            >
                                <strong>{user.followingCount}</strong>{' '}
                                <span style={{ color: 'var(--foreground-tertiary)' }}>Following</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('followers')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--foreground)',
                                    cursor: 'pointer',
                                }}
                            >
                                <strong>{user.followersCount}</strong>{' '}
                                <span style={{ color: 'var(--foreground-tertiary)' }}>Followers</span>
                            </button>
                        </div>
                    </div>
                </div>

                {isOwnProfile && isEditing && (
                    <div style={{ padding: '0 16px 16px' }}>
                        <div className="card" style={{ padding: '16px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '12px' }}>Edit profile</div>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--foreground-tertiary)' }}>Display name</label>
                                    <input
                                        className="input"
                                        value={profileForm.displayName}
                                        onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                                        maxLength={50}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--foreground-tertiary)' }}>Bio</label>
                                    <AutoTextarea
                                        className="input"
                                        value={profileForm.bio}
                                        onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                                        maxLength={160}
                                        style={{ minHeight: '80px', resize: 'vertical' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--foreground-tertiary)' }}>Avatar</label>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                                            {isSaving ? 'Uploading...' : 'Choose File'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setIsSaving(true);
                                                    try {
                                                        const formData = new FormData();
                                                        formData.append('file', file);
                                                        const res = await fetch('/api/uploads', {
                                                            method: 'POST',
                                                            body: formData,
                                                        });
                                                        const data = await res.json();
                                                        if (data.url) {
                                                            setProfileForm(prev => ({ ...prev, avatarUrl: data.url }));
                                                        }
                                                    } catch (err) {
                                                        console.error(err);
                                                        setSaveError('Upload failed');
                                                    } finally {
                                                        setIsSaving(false);
                                                    }
                                                }}
                                                disabled={isSaving}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                        {profileForm.avatarUrl && (
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                <img src={profileForm.avatarUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--foreground-tertiary)' }}>Header</label>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                                            {isSaving ? 'Uploading...' : 'Choose File'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setIsSaving(true);
                                                    try {
                                                        const formData = new FormData();
                                                        formData.append('file', file);
                                                        const res = await fetch('/api/uploads', {
                                                            method: 'POST',
                                                            body: formData,
                                                        });
                                                        const data = await res.json();
                                                        if (data.url) {
                                                            setProfileForm(prev => ({ ...prev, headerUrl: data.url }));
                                                        }
                                                    } catch (err) {
                                                        console.error(err);
                                                        setSaveError('Upload failed');
                                                    } finally {
                                                        setIsSaving(false);
                                                    }
                                                }}
                                                disabled={isSaving}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                        {profileForm.headerUrl && (
                                            <div style={{ width: '80px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                <img src={profileForm.headerUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {saveError && (
                                    <div style={{ color: 'var(--error)', fontSize: '13px' }}>{saveError}</div>
                                )}
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                    <button className="btn btn-ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>
                                        Cancel
                                    </button>
                                    <button className="btn btn-primary" onClick={handleSaveProfile} disabled={isSaving}>
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
                    {(['posts', 'followers', 'following'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                flex: 1,
                                padding: '16px',
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                                color: activeTab === tab ? 'var(--foreground)' : 'var(--foreground-tertiary)',
                                fontWeight: activeTab === tab ? 600 : 400,
                                cursor: 'pointer',
                                textTransform: 'capitalize',
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            {activeTab === 'posts' && (
                posts.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                        <p>No posts yet</p>
                    </div>
                ) : (
                    posts.map(post => <PostCard key={post.id} post={post} />)
                )
            )}

            {activeTab === 'followers' && (
                followersLoading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                        Loading followers...
                    </div>
                ) : followers.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                        <p>No followers yet</p>
                    </div>
                ) : (
                    <div>
                        {followers.map(follower => (
                            <UserRow key={follower.id} user={follower} />
                        ))}
                    </div>
                )
            )}

            {activeTab === 'following' && (
                followingLoading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                        Loading following...
                    </div>
                ) : following.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                        <p>Not following anyone yet</p>
                    </div>
                ) : (
                    <div>
                        {following.map(userItem => (
                            <UserRow key={userItem.id} user={userItem} />
                        ))}
                    </div>
                )
            )}
        </div>
    );
}

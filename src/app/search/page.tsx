'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
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
const SearchIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const ArrowLeftIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

const HeartIcon = ({ filled }: { filled?: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
);

const RepeatIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
);

const MessageIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
);

const FlagIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 5v16" />
        <path d="M5 5h11l-1 4 1 4H5" />
    </svg>
);

function UserCard({ user }: { user: User }) {
    return (
        <Link
            href={`/@${user.handle}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s ease',
            }}
            className="hover-bg"
        >
            <div className="avatar">
                {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} />
                ) : (
                    (user.displayName || user.handle).charAt(0).toUpperCase()
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{user.displayName || user.handle}</div>
                <div style={{ color: 'var(--foreground-tertiary)', fontSize: '14px' }}>@{user.handle}</div>
                {user.bio && (
                    <div style={{
                        color: 'var(--foreground-secondary)',
                        fontSize: '14px',
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {user.bio}
                    </div>
                )}
            </div>
        </Link>
    );
}

function PostCard({ post }: { post: Post }) {
    const [liked, setLiked] = useState(false);
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
                    {post.author?.avatarUrl ? (
                        <img src={post.author.avatarUrl} alt={post.author.displayName} />
                    ) : (
                        (post.author?.displayName || post.author?.handle || '?').charAt(0).toUpperCase()
                    )}
                </div>
                <div className="post-author">
                    <Link href={`/@${post.author?.handle}`} className="post-handle">
                        {post.author?.displayName || post.author?.handle}
                    </Link>
                    <span className="post-time">@{post.author?.handle} · {formatTime(post.createdAt)}</span>
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
                <button className="post-action">
                    <RepeatIcon />
                    <span>{post.repostsCount || ''}</span>
                </button>
                <button className={`post-action ${liked ? 'liked' : ''}`} onClick={() => setLiked(!liked)}>
                    <HeartIcon filled={liked} />
                    <span>{post.likesCount + (liked ? 1 : 0) || ''}</span>
                </button>
                <button className="post-action" onClick={async () => {
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
                }} disabled={reporting}>
                    <FlagIcon />
                    <span>{reporting ? '...' : ''}</span>
                </button>
            </div>
        </article>
    );
}

export default function SearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get('q') || '';

    const [query, setQuery] = useState(initialQuery);
    const [users, setUsers] = useState<User[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'users' | 'posts'>('all');

    const search = useCallback(async (q: string, type: string = 'all') => {
        if (!q.trim()) {
            setUsers([]);
            setPosts([]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`);
            const data = await res.json();
            setUsers(data.users || []);
            setPosts(data.posts || []);
        } catch {
            console.error('Search failed');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialQuery) {
            search(initialQuery, activeTab);
        }
    }, [initialQuery, activeTab, search]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            router.push(`/search?q=${encodeURIComponent(query)}`);
            search(query, activeTab);
        }
    };

    const handleTabChange = (tab: 'all' | 'users' | 'posts') => {
        setActiveTab(tab);
        if (query.trim()) {
            search(query, tab);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', minHeight: '100vh' }}>
            {/* Header */}
            <header style={{
                padding: '16px',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'var(--background)',
                zIndex: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Link href="/" style={{ color: 'var(--foreground)' }}>
                        <ArrowLeftIcon />
                    </Link>
                    <form onSubmit={handleSubmit} style={{ flex: 1 }}>
                        <div style={{ position: 'relative' }}>
                            <span style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--foreground-tertiary)',
                            }}>
                                <SearchIcon />
                            </span>
                            <input
                                type="text"
                                className="input"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search users and posts..."
                                style={{ paddingLeft: '44px' }}
                            />
                        </div>
                    </form>
                </div>
            </header>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {(['all', 'users', 'posts'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
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

            {/* Results */}
            {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                    Searching...
                </div>
            ) : !initialQuery ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                    <p>Search for users and posts</p>
                </div>
            ) : users.length === 0 && posts.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
                    <p>No results for &ldquo;{initialQuery}&rdquo;</p>
                </div>
            ) : (
                <>
                    {/* Users */}
                    {(activeTab === 'all' || activeTab === 'users') && users.length > 0 && (
                        <div>
                            {activeTab === 'all' && (
                                <div style={{
                                    padding: '12px 16px',
                                    fontWeight: 600,
                                    borderBottom: '1px solid var(--border)',
                                    background: 'var(--background-secondary)',
                                }}>
                                    Users
                                </div>
                            )}
                            {users.map(user => <UserCard key={user.id} user={user} />)}
                        </div>
                    )}

                    {/* Posts */}
                    {(activeTab === 'all' || activeTab === 'posts') && posts.length > 0 && (
                        <div>
                            {activeTab === 'all' && (
                                <div style={{
                                    padding: '12px 16px',
                                    fontWeight: 600,
                                    borderBottom: '1px solid var(--border)',
                                    background: 'var(--background-secondary)',
                                }}>
                                    Posts
                                </div>
                            )}
                            {posts.map(post => <PostCard key={post.id} post={post} />)}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

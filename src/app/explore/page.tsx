'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SearchIcon, TrendingIcon, UsersIcon } from '@/components/Icons';
import { PostCard } from '@/components/PostCard';
import { Post } from '@/lib/types';
import { formatFullHandle } from '@/lib/utils/handle';
import { Bot } from 'lucide-react';

interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    profileUrl?: string | null;
    isRemote?: boolean;
    isBot?: boolean;
}

function UserCard({ user }: { user: User }) {
    return (
        <Link href={`/${user.handle}`} className="user-card">
            <div className="avatar">
                {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} />
                ) : (
                    user.displayName?.charAt(0).toUpperCase() || user.handle.charAt(0).toUpperCase()
                )}
            </div>
            <div className="user-card-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="user-card-name">{user.displayName || user.handle}</span>
                    {user.isBot && (
                        <span 
                            style={{ 
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '10px', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                background: 'var(--accent-muted)', 
                                color: 'var(--accent)',
                                fontWeight: 500,
                            }}
                        >
                            <Bot size={12} />
                            AI Account
                        </span>
                    )}
                </div>
                <div className="user-card-handle">{formatFullHandle(user.handle)}</div>
                {user.bio && <div className="user-card-bio">{user.bio}</div>}
            </div>
        </Link>
    );
}

export default function ExplorePage() {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'trending' | 'users' | 'search'>('trending');
    const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [searchResults, setSearchResults] = useState<{ posts: Post[]; users: User[] }>({ posts: [], users: [] });
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        // Load trending posts
        const loadTrending = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/posts?type=curated&limit=20');
                const data = await res.json();
                setTrendingPosts(data.posts || []);
            } catch {
                setTrendingPosts([]);
            } finally {
                setLoading(false);
            }
        };

        loadTrending();
    }, []);

    useEffect(() => {
        // Load users when tab changes to users
        if (activeTab === 'users' && users.length === 0) {
            const loadUsers = async () => {
                setLoading(true);
                try {
                    const res = await fetch('/api/users?limit=20');
                    const data = await res.json();
                    setUsers(data.users || []);
                } catch {
                    setUsers([]);
                } finally {
                    setLoading(false);
                }
            };
            loadUsers();
        }
    }, [activeTab, users.length]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setSearching(true);
        setActiveTab('search');

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            setSearchResults({
                posts: data.posts || [],
                users: data.users || [],
            });
        } catch {
            setSearchResults({ posts: [], users: [] });
        } finally {
            setSearching(false);
        }
    };

    const handleLike = async (postId: string, currentLiked: boolean) => {
        const method = currentLiked ? 'DELETE' : 'POST';
        await fetch(`/api/posts/${postId}/like`, { method });
    };

    const handleRepost = async (postId: string, currentReposted: boolean) => {
        const method = currentReposted ? 'DELETE' : 'POST';
        await fetch(`/api/posts/${postId}/repost`, { method });
    };

    const handleDelete = (postId: string) => {
        setTrendingPosts(prev => prev.filter(p => p.id !== postId));
        setSearchResults(prev => ({
            ...prev,
            posts: prev.posts.filter(p => p.id !== postId)
        }));
    };

    return (
        <div className="explore-page">
            <header className="explore-header">
                <h1>Explore</h1>
                <form onSubmit={handleSearch} className="explore-search">
                    <SearchIcon />
                    <input
                        type="text"
                        placeholder="Search posts and users..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </form>
            </header>

            <div className="explore-tabs">
                <button
                    className={`explore-tab ${activeTab === 'trending' ? 'active' : ''}`}
                    onClick={() => setActiveTab('trending')}
                >
                    <TrendingIcon />
                    <span>Trending</span>
                </button>
                <button
                    className={`explore-tab ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <UsersIcon />
                    <span>Users</span>
                </button>
                {searchResults.posts.length > 0 || searchResults.users.length > 0 ? (
                    <button
                        className={`explore-tab ${activeTab === 'search' ? 'active' : ''}`}
                        onClick={() => setActiveTab('search')}
                    >
                        <SearchIcon />
                        <span>Results</span>
                    </button>
                ) : null}
            </div>

            <div className="explore-content">
                {activeTab === 'trending' && (
                    loading ? (
                        <div className="explore-loading">Loading trending posts...</div>
                    ) : trendingPosts.length === 0 ? (
                        <div className="explore-empty">
                            <TrendingIcon />
                            <p>No trending posts yet</p>
                        </div>
                    ) : (
                        <>
                            <div className="feed-meta card">
                                <div className="feed-meta-title">Fediverse feed</div>
                                <div className="feed-meta-body">
                                    This feed shows posts from across the fediverse, including content from accounts that users on this node follow. Discover new voices and conversations from the wider federated network.
                                </div>
                            </div>
                            <div className="explore-posts">
                                {trendingPosts.map((post) => (
                                    <PostCard key={post.id} post={post} onLike={handleLike} onRepost={handleRepost} onDelete={handleDelete} />
                                ))}
                            </div>
                        </>
                    )
                )}

                {activeTab === 'users' && (
                    loading ? (
                        <div className="explore-loading">Loading users...</div>
                    ) : users.length === 0 ? (
                        <div className="explore-empty">
                            <UsersIcon />
                            <p>No users found</p>
                        </div>
                    ) : (
                        <div className="explore-users">
                            {users.map((user) => (
                                <UserCard key={user.id} user={user} />
                            ))}
                        </div>
                    )
                )}

                {activeTab === 'search' && (
                    searching ? (
                        <div className="explore-loading">Searching...</div>
                    ) : (
                        <div className="explore-search-results">
                            {searchResults.users.length > 0 && (
                                <div className="search-section">
                                    <h2>Users</h2>
                                    <div className="explore-users">
                                        {searchResults.users.map((user) => (
                                            <UserCard key={user.id} user={user} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {searchResults.posts.length > 0 && (
                                <div className="search-section">
                                    <h2>Posts</h2>
                                    <div className="explore-posts">
                                        {searchResults.posts.map((post) => (
                                            <PostCard key={post.id} post={post} onLike={handleLike} onRepost={handleRepost} onDelete={handleDelete} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {searchResults.users.length === 0 && searchResults.posts.length === 0 && (
                                <div className="explore-empty">
                                    <SearchIcon />
                                    <p>No results found for &ldquo;{query}&rdquo;</p>
                                </div>
                            )}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

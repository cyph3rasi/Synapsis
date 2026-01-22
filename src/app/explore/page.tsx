'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SearchIcon, TrendingIcon, UsersIcon, HeartIcon, RepeatIcon, MessageIcon } from '@/components/Icons';

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



function PostCard({ post }: { post: Post }) {
    const [liked, setLiked] = useState(false);
    const [reposted, setReposted] = useState(false);

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

    const handleLike = async () => {
        setLiked(!liked);
        await fetch(`/api/posts/${post.id}/like`, { method: 'POST' });
    };

    const handleRepost = async () => {
        setReposted(!reposted);
        await fetch(`/api/posts/${post.id}/repost`, { method: 'POST' });
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
                <button className="post-action" onClick={() => { }}>
                    <MessageIcon />
                    <span>{post.repliesCount || ''}</span>
                </button>
                <button className={`post-action ${reposted ? 'reposted' : ''}`} onClick={handleRepost}>
                    <RepeatIcon />
                    <span>{post.repostsCount + (reposted ? 1 : 0) || ''}</span>
                </button>
                <button className={`post-action ${liked ? 'liked' : ''}`} onClick={handleLike}>
                    <HeartIcon filled={liked} />
                    <span>{post.likesCount + (liked ? 1 : 0) || ''}</span>
                </button>
            </div>
        </article>
    );
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
                <div className="user-card-name">{user.displayName || user.handle}</div>
                <div className="user-card-handle">@{user.handle}</div>
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
                        <div className="explore-posts">
                            {trendingPosts.map((post) => (
                                <PostCard key={post.id} post={post} />
                            ))}
                        </div>
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
                                            <PostCard key={post.id} post={post} />
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

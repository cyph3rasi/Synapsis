'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SearchIcon, TrendingIcon, UsersIcon } from '@/components/Icons';
import { PostCard } from '@/components/PostCard';
import { Post } from '@/lib/types';
import { formatFullHandle } from '@/lib/utils/handle';
import { Bot, Network, Server } from 'lucide-react';

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

interface SwarmPost {
    id: string;
    content: string;
    createdAt: string;
    author: {
        handle: string;
        displayName: string;
        avatarUrl?: string;
    };
    nodeDomain: string;
    likeCount: number;
    repostCount: number;
    replyCount: number;
    mediaUrls?: string[];
}

export default function ExplorePage() {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'node' | 'swarm' | 'users' | 'search'>('node');
    const [nodePosts, setNodePosts] = useState<Post[]>([]);
    const [swarmPosts, setSwarmPosts] = useState<SwarmPost[]>([]);
    const [swarmSources, setSwarmSources] = useState<{ domain: string; postCount: number }[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [searchResults, setSearchResults] = useState<{ posts: Post[]; users: User[] }>({ posts: [], users: [] });
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        // Load node posts (local only)
        const loadNodePosts = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/posts?type=local&limit=20');
                const data = await res.json();
                setNodePosts(data.posts || []);
            } catch {
                setNodePosts([]);
            } finally {
                setLoading(false);
            }
        };

        loadNodePosts();
    }, []);

    useEffect(() => {
        // Load swarm posts when tab changes
        if (activeTab === 'swarm' && swarmPosts.length === 0) {
            const loadSwarm = async () => {
                setLoading(true);
                try {
                    const res = await fetch('/api/posts/swarm');
                    const data = await res.json();
                    setSwarmPosts(data.posts || []);
                    setSwarmSources(data.sources || []);
                } catch {
                    setSwarmPosts([]);
                } finally {
                    setLoading(false);
                }
            };
            loadSwarm();
        }
    }, [activeTab, swarmPosts.length]);

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
        setNodePosts(prev => prev.filter(p => p.id !== postId));
        setSwarmPosts(prev => prev.filter(p => p.id !== postId));
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
                    className={`explore-tab ${activeTab === 'node' ? 'active' : ''}`}
                    onClick={() => setActiveTab('node')}
                >
                    <Server size={18} />
                    <span>Node</span>
                </button>
                <button
                    className={`explore-tab ${activeTab === 'swarm' ? 'active' : ''}`}
                    onClick={() => setActiveTab('swarm')}
                >
                    <Network size={18} />
                    <span>Swarm</span>
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
                {activeTab === 'node' && (
                    loading ? (
                        <div className="explore-loading">Loading posts...</div>
                    ) : nodePosts.length === 0 ? (
                        <div className="explore-empty">
                            <Server size={24} />
                            <p>No posts on this node yet</p>
                        </div>
                    ) : (
                        <>
                            <div className="feed-meta card">
                                <div className="feed-meta-title">Node feed</div>
                                <div className="feed-meta-body">
                                    A chronological feed of all posts from users on this node. See what the local community is sharing.
                                </div>
                            </div>
                            <div className="explore-posts">
                                {nodePosts.map((post) => (
                                    <PostCard key={post.id} post={post} onLike={handleLike} onRepost={handleRepost} onDelete={handleDelete} />
                                ))}
                            </div>
                        </>
                    )
                )}

                {activeTab === 'swarm' && (
                    loading ? (
                        <div className="explore-loading">Loading swarm posts...</div>
                    ) : swarmPosts.length === 0 ? (
                        <div className="explore-empty">
                            <Network size={24} />
                            <p>No swarm posts yet</p>
                            <p style={{ fontSize: '14px', opacity: 0.7, marginTop: '8px' }}>
                                Posts from other Synapsis nodes will appear here
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="feed-meta card">
                                <div className="feed-meta-title">Swarm feed</div>
                                <div className="feed-meta-body">
                                    Posts from across the Synapsis network. Currently showing posts from {swarmSources.filter(s => s.postCount > 0).length} node{swarmSources.filter(s => s.postCount > 0).length !== 1 ? 's' : ''}.
                                </div>
                            </div>
                            <div className="explore-posts">
                                {swarmPosts.map((post) => (
                                    <div key={`${post.nodeDomain}:${post.id}`} className="swarm-post-wrapper">
                                        <div className="swarm-post-card card">
                                            <div className="swarm-post-header">
                                                <div className="avatar">
                                                    {post.author.avatarUrl ? (
                                                        <img src={post.author.avatarUrl} alt={post.author.displayName} />
                                                    ) : (
                                                        post.author.displayName?.charAt(0).toUpperCase() || post.author.handle.charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                                <div className="swarm-post-meta">
                                                    <span className="swarm-post-author">{post.author.displayName}</span>
                                                    <span className="swarm-post-handle">@{post.author.handle}@{post.nodeDomain}</span>
                                                </div>
                                            </div>
                                            <div className="swarm-post-content">{post.content}</div>
                                            {post.mediaUrls && post.mediaUrls.length > 0 && (
                                                <div className="swarm-post-media">
                                                    {post.mediaUrls.map((url, i) => (
                                                        <img key={i} src={url} alt="" />
                                                    ))}
                                                </div>
                                            )}
                                            <div className="swarm-post-footer">
                                                <span className="swarm-post-time">
                                                    {new Date(post.createdAt).toLocaleString()}
                                                </span>
                                                <span className="swarm-post-stats">
                                                    {post.likeCount > 0 && `${post.likeCount} likes`}
                                                    {post.likeCount > 0 && post.repostCount > 0 && ' · '}
                                                    {post.repostCount > 0 && `${post.repostCount} reposts`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HeartIcon, RepeatIcon, MessageIcon, FlagIcon } from '@/components/Icons';
import { Post } from '@/lib/types';

interface PostCardProps {
    post: Post;
    onLike?: (id: string) => void;
    onRepost?: (id: string) => void;
    onComment?: (post: Post) => void;
    isDetail?: boolean;
}

export function PostCard({ post, onLike, onRepost, onComment, isDetail }: PostCardProps) {
    const [liked, setLiked] = useState(post.isLiked || false);
    const [reposted, setReposted] = useState(post.isReposted || false);
    const [reporting, setReporting] = useState(false);

    // Sync state if post changes (e.g. after a re-render from parent)
    useEffect(() => {
        setLiked(post.isLiked || false);
        setReposted(post.isReposted || false);
    }, [post.isLiked, post.isReposted, post.id]);

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

    const handleLike = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const currentLiked = liked;
        setLiked(!currentLiked);
        onLike?.(post.id, currentLiked); // Pass current state before toggle
    };

    const handleRepost = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const currentReposted = reposted;
        setReposted(!currentReposted);
        onRepost?.(post.id, currentReposted); // Pass current state before toggle
    };

    const handleComment = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onComment?.(post);
    };

    const handleReport = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
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
    };

    const postUrl = `/${post.author.handle}/posts/${post.id}`;

    return (
        <article className={`post ${isDetail ? 'detail' : ''}`}>
            <Link href={postUrl} className="post-link-overlay" aria-label="View post" />

            <div className="post-header">
                <Link href={`/${post.author.handle}`} className="avatar-link" onClick={(e) => e.stopPropagation()}>
                    <div className="avatar">
                        {post.author.avatarUrl ? (
                            <img src={post.author.avatarUrl} alt={post.author.displayName} />
                        ) : (
                            post.author.displayName?.charAt(0).toUpperCase() || post.author.handle.charAt(0).toUpperCase()
                        )}
                    </div>
                </Link>
                <div className="post-author">
                    <Link href={`/${post.author.handle}`} className="post-handle" onClick={(e) => e.stopPropagation()}>
                        {post.author.displayName || post.author.handle}
                    </Link>
                    <span className="post-time">@{post.author.handle} · {formatTime(post.createdAt)}</span>
                </div>
            </div>

            {post.replyTo && (
                <div className="post-reply-to">
                    Replied to <Link href={`/${post.replyTo.author.handle}`} onClick={(e) => e.stopPropagation()}>@{post.replyTo.author.handle}</Link>
                </div>
            )}

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

            {post.linkPreviewUrl && (
                <a
                    href={post.linkPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-preview-card"
                    onClick={(e) => e.stopPropagation()}
                >
                    {post.linkPreviewImage && (
                        <div className="link-preview-image">
                            <img src={post.linkPreviewImage} alt={post.linkPreviewTitle || ''} />
                        </div>
                    )}
                    <div className="link-preview-info">
                        <div className="link-preview-title">{post.linkPreviewTitle}</div>
                        {post.linkPreviewDescription && (
                            <div className="link-preview-description">{post.linkPreviewDescription}</div>
                        )}
                        <div className="link-preview-url">
                            {new URL(post.linkPreviewUrl.startsWith('http') ? post.linkPreviewUrl : `https://${post.linkPreviewUrl}`).hostname}
                        </div>
                    </div>
                </a>
            )}

            <div className="post-actions">
                <button className="post-action" onClick={handleComment}>
                    <MessageIcon />
                    <span>{post.repliesCount || ''}</span>
                </button>
                <button className={`post-action ${reposted ? 'reposted' : ''}`} onClick={handleRepost}>
                    <RepeatIcon />
                    <span>{(post.repostsCount - (post.isReposted ? 1 : 0)) + (reposted ? 1 : 0) || ''}</span>
                </button>
                <button className={`post-action ${liked ? 'liked' : ''}`} onClick={handleLike}>
                    <HeartIcon filled={liked} />
                    <span>{(post.likesCount - (post.isLiked ? 1 : 0)) + (liked ? 1 : 0) || ''}</span>
                </button>
                <button className="post-action" onClick={handleReport} disabled={reporting}>
                    <FlagIcon />
                    <span>{reporting ? '...' : ''}</span>
                </button>
            </div>
        </article>
    );
}

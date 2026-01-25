'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HeartIcon, RepeatIcon, MessageIcon, FlagIcon, TrashIcon } from '@/components/Icons';
import { Bot } from 'lucide-react';
import { Post } from '@/lib/types';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useToast } from '@/lib/contexts/ToastContext';
import { VideoEmbed } from '@/components/VideoEmbed';
import { formatFullHandle } from '@/lib/utils/handle';

// Component for link preview image that hides on error
function LinkPreviewImage({ src, alt }: { src: string; alt: string }) {
    const [hasError, setHasError] = useState(false);
    
    if (hasError) return null;
    
    return (
        <div className="link-preview-image">
            <img 
                src={src} 
                alt={alt} 
                onError={() => setHasError(true)}
            />
        </div>
    );
}

interface PostCardProps {
    post: Post;
    onLike?: (id: string, currentLiked: boolean) => void;
    onRepost?: (id: string, currentReposted: boolean) => void;
    onComment?: (post: Post) => void;
    onDelete?: (id: string) => void;
    isDetail?: boolean;
}

export function PostCard({ post, onLike, onRepost, onComment, onDelete, isDetail }: PostCardProps) {
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();
    const [liked, setLiked] = useState(post.isLiked || false);
    const [reposted, setReposted] = useState(post.isReposted || false);
    const [reporting, setReporting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Sync state if post changes (e.g. after a re-render from parent)
    useEffect(() => {
        setLiked(post.isLiked || false);
        setReposted(post.isReposted || false);
    }, [post.isLiked, post.isReposted, post.id]);

    const formatTime = (dateStr: string | Date) => {
        const date = new Date(dateStr);
        
        if (isNaN(date.getTime())) {
            return '';
        }
        
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        
        // If post is in the future (minor clock skew), show "now"
        if (diff < 0) {
            return 'now';
        }
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'now';
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
                    showToast('Please log in to report.', 'error');
                } else {
                    showToast('Report failed. Please try again.', 'error');
                }
            } else {
                showToast('Report submitted. Thank you.', 'success');
            }
        } catch {
            showToast('Report failed. Please try again.', 'error');
        } finally {
            setReporting(false);
        }
    };
    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (deleting) return;
        if (!window.confirm('Are you sure you want to delete this post? This action cannot be undone.')) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/posts/${post.id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                onDelete?.(post.id);
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to delete post', 'error');
            }
        } catch {
            showToast('Failed to delete post', 'error');
        } finally {
            setDeleting(false);
        }
    };

    const postUrl = `/${post.author.handle}/posts/${post.id}`;

    // Decode HTML entities from federated posts (e.g., &amp;rsquo; -> ')
    const decodeHtmlEntities = (text: string): string => {
        const entities: Record<string, string> = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#039;': "'",
            '&apos;': "'",
            '&rsquo;': '\u2019', // '
            '&lsquo;': '\u2018', // '
            '&rdquo;': '\u201D', // "
            '&ldquo;': '\u201C', // "
            '&ndash;': '\u2013', // –
            '&mdash;': '\u2014', // —
            '&hellip;': '\u2026', // …
            '&nbsp;': ' ',
            '&copy;': '\u00A9', // ©
            '&reg;': '\u00AE', // ®
            '&trade;': '\u2122', // ™
            '&euro;': '\u20AC', // €
            '&pound;': '\u00A3', // £
            '&yen;': '\u00A5', // ¥
            '&cent;': '\u00A2', // ¢
        };

        // First decode named entities
        let decoded = text;
        for (const [entity, char] of Object.entries(entities)) {
            decoded = decoded.replace(new RegExp(entity, 'g'), char);
        }

        // Decode numeric entities (&#123; or &#x7B;)
        decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
        decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

        // Strip HTML tags (remote posts may contain <p>, <br>, <a> etc.)
        decoded = decoded.replace(/<br\s*\/?>/gi, '\n');
        decoded = decoded.replace(/<\/p>\s*<p>/gi, '\n\n');
        decoded = decoded.replace(/<[^>]+>/g, '');

        return decoded.trim();
    };

    const renderContent = (content: string, hidePreviewUrl?: string) => {
        const decoded = decodeHtmlEntities(content);
        const parts = decoded.split(/(https?:\/\/[^\s]+)/g);
        return parts.map((part, index) => {
            if (part.match(/^https?:\/\/[^\s]+$/)) {
                // If this URL matches the link preview URL, hide it entirely
                if (hidePreviewUrl && part.includes(hidePreviewUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])) {
                    return null;
                }
                // Extract just the domain (TLD)
                try {
                    const url = new URL(part);
                    const domain = url.hostname.replace(/^www\./, '');
                    return (
                        <a
                            key={`url-${index}`}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={part}
                        >
                            {domain}
                        </a>
                    );
                } catch {
                    // Fallback if URL parsing fails
                    return (
                        <a
                            key={`url-${index}`}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {part}
                        </a>
                    );
                }
            }
            // Handle newlines
            if (part.includes('\n')) {
                return part.split('\n').map((line, lineIndex, arr) => (
                    <span key={`text-${index}-${lineIndex}`}>
                        {line}
                        {lineIndex < arr.length - 1 && <br />}
                    </span>
                ));
            }
            return <span key={`text-${index}`}>{part}</span>;
        });
    };

    return (
        <article className={`post ${isDetail ? 'detail' : ''}`}>
            {!isDetail && <Link href={postUrl} className="post-link-overlay" aria-label="View post" />}

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Link href={`/${post.author.handle}`} className="post-handle" onClick={(e) => e.stopPropagation()}>
                            {post.author.displayName || post.author.handle}
                        </Link>
                        {post.bot && (
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
                                title={`AI Account: ${post.bot.name}`}
                            >
                                <Bot size={12} />
                                AI Account
                            </span>
                        )}
                    </div>
                    <span className="post-time">{formatFullHandle(post.author.handle)} · {formatTime(post.createdAt)}</span>
                </div>
            </div>

            {post.replyTo && (
                <div className="post-reply-to">
                    Replied to <Link href={`/${post.replyTo.author.handle}`} onClick={(e) => e.stopPropagation()}>{formatFullHandle(post.replyTo.author.handle)}</Link>
                </div>
            )}

            <div className="post-content">{renderContent(post.content, post.linkPreviewUrl ?? undefined)}</div>

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
                <VideoEmbed url={post.linkPreviewUrl} />
            )}

            {post.linkPreviewUrl && !post.linkPreviewUrl.match(/(youtube\.com|youtu\.be|vimeo\.com)/) && (
                <a
                    href={post.linkPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-preview-card"
                    onClick={(e) => e.stopPropagation()}
                >
                    {post.linkPreviewImage && (
                        <LinkPreviewImage src={post.linkPreviewImage} alt={post.linkPreviewTitle || ''} />
                    )}
                    <div className="link-preview-info">
                        <div className="link-preview-title">{post.linkPreviewTitle ? decodeHtmlEntities(post.linkPreviewTitle) : ''}</div>
                        {post.linkPreviewDescription && (
                            <div className="link-preview-description">{decodeHtmlEntities(post.linkPreviewDescription)}</div>
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
                {(currentUser?.id === post.author.id || (post.bot && currentUser?.id === post.bot.ownerId)) && (
                    <button className="post-action delete-action" onClick={handleDelete} disabled={deleting} title="Delete post">
                        <TrashIcon />
                        <span>{deleting ? '...' : ''}</span>
                    </button>
                )}
            </div>
        </article>
    );
}

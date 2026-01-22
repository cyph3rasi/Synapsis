'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import AutoTextarea from '@/components/AutoTextarea';

interface User {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

interface MediaItem {
  id: string;
  url: string;
  altText?: string | null;
}

interface FeedMeta {
  score: number;
  reasons: string[];
  engagement: {
    likes: number;
    reposts: number;
    replies: number;
  };
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
  feedMeta?: FeedMeta;
  linkPreviewUrl?: string | null;
  linkPreviewTitle?: string | null;
  linkPreviewDescription?: string | null;
  linkPreviewImage?: string | null;
}

// Icons as simple SVG components


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



function PostCard({ post, onLike, onRepost }: { post: Post; onLike: (id: string) => void; onRepost: (id: string) => void }) {
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

  const handleLike = () => {
    setLiked(!liked);
    onLike(post.id);
  };

  const handleRepost = () => {
    setReposted(!reposted);
    onRepost(post.id);
  };

  const handleReport = async () => {
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
      {post.feedMeta?.reasons?.length ? (
        <div className="post-reasons">
          {post.feedMeta.reasons.map((reason, index) => (
            <span key={`${post.id}-reason-${index}`} className="post-reason-chip">
              {reason}
            </span>
          ))}
        </div>
      ) : null}
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
        <a href={post.linkPreviewUrl} target="_blank" rel="noopener noreferrer" className="link-preview-card">
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
        <button className="post-action" onClick={handleReport} disabled={reporting}>
          <FlagIcon />
          <span>{reporting ? '...' : ''}</span>
        </button>
      </div>
    </article>
  );
}

type Attachment = {
  id: string;
  url: string;
  altText?: string | null;
};

function Compose({ onPost }: { onPost: (content: string, mediaIds: string[], linkPreview?: any) => void }) {
  const [content, setContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<any>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [lastDetectedUrl, setLastDetectedUrl] = useState<string | null>(null);
  const maxLength = 400;
  const remaining = maxLength - content.length;

  // Detect URLs in content
  useEffect(() => {
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+\.[a-z]{2,63})\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;
    const matches = content.match(urlRegex);

    if (matches && matches[0]) {
      const url = matches[0];
      if (url !== lastDetectedUrl) {
        setLastDetectedUrl(url);
        fetchPreview(url);
      }
    } else if (!content.trim()) {
      setLinkPreview(null);
      setLastDetectedUrl(null);
    }
  }, [content]);

  const fetchPreview = async (url: string) => {
    setFetchingPreview(true);
    try {
      const res = await fetch(`/api/media/preview?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        setLinkPreview(data);
      }
    } catch (err) {
      console.error('Preview error', err);
    } finally {
      setFetchingPreview(false);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() || isPosting || isUploading) return;
    setIsPosting(true);
    await onPost(content, attachments.map((item) => item.id).filter(Boolean), linkPreview);
    setContent('');
    setAttachments([]);
    setLinkPreview(null);
    setLastDetectedUrl(null);
    setIsPosting(false);
  };

  const handleMediaSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, 4 - attachments.length);
    const selectedFiles = files.slice(0, remainingSlots);
    if (selectedFiles.length === 0) return;

    setUploadError(null);
    setIsUploading(true);

    const uploaded: Attachment[] = [];

    for (const file of selectedFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/media/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (!res.ok || !data.media?.id) {
          throw new Error(data.error || 'Upload failed');
        }

        uploaded.push({
          id: data.media.id,
          url: data.media.url || data.url,
          altText: data.media.altText ?? null,
        });
      } catch (error) {
        console.error('Upload failed', error);
        setUploadError('One or more uploads failed. Try again.');
      }
    }

    setAttachments((prev) => [...prev, ...uploaded].slice(0, 4));
    setIsUploading(false);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="compose">
      <AutoTextarea
        className="compose-input"
        placeholder="What's happening?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={maxLength + 50} // Allow some overflow for better UX
      />
      {attachments.length > 0 && (
        <div className="compose-media-grid">
          {attachments.map((item) => (
            <div className="compose-media-item" key={item.id}>
              <img src={item.url} alt={item.altText || 'Upload preview'} />
              <button
                type="button"
                className="compose-media-remove"
                onClick={() => handleRemoveAttachment(item.id)}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {linkPreview && (
        <div className="compose-link-preview">
          <button
            type="button"
            className="compose-link-preview-remove"
            onClick={() => setLinkPreview(null)}
          >
            x
          </button>
          <div className="link-preview-card mini">
            {linkPreview.image && (
              <div className="link-preview-image">
                <img src={linkPreview.image} alt="" />
              </div>
            )}
            <div className="link-preview-info">
              <div className="link-preview-title">{linkPreview.title}</div>
              <div className="link-preview-url">{new URL(linkPreview.url.startsWith('http') ? linkPreview.url : `https://${linkPreview.url}`).hostname}</div>
            </div>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="compose-media-error">{uploadError}</div>
      )}
      <div className="compose-footer">
        <span className={`compose-counter ${remaining < 50 ? (remaining < 0 ? 'error' : 'warning') : ''}`}>
          {remaining}
        </span>
        <div className="compose-actions">
          <label className="btn btn-ghost btn-sm compose-media-button">
            {isUploading ? 'Uploading...' : 'Add media'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleMediaSelect}
              disabled={isUploading || attachments.length >= 4}
              className="compose-media-input"
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!content.trim() || remaining < 0 || isPosting || isUploading}
          >
            {isPosting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedType, setFeedType] = useState<'latest' | 'curated'>('latest');
  const [feedMeta, setFeedMeta] = useState<{
    algorithm: string;
    windowHours: number;
    seedLimit: number;
    weights: {
      engagement: number;
      recency: number;
      followBoost: number;
      selfBoost: number;
    };
  } | null>(null);

  const loadFeed = async (type: 'latest' | 'curated') => {
    setLoading(true);
    try {
      const endpoint = type === 'curated' ? '/api/posts?type=curated' : '/api/posts?type=home';
      const res = await fetch(endpoint);
      const data = await res.json();
      setPosts(data.posts || []);
      setFeedMeta(data.meta || null);
    } catch {
      setPosts([]);
      setFeedMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed(feedType);
  }, [feedType]);

  const handlePost = async (content: string, mediaIds: string[], linkPreview?: any) => {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mediaIds, linkPreview }),
    });

    if (res.ok) {
      const data = await res.json();
      if (feedType === 'curated') {
        loadFeed('curated');
      } else {
        setPosts([{ ...data.post, author: user }, ...posts]);
      }
    }
  };

  const handleLike = async (postId: string) => {
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  };

  const handleRepost = async (postId: string) => {
    await fetch(`/api/posts/${postId}/repost`, { method: 'POST' });
  };

  return (
    <>
      <header style={{
        padding: '16px',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        background: 'var(--background)',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 600 }}>Home</h1>
          <div className="feed-toggle">
            <button
              className={`feed-toggle-btn ${feedType === 'latest' ? 'active' : ''}`}
              onClick={() => setFeedType('latest')}
            >
              Latest
            </button>
            <button
              className={`feed-toggle-btn ${feedType === 'curated' ? 'active' : ''}`}
              onClick={() => setFeedType('curated')}
            >
              Curated
            </button>
          </div>
        </div>
      </header>

      {user && <Compose onPost={handlePost} />}

      {!user && (
        <div style={{ padding: '24px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--foreground-secondary)', marginBottom: '16px' }}>
            Join Synapsis to post and interact
          </p>
          <Link href="/login" className="btn btn-primary">
            Login or Register
          </Link>
        </div>
      )}

      {feedType === 'curated' && feedMeta && (
        <div className="feed-meta card">
          <div className="feed-meta-title">Curated feed</div>
          <div className="feed-meta-body">
            We rank posts using recency and engagement. Following gets a boost, and your own posts stay visible.
          </div>
          <div className="feed-meta-weights">
            Weights: engagement {feedMeta.weights.engagement}, recency {feedMeta.weights.recency}, follow boost {feedMeta.weights.followBoost}.
          </div>
          <div className="feed-meta-foot">
            Window: {feedMeta.windowHours} hours. Seed: {feedMeta.seedLimit} posts.
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
          Loading...
        </div>
      ) : posts.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--foreground-tertiary)' }}>
          <p>No posts yet</p>
          <p style={{ fontSize: '13px', marginTop: '8px' }}>Be the first to post something!</p>
        </div>
      ) : (
        posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onLike={handleLike}
            onRepost={handleRepost}
          />
        ))
      )}
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { PostCard } from '@/components/PostCard';
import { Compose } from '@/components/Compose';
import { Post } from '@/lib/types';

interface FeedMeta {
  score: number;
  reasons: string[];
  engagement: {
    likes: number;
    reposts: number;
    replies: number;
  };
}

export default function Home() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Post | null>(null);
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

  const handlePost = async (content: string, mediaIds: string[], linkPreview?: any, replyToId?: string) => {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mediaIds, linkPreview, replyToId }),
    });

    if (res.ok) {
      const data = await res.json();
      if (feedType === 'curated') {
        loadFeed('curated');
      } else {
        setPosts([{ ...data.post, author: user }, ...posts]);
      }
      setReplyingTo(null);
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

      {user && (
        <Compose
          onPost={handlePost}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      )}

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
            onComment={(p) => {
              setReplyingTo(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ))
      )}
    </>
  );
}

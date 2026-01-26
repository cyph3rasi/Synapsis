/**
 * Bot Management Page
 * 
 * Lists user's bots and provides creation interface.
 * 
 * Requirements: 1.3
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/Icons';
import { Bot, Plus, Sparkles } from 'lucide-react';

interface BotData {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  isActive: boolean;
  isSuspended: boolean;
  autonomousMode: boolean;
  lastPostAt: Date | null;
  createdAt: Date;
}

export default function BotsPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch('/api/bots');
      if (response.ok) {
        const data = await response.json();
        setBots(data.bots || []);
      }
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px 64px' }}>
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--foreground-tertiary)' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px 64px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <Link href="/settings" style={{ color: 'var(--foreground)' }}>
          <ArrowLeftIcon />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={24} />
            My Bots
          </h1>
          <p style={{ color: 'var(--foreground-tertiary)', fontSize: '14px' }}>
            Create and manage your automated bots
          </p>
        </div>
        <Link href="/settings/bots/new" className="btn btn-primary">
          <Plus size={18} />
          Create Bot
        </Link>
      </header>

      {bots.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Bot size={48} style={{ margin: '0 auto 16px', color: 'var(--foreground-tertiary)', opacity: 0.5 }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            No bots yet
          </h2>
          <p style={{ color: 'var(--foreground-tertiary)', fontSize: '14px', marginBottom: '24px' }}>
            Create your first bot to start automating posts and interactions
          </p>
          <Link href="/settings/bots/new" className="btn btn-primary">
            <Plus size={18} />
            Create Your First Bot
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {bots.map((bot) => (
            <div
              key={bot.id}
              className="card"
              style={{
                padding: '20px',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease',
              }}
              onClick={() => router.push(`/settings/bots/${bot.id}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: 0 }}>
                  <Link 
                    href={`/${bot.handle}`} 
                    onClick={(e) => e.stopPropagation()}
                    className="avatar"
                    style={{ 
                      width: '48px', 
                      height: '48px', 
                      flexShrink: 0,
                      fontSize: '18px',
                    }}
                  >
                    {bot.avatarUrl ? (
                      <img src={bot.avatarUrl} alt={bot.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    ) : (
                      bot.name.charAt(0).toUpperCase()
                    )}
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{bot.name}</h2>
                      {bot.autonomousMode && (
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '4px',
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--accent-muted)',
                          color: 'var(--accent)',
                        }}>
                          <Sparkles size={12} />
                          Auto
                        </span>
                      )}
                    </div>
                    <Link 
                      href={`/${bot.handle}`} 
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: '13px', color: 'var(--foreground-tertiary)' }}
                    >
                      @{bot.handle}
                    </Link>
                    {bot.bio && (
                      <p style={{ 
                        fontSize: '13px', 
                        color: 'var(--foreground-secondary)', 
                        marginTop: '8px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {bot.bio}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {bot.isSuspended ? (
                    <span className="status-pill suspended">
                      Suspended
                    </span>
                  ) : bot.isActive ? (
                    <span className="status-pill active">
                      Active
                    </span>
                  ) : (
                    <span className="status-pill">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                gap: '16px', 
                fontSize: '12px', 
                color: 'var(--foreground-tertiary)',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)',
              }}>
                <span>
                  Last post: {bot.lastPostAt
                    ? new Date(bot.lastPostAt).toLocaleDateString()
                    : 'Never'}
                </span>
                <span>
                  Created: {new Date(bot.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

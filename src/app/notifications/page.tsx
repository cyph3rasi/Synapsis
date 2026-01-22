'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Notification = {
    id: string;
    type: 'follow' | 'like' | 'repost' | 'mention';
    createdAt: string;
    readAt?: string | null;
    actor?: {
        id: string;
        handle: string;
        displayName?: string | null;
        avatarUrl?: string | null;
    } | null;
    post?: {
        id: string;
        content: string;
    } | null;
};

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

const buildMessage = (item: Notification) => {
    const actorName = item.actor?.displayName || item.actor?.handle || 'Someone';
    switch (item.type) {
        case 'follow':
            return `${actorName} followed you`;
        case 'like':
            return `${actorName} liked your post`;
        case 'repost':
            return `${actorName} reposted your post`;
        case 'mention':
            return `${actorName} mentioned you`;
        default:
            return `${actorName} sent a notification`;
    }
};

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [polling, setPolling] = useState(true);

    const loadNotifications = async () => {
        try {
            const res = await fetch('/api/notifications?limit=50', { cache: 'no-store' });
            const data = await res.json();
            setNotifications(data.notifications || []);
        } catch {
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    useEffect(() => {
        if (!polling) return;
        const interval = setInterval(loadNotifications, 15000);
        return () => clearInterval(interval);
    }, [polling]);

    const markAllRead = async () => {
        await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true }),
        });
        loadNotifications();
    };

    const markRead = async (id: string) => {
        await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id] }),
        });
        setNotifications((prev) =>
            prev.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item))
        );
    };

    const unreadCount = notifications.filter((item) => !item.readAt).length;

    return (
        <div className="notifications-shell">
            <header className="notifications-header">
                <div>
                    <h1>Notifications</h1>
                    <p>{unreadCount} unread</p>
                </div>
                <div className="notifications-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setPolling(!polling)}>
                        {polling ? 'Pause polling' : 'Resume polling'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={markAllRead} disabled={notifications.length === 0}>
                        Mark all read
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="notifications-empty">Loading notifications...</div>
            ) : notifications.length === 0 ? (
                <div className="notifications-empty">No notifications yet.</div>
            ) : (
                <div className="notifications-list">
                    {notifications.map((item) => (
                        <div
                            key={item.id}
                            className={`notification-row ${item.readAt ? 'read' : 'unread'}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => markRead(item.id)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    markRead(item.id);
                                }
                            }}
                        >
                            <div className="notification-avatar">
                                {item.actor?.avatarUrl ? (
                                    <img src={item.actor.avatarUrl} alt={item.actor.handle} />
                                ) : (
                                    (item.actor?.displayName || item.actor?.handle || '?').charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="notification-content">
                                <div className="notification-message">{buildMessage(item)}</div>
                                {item.post?.content && (
                                    <div className="notification-post">“{item.post.content.slice(0, 120)}”</div>
                                )}
                                <div className="notification-meta">
                                    <span>{formatTime(item.createdAt)}</span>
                                    {item.actor?.handle && (
                                        <Link href={`/@${item.actor.handle}`} className="notification-link">
                                            @{item.actor.handle}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

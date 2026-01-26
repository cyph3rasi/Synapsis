'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { MessageCircle, Send, ArrowLeft } from 'lucide-react';
import { formatFullHandle } from '@/lib/utils/handle';

interface Conversation {
  id: string;
  participant2: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
  };
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
}

interface Message {
  id: string;
  senderHandle: string;
  senderDisplayName?: string;
  senderAvatarUrl?: string;
  encryptedContent: string;
  isSentByMe: boolean;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [newChatHandle, setNewChatHandle] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/swarm/chat/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/swarm/chat/messages?conversationId=${conversationId}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const markAsRead = async (conversationId: string) => {
    try {
      await fetch('/api/swarm/chat/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      // Update unread count locally
      setConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c)
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const res = await fetch('/api/swarm/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientHandle: selectedConversation.participant2.handle,
          content: newMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        setNewMessage('');
        loadConversations(); // Refresh to update last message
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const startNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatHandle.trim()) return;

    setSending(true);
    try {
      const res = await fetch('/api/swarm/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientHandle: newChatHandle,
          content: 'Hey! 👋',
        }),
      });

      if (res.ok) {
        setShowNewChat(false);
        setNewChatHandle('');
        loadConversations();
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <div className="chat-page">
        <div style={{ padding: '48px', textAlign: 'center' }}>
          <MessageCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <p>Sign in to use Swarm Chat</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-container">
        {/* Conversations List */}
        <div className={`chat-sidebar ${selectedConversation ? 'mobile-hidden' : ''}`}>
          <div className="chat-sidebar-header">
            <h2>Swarm Chat</h2>
            <button
              className="btn-primary"
              onClick={() => setShowNewChat(true)}
              style={{ padding: '8px 16px', fontSize: '14px' }}
            >
              New Chat
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', opacity: 0.5 }}>
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', opacity: 0.5 }}>
              <MessageCircle size={32} style={{ margin: '0 auto 12px' }} />
              <p>No conversations yet</p>
              <p style={{ fontSize: '14px', marginTop: '8px' }}>
                Start a chat with anyone on the swarm
              </p>
            </div>
          ) : (
            <div className="conversations-list">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  className={`conversation-item ${selectedConversation?.id === conv.id ? 'active' : ''}`}
                  onClick={() => setSelectedConversation(conv)}
                >
                  <div className="conversation-avatar">
                    {conv.participant2.avatarUrl ? (
                      <img src={conv.participant2.avatarUrl} alt={conv.participant2.displayName} />
                    ) : (
                      conv.participant2.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="conversation-info">
                    <div className="conversation-name">
                      {conv.participant2.displayName}
                      {conv.unreadCount > 0 && (
                        <span className="unread-badge">{conv.unreadCount}</span>
                      )}
                    </div>
                    <div className="conversation-handle">
                      {formatFullHandle(conv.participant2.handle)}
                    </div>
                    <div className="conversation-preview">{conv.lastMessagePreview}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages View */}
        <div className={`chat-main ${!selectedConversation ? 'mobile-hidden' : ''}`}>
          {selectedConversation ? (
            <>
              <div className="chat-header">
                <button
                  className="back-button"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="chat-header-avatar">
                  {selectedConversation.participant2.avatarUrl ? (
                    <img src={selectedConversation.participant2.avatarUrl} alt="" />
                  ) : (
                    selectedConversation.participant2.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-name">
                    {selectedConversation.participant2.displayName}
                  </div>
                  <div className="chat-header-handle">
                    {formatFullHandle(selectedConversation.participant2.handle)}
                  </div>
                </div>
              </div>

              <div className="chat-messages">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message ${msg.isSentByMe ? 'sent' : 'received'}`}
                  >
                    {!msg.isSentByMe && (
                      <div className="message-avatar">
                        {msg.senderAvatarUrl ? (
                          <img src={msg.senderAvatarUrl} alt="" />
                        ) : (
                          (msg.senderDisplayName || msg.senderHandle).charAt(0).toUpperCase()
                        )}
                      </div>
                    )}
                    <div className="message-content">
                      <div className="message-bubble">
                        {/* Note: In production, decrypt client-side */}
                        <div style={{ opacity: 0.5, fontSize: '12px' }}>
                          [Encrypted: {msg.encryptedContent.substring(0, 20)}...]
                        </div>
                      </div>
                      <div className="message-meta">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                        {msg.isSentByMe && (
                          <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                            {msg.readAt ? '✓✓' : msg.deliveredAt ? '✓' : '○'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={sending}
                />
                <button type="submit" disabled={sending || !newMessage.trim()}>
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty">
              <MessageCircle size={64} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p>Select a conversation to start chatting</p>
            </div>
          )}
        </div>

        {/* New Chat Modal */}
        {showNewChat && (
          <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Start New Chat</h3>
              <form onSubmit={startNewChat}>
                <input
                  type="text"
                  placeholder="Enter handle (e.g., user@node.domain)"
                  value={newChatHandle}
                  onChange={(e) => setNewChatHandle(e.target.value)}
                  autoFocus
                />
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowNewChat(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={sending || !newChatHandle.trim()}
                  >
                    Start Chat
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .chat-page {
          max-width: 1200px;
          margin: 0 auto;
          height: calc(100vh - 60px);
        }

        .chat-container {
          display: grid;
          grid-template-columns: 350px 1fr;
          height: 100%;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--background);
        }

        .chat-sidebar {
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }

        .chat-sidebar-header {
          padding: 16px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .chat-sidebar-header h2 {
          margin: 0;
          font-size: 18px;
        }

        .conversations-list {
          overflow-y: auto;
          flex: 1;
        }

        .conversation-item {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          transition: background 0.2s;
        }

        .conversation-item:hover {
          background: var(--background-secondary);
        }

        .conversation-item.active {
          background: var(--accent-muted);
        }

        .conversation-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          flex-shrink: 0;
        }

        .conversation-avatar img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .conversation-info {
          flex: 1;
          min-width: 0;
        }

        .conversation-name {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .unread-badge {
          background: var(--accent);
          color: white;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 10px;
          font-weight: 600;
        }

        .conversation-handle {
          font-size: 13px;
          color: var(--foreground-secondary);
        }

        .conversation-preview {
          font-size: 14px;
          color: var(--foreground-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 4px;
        }

        .chat-main {
          display: flex;
          flex-direction: column;
        }

        .chat-header {
          padding: 16px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .back-button {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          color: var(--foreground);
        }

        .chat-header-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
        }

        .chat-header-avatar img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .chat-header-info {
          flex: 1;
        }

        .chat-header-name {
          font-weight: 600;
        }

        .chat-header-handle {
          font-size: 13px;
          color: var(--foreground-secondary);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .message {
          display: flex;
          gap: 8px;
        }

        .message.sent {
          flex-direction: row-reverse;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .message-avatar img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .message-content {
          max-width: 70%;
        }

        .message.sent .message-content {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .message-bubble {
          padding: 12px 16px;
          border-radius: 16px;
          background: var(--background-secondary);
          word-wrap: break-word;
        }

        .message.sent .message-bubble {
          background: var(--accent);
          color: white;
        }

        .message-meta {
          font-size: 11px;
          color: var(--foreground-tertiary);
          margin-top: 4px;
          padding: 0 8px;
        }

        .chat-input {
          padding: 16px;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
        }

        .chat-input input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid var(--border);
          border-radius: 24px;
          background: var(--background-secondary);
          color: var(--foreground);
        }

        .chat-input button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-input button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--foreground-tertiary);
        }

        @media (max-width: 768px) {
          .chat-container {
            grid-template-columns: 1fr;
          }

          .mobile-hidden {
            display: none;
          }

          .back-button {
            display: block;
          }
        }
      `}</style>
    </div>
  );
}

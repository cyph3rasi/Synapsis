'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { MessageCircle, Send, ArrowLeft, Search, Plus } from 'lucide-react';
import { formatFullHandle } from '@/lib/utils/handle';
import './chat.css';

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
  const [searchQuery, setSearchQuery] = useState('');
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
        loadConversations();
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

  const filteredConversations = conversations.filter(conv =>
    conv.participant2.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.participant2.handle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!user) {
    return (
      <div className="chat-page">
        <div className="chat-empty-state">
          <MessageCircle size={64} />
          <h2>Sign in to use Swarm Chat</h2>
          <p>End-to-end encrypted messaging across the Synapsis network</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-container">
        {/* Sidebar */}
        <div className={`chat-sidebar ${selectedConversation ? 'mobile-hidden' : ''}`}>
          <div className="chat-sidebar-header">
            <h1>Messages</h1>
            <button className="btn-icon" onClick={() => setShowNewChat(true)} title="New chat">
              <Plus size={20} />
            </button>
          </div>

          <div className="chat-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="chat-loading">
              <div className="spinner" />
              <p>Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="chat-empty-state">
              <MessageCircle size={48} />
              <h3>No conversations yet</h3>
              <p>Start a chat with anyone on the swarm</p>
              <button className="btn-primary" onClick={() => setShowNewChat(true)}>
                <Plus size={18} />
                New Chat
              </button>
            </div>
          ) : (
            <div className="conversations-list">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  className={`conversation-item ${selectedConversation?.id === conv.id ? 'active' : ''}`}
                  onClick={() => setSelectedConversation(conv)}
                >
                  <div className="conversation-avatar">
                    {conv.participant2.avatarUrl ? (
                      <img src={conv.participant2.avatarUrl} alt={conv.participant2.displayName} />
                    ) : (
                      <span>{conv.participant2.displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="conversation-content">
                    <div className="conversation-header">
                      <span className="conversation-name">{conv.participant2.displayName}</span>
                      {conv.unreadCount > 0 && (
                        <span className="unread-badge">{conv.unreadCount}</span>
                      )}
                    </div>
                    <div className="conversation-handle">{formatFullHandle(conv.participant2.handle)}</div>
                    <div className="conversation-preview">{conv.lastMessagePreview}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Chat Area */}
        <div className={`chat-main ${!selectedConversation ? 'mobile-hidden' : ''}`}>
          {selectedConversation ? (
            <>
              <div className="chat-header">
                <button className="btn-icon back-button" onClick={() => setSelectedConversation(null)}>
                  <ArrowLeft size={20} />
                </button>
                <div className="chat-header-avatar">
                  {selectedConversation.participant2.avatarUrl ? (
                    <img src={selectedConversation.participant2.avatarUrl} alt="" />
                  ) : (
                    <span>{selectedConversation.participant2.displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="chat-header-info">
                  <h2>{selectedConversation.participant2.displayName}</h2>
                  <p>{formatFullHandle(selectedConversation.participant2.handle)}</p>
                </div>
              </div>

              <div className="chat-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.isSentByMe ? 'sent' : 'received'}`}>
                    {!msg.isSentByMe && (
                      <div className="message-avatar">
                        {msg.senderAvatarUrl ? (
                          <img src={msg.senderAvatarUrl} alt="" />
                        ) : (
                          <span>{(msg.senderDisplayName || msg.senderHandle).charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                    )}
                    <div className="message-content">
                      <div className="message-bubble">
                        <div className="encrypted-indicator">🔒 Encrypted</div>
                        <div className="encrypted-preview">{msg.encryptedContent.substring(0, 40)}...</div>
                      </div>
                      <div className="message-meta">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.isSentByMe && (
                          <span className="delivery-status">
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
                <button type="submit" className="btn-icon send-button" disabled={sending || !newMessage.trim()}>
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty-state">
              <MessageCircle size={64} />
              <h2>Select a conversation</h2>
              <p>Choose a conversation from the sidebar to start chatting</p>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Start New Chat</h2>
            <p>Enter the handle of the person you want to message</p>
            <form onSubmit={startNewChat}>
              <input
                type="text"
                placeholder="user@node.domain or localuser"
                value={newChatHandle}
                onChange={(e) => setNewChatHandle(e.target.value)}
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowNewChat(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={sending || !newChatHandle.trim()}>
                  Start Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

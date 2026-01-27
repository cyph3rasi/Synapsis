'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useChatEncryption } from '@/lib/hooks/useChatEncryption';
import { MessageCircle, Send, ArrowLeft, Search, Plus, Lock, Shield, Key } from 'lucide-react';
import { formatFullHandle } from '@/lib/utils/handle';
import './chat.css';

interface Conversation {
  id: string;
  participant2: { handle: string; displayName: string; avatarUrl: string | null; chatPublicKey: string | null; };
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
}

interface Message {
  id: string;
  senderHandle: string;
  senderDisplayName?: string;
  senderAvatarUrl?: string;
  senderPublicKey?: string;
  encryptedContent: string;
  decryptedContent?: string;
  isSentByMe: boolean;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { keys, isReady, hasKeys, isRegistering, needsPasswordToRestore, generateAndRegisterKeys, restoreKeysWithPassword, encryptMessage, decryptMessage } = useChatEncryption();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [newChatHandle, setNewChatHandle] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recipientPublicKey, setRecipientPublicKey] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isProcessingPassword, setIsProcessingPassword] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user && hasKeys) loadConversations(); }, [user, hasKeys]);
  useEffect(() => { if (selectedConversation && hasKeys) { loadMessages(selectedConversation.id); markAsRead(selectedConversation.id); fetchRecipientKey(selectedConversation.participant2.handle); } }, [selectedConversation, hasKeys]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchRecipientKey = async (handle: string) => { try { const res = await fetch(`/api/users/\${encodeURIComponent(handle)}`); const data = await res.json(); setRecipientPublicKey(data.user?.chatPublicKey || null); } catch { setRecipientPublicKey(null); } };
  const loadConversations = async () => { try { const res = await fetch('/api/swarm/chat/conversations'); const data = await res.json(); setConversations(data.conversations || []); } catch { /* ignore */ } finally { setLoading(false); } };
  const loadMessages = async (conversationId: string) => { try { const res = await fetch(`/api/swarm/chat/messages?conversationId=\${conversationId}`); const data = await res.json(); const decrypted = await Promise.all((data.messages || []).map(async (msg: Message) => { try { const key = msg.isSentByMe ? keys?.publicKey : msg.senderPublicKey || recipientPublicKey; if (key && msg.encryptedContent) return { ...msg, decryptedContent: await decryptMessage(msg.encryptedContent, key) }; } catch { /* ignore */ } return { ...msg, decryptedContent: '[Unable to decrypt]' }; })); setMessages(decrypted); } catch { /* ignore */ } };
  const markAsRead = async (conversationId: string) => { try { await fetch('/api/swarm/chat/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId }) }); setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c)); } catch { /* ignore */ } };
  const sendMessage = async (e: React.FormEvent) => { e.preventDefault(); if (!newMessage.trim() || !selectedConversation || !recipientPublicKey) return; setSending(true); try { const encrypted = await encryptMessage(newMessage, recipientPublicKey); const res = await fetch('/api/swarm/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientHandle: selectedConversation.participant2.handle, encryptedContent: encrypted, senderPublicKey: keys?.publicKey }) }); if (res.ok) { setMessages(prev => [...prev, { id: crypto.randomUUID(), senderHandle: user?.handle || '', encryptedContent: encrypted, decryptedContent: newMessage, isSentByMe: true, createdAt: new Date().toISOString() }]); setNewMessage(''); loadConversations(); } } catch { /* ignore */ } finally { setSending(false); } };
  const startNewChat = async (e: React.FormEvent) => { e.preventDefault(); if (!newChatHandle.trim()) return; setSending(true); try { const cleanHandle = newChatHandle.replace(/^@/, ''); const res = await fetch(`/api/users/\${encodeURIComponent(cleanHandle)}`); const data = await res.json(); if (!data.user?.chatPublicKey) { alert('This user has not enabled encrypted chat yet.'); return; } const encrypted = await encryptMessage('Hey!', data.user.chatPublicKey); const sendRes = await fetch('/api/swarm/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientHandle: cleanHandle, encryptedContent: encrypted, senderPublicKey: keys?.publicKey }) }); if (sendRes.ok) { setShowNewChat(false); setNewChatHandle(''); loadConversations(); } } catch { /* ignore */ } finally { setSending(false); } };
  const handlePasswordSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (!password) return; setPasswordError(''); setIsProcessingPassword(true); try { if (needsPasswordToRestore) { const success = await restoreKeysWithPassword(password); if (!success) { setPasswordError('Incorrect password.'); return; } } else { await generateAndRegisterKeys(password); } setShowPasswordModal(false); setPassword(''); } catch { setPasswordError('Failed. Please try again.'); } finally { setIsProcessingPassword(false); } };
  const filteredConversations = conversations.filter(conv => conv.participant2.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || conv.participant2.handle.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!user) return <div className="chat-page"><div className="chat-empty-state"><MessageCircle size={64} /><h2>Sign in to use Swarm Chat</h2><p>End-to-end encrypted messaging</p></div></div>;
  if (!isReady) return <div className="chat-page"><div className="chat-empty-state"><div className="spinner" /><p>Loading encryption...</p></div></div>;
  if (!hasKeys) return (
    <div className="chat-page">
      <div className="chat-empty-state">
        <Shield size={64} />
        <h2>{needsPasswordToRestore ? 'Restore Your Chat Keys' : 'Enable End-to-End Encryption'}</h2>
        <p>{needsPasswordToRestore ? 'Enter your password to restore your encrypted chat keys.' : 'Generate encryption keys to start secure messaging.'}</p>
        <p className="text-sm text-gray-500 mt-2"><Lock size={14} className="inline mr-1" />Your private key is encrypted with your password.</p>
        <button className="btn-primary mt-4" onClick={() => setShowPasswordModal(true)} disabled={isRegistering}><Key size={18} className="mr-2" />{needsPasswordToRestore ? 'Restore Keys' : 'Enable Encrypted Chat'}</button>
      </div>
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{needsPasswordToRestore ? 'Enter Your Password' : 'Secure Your Chat Keys'}</h2>
            <p>{needsPasswordToRestore ? 'Enter your account password to decrypt your chat keys.' : 'Enter your account password to encrypt your chat keys.'}</p>
            <form onSubmit={handlePasswordSubmit}>
              <input type="password" placeholder="Your account password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              {passwordError && <p className="text-red-500 text-sm mt-2">{passwordError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowPasswordModal(false); setPassword(''); setPasswordError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isProcessingPassword || !password}>{isProcessingPassword ? 'Processing...' : (needsPasswordToRestore ? 'Restore' : 'Enable')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="chat-page">
      <div className="chat-container">
        <div className={`chat-sidebar \${selectedConversation ? 'mobile-hidden' : ''}`}>
          <div className="chat-sidebar-header"><h1><Lock size={18} className="inline mr-2" />Messages</h1><button className="btn-icon" onClick={() => setShowNewChat(true)} title="New chat"><Plus size={20} /></button></div>
          <div className="chat-search"><Search size={18} /><input type="text" placeholder="Search conversations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
          {loading ? <div className="chat-loading"><div className="spinner" /><p>Loading...</p></div> : filteredConversations.length === 0 ? <div className="chat-empty-state"><MessageCircle size={48} /><h3>No conversations</h3><button className="btn-primary" onClick={() => setShowNewChat(true)}><Plus size={18} />New Chat</button></div> : <div className="conversations-list">{filteredConversations.map((conv) => <button key={conv.id} className={`conversation-item \${selectedConversation?.id === conv.id ? 'active' : ''}`} onClick={() => setSelectedConversation(conv)}><div className="conversation-avatar">{conv.participant2.avatarUrl ? <img src={conv.participant2.avatarUrl} alt="" /> : <span>{(conv.participant2.displayName || conv.participant2.handle).charAt(0).toUpperCase()}</span>}</div><div className="conversation-content"><div className="conversation-header"><span className="conversation-name">{conv.participant2.displayName}</span>{conv.unreadCount > 0 && <span className="unread-badge">{conv.unreadCount}</span>}</div><div className="conversation-handle">{formatFullHandle(conv.participant2.handle)}</div><div className="conversation-preview"><Lock size={12} className="inline mr-1" />{conv.lastMessagePreview}</div></div></button>)}</div>}
        </div>
        <div className={`chat-main \${!selectedConversation ? 'mobile-hidden' : ''}`}>
          {selectedConversation ? <>
            <div className="chat-header"><button className="btn-icon back-button" onClick={() => setSelectedConversation(null)}><ArrowLeft size={20} /></button><div className="chat-header-avatar">{selectedConversation.participant2.avatarUrl ? <img src={selectedConversation.participant2.avatarUrl} alt="" /> : <span>{(selectedConversation.participant2.displayName || selectedConversation.participant2.handle).charAt(0).toUpperCase()}</span>}</div><div className="chat-header-info"><h2>{selectedConversation.participant2.displayName}</h2><p><Lock size={12} className="inline mr-1" />{formatFullHandle(selectedConversation.participant2.handle)}</p></div></div>
            <div className="chat-messages"><div className="encryption-notice"><Shield size={16} /><span>Messages are end-to-end encrypted.</span></div>{messages.map((msg) => <div key={msg.id} className={`message \${msg.isSentByMe ? 'sent' : 'received'}`}>{!msg.isSentByMe && <div className="message-avatar">{msg.senderAvatarUrl ? <img src={msg.senderAvatarUrl} alt="" /> : <span>{(msg.senderDisplayName || msg.senderHandle).charAt(0).toUpperCase()}</span>}</div>}<div className="message-content"><div className="message-bubble">{msg.decryptedContent || msg.encryptedContent}</div><div className="message-meta"><span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{msg.isSentByMe && <span className="delivery-status">{msg.readAt ? '✓✓' : msg.deliveredAt ? '✓' : '○'}</span>}</div></div></div>)}<div ref={messagesEndRef} /></div>
            <form className="chat-input" onSubmit={sendMessage}><input type="text" placeholder={recipientPublicKey ? "Type a message..." : "Recipient hasn't enabled encryption..."} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} disabled={sending || !recipientPublicKey} /><button type="submit" className="btn-icon send-button" disabled={sending || !newMessage.trim() || !recipientPublicKey}><Send size={20} /></button></form>
          </> : <div className="chat-empty-state"><MessageCircle size={64} /><h2>Select a conversation</h2></div>}
        </div>
      </div>
      {showNewChat && <div className="modal-overlay" onClick={() => setShowNewChat(false)}><div className="modal-content" onClick={(e) => e.stopPropagation()}><h2>Start New Chat</h2><form onSubmit={startNewChat}><input type="text" placeholder="user@node.domain" value={newChatHandle} onChange={(e) => setNewChatHandle(e.target.value)} autoFocus /><div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setShowNewChat(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={sending || !newChatHandle.trim()}>Start Chat</button></div></form></div></div>}
    </div>
  );
}

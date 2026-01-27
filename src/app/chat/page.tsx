'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useChatEncryption } from '@/lib/hooks/useChatEncryption';
import { ArrowLeft, Send, Lock, Shield, Loader2, MessageCircle, Search, Plus, Trash2, MoreVertical } from 'lucide-react';
import { formatFullHandle } from '@/lib/utils/handle';
import { useRouter } from 'next/navigation';

interface Conversation {
    id: string;
    participant2: {
        handle: string;
        displayName: string;
        avatarUrl: string | null;
        chatPublicKey: string | null;
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
    const router = useRouter();
    const { keys, isReady, hasKeys, needsPasswordToRestore, generateAndRegisterKeys, restoreKeysWithPassword, encryptMessage, decryptMessage } = useChatEncryption();

    // Chat Data State
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
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Password/Key State
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isProcessingPassword, setIsProcessingPassword] = useState(false);

    // Encryption loading state to prevent flash
    const [encryptionChecked, setEncryptionChecked] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);

    // Check if user is scrolled to bottom
    const checkIfAtBottom = () => {
        if (!messagesContainerRef.current) return true;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const threshold = 100; // pixels from bottom
        return scrollHeight - scrollTop - clientHeight < threshold;
    };

    // Handle scroll to track if user is at bottom
    const handleScroll = () => {
        setIsAtBottom(checkIfAtBottom());
    };

    // Scroll to bottom manually
    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Wait for encryption to be ready before showing UI
    useEffect(() => {
        if (isReady) {
            setEncryptionChecked(true);
        }
    }, [isReady]);

    // Redirect if not logged in
    useEffect(() => {
        if (!user) {
            router.push('/login');
        }
    }, [user, router]);

    // Load conversations
    useEffect(() => {
        if (user && hasKeys) {
            loadConversations(true); // Initial load with spinner
            
            // Poll for new conversations every 5 seconds (no spinner)
            const pollInterval = setInterval(() => {
                loadConversations(false);
            }, 5000);
            
            return () => clearInterval(pollInterval);
        }
    }, [user, hasKeys]);

    // Load messages when conversation is selected
    useEffect(() => {
        if (selectedConversation && hasKeys) {
            loadMessages(selectedConversation.id);
            markAsRead(selectedConversation.id);
            fetchRecipientKey(selectedConversation.participant2.handle);
            
            // Poll for new messages every 3 seconds
            const pollInterval = setInterval(() => {
                loadMessages(selectedConversation.id);
            }, 3000);
            
            return () => clearInterval(pollInterval);
        }
    }, [selectedConversation, hasKeys]);

    // Auto-scroll to bottom of messages only if user was already at bottom
    useEffect(() => {
        if (messagesEndRef.current && isAtBottom) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isAtBottom]);

    const fetchRecipientKey = async (handle: string) => {
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(handle)}`);
            const data = await res.json();
            setRecipientPublicKey(data.user?.chatPublicKey || null);
        } catch {
            setRecipientPublicKey(null);
        }
    };

    const loadConversations = async (isInitialLoad = false) => {
        if (isInitialLoad) setLoading(true);
        try {
            const res = await fetch('/api/swarm/chat/conversations');
            const data = await res.json();
            setConversations(data.conversations || []);
        } catch (e) {
            console.error("Failed to load conversations", e);
        } finally {
            if (isInitialLoad) setLoading(false);
        }
    };

    const loadMessages = async (conversationId: string) => {
        try {
            let chatPartnerKey = selectedConversation?.participant2?.chatPublicKey || recipientPublicKey;

            if (!chatPartnerKey && selectedConversation?.participant2?.handle) {
                try {
                    const userRes = await fetch(`/api/users/${encodeURIComponent(selectedConversation.participant2.handle)}`);
                    const userData = await userRes.json();
                    console.log('[Chat] Fetched user data:', {
                        handle: selectedConversation.participant2.handle,
                        hasChatPublicKey: !!userData.user?.chatPublicKey,
                        hasPublicKey: !!userData.user?.publicKey,
                        chatPublicKeyLength: userData.user?.chatPublicKey?.length,
                        publicKeyLength: userData.user?.publicKey?.length,
                        chatPublicKeyStart: userData.user?.chatPublicKey?.substring(0, 20),
                        publicKeyStart: userData.user?.publicKey?.substring(0, 20),
                    });
                    chatPartnerKey = userData.user?.chatPublicKey || null;
                    if (chatPartnerKey) setRecipientPublicKey(chatPartnerKey);
                } catch (e) { console.error(e); }
            }

            const res = await fetch(`/api/swarm/chat/messages?conversationId=${conversationId}`);
            const data = await res.json();

            const decrypted = await Promise.all((data.messages || []).map(async (msg: Message & { isE2E?: boolean }) => {
                try {
                    const isE2E = !!msg.senderPublicKey;
                    if (!isE2E) return { ...msg, decryptedContent: '[Legacy message - incompatible encryption]' };

                    const otherPartyKey = msg.isSentByMe ? chatPartnerKey : msg.senderPublicKey;
                    if (!otherPartyKey) return { ...msg, decryptedContent: '[Missing encryption key]' };

                    console.log('[Chat] Decrypting message:', {
                        messageId: msg.id,
                        isSentByMe: msg.isSentByMe,
                        keyLength: otherPartyKey?.length,
                        keySource: msg.isSentByMe ? 'chatPartnerKey' : 'msg.senderPublicKey',
                        firstChars: otherPartyKey?.substring(0, 20)
                    });

                    if (msg.encryptedContent) {
                        const decrypted = await decryptMessage(msg.encryptedContent, otherPartyKey);
                        return { ...msg, decryptedContent: decrypted };
                    }
                } catch (err) {
                    console.warn('[Chat] Failed to decrypt message:', msg.id, err);
                }
                return { ...msg, decryptedContent: '[Unable to decrypt - incompatible format]' };
            }));

            setMessages(decrypted);
        } catch (err) { console.error(err); }
    };

    const markAsRead = async (conversationId: string) => {
        try {
            await fetch('/api/swarm/chat/messages', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId })
            });
            setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c));
        } catch { }
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversation || !recipientPublicKey) return;
        setSending(true);
        try {
            console.log('[Send] Starting encryption...', {
                messageLength: newMessage.length,
                recipientHandle: selectedConversation.participant2.handle,
                hasRecipientKey: !!recipientPublicKey,
                recipientKeyLength: recipientPublicKey?.length
            });
            
            const encrypted = await encryptMessage(newMessage, recipientPublicKey);
            console.log('[Send] Message encrypted, sending to server...');
            
            const res = await fetch('/api/swarm/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientHandle: selectedConversation.participant2.handle,
                    encryptedContent: encrypted,
                    senderPublicKey: keys?.publicKey
                })
            });

            console.log('[Send] Server response:', res.status, res.statusText);
            
            if (!res.ok) {
                const errorData = await res.json();
                console.error('[Send] Server error:', errorData);
                alert(`Failed to send: ${errorData.error || 'Unknown error'}`);
                return;
            }

            const result = await res.json();
            console.log('[Send] Success:', result);
            
            setNewMessage('');
            await loadMessages(selectedConversation.id);
            loadConversations(false);
        } catch (err) { 
            console.error('[Send] Error:', err);
            alert(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally { 
            setSending(false); 
        }
    };

    const startNewChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newChatHandle.trim()) return;
        setSending(true);
        try {
            const cleanHandle = newChatHandle.replace(/^@/, '');
            const res = await fetch(`/api/users/${encodeURIComponent(cleanHandle)}`);
            const data = await res.json();
            if (!data.user?.chatPublicKey) {
                alert('This user has not enabled encrypted chat yet.');
                return;
            }
            const encrypted = await encryptMessage('Hey! 👋', data.user.chatPublicKey);
            const sendRes = await fetch('/api/swarm/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientHandle: cleanHandle,
                    encryptedContent: encrypted,
                    senderPublicKey: keys?.publicKey
                })
            });
            if (sendRes.ok) {
                setShowNewChat(false);
                setNewChatHandle('');
                loadConversations(false);
            }
        } catch { }
        finally { setSending(false); }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        setPasswordError('');
        setIsProcessingPassword(true);
        try {
            if (needsPasswordToRestore) {
                const success = await restoreKeysWithPassword(password);
                if (!success) { setPasswordError('Incorrect password.'); return; }
            } else {
                await generateAndRegisterKeys(password);
            }
            setShowPasswordInput(false);
            setPassword('');
        } catch (err) {
            setPasswordError('Failed. Please try again.');
        } finally {
            setIsProcessingPassword(false);
        }
    };

    const handleDeleteConversation = async (deleteFor: 'self' | 'both') => {
        if (!conversationToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/swarm/chat/conversations/${conversationToDelete.id}?deleteFor=${deleteFor}`, {
                method: 'DELETE',
            });
            
            if (res.ok) {
                // Remove from local state
                setConversations(prev => prev.filter(c => c.id !== conversationToDelete.id));
                
                // If we're viewing this conversation, go back to list
                if (selectedConversation?.id === conversationToDelete.id) {
                    setSelectedConversation(null);
                }
                
                setShowDeleteModal(false);
                setConversationToDelete(null);
            } else {
                alert('Failed to delete conversation');
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete conversation');
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredConversations = conversations.filter((conv) =>
        conv.participant2.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.participant2.handle.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!user) return null;

    // Show loading while checking encryption status
    if (!encryptionChecked) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--foreground-tertiary)' }} />
            </div>
        );
    }

    // Encryption Setup Screen
    if (!hasKeys) {
        return (
            <div className="container" style={{ maxWidth: '500px', paddingTop: '80px', paddingBottom: '80px' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'var(--background-secondary)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 24px'
                    }}>
                        <Shield size={40} style={{ color: 'var(--accent)' }} />
                    </div>

                    <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px' }}>
                        {needsPasswordToRestore ? 'Unlock Messages' : 'Secure Messaging'}
                    </h1>

                    <p style={{ color: 'var(--foreground-secondary)', marginBottom: '32px', lineHeight: 1.6 }}>
                        {needsPasswordToRestore
                            ? 'Enter your password to decrypt your conversation history.'
                            : 'End-to-end encryption keeps your personal messages private.'}
                    </p>

                    {needsPasswordToRestore && (
                        <div style={{
                            fontSize: '13px',
                            color: 'var(--foreground-tertiary)',
                            marginBottom: '24px',
                            padding: '12px',
                            background: 'var(--background-secondary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)'
                        }}>
                            Having issues? You can{' '}
                            <button
                                onClick={() => {
                                    if (confirm('This will delete your local encryption keys. You\'ll need to set up encryption again. Continue?')) {
                                        localStorage.removeItem('synapsis_chat_private_key');
                                        localStorage.removeItem('synapsis_chat_public_key');
                                        window.location.reload();
                                    }
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--accent)',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    padding: 0,
                                    font: 'inherit'
                                }}
                            >
                                reset your encryption keys
                            </button>
                            {' '}and start fresh.
                        </div>
                    )}

                    {!showPasswordInput ? (
                        <button onClick={() => setShowPasswordInput(true)} className="btn btn-primary">
                            {needsPasswordToRestore ? 'Restore Keys' : 'Enable Encryption'}
                        </button>
                    ) : (
                        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input
                                type="password"
                                className="input"
                                placeholder="Enter your password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoFocus
                            />

                            {passwordError && (
                                <div style={{
                                    color: 'var(--error)',
                                    fontSize: '13px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid rgba(239, 68, 68, 0.2)'
                                }}>
                                    {passwordError}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => { setShowPasswordInput(false); setPasswordError(''); }}
                                    className="btn btn-ghost"
                                    style={{ flex: 1 }}
                                    disabled={isProcessingPassword}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{ flex: 2 }}
                                    disabled={!password || isProcessingPassword}
                                >
                                    {isProcessingPassword ? <Loader2 className="animate-spin" size={18} /> : 'Confirm'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    // Thread View
    if (selectedConversation) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '600px', margin: '0 auto' }}>
                {/* Header */}
                <div className="post" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--background)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            onClick={() => setSelectedConversation(null)}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: '8px',
                                cursor: 'pointer',
                                color: 'var(--foreground)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--background-secondary)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="avatar">
                            {selectedConversation.participant2.avatarUrl ? (
                                <img src={selectedConversation.participant2.avatarUrl} alt="" />
                            ) : (
                                selectedConversation.participant2.displayName[0]
                            )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{selectedConversation.participant2.displayName}</div>
                            <div style={{ fontSize: '13px', color: 'var(--foreground-tertiary)' }}>
                                {formatFullHandle(selectedConversation.participant2.handle)}
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setConversationToDelete(selectedConversation);
                                setShowDeleteModal(true);
                            }}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: '8px',
                                cursor: 'pointer',
                                color: 'var(--foreground-tertiary)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--background-secondary)';
                                e.currentTarget.style.color = 'var(--error)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'none';
                                e.currentTarget.style.color = 'var(--foreground-tertiary)';
                            }}
                            title="Delete conversation"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div 
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    style={{ 
                        padding: '16px', 
                        flex: 1,
                        overflowY: 'auto',
                        paddingBottom: '16px',
                        position: 'relative'
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {messages.map(msg => (
                            <div key={msg.id} style={{
                                display: 'flex',
                                gap: '12px',
                                maxWidth: '70%',
                                marginLeft: msg.isSentByMe ? 'auto' : '0',
                                flexDirection: msg.isSentByMe ? 'row-reverse' : 'row'
                            }}>
                                <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>
                                    {msg.isSentByMe ? (
                                        user.avatarUrl ? (
                                            <img src={user.avatarUrl} alt="" />
                                        ) : (
                                            user.displayName[0]
                                        )
                                    ) : (
                                        msg.senderAvatarUrl ? (
                                            <img src={msg.senderAvatarUrl} alt="" />
                                        ) : (
                                            msg.senderDisplayName?.[0]
                                        )
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.isSentByMe ? 'flex-end' : 'flex-start' }}>
                                    <div style={{
                                        padding: '10px 14px',
                                        borderRadius: '16px',
                                        background: msg.isSentByMe ? 'var(--accent)' : 'var(--background-secondary)',
                                        color: msg.isSentByMe ? '#000' : 'var(--foreground)',
                                        border: msg.isSentByMe ? 'none' : '1px solid var(--border)',
                                        wordBreak: 'break-word'
                                    }}>
                                        {msg.decryptedContent || msg.encryptedContent}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--foreground-tertiary)', marginTop: '4px' }}>
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Scroll to bottom button */}
                    {!isAtBottom && (
                        <button
                            onClick={scrollToBottom}
                            style={{
                                position: 'absolute',
                                bottom: '16px',
                                right: '24px',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'var(--accent)',
                                color: '#000',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                zIndex: 5
                            }}
                            aria-label="Scroll to bottom"
                        >
                            ↓
                        </button>
                    )}
                </div>

                {/* Input */}
                <div 
                    className="compose" 
                    style={{
                        borderTop: '1px solid var(--border)',
                        background: 'var(--background)',
                        flexShrink: 0
                    }}
                >
                    <form onSubmit={sendMessage} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                            type="text"
                            className="input"
                            style={{ flex: 1 }}
                            placeholder="Type a message..."
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim() || sending}
                            className="btn btn-primary"
                        >
                            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Conversations List
    return (
        <>
            {/* Header */}
            <div className="post" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Messages</h1>
                    {!showNewChat && (
                        <button
                            onClick={() => setShowNewChat(true)}
                            className="btn btn-primary btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Plus size={16} />
                            New
                        </button>
                    )}
                </div>

                {showNewChat ? (
                    <form onSubmit={startNewChat} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <input
                            type="text"
                            placeholder="Enter handle (@username)"
                            className="input"
                            value={newChatHandle}
                            onChange={e => setNewChatHandle(e.target.value)}
                            autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setShowNewChat(false)}
                                className="btn btn-ghost btn-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary btn-sm"
                                disabled={!newChatHandle.trim() || sending}
                            >
                                {sending ? <Loader2 size={14} className="animate-spin" /> : 'Start Chat'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'var(--background-secondary)',
                        borderRadius: 'var(--radius-full)',
                        padding: '8px 16px',
                        border: '1px solid var(--border)'
                    }}>
                        <Search size={16} style={{ color: 'var(--foreground-tertiary)' }} />
                        <input
                            type="text"
                            placeholder="Search conversations"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                flex: 1,
                                color: 'var(--foreground)',
                                fontSize: '14px'
                            }}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* Conversations */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--foreground-tertiary)' }} />
                </div>
            ) : filteredConversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--foreground-tertiary)' }}>
                    <MessageCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                    <h3 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px', color: 'var(--foreground)' }}>
                        No conversations yet
                    </h3>
                    <p style={{ fontSize: '14px', marginBottom: '16px' }}>
                        Start a conversation with someone on the network.
                    </p>
                    <button onClick={() => setShowNewChat(true)} className="btn btn-primary">
                        New Message
                    </button>
                </div>
            ) : (
                filteredConversations.map(conv => (
                    <div
                        key={conv.id}
                        className="post"
                        style={{ 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            position: 'relative'
                        }}
                    >
                        <div 
                            onClick={() => setSelectedConversation(conv)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: 0 }}
                        >
                            <div className="avatar">
                                {conv.participant2.avatarUrl ? (
                                    <img src={conv.participant2.avatarUrl} alt="" />
                                ) : (
                                    conv.participant2.displayName[0]
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 600 }}>{conv.participant2.displayName}</span>
                                    {conv.unreadCount > 0 && (
                                        <span style={{
                                            background: 'var(--accent)',
                                            color: '#000',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            borderRadius: '10px',
                                            padding: '2px 8px',
                                            minWidth: '20px',
                                            textAlign: 'center'
                                        }}>
                                            {conv.unreadCount}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', marginBottom: '4px' }}>
                                    {formatFullHandle(conv.participant2.handle)}
                                </div>
                                <div style={{
                                    fontSize: '14px',
                                    color: conv.unreadCount > 0 ? 'var(--foreground)' : 'var(--foreground-secondary)',
                                    fontWeight: conv.unreadCount > 0 ? 500 : 400,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {conv.lastMessagePreview === 'New message' ? 'Encrypted Message' : conv.lastMessagePreview}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setConversationToDelete(conv);
                                setShowDeleteModal(true);
                            }}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: '8px',
                                cursor: 'pointer',
                                color: 'var(--foreground-tertiary)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.15s',
                                flexShrink: 0
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--background-secondary)';
                                e.currentTarget.style.color = 'var(--error)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'none';
                                e.currentTarget.style.color = 'var(--foreground-tertiary)';
                            }}
                            title="Delete conversation"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && conversationToDelete && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '16px'
                    }}
                    onClick={() => {
                        if (!isDeleting) {
                            setShowDeleteModal(false);
                            setConversationToDelete(null);
                        }
                    }}
                >
                    <div
                        className="card"
                        style={{
                            maxWidth: '400px',
                            width: '100%',
                            padding: '24px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'rgba(239, 68, 68, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Trash2 size={20} style={{ color: 'var(--error)' }} />
                            </div>
                            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                                Delete Conversation
                            </h2>
                        </div>

                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
                            Delete your conversation with <strong>{conversationToDelete.participant2.displayName}</strong>?
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                                onClick={() => handleDeleteConversation('self')}
                                disabled={isDeleting}
                                className="btn btn-ghost"
                                style={{
                                    justifyContent: 'flex-start',
                                    textAlign: 'left',
                                    padding: '12px 16px'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500 }}>Delete for me</div>
                                    <div style={{ fontSize: '13px', color: 'var(--foreground-tertiary)', marginTop: '2px' }}>
                                        Remove this conversation from your inbox only
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={() => handleDeleteConversation('both')}
                                disabled={isDeleting}
                                className="btn btn-ghost"
                                style={{
                                    justifyContent: 'flex-start',
                                    textAlign: 'left',
                                    padding: '12px 16px',
                                    color: 'var(--error)'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500 }}>Delete for both</div>
                                    <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '2px' }}>
                                        Remove this conversation for you and {conversationToDelete.participant2.displayName}
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setConversationToDelete(null);
                                }}
                                disabled={isDeleting}
                                className="btn btn-primary"
                                style={{ marginTop: '8px' }}
                            >
                                {isDeleting ? <Loader2 size={18} className="animate-spin" /> : 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

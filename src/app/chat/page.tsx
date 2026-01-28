
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSodiumChat } from '@/lib/hooks/useSodiumChat';
import { ArrowLeft, Send, Lock, Shield, Loader2, MessageCircle, Search, Plus, Trash2, MoreVertical } from 'lucide-react';
import { formatFullHandle } from '@/lib/utils/handle';
import { useRouter, useSearchParams } from 'next/navigation';

interface Conversation {
    id: string;
    participant2: {
        handle: string;
        displayName: string;
        avatarUrl: string | null;
        did?: string; // Add DID support
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
    senderDid?: string; // V2 needs DID
    senderPublicKey?: string; // Legacy
    encryptedContent: string;
    decryptedContent?: string;
    isSentByMe: boolean;
    deliveredAt?: string;
    readAt?: string;
    createdAt: string;
}

export default function ChatPage() {
    const { user, isIdentityUnlocked, setShowUnlockPrompt } = useAuth();
    const router = useRouter();
    // Libsodium E2EE Hook
    const { isReady, status, sendMessage, decryptMessage } = useSodiumChat();
    const searchParams = useSearchParams();
    const composeHandle = searchParams.get('compose');

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
    const [loadingMessages, setLoadingMessages] = useState(false);

    // Cache for decrypted messages to avoid re-decrypting on every poll
    const decryptedCacheRef = useRef<Map<string, string>>(new Map());
    // Track which messages we've attempted to decrypt (even if they failed)
    const attemptedDecryptionRef = useRef<Set<string>>(new Set());
    // Track the current conversation ID to prevent race conditions
    const currentConversationIdRef = useRef<string | null>(null);

    // Load conversations
    useEffect(() => {
        if (user && isReady) {
            loadConversations(true); // Initial load with spinner

            // Poll for new conversations every 5 seconds (no spinner)
            const pollInterval = setInterval(() => {
                loadConversations(false);
            }, 5000);

            return () => clearInterval(pollInterval);
        }
    }, [user, isReady]);

    // Handle Compose Intent
    useEffect(() => {
        if (composeHandle && isReady && !selectedConversation && conversations.length >= 0) {
            // Check if we already have a conversation with this user
            const existing = conversations.find(c =>
                c.participant2.handle.toLowerCase() === composeHandle.toLowerCase()
            );

            if (existing) {
                setSelectedConversation(existing);
                // Clear the query param so refresh doesn't keep resetting state
                router.replace('/chat', { scroll: false });
            } else if (!loading) {
                // Fetch user details to create a draft conversation
                const fetchUserAndInitDraft = async () => {
                    try {
                        const res = await fetch(`/api/users/${encodeURIComponent(composeHandle)}`);
                        const data = await res.json();
                        if (data.user) {
                            const draftConv: Conversation = {
                                id: 'new',
                                participant2: {
                                    handle: data.user.handle,
                                    displayName: data.user.displayName || data.user.handle,
                                    avatarUrl: data.user.avatarUrl,
                                    did: data.user.did
                                },
                                lastMessageAt: new Date().toISOString(),
                                lastMessagePreview: 'New Conversation',
                                unreadCount: 0
                            };
                            setSelectedConversation(draftConv);
                            router.replace('/chat', { scroll: false });
                        }
                    } catch (e) {
                        console.error("Failed to load user for compose", e);
                    }
                };
                fetchUserAndInitDraft();
            }
        }
    }, [composeHandle, isReady, selectedConversation, conversations, loading, router]);


    // Legacy / V2 Hybrid State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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

    // Redirect if not logged in
    useEffect(() => {
        if (user === null) {
            router.push('/login');
        }
    }, [user, router]);

    // Load messages when conversation is selected
    useEffect(() => {
        if (selectedConversation && isReady) {
            // Update current conversation ref
            currentConversationIdRef.current = selectedConversation.id;

            // Clear messages immediately to prevent flash
            setMessages([]);

            if (selectedConversation.id === 'new') {
                setLoadingMessages(false);
                return; // Don't load messages for new/draft conversation
            }

            setLoadingMessages(true);

            loadMessages(selectedConversation.id);
            markAsRead(selectedConversation.id);

            // Poll for new messages every 3 seconds
            const pollInterval = setInterval(() => {
                // Only load if still the same conversation
                if (currentConversationIdRef.current === selectedConversation.id && selectedConversation.id !== 'new') {
                    loadMessages(selectedConversation.id);
                }
            }, 3000);

            return () => clearInterval(pollInterval);
        } else if (!selectedConversation) {
            // Clear messages when no conversation selected
            currentConversationIdRef.current = null;
            setMessages([]);
            setLoadingMessages(false);
        }
    }, [selectedConversation, isReady]);

    // Auto-scroll to bottom of messages only if user was already at bottom
    useEffect(() => {
        if (messagesEndRef.current && isAtBottom) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isAtBottom]);

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
            const res = await fetch(`/api/swarm/chat/messages?conversationId=${conversationId}`);
            const data = await res.json();

            const decrypted = await Promise.all((data.messages || []).map(async (msg: any) => {
                try {
                    // Check cache first
                    const cacheKey = `${msg.id}`;
                    const cached = decryptedCacheRef.current.get(cacheKey);
                    if (cached) {
                        return { ...msg, decryptedContent: cached };
                    }

                    // Check if already attempted
                    if (attemptedDecryptionRef.current.has(cacheKey)) {
                        const fallback = decryptedCacheRef.current.get(cacheKey) || '🔒 [Encrypted]';
                        return { ...msg, decryptedContent: fallback };
                    }

                    // Mark as attempted
                    attemptedDecryptionRef.current.add(cacheKey);

                    // Parse libsodium message format
                    if (msg.encryptedContent && msg.encryptedContent.startsWith('{')) {
                        try {
                            const envelope = JSON.parse(msg.encryptedContent);

                            // Libsodium format: {senderPublicKey, recipientDid, ciphertext, nonce}
                            if (envelope.senderPublicKey && envelope.ciphertext && envelope.nonce) {
                                // For decryption with crypto_box_open_easy:
                                // - We need the OTHER party's public key
                                // - We use OUR private key

                                // console.log('[Chat UI] Decrypting message:', {
                                //     isSentByMe: msg.isSentByMe,
                                //     recipientDid: envelope.recipientDid,
                                //     senderPublicKey: envelope.senderPublicKey?.substring(0, 20) + '...'
                                // });

                                // If I sent this message, the "other party" is the recipient
                                // If I received this message, the "other party" is the sender
                                let otherPartyPublicKey = envelope.senderPublicKey;

                                if (msg.isSentByMe && envelope.recipientDid) {
                                    // I'm the sender, so I need the recipient's public key to decrypt my own message
                                    try {
                                        const keyRes = await fetch(`/api/chat/keys?did=${encodeURIComponent(envelope.recipientDid)}`);
                                        if (keyRes.ok) {
                                            const keyData = await keyRes.json();
                                            otherPartyPublicKey = keyData.publicKey;
                                            // console.log('[Chat UI] Fetched recipient public key:', otherPartyPublicKey?.substring(0, 20) + '...');
                                        }
                                    } catch (e) {
                                        console.error('[Chat UI] Failed to fetch recipient key:', e);
                                    }
                                } else {
                                    // console.log('[Chat UI] Using sender public key from envelope');
                                }

                                const plaintext = await decryptMessage(
                                    envelope.ciphertext,
                                    envelope.nonce,
                                    otherPartyPublicKey
                                );

                                decryptedCacheRef.current.set(cacheKey, plaintext);
                                return { ...msg, decryptedContent: plaintext };
                            }
                        } catch (e) {
                            console.error('[Chat UI] Libsodium decryption failed:', e);
                        }
                    }

                    // Fallback
                    const fallback = '🔒 [Encrypted - refresh page]';
                    decryptedCacheRef.current.set(cacheKey, fallback);
                    return { ...msg, decryptedContent: fallback };
                } catch (err) {
                    console.error('[Chat UI] Message processing error:', err);
                    return { ...msg, decryptedContent: '[Error]' };
                }
            }));

            setMessages(decrypted);
        } catch (err) {
            console.error('[Chat UI] Load messages error:', err);
        }
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

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversation) return;
        setSending(true);
        try {
            // Get recipient DID
            let did = selectedConversation.participant2.did;

            if (!did) {
                const res = await fetch(`/api/users/${encodeURIComponent(selectedConversation.participant2.handle)}`);
                const data = await res.json();
                did = data.user?.did;
                if (!did) throw new Error('User not found');
            }

            // Send using Signal Protocol
            await sendMessage(did, newMessage, selectedConversation.participant2.handle);

            setNewMessage('');

            // If this was a new conversation, we need to refresh the conversation list and select the real one
            if (selectedConversation.id === 'new') {
                // Refresh conversations to get the new ID
                const res = await fetch('/api/swarm/chat/conversations');
                const data = await res.json();
                const updatedConversations = data.conversations || [];
                setConversations(updatedConversations);

                // Find the real conversation
                const realConv = updatedConversations.find((c: Conversation) =>
                    c.participant2.handle === selectedConversation.participant2.handle
                );

                if (realConv) {
                    setSelectedConversation(realConv);
                    loadMessages(realConv.id);
                }
            } else {
                await loadMessages(selectedConversation.id);
                loadConversations(false);
            }
        } catch (err: any) {
            console.error('[Send] Error:', err);
            alert(`Failed: ${err.message}`);
        } finally {
            setSending(false);
        }
    };

    const startNewChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newChatHandle.trim()) return;
        setSending(true);
        try {
            let cleanHandle = newChatHandle.replace(/^@/, '');

            // If the handle includes a domain, check if it's our local domain
            if (cleanHandle.includes('@')) {
                const [handle, domain] = cleanHandle.split('@');
                const localDomain = process.env.NEXT_PUBLIC_NODE_DOMAIN || window.location.host;

                // If it's our local domain, strip it for the API call
                if (domain === localDomain) {
                    cleanHandle = handle;
                }
            }

            const res = await fetch(`/api/users/${encodeURIComponent(cleanHandle)}`);
            const data = await res.json();

            if (!data.user?.did) {
                alert('User not found or Olm encryption not enabled.');
                setSending(false);
                return;
            }

            // Previously we auto-sent "👋" here.
            // Now we just setup the draft conversation.

            // Check if existing conversation
            const existing = conversations.find(c =>
                c.participant2.handle.toLowerCase() === data.user.handle.toLowerCase()
            );

            if (existing) {
                setSelectedConversation(existing);
            } else {
                // Setup draft
                const draftConv: Conversation = {
                    id: 'new',
                    participant2: {
                        handle: data.user.handle,
                        displayName: data.user.displayName || data.user.handle,
                        avatarUrl: data.user.avatarUrl,
                        did: data.user.did
                    },
                    lastMessageAt: new Date().toISOString(),
                    lastMessagePreview: 'New Conversation',
                    unreadCount: 0
                };
                setSelectedConversation(draftConv);
            }

            setShowNewChat(false);
            setNewChatHandle('');
        } catch (e: any) {
            console.error('[Chat UI] Start chat failed:', e);
            if (e.message.includes('Recipient keys not found') || e.message.includes('Failed to fetch recipient keys')) {
                alert('This user has not set up secure chat yet. They need to log in to enable end-to-end encryption.');
            } else {
                alert('Failed to start chat: ' + e.message);
            }
        } finally {
            setSending(false);
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
                setConversations(prev => prev.filter(c => c.id !== conversationToDelete.id));
                if (selectedConversation?.id === conversationToDelete.id) {
                    setSelectedConversation(null);
                }
                setShowDeleteModal(false);
                setConversationToDelete(null);
            }
        } catch (err) {
            alert('Failed to delete');
        } finally {
            setIsDeleting(false);
        }
    };


    const filteredConversations = conversations.filter((conv) =>
        conv.participant2.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.participant2.handle.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (user === null) return null;

    // Identity Locked State
    if (!isIdentityUnlocked) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px' }}>
                <Lock size={48} style={{ color: 'rgb(251, 191, 36)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Identity Locked</h2>
                <p style={{ color: 'var(--foreground-secondary)', maxWidth: '400px', textAlign: 'center' }}>
                    End-to-end encrypted chat requires your identity to be unlocked. Your private keys are needed to encrypt and decrypt messages.
                </p>
                <button
                    onClick={() => setShowUnlockPrompt(true)}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Shield size={16} />
                    Unlock Identity
                </button>
            </div>
        );
    }

    // Error State
    if (status === 'error') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <Shield size={48} style={{ color: 'var(--destructive)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Connection Failed</h2>
                <p style={{ color: 'var(--foreground-secondary)', maxWidth: '300px', textAlign: 'center' }}>
                    Unable to initialize secure chat. Please refresh the page to try again.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="btn btn-primary"
                >
                    Refresh Page
                </button>
            </div>
        );
    }

    // Loading State
    if (!isReady || status === 'initializing') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="animate-spin" size={32} />
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
                            style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: 'var(--foreground)' }}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="avatar">
                            {selectedConversation.participant2.avatarUrl ? (
                                <img src={selectedConversation.participant2.avatarUrl} alt="" />
                            ) : (
                                selectedConversation.participant2.displayName[0] || '?'
                            )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{selectedConversation.participant2.displayName}</div>
                            <div style={{ fontSize: '13px', color: 'var(--foreground-tertiary)' }}>
                                {formatFullHandle(selectedConversation.participant2.handle)}
                            </div>
                        </div>
                        <button
                            onClick={() => { setConversationToDelete(selectedConversation); setShowDeleteModal(true); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--foreground-tertiary)' }}
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
                        {messages.map((msg, i) => (
                            <div key={msg.id || i} style={{
                                display: 'flex',
                                gap: '12px',
                                maxWidth: '70%',
                                marginLeft: msg.isSentByMe ? 'auto' : '0',
                                flexDirection: msg.isSentByMe ? 'row-reverse' : 'row'
                            }}>
                                <div className="avatar avatar-sm" style={{ flexShrink: 0 }}>
                                    {msg.isSentByMe ? (
                                        user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName[0]
                                    ) : (
                                        msg.senderAvatarUrl ? <img src={msg.senderAvatarUrl} alt="" /> : msg.senderDisplayName?.[0]
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
                </div>

                {/* Input */}
                <div className="compose" style={{ borderTop: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0 }}>
                    <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                            type="text"
                            className="input"
                            style={{ flex: 1 }}
                            placeholder="Type a message..."
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                        />
                        <button type="submit" disabled={!newMessage.trim() || sending} className="btn btn-primary">
                            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </form>
                </div>
                {/* Delete Modal */}
                {showDeleteModal && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 50
                    }}>
                        <div style={{
                            background: 'var(--background)',
                            padding: '24px',
                            borderRadius: '16px',
                            width: '100%',
                            maxWidth: '320px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}>
                            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: 600 }}>Delete Conversation</h3>
                            <p style={{ color: 'var(--foreground-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                                This action cannot be undone.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteConversation('self')}
                                    className="btn"
                                    style={{ justifyContent: 'center', width: '100%' }}
                                >
                                    Delete for me
                                </button>
                                <button
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteConversation('both')}
                                    className="btn btn-danger" // Assuming btn-danger exists or falls back
                                    style={{ justifyContent: 'center', width: '100%', color: 'var(--destructive)', background: 'var(--destructive-10)' }}
                                >
                                    Delete for everyone
                                </button>
                                <button
                                    disabled={isDeleting}
                                    onClick={() => setShowDeleteModal(false)}
                                    className="btn btn-ghost"
                                    style={{ justifyContent: 'center', width: '100%' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // LIST VIEW
    return (
        <>
            <div className="post" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Messages</h1>
                    <button onClick={() => setShowNewChat(true)} className="btn btn-primary btn-sm">
                        <Plus size={16} style={{ marginRight: 6 }} /> New
                    </button>
                </div>

                {showNewChat ? (
                    <form onSubmit={startNewChat} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <input
                            type="text"
                            placeholder="@username"
                            className="input"
                            value={newChatHandle}
                            onChange={e => setNewChatHandle(e.target.value)}
                            autoFocus
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button type="button" onClick={() => setShowNewChat(false)} className="btn btn-ghost btn-sm">Cancel</button>
                            <button type="submit" className="btn btn-primary btn-sm" disabled={sending}>Start</button>
                        </div>
                    </form>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--background-secondary)', borderRadius: 'var(--radius-full)', padding: '8px 16px', border: '1px solid var(--border)' }}>
                        <Search size={16} style={{ color: 'var(--foreground-tertiary)' }} />
                        <input
                            type="text"
                            placeholder="Search..."
                            style={{ background: 'transparent', border: 'none', outline: 'none', flex: 1, color: 'var(--foreground)' }}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                    <Loader2 className="animate-spin" size={32} />
                </div>
            ) : filteredConversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--foreground-tertiary)' }}>
                    <MessageCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                    <p>No conversations yet</p>
                </div>
            ) : (
                filteredConversations.map(conv => (
                    <div
                        key={conv.id}
                        className="post"
                        onClick={() => {
                            setMessages([]);
                            setSelectedConversation(conv);
                        }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '12px' }}
                    >
                        <div className="avatar">
                            {conv.participant2.avatarUrl ? <img src={conv.participant2.avatarUrl} alt="" /> : conv.participant2.displayName[0]}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600 }}>{conv.participant2.displayName}</span>
                                {conv.unreadCount > 0 && <span className="badge">{conv.unreadCount}</span>}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--foreground-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {conv.lastMessagePreview}
                            </div>
                        </div>
                    </div>
                ))
            )}
        </>
    );
}

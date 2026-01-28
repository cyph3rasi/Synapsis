
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useChatEncryption } from '@/lib/hooks/useChatEncryption';
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
    const { user, setShowUnlockPrompt } = useAuth();
    const router = useRouter();
    // V2 Hook Destructuring
    const { isReady, isLocked, status, ensureReady, sendMessage, decryptMessage } = useChatEncryption();
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

    // Handle Compose Intent
    useEffect(() => {
        if (composeHandle && isReady && !selectedConversation && !showNewChat) {
            setNewChatHandle(composeHandle);
            setShowNewChat(true);
            // We could auto-submit here if we refactored startNewChat to be separate from event hnadler
        }
    }, [composeHandle, isReady, selectedConversation, showNewChat]);


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

    // Load conversations
    useEffect(() => {
        if (user && isReady) {
            // ... existing loadConversations code ...
            loadConversations(true); // Initial load with spinner

            // Poll for new conversations every 5 seconds (no spinner)
            const pollInterval = setInterval(() => {
                loadConversations(false);
            }, 5000);

            return () => clearInterval(pollInterval);
        }
    }, [user, isReady]);

    // Load messages when conversation is selected
    useEffect(() => {
        if (selectedConversation && isReady) {
            loadMessages(selectedConversation.id);
            markAsRead(selectedConversation.id);

            // Poll for new messages every 3 seconds
            const pollInterval = setInterval(() => {
                loadMessages(selectedConversation.id);
            }, 3000);

            return () => clearInterval(pollInterval);
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

            // Resolve DIDs if needed?
            // V2: We need Sender DID to decrypt. 
            // The API response should include senderDid if possible.
            // If not, we have handle.
            // But encryption is bound to DID.
            // We'll rely on `senderNodeDomain`?

            const decrypted = await Promise.all((data.messages || []).map(async (msg: any) => {
                try {
                    // Try V2 Decryption
                    // Construct a fake envelope-like structure expected by our hook
                    // We assume `encryptedContent` IS the V2 payload JSON.
                    // And we need `senderDid`.
                    // Does msg have `senderDid`?
                    // If not, we might need to resolve it or `senderHandle`.
                    // Let's guess senderDid from cache or user info?

                    let senderDid = msg.senderDid;
                    if (!senderDid) {
                        // Fallback: This might fail if we don't know the DID.
                        // Can we resolve handle?
                        // Ideally the backend message object includes DID.
                        // If not, decryption returns error.
                    }

                    // Note: In V2, 'isSentByMe' means we can decrypt using OUR session with recipient?
                    // No, `isSentByMe` means WE encrypted it.
                    // We should have stored the `plaintext` locally or a `self-encrypted` copy?
                    // Ratchet implementations often encrypt a copy for the sender.
                    // My `sendMessage` implementation (Step 488) did NOT encrypt for self explicitly in the DB payload logic.
                    // However, `api/chat/send` stored `envelope` in `chatInbox` (Local).
                    // If `isSentByMe`, the `recipientDeviceId` in the stored envelope is... ?
                    // In `sendMessage`, I iterated over Recipient Bundles.
                    // I did NOT creating a bundle for myself.
                    // SO: I cannot decrypt my own sent messages unless I stored them plaintext or self-encrypted.
                    // In the previous V2 hook, I updated `activeMessages` optimistically.

                    // If these messages are "Me" messages from another device, I can't read them!
                    // This is a known V2 Ratchet limitation if not explicitly handling "Self-Send".
                    // For now, I'll display "[Encrypted Sync]" or similar if I can't decrypt.

                    if (msg.isSentByMe) {
                        // Optimistic approach: We might not be able to decrypt our own history from other devices yet.
                        // Unless I implement "Encrypt to Self" loop.
                        // I will display the content if it's plaintext (legacy) or placeholder.
                        if (!msg.encryptedContent) return msg;
                        // return { ...msg, decryptedContent: '[Sent Message]' };
                    }

                    // encryptedContent is now the full envelope JSON
                    if (msg.encryptedContent && msg.encryptedContent.startsWith('{')) {
                        try {
                            const envelope = JSON.parse(msg.encryptedContent);
                            // envelope contains { did, handle, ciphertext }
                            const envelopeMock = {
                                did: envelope.did,
                                data: {
                                    ciphertext: envelope.ciphertext
                                }
                            };
                            const dec = await decryptMessage(envelopeMock);
                            if (!dec.startsWith('[')) {
                                return { ...msg, decryptedContent: dec };
                            }
                        } catch (e) {
                            console.error('[Chat] Failed to parse envelope:', e);
                        }
                    }

                    // Legacy Message types?
                    if (!msg.senderPublicKey && !msg.encryptedContent.startsWith('{')) {
                        return { ...msg, decryptedContent: '[Legacy Message]' };
                    }

                    return { ...msg, decryptedContent: '[Encrypted]' };
                } catch (err) {
                    return { ...msg, decryptedContent: '[Error]' };
                }
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

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversation) return;
        setSending(true);
        try {
            // Need Recipient DID.
            // conversation.participant2 might have valid handle.
            // We resolve DID first.
            let did = selectedConversation.participant2.did;
            // We need to support nodeDomain for existing chats too.
            // But Conversation interface might lack it.
            // We can try to resolve it from handle if needed, or if we stored it?
            // "participant2" comes from API.
            // Let's assume we re-fetch to be safe if it's remote?
            // Or just check handle structure?
            let nodeDomain = undefined;
            if (selectedConversation.participant2.handle.includes('@')) {
                const parts = selectedConversation.participant2.handle.split('@');
                if (parts.length === 2) nodeDomain = parts[1];
            }

            if (!did) {
                const res = await fetch(`/api/users/${encodeURIComponent(selectedConversation.participant2.handle)}`);
                const data = await res.json();
                did = data.user?.did;
                nodeDomain = data.user?.nodeDomain || nodeDomain; // API is authoritative
                if (!did) throw new Error('User not found');
            }

            await sendMessage(did, newMessage, nodeDomain, selectedConversation.participant2.handle);

            // Legacy UI expects message reload.
            setNewMessage('');
            await loadMessages(selectedConversation.id);
            loadConversations(false);
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
            const cleanHandle = newChatHandle.replace(/^@/, '');
            const res = await fetch(`/api/users/${encodeURIComponent(cleanHandle)}`);
            const data = await res.json();
            if (!data.user?.did) {
                alert('User not found or V2 not enabled.');
                setSending(false);
                return;
            }

            console.log('[Chat UI] Starting chat with:', data.user);

            // Send "Hello" to init session
            await sendMessage(data.user.did, '👋', data.user.nodeDomain, data.user.handle);

            console.log('[Chat UI] Message sent, reloading conversations');

            setShowNewChat(false);
            setNewChatHandle('');
            await loadConversations(false);
            // Select the new conversation (we might need to find it)
            // For now just reload list.
        } catch (e: any) {
            console.error('[Chat UI] Start chat failed:', e);
            if (e.message.includes('Recipient keys not found')) {
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

    // Locked State
    if (isLocked) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center' }}>
                <Lock size={48} style={{ color: 'var(--accent)', marginBottom: '16px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Chat Locked</h2>
                <p style={{ color: 'var(--foreground-secondary)', maxWidth: '300px', marginBottom: '24px' }}>
                    Your end-to-end encrypted identity is locked. Please unlock it to view your messages.
                </p>
                <button onClick={() => setShowUnlockPrompt(true)} className="btn btn-primary">
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
                    Unable to initialize secure chat. This might be a network issue or missing keys.
                </p>
                <button
                    onClick={() => ensureReady('RETRY', user?.id || 'retry')}
                    className="btn btn-primary"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    // Loading State
    if ((!isReady && status !== 'error') || status === 'initializing' || status === 'generating_keys') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 className="animate-spin" size={32} />
                <p style={{ marginTop: 16 }}>Initializing Secure Encrypted Chat...</p>
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
                        onClick={() => setSelectedConversation(conv)}
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

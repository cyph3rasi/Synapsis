'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useChatEncryption } from '@/lib/hooks/useChatEncryption';
import { MessageCircle, Send, ArrowLeft, Search, Plus, Lock, Shield, Key, X, ChevronDown, CheckCheck, Loader2, Mail } from 'lucide-react';
import { formatFullHandle } from '@/lib/utils/handle';
import Link from 'next/link';

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

export function ChatWidget() {
    const { user } = useAuth();
    const { keys, isReady, hasKeys, isRegistering, needsPasswordToRestore, generateAndRegisterKeys, restoreKeysWithPassword, encryptMessage, decryptMessage } = useChatEncryption();

    // Widget State
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true); // For minimize/maximize behavior when open

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

    // Password/Key State
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isProcessingPassword, setIsProcessingPassword] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Listen for global open event
    useEffect(() => {
        const handleOpenEvent = () => {
            setIsOpen(true);
            setIsExpanded(true);
        };
        window.addEventListener('open-chat-widget', handleOpenEvent);
        return () => window.removeEventListener('open-chat-widget', handleOpenEvent);
    }, []);

    // Load conversations when widget opens or auth changes
    useEffect(() => {
        if (user && hasKeys && isOpen) {
            loadConversations();
        }
    }, [user, hasKeys, isOpen]);

    // Load messages when conversation is selected
    useEffect(() => {
        if (selectedConversation && hasKeys) {
            loadMessages(selectedConversation.id);
            markAsRead(selectedConversation.id);
            fetchRecipientKey(selectedConversation.participant2.handle);
        }
    }, [selectedConversation, hasKeys]);

    // Auto-scroll to bottom of messages
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isExpanded]);

    // -- Data Fetching Utils (Ported from page.tsx) --
    const fetchRecipientKey = async (handle: string) => {
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(handle)}`);
            const data = await res.json();
            setRecipientPublicKey(data.user?.chatPublicKey || null);
        } catch {
            setRecipientPublicKey(null);
        }
    };

    const loadConversations = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/swarm/chat/conversations');
            const data = await res.json();
            setConversations(data.conversations || []);
        } catch (e) {
            console.error("Failed to load conversations", e);
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (conversationId: string) => {
        try {
            // Ensure we have the recipient's key logic (simplified for brevity, main logic preserved)
            let chatPartnerKey = selectedConversation?.participant2?.chatPublicKey || recipientPublicKey;

            if (!chatPartnerKey && selectedConversation?.participant2?.handle) {
                try {
                    const userRes = await fetch(`/api/users/${encodeURIComponent(selectedConversation.participant2.handle)}`);
                    const userData = await userRes.json();
                    chatPartnerKey = userData.user?.chatPublicKey || null;
                    if (chatPartnerKey) setRecipientPublicKey(chatPartnerKey);
                } catch (e) { console.error(e); }
            }

            const res = await fetch(`/api/swarm/chat/messages?conversationId=${conversationId}`);
            const data = await res.json();

            const decrypted = await Promise.all((data.messages || []).map(async (msg: Message & { isE2E?: boolean }) => {
                try {
                    const isE2E = !!msg.senderPublicKey;
                    if (!isE2E) return { ...msg, decryptedContent: '[Legacy encrypted message]' };

                    const otherPartyKey = msg.isSentByMe ? chatPartnerKey : msg.senderPublicKey;
                    if (!otherPartyKey) return { ...msg, decryptedContent: '[Missing decryption key]' };

                    if (msg.encryptedContent) {
                        const decrypted = await decryptMessage(msg.encryptedContent, otherPartyKey);
                        return { ...msg, decryptedContent: decrypted };
                    }
                } catch (err) { }
                return { ...msg, decryptedContent: '[Unable to decrypt]' };
            }));

            setMessages(decrypted);
        } catch (err) { console.error(err); }
    };

    const markAsRead = async (conversationId: string) => { try { await fetch('/api/swarm/chat/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId }) }); setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c)); } catch { } };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversation || !recipientPublicKey) return;
        setSending(true);
        try {
            const encrypted = await encryptMessage(newMessage, recipientPublicKey);
            const res = await fetch('/api/swarm/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientHandle: selectedConversation.participant2.handle,
                    encryptedContent: encrypted,
                    senderPublicKey: keys?.publicKey
                })
            });

            if (res.ok) {
                setNewMessage('');
                await loadMessages(selectedConversation.id);
                loadConversations();
            }
        } catch (err) { console.error(err); }
        finally { setSending(false); }
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
                loadConversations();
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

    const filteredConversations: Conversation[] = conversations.filter((conv: Conversation) => conv.participant2.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || conv.participant2.handle.toLowerCase().includes(searchQuery.toLowerCase()));

    // -- Render Logic --

    // If not signed in, show nothing or maybe a prompt? User said "widget", usually hidden if not meaningful.
    if (!user) return null;

    // Collapsed State (Just the Fab/Button)
    if (!isOpen) {
        return (
            <div className="fixed bottom-6 right-6 z-50">
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center justify-center w-14 h-14 rounded-full bg-white text-black shadow-lg hover:bg-gray-200 transition-all border border-gray-200"
                >
                    <Mail size={24} />
                    {/* Unread badge logic could go here */}
                </button>
            </div>
        );
    }

    // Expanded Widget
    return (
        <div className={`fixed bottom-0 right-12 z-50 w-[350px] sm:w-[400px] bg-black border border-[#262626] rounded-t-2xl shadow-2xl flex flex-col transition-all duration-200 ${isExpanded ? 'h-[600px] max-h-[90vh]' : 'h-[60px]'}`}>

            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b border-[#262626] cursor-pointer bg-[#111] rounded-t-2xl"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    {selectedConversation && isExpanded ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setSelectedConversation(null); }}
                            className="p-1 hover:bg-[#262626] rounded-full mr-1"
                        >
                            <ArrowLeft size={18} />
                        </button>
                    ) : null}
                    <h3 className="font-bold text-lg">Messages</h3>
                </div>
                <div className="flex items-center gap-2">
                    {!selectedConversation && isExpanded && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowNewChat(true); }}
                            className="p-1 hover:bg-[#262626] rounded-full"
                        >
                            <Plus size={20} />
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                        className="p-1 hover:bg-[#262626] rounded-full"
                    >
                        <ChevronDown size={20} className={`transform transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                        className="p-1 hover:bg-[#262626] rounded-full"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content (Only visible if expanded) */}
            {isExpanded && (
                <div className="flex-1 flex flex-col min-h-0 bg-black">

                    {/* Encryption Setup Overlay */}
                    {!hasKeys && (
                        <div className="absolute inset-0 z-10 bg-black/90 flex flex-col items-center justify-center p-6 text-center">
                            <Shield size={48} className="mb-4 text-white" />
                            <h3 className="font-bold text-lg mb-2">{needsPasswordToRestore ? 'Unlock Messages' : 'Enable Encryption'}</h3>
                            <p className="text-sm text-gray-400 mb-4">{needsPasswordToRestore ? 'Enter your password to restore chat.' : 'Set up secure messaging.'}</p>

                            {!showPasswordInput ? (
                                <button onClick={() => setShowPasswordInput(true)} className="px-4 py-2 bg-white text-black font-bold rounded-full">
                                    {needsPasswordToRestore ? 'Restore Keys' : 'Enable'}
                                </button>
                            ) : (
                                <form onSubmit={handlePasswordSubmit} className="w-full max-w-[250px] flex flex-col gap-2">
                                    <input
                                        type="password"
                                        className="w-full bg-[#262626] border border-[#404040] rounded-md p-2 text-white outline-none focus:border-white"
                                        placeholder="Password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        autoFocus
                                    />
                                    {passwordError && <p className="text-red-500 text-xs">{passwordError}</p>}
                                    <button type="submit" className="w-full bg-white text-black font-bold rounded-full py-2 disabled:opacity-50" disabled={!password || isProcessingPassword}>
                                        {isProcessingPassword ? <Loader2 className="animate-spin mx-auto" /> : 'Confirm'}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Main View Switching */}
                    {hasKeys && (
                        <>
                            {selectedConversation ? (
                                // Thread View
                                <div className="flex-1 flex flex-col min-h-0">
                                    {/* Thread Header */}
                                    <div className="px-4 py-3 border-b border-[#262626] flex items-center gap-3 bg-black">
                                        <div className="w-8 h-8 rounded-full bg-[#262626] overflow-hidden flex items-center justify-center border border-[#404040]">
                                            {selectedConversation.participant2.avatarUrl ? (
                                                <img src={selectedConversation.participant2.avatarUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="font-bold">{selectedConversation.participant2.displayName[0]}</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold truncate text-sm">{selectedConversation.participant2.displayName}</h4>
                                            <p className="text-xs text-gray-500 truncate">{formatFullHandle(selectedConversation.participant2.handle)}</p>
                                        </div>
                                    </div>

                                    {/* Messages List */}
                                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                                        <div className="flex justify-center my-4">
                                            <div className="text-xs text-gray-500 flex items-center gap-1 bg-[#111] px-3 py-1 rounded-full border border-[#262626]">
                                                <Lock size={10} /> End-to-end encrypted
                                            </div>
                                        </div>

                                        {messages.map(msg => (
                                            <div key={msg.id} className={`flex gap-2 max-w-[85%] ${msg.isSentByMe ? 'ml-auto flex-row-reverse' : ''}`}>
                                                {/* Avatar for received messages */}
                                                {!msg.isSentByMe && (
                                                    <div className="w-6 h-6 rounded-full bg-[#262626] flex-shrink-0 overflow-hidden mt-1">
                                                        {msg.senderAvatarUrl ? <img src={msg.senderAvatarUrl} className="object-cover w-full h-full" /> : <span className="flex items-center justify-center h-full text-[10px]">{msg.senderDisplayName?.[0]}</span>}
                                                    </div>
                                                )}

                                                <div className={`flex flex-col ${msg.isSentByMe ? 'items-end' : 'items-start'}`}>
                                                    <div className={`px-3 py-2 rounded-2xl text-sm break-words ${msg.isSentByMe ? 'bg-white text-black' : 'bg-[#262626] text-white'}`}>
                                                        {msg.decryptedContent || msg.encryptedContent}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {msg.isSentByMe && (
                                                            <span className={msg.readAt ? 'text-blue-500' : ''}>
                                                                {msg.readAt ? <CheckCheck size={12} /> : msg.deliveredAt ? <Loader2 size={12} /> : null}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input Area */}
                                    <form onSubmit={sendMessage} className="p-3 border-t border-[#262626] flex items-center gap-2 bg-[#111]">
                                        <input
                                            type="text"
                                            className="flex-1 bg-[#262626] border-none rounded-full px-4 py-2 text-sm text-white focus:ring-1 focus:ring-white outline-none"
                                            placeholder="Type a message..."
                                            value={newMessage}
                                            onChange={e => setNewMessage(e.target.value)}
                                        />
                                        <button
                                            type="submit"
                                            disabled={!newMessage.trim() || sending}
                                            className="p-2 text-blue-500 hover:bg-[#262626] rounded-full disabled:opacity-50"
                                        >
                                            <Send size={18} />
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                // Conversation List View
                                <div className="flex-1 flex flex-col min-h-0">
                                    {showNewChat ? (
                                        <div className="p-4">
                                            <form onSubmit={startNewChat} className="flex flex-col gap-3">
                                                <input
                                                    type="text"
                                                    placeholder="Search people"
                                                    className="w-full bg-[#262626] border-none rounded-md p-2 text-white outline-none"
                                                    value={newChatHandle}
                                                    onChange={e => setNewChatHandle(e.target.value)}
                                                    autoFocus
                                                />
                                                <div className='flex justify-end gap-2'>
                                                    <button type="button" onClick={() => setShowNewChat(false)} className='text-sm text-gray-400'>Cancel</button>
                                                    <button type="submit" className='text-sm bg-white text-black px-3 py-1 rounded-full font-bold' disabled={!newChatHandle.trim()}>Next</button>
                                                </div>
                                            </form>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Search Bar */}
                                            <div className="p-2">
                                                <div className="bg-[#262626] rounded-full flex items-center px-3 py-1.5 gap-2">
                                                    <Search size={16} className="text-gray-500" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search Direct Messages"
                                                        className="bg-transparent border-none outline-none text-sm text-white flex-1"
                                                        value={searchQuery}
                                                        onChange={e => setSearchQuery(e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* List */}
                                            <div className="flex-1 overflow-y-auto">
                                                {loading ? (
                                                    <div className="flex justify-center p-4"><Loader2 className="animate-spin text-gray-500" /></div>
                                                ) : filteredConversations.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
                                                        <h4 className="font-bold text-lg mb-2">Welcome to your inbox!</h4>
                                                        <p className="text-sm">Drop a potential swarm of thoughts to people.</p>
                                                        <button
                                                            onClick={() => setShowNewChat(true)}
                                                            className="mt-4 px-4 py-2 bg-white text-black rounded-full font-bold text-sm"
                                                        >
                                                            Write a message
                                                        </button>
                                                    </div>
                                                ) : (
                                                    filteredConversations.map((conv: any) => (
                                                        <div
                                                            key={conv.id}
                                                            onClick={() => setSelectedConversation(conv)}
                                                            className={`flex items-center gap-3 p-3 hover:bg-[#161616] cursor-pointer transition-colors ${selectedConversation?.id === conv.id ? 'bg-[#161616] border-r-2 border-blue-500' : ''}`}
                                                        >
                                                            <div className="relative">
                                                                <div className="w-10 h-10 rounded-full bg-[#333] overflow-hidden flex items-center justify-center border border-[#404040]">
                                                                    {conv.participant2.avatarUrl ? (
                                                                        <img src={conv.participant2.avatarUrl} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <span className="font-bold">{conv.participant2.displayName[0]}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-bold text-sm truncate">{conv.participant2.displayName}</span>
                                                                    <span className="text-xs text-gray-500">{formatFullHandle(conv.participant2.handle)}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between mt-0.5">
                                                                    <span className={`text-sm truncate max-w-[180px] ${conv.unreadCount > 0 ? 'text-white font-medium' : 'text-gray-500'}`}>
                                                                        {conv.lastMessagePreview}
                                                                    </span>
                                                                    {conv.unreadCount > 0 && (
                                                                        <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-2">
                                                                            {conv.unreadCount}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                </div>
            )}
        </div>
    );
}

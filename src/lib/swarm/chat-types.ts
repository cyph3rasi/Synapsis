/**
 * Swarm Chat Types
 * 
 * Type definitions for the swarm chat system.
 */

export interface SwarmChatMessage {
  id: string;
  conversationId: string;
  senderHandle: string;
  senderDisplayName?: string;
  senderAvatarUrl?: string;
  senderNodeDomain?: string;
  encryptedContent: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface SwarmChatConversation {
  id: string;
  type: 'direct' | 'group';
  participant1Id: string;
  participant2Handle: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for sending a chat message to a remote node
 */
export interface SwarmChatMessagePayload {
  messageId: string;
  senderHandle: string;
  senderDisplayName?: string;
  senderAvatarUrl?: string;
  senderNodeDomain: string;
  recipientHandle: string;
  encryptedContent: string;
  timestamp: string;
  signature?: string;
}

/**
 * Payload for typing indicator
 */
export interface SwarmChatTypingPayload {
  senderHandle: string;
  senderNodeDomain: string;
  recipientHandle: string;
  isTyping: boolean;
  timestamp: string;
}

/**
 * Payload for read receipt
 */
export interface SwarmChatReadReceiptPayload {
  messageId: string;
  readerHandle: string;
  readerNodeDomain: string;
  timestamp: string;
}

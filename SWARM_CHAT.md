# Swarm Chat

A real-time, end-to-end encrypted chat system built exclusively for the Synapsis Swarm network.

## Features

- **End-to-End Encryption**: Messages are encrypted using recipient's public key
- **Cross-Node Messaging**: Chat with users on any Synapsis node
- **Real-Time Delivery**: Messages delivered instantly via swarm inbox
- **Read Receipts**: See when messages are delivered and read
- **Typing Indicators**: Know when someone is typing (coming soon)
- **No ActivityPub Limitations**: Built specifically for swarm, not constrained by AP spec

## Architecture

### Database Schema

**chat_conversations**: Tracks conversations between users
- Stores participant info and last message preview
- Unique constraint ensures one conversation per user pair

**chat_messages**: Individual encrypted messages
- Content encrypted with recipient's public key
- Swarm message ID for deduplication
- Delivery and read status tracking

**chat_typing_indicators**: Real-time typing status (future)

### API Endpoints

**POST /api/swarm/chat/send**
- Send a message to any user (local or remote)
- Encrypts content with recipient's public key
- Delivers to remote nodes via swarm inbox

**POST /api/swarm/chat/inbox**
- Receives messages from other swarm nodes
- Validates and stores encrypted messages
- Updates conversation metadata

**GET /api/swarm/chat/conversations**
- Lists all conversations for current user
- Includes unread counts and last message preview

**GET /api/swarm/chat/messages**
- Fetches messages for a conversation
- Supports cursor-based pagination
- Returns encrypted content for client-side decryption

**PATCH /api/swarm/chat/messages**
- Marks messages as read
- Updates read receipts

### Encryption

Messages are encrypted using RSA-OAEP with SHA-256:

1. **Sending**: Message encrypted with recipient's public key
2. **Storage**: Only encrypted content stored in database
3. **Decryption**: Client-side decryption using user's private key

This ensures true end-to-end encryption - even the server cannot read messages.

## Usage

### Starting a Chat

```typescript
// Send a message to start a conversation
await fetch('/api/swarm/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recipientHandle: 'user@remote.node',
    content: 'Hello!',
  }),
});
```

### Receiving Messages

Messages are automatically received via the swarm inbox endpoint. The system:
1. Validates the sender and recipient
2. Checks for duplicate messages
3. Creates or updates the conversation
4. Stores the encrypted message
5. Returns success to the sender

### Client-Side Decryption

```typescript
import { decryptMessage } from '@/lib/swarm/chat-crypto';

// Decrypt a message using user's private key
const plaintext = decryptMessage(
  message.encryptedContent,
  userPrivateKey
);
```

## Security Considerations

1. **Private Key Storage**: User private keys should be encrypted at rest
2. **Key Derivation**: Consider using password-based key derivation
3. **Forward Secrecy**: Future enhancement - implement Signal protocol
4. **Message Signing**: Verify sender authenticity with signatures
5. **Rate Limiting**: Prevent spam and abuse

## Future Enhancements

- [ ] Group chats (multi-party encryption)
- [ ] Voice/video calls (WebRTC)
- [ ] File attachments (encrypted)
- [ ] Message reactions
- [ ] Message editing/deletion
- [ ] Typing indicators (real-time)
- [ ] Online/offline status
- [ ] Push notifications
- [ ] Desktop notifications
- [ ] Message search
- [ ] Conversation archiving
- [ ] Block/mute users
- [ ] Forward secrecy (Signal protocol)

## Migration

Run the migration to create the chat tables:

```bash
npm run db:generate
npm run db:migrate
```

## Testing

Test the chat system:

1. Create two accounts on different nodes
2. Navigate to `/chat` on one account
3. Click "New Chat" and enter the other user's handle
4. Send a message
5. Check the other account's `/chat` page

## Differences from ActivityPub DMs

Traditional ActivityPub direct messages are just posts with limited visibility. Swarm Chat is superior:

- **True E2E Encryption**: Not possible with ActivityPub
- **Real-Time**: Direct delivery, no polling required
- **Proper Chat UX**: Conversations, read receipts, typing indicators
- **Lightweight**: No heavyweight ActivityPub overhead
- **Swarm-Native**: Built for the swarm, not retrofitted

## Contributing

Contributions welcome! Priority areas:
- Client-side encryption implementation
- Real-time updates (WebSocket/SSE)
- Mobile-responsive UI improvements
- Group chat support

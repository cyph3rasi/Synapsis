
import { db } from './src/db/index';
import { users, chatConversations, chatMessages } from './src/db/schema';
import { eq, and } from 'drizzle-orm';
import { encryptMessage } from './src/lib/swarm/chat-crypto';
import crypto from 'crypto';

async function main() {
    console.log('--- SIMULATING CHAT SEND ---');
    try {
        // 1. Get Sender (Cypher)
        const sender = await db.query.users.findFirst({
            where: eq(users.handle, 'cypher'),
        });
        if (!sender) throw new Error('Sender not found');
        console.log('Sender found:', sender.handle);

        // 2. Get Recipient (newinnightvale)
        const recipientHandle = 'newinnightvale';
        const recipient = await db.query.users.findFirst({
            where: eq(users.handle, recipientHandle),
        });
        if (!recipient) throw new Error('Recipient not found');
        console.log('Recipient found:', recipient.handle);
        console.log('Recipient PK length:', recipient.publicKey?.length);

        // 3. Encrypt
        console.log('Encrypting...');
        try {
            const encrypted = encryptMessage('Hello World', recipient.publicKey);
            console.log('Encryption successful. Length:', encrypted.length);
        } catch (e) {
            console.error('Encryption FAILED:', e);
            // Dump key for manual inspection if needed (truncated)
            console.log('Key start:', recipient.publicKey.substring(0, 50));
            return;
        }

        console.log('Simulation complete (not inserting to DB to avoid pollution, but encryption passed).');

    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}
main();

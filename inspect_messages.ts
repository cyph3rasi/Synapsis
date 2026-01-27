import 'dotenv/config';
import { db } from './src/db/index';
import { chatMessages } from './src/db/schema';
import { desc } from 'drizzle-orm';

async function main() {
    console.log('--- LATEST CHAT MESSAGES ---');
    try {
        const messages = await db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(20);
        console.log(`Found ${messages.length} messages.`);
        messages.forEach(m => {
            console.log(`\nID: ${m.id}`);
            console.log(`Sender: ${m.senderHandle}`);
            console.log(`Created: ${m.createdAt}`);
            console.log(`EncryptedContent (${m.encryptedContent?.length} chars): ${m.encryptedContent}`);
            console.log(`SenderEncryptedContent (${m.senderEncryptedContent?.length} chars): ${m.senderEncryptedContent}`);
            console.log('-----------------------------------');
        });

    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();


import { db } from './src/db/index';
import { users } from './src/db/schema';
import { chatConversations } from './src/db/schema';

async function main() {
    console.log('--- USERS ---');
    try {
        const allUsers = await db.select().from(users);
        console.log(`Found ${allUsers.length} users.`);
        allUsers.forEach(u => {
            console.log(`User: ${u.handle} | ID: ${u.id} | Local: ${!u.handle.includes('@')}`);
        });

        console.log('\n--- CONVERSATIONS ---');
        const convs = await db.select().from(chatConversations);
        console.log(`Found ${convs.length} conversations.`);
        convs.forEach(c => {
            console.log(`Conv: ${c.id} | Type: ${c.type} | P1: ${c.participant1Id} | P2Handle: ${c.participant2Handle}`);
        });

    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}
main();

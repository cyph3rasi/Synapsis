import { db, chatMessages } from './src/db';
import { isNull } from 'drizzle-orm';

async function cleanOldMessages() {
  console.log('Deleting old RSA-encrypted messages...');
  
  const result = await db.delete(chatMessages)
    .where(isNull(chatMessages.senderChatPublicKey));
  
  console.log('Deleted old messages. Now only E2E encrypted messages remain.');
  process.exit(0);
}

cleanOldMessages().catch(console.error);

import { db, users } from './src/db';
import { eq } from 'drizzle-orm';

async function checkKeys() {
  const allUsers = await db.select({
    handle: users.handle,
    hasChatPublicKey: users.chatPublicKey,
    hasChatPrivateKeyEncrypted: users.chatPrivateKeyEncrypted,
  }).from(users);
  
  console.log('Users and their chat keys:');
  allUsers.forEach(u => {
    console.log(`- ${u.handle}: chatPublicKey=${!!u.hasChatPublicKey}, chatPrivateKeyEncrypted=${!!u.hasChatPrivateKeyEncrypted}`);
  });
  
  process.exit(0);
}

checkKeys().catch(console.error);

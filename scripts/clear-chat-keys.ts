import { db } from '../src/db';
import { chatDeviceBundles } from '../src/db/schema';

async function clearChatKeys() {
  console.log('Clearing all chat device bundles...');
  
  const result = await db.delete(chatDeviceBundles);
  
  console.log('Cleared chat device bundles');
  process.exit(0);
}

clearChatKeys().catch((error) => {
  console.error('Failed to clear keys:', error);
  process.exit(1);
});

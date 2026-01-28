import { db } from '../src/db';

async function main() {
  await db.execute(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_did text;`);
  console.log('Added sender_did column to chat_messages');
  process.exit(0);
}

main();

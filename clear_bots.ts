
import { db } from './src/db';
import { bots } from './src/db/schema';

async function main() {
    console.log('Deleting all bots...');
    await db.delete(bots);
    console.log('Bots deleted.');
}

main().then(() => process.exit(0)).catch(console.error);

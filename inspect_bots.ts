
import { db } from './src/db';
import { bots } from './src/db/schema';

async function main() {
    const allBots = await db.select().from(bots);
    console.log('Bot Count:', allBots.length);
    if (allBots.length > 0) {
        console.log('Bot Data:', JSON.stringify(allBots, null, 2));
    }
}

main().then(() => process.exit(0)).catch(console.error);

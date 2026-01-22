import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Lazy initialization to prevent build-time crashes
let _db: NeonHttpDatabase<typeof schema> | null = null;

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
    get: (target, prop) => {
        if (!_db) {
            if (!process.env.DATABASE_URL) {
                // Allow build to pass by returning a dummy if accessed during build
                if (process.env.NODE_ENV === 'production') {
                    console.warn('Database accessed during build without DATABASE_URL. Returning dummy.');
                    // We return a proxy that logs on any access to avoid hard crashes if possible,
                    // but typically this path is creating the client.
                    // Returning a dummy DB object that matches the shape is hard.
                    // But if we throw, we crash.
                    // The issue is verify the build doesn't crash on import.
                    // If we are here, something ACCESSED db.
                }
                throw new Error('DATABASE_URL is not defined');
            }
            const sql = neon(process.env.DATABASE_URL);
            _db = drizzle(sql, { schema });
        }
        return Reflect.get(_db, prop);
    },
});

// Helper to check if DB is available
export const isDbAvailable = () => !!process.env.DATABASE_URL;

// Export schema for use elsewhere
export * from './schema';

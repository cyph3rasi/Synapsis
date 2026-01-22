import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Create the Neon client (with fallback for UI testing)
const sql = process.env.DATABASE_URL
    ? neon(process.env.DATABASE_URL)
    : null;

// Create the Drizzle client
export const db = sql ? drizzle(sql, { schema }) : null;

// Helper to check if DB is available
export const isDbAvailable = () => db !== null;

// Export schema for use elsewhere
export * from './schema';

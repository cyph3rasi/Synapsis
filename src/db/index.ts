import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// Best Practice:
// In Vercel builds, environment variables might be missing during the "Build" step.
// We provide a fallback connection string to allow the code to load and type-check.
// The app will fail fast at runtime if it tries to actually query with this invalid URL.
const connectionString = process.env.DATABASE_URL || 'postgres://placeholder:placeholder@localhost:5432/placeholder';

const sql = neon(connectionString);

// Create the Drizzle client with the specific schema type
export const db = drizzle(sql, { schema });

// Helper to check if DB is configured (useful for UI checks)
export const isDbAvailable = () => !!process.env.DATABASE_URL;

// Export schema for use elsewhere
export * from './schema';

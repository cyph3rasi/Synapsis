import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Best Practice for VPS/Self-Hosting:
// We use 'pg' (node-postgres) which connects via standard TCP.
// This works for local Postgres, Docker, VPS, and managed clouds (AWS RDS, Neon, etc.).

const connectionString = process.env.DATABASE_URL || 'postgres://placeholder:placeholder@localhost:5432/placeholder';

// Create a connection pool
const pool = new Pool({
    connectionString,
    max: 20, // Adjust based on your server capacity
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Create the Drizzle client
export const db = drizzle(pool, { schema });

// Helper to check if DB is configured
export const isDbAvailable = () => !!process.env.DATABASE_URL;

// Export schema for use elsewhere
export * from './schema';

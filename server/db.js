import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export function query(text, params) { return pool.query(text, params); }

export async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await query(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    input TEXT NOT NULL,
    intent TEXT NOT NULL CHECK (intent IN ('website','plan','learn','organize')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query('CREATE INDEX IF NOT EXISTS intents_user_created_idx ON intents(user_id, created_at DESC)');
}

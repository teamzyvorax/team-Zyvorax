import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
export function query(text, params) { return pool.query(text, params); }
export async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS auth_accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL CHECK (provider IN ('google','github','discord')), provider_user_id TEXT NOT NULL, email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(provider, provider_user_id), UNIQUE(provider, email))`);
  await query(`CREATE TABLE IF NOT EXISTS sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, user_agent TEXT NOT NULL DEFAULT '', ip_address TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ)`);
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT ''`);
  await query(`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS sessions_active_idx ON sessions(token_hash) WHERE revoked_at IS NULL`);
  await query(`CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at) WHERE revoked_at IS NULL`);
  await query(`CREATE TABLE IF NOT EXISTS intents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, input TEXT NOT NULL, intent TEXT NOT NULL CHECK (intent IN ('website','plan','learn','organize')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'todo', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query('CREATE INDEX IF NOT EXISTS intents_user_created_idx ON intents(user_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id, created_at)');
  await query('CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON auth_accounts(user_id)');
  await query(`DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL`);
}

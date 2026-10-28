import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query, initDb } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

if (!JWT_SECRET) console.warn('JWT_SECRET is not set; auth endpoints will reject requests.');

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const credentials = z.object({ email: z.string().email().max(320), password: z.string().min(8).max(128) });
const intentSchema = z.object({ input: z.string().trim().min(1).max(4000), intent: z.enum(['website','plan','learn','organize']) });

function sign(user) {
  if (!JWT_SECRET) throw new Error('Authentication is not configured');
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !JWT_SECRET) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
}

app.get('/api/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, service: 'team-zyvorax-api', database: 'connected' }); }
  catch { res.status(503).json({ ok: false, service: 'team-zyvorax-api', database: 'unavailable' }); }
});

app.post('/api/auth/register', authLimit, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password (8-128 chars) are required' });
  const { email, password } = parsed.data;
  const normalized = email.toLowerCase();
  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalized]);
    if (existing.rowCount) return res.status(409).json({ error: 'An account with this email already exists' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at', [normalized, passwordHash]);
    const user = result.rows[0];
    res.status(201).json({ user, token: sign(user) });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to create account' }); }
});

app.post('/api/auth/login', authLimit, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password are required' });
  const { email, password } = parsed.data;
  try {
    const result = await query('SELECT id, email, password_hash, created_at FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ user: { id: user.id, email: user.email, created_at: user.created_at }, token: sign(user) });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to sign in' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await query('SELECT id, email, created_at FROM users WHERE id = $1', [req.user.sub]);
  if (!result.rowCount) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: result.rows[0] });
});

app.get('/api/intents', auth, async (req, res) => {
  const result = await query('SELECT id, input, intent, created_at FROM intents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.sub]);
  res.json({ intents: result.rows });
});

app.post('/api/intents', auth, async (req, res) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid intent payload' });
  const { input, intent } = parsed.data;
  const result = await query('INSERT INTO intents (user_id, input, intent) VALUES ($1, $2, $3) RETURNING id, input, intent, created_at', [req.user.sub, input, intent]);
  res.status(201).json({ intent: result.rows[0] });
});

app.delete('/api/intents', auth, async (req, res) => {
  await query('DELETE FROM intents WHERE user_id = $1', [req.user.sub]);
  res.status(204).end();
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

initDb().then(() => app.listen(PORT, () => console.log(`Team ZyvoraX API listening on ${PORT}`))).catch((error) => { console.error('Database initialization failed:', error); process.exit(1); });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, initDb } from './db.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(CLIENT_ORIGIN ? cors({ origin: CLIENT_ORIGIN, credentials: true }) : cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const credentials = z.object({ email: z.string().email().max(320), password: z.string().min(8).max(128) });
const intentSchema = z.object({ input: z.string().trim().min(1).max(4000), intent: z.enum(['website', 'plan', 'learn', 'organize']) });
const projectSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional() });
const taskSchema = z.object({ title: z.string().trim().min(1).max(300) });

function sign(user) {
  if (!JWT_SECRET) throw Error('Authentication is not configured');
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !JWT_SECRET) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, service: 'team-zyvorax-api', database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, service: 'team-zyvorax-api', database: 'unavailable' });
  }
});

app.post('/api/auth/register', authLimit, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password are required' });
  const email = parsed.data.email.toLowerCase();
  try {
    if ((await query('SELECT id FROM users WHERE email=$1', [email])).rowCount) return res.status(409).json({ error: 'An account with this email already exists' });
    const hash = await bcrypt.hash(parsed.data.password, 12);
    const user = (await query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,created_at', [email, hash])).rows[0];
    res.status(201).json({ user, token: sign(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to create account' });
  }
});

app.post('/api/auth/login', authLimit, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password are required' });
  try {
    const user = (await query('SELECT id,email,password_hash,created_at FROM users WHERE email=$1', [parsed.data.email.toLowerCase()])).rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ user: { id: user.id, email: user.email, created_at: user.created_at }, token: sign(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await query('SELECT id,email,created_at FROM users WHERE id=$1', [req.user.sub]);
  if (!result.rowCount) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: result.rows[0] });
});

app.get('/api/intents', auth, async (req, res) => {
  const result = await query('SELECT id,input,intent,created_at FROM intents WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.sub]);
  res.json({ intents: result.rows });
});

app.post('/api/intents', auth, async (req, res) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid intent payload' });
  const result = await query('INSERT INTO intents(user_id,input,intent) VALUES($1,$2,$3) RETURNING id,input,intent,created_at', [req.user.sub, parsed.data.input, parsed.data.intent]);
  res.status(201).json({ intent: result.rows[0] });
});

app.delete('/api/intents', auth, async (req, res) => {
  await query('DELETE FROM intents WHERE user_id=$1', [req.user.sub]);
  res.status(204).end();
});

app.get('/api/projects', auth, async (req, res) => {
  const result = await query(`SELECT p.id,p.name,p.description,p.status,p.created_at,p.updated_at,
    COUNT(t.id)::int task_count,
    COUNT(t.id) FILTER(WHERE t.status='done')::int done_count
    FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.user_id=p.user_id
    WHERE p.user_id=$1 GROUP BY p.id ORDER BY p.updated_at DESC`, [req.user.sub]);
  res.json({ projects: result.rows });
});

app.post('/api/projects', auth, async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Project name is required' });
  const result = await query('INSERT INTO projects(user_id,name,description) VALUES($1,$2,$3) RETURNING *', [req.user.sub, parsed.data.name, parsed.data.description || '']);
  res.status(201).json({ project: result.rows[0] });
});

app.patch('/api/projects/:id', auth, async (req, res) => {
  const parsed = projectSchema.partial().extend({ status: z.enum(['active', 'paused', 'done']).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid project update' });
  const result = await query('UPDATE projects SET name=COALESCE($1,name),description=COALESCE($2,description),status=COALESCE($3,status),updated_at=NOW() WHERE id=$4 AND user_id=$5 RETURNING *', [parsed.data.name ?? null, parsed.data.description ?? null, parsed.data.status ?? null, req.params.id, req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
  res.json({ project: result.rows[0] });
});

app.delete('/api/projects/:id', auth, async (req, res) => {
  const result = await query('DELETE FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ error: 'Project not found' });
  res.status(204).end();
});

app.get('/api/projects/:id/tasks', auth, async (req, res) => {
  const result = await query('SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id=$1 AND t.user_id=$2 AND p.user_id=$2 ORDER BY t.created_at', [req.params.id, req.user.sub]);
  res.json({ tasks: result.rows });
});

app.post('/api/projects/:id/tasks', auth, async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Task title is required' });
  if (!(await query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub])).rowCount) return res.status(404).json({ error: 'Project not found' });
  const result = await query('INSERT INTO tasks(project_id,user_id,title) VALUES($1,$2,$3) RETURNING *', [req.params.id, req.user.sub, parsed.data.title]);
  await query('UPDATE projects SET updated_at=NOW() WHERE id=$1', [req.params.id]);
  res.status(201).json({ task: result.rows[0] });
});

app.patch('/api/tasks/:id', auth, async (req, res) => {
  const parsed = z.object({ status: z.enum(['todo', 'doing', 'done']).optional(), title: z.string().trim().min(1).max(300).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid task update' });
  const result = await query('UPDATE tasks SET status=COALESCE($1,status),title=COALESCE($2,title),updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING *', [parsed.data.status ?? null, parsed.data.title ?? null, req.params.id, req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
  const project = (await query('SELECT project_id FROM tasks WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub])).rows[0];
  if (project) await query('UPDATE projects SET updated_at=NOW() WHERE id=$1', [project.project_id]);
  res.json({ task: result.rows[0] });
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  const result = await query('DELETE FROM tasks WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

// In production Render serves the Vite build and API from the same origin.
app.use(express.static(DIST_DIR, { index: 'index.html' }));
app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(DIST_DIR, 'index.html'), error => error && next(error));
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`Team ZyvoraX API listening on ${PORT}`)))
  .catch(error => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });

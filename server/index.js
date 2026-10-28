import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, initDb } from './db.js';
import { createPlatformRouter } from './platform.js';
import { verifyOAuthState } from './oauth-security.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Same-origin requests need no CORS headers. Enable credentialed CORS only for an explicit trusted origin.
if (CLIENT_ORIGIN) app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const credentials = z.object({ email: z.string().email().max(320), password: z.string().min(8).max(128) });
const intentSchema = z.object({ input: z.string().trim().min(1).max(4000), intent: z.enum(['website', 'plan', 'learn', 'organize']) });
const projectSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional() });
const taskSchema = z.object({ title: z.string().trim().min(1).max(300) });
const providers = {
  google: { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET },
  github: { id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET },
  discord: { id: process.env.DISCORD_CLIENT_ID, secret: process.env.DISCORD_CLIENT_SECRET }
};

function sign(user) {
  if (!JWT_SECRET) throw Error('Authentication is not configured');
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}
async function auth(req, res, next) {
  try {
    const bearer = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const raw = cookie(req, '__Host-zyvorax_session') || bearer;
    if (!raw) return res.status(401).json({ error: 'Authentication required' });
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const result = await query('SELECT s.id,s.user_id,s.expires_at,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()',[tokenHash]);
    if (!result.rowCount) return res.status(401).json({ error: 'Invalid or expired session' });
    await query('UPDATE sessions SET last_seen_at=NOW() WHERE id=$1',[result.rows[0].id]);
    req.sessionId=result.rows[0].id;
    req.user={sub:result.rows[0].user_id,email:result.rows[0].email};
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
}
function origin(req) { return CLIENT_ORIGIN || `${req.protocol}://${req.get('host')}`; }
function redirectUri(req, provider) { return `${origin(req)}/api/auth/${provider}/callback`; }
function cookie(req, name) { const raw = req.headers.cookie || ''; const item = raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`)); return item ? decodeURIComponent(item.slice(name.length+1)) : ''; }
function setCookie(res, name, value, maxAge=600) { res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax; Secure`); }
function clearCookie(res, name) { res.setHeader('Set-Cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure`); }
function stateToken(provider) { return jwt.sign({ provider, nonce: crypto.randomBytes(16).toString('hex') }, JWT_SECRET, { expiresIn: '10m' }); }
function newSessionToken(){return crypto.randomBytes(32).toString('base64url');}
async function createSession(user,req){const raw=newSessionToken();const hash=crypto.createHash('sha256').update(raw).digest('hex');await query("INSERT INTO sessions(user_id,token_hash,user_agent,ip_address,label,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '30 days')",[user.id,hash,String(req.get('user-agent')||'').slice(0,500),String(req.ip||'').slice(0,100),'Browser session']);setCookie(req.res,'__Host-zyvorax_session',raw,60*60*24*30);return raw;}
function sessionCookieClear(res){clearCookie(res,'__Host-zyvorax_session');}
app.use('/api/platform', auth, createPlatformRouter({ query }));

app.get('/api/health', async (_req, res) => { try { await query('SELECT 1'); res.json({ok:true,service:'team-zyvorax-api',database:'connected'}); } catch { res.status(503).json({ok:false,service:'team-zyvorax-api',database:'unavailable'}); } });

app.post('/api/auth/register', authLimit, async (req,res)=>{ const parsed=credentials.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:'Valid email and password are required'}); const email=parsed.data.email.toLowerCase(); try { if((await query('SELECT id FROM users WHERE email=$1',[email])).rowCount)return res.status(409).json({error:'An account with this email already exists'}); const hash=await bcrypt.hash(parsed.data.password,12); const user=(await query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,created_at',[email,hash])).rows[0]; await createSession(user,req); res.status(201).json({user}); } catch(error){console.error(error);res.status(500).json({error:'Unable to create account'});} });
app.post('/api/auth/login', authLimit, async (req,res)=>{ const parsed=credentials.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:'Valid email and password are required'}); try { const user=(await query('SELECT id,email,password_hash,created_at FROM users WHERE email=$1',[parsed.data.email.toLowerCase()])).rows[0]; if(!user||!(await bcrypt.compare(parsed.data.password,user.password_hash)))return res.status(401).json({error:'Invalid email or password'}); await createSession(user,req); res.json({user:{id:user.id,email:user.email,created_at:user.created_at}}); } catch(error){console.error(error);res.status(500).json({error:'Unable to sign in'});} });
app.get('/api/auth/me',auth,async(req,res)=>{const result=await query('SELECT id,email,created_at FROM users WHERE id=$1',[req.user.sub]);if(!result.rowCount)return res.status(401).json({error:'Account not found'});res.json({user:result.rows[0]});});

app.get('/api/auth/:provider/start',(req,res)=>{
  const {provider}=req.params; const cfg=providers[provider];
  if(!cfg?.id||!cfg.secret)return res.status(503).json({error:`${provider} OAuth is not configured yet`});
  const state=stateToken(provider); setCookie(res,'zyvorax_oauth_state',state);
  const uri=encodeURIComponent(redirectUri(req,provider));
  const stateQ=encodeURIComponent(state);
  const urls={
    google:`https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(cfg.id)}&redirect_uri=${uri}&response_type=code&scope=openid%20email%20profile&state=${stateQ}`,
    github:`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(cfg.id)}&redirect_uri=${uri}&scope=read:user%20user:email&state=${stateQ}`,
    discord:`https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(cfg.id)}&redirect_uri=${uri}&response_type=code&scope=identify%20email&state=${stateQ}`
  };
  res.redirect(urls[provider]);
});

async function oauthUser(provider, code, req) {
  const cfg=providers[provider]; const redirect_uri=redirectUri(req,provider); let profile;
  if(provider==='google'){
    const t=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:cfg.id,client_secret:cfg.secret,redirect_uri,grant_type:'authorization_code'})});
    const td=await t.json(); if(!t.ok)throw Error(td.error_description||'Google token exchange failed');
    const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${td.access_token}`}}); profile=await r.json();
    if(!r.ok||!profile.sub||!profile.email||profile.email_verified!==true)throw Error('Google account must provide a verified email');
    return {id:String(profile.sub),email:profile.email.toLowerCase()};
  }
  if(provider==='github'){
    const t=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:cfg.id,client_secret:cfg.secret,code,redirect_uri})});
    const td=await t.json(); if(!t.ok||!td.access_token)throw Error(td.error||'GitHub token exchange failed');
    const r=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${td.access_token}`,Accept:'application/vnd.github+json','User-Agent':'Team-ZyvoraX'}}); const u=await r.json(); if(!r.ok)throw Error('GitHub profile lookup failed');
    let email=u.email; if(!email){const er=await fetch('https://api.github.com/user/emails',{headers:{Authorization:`Bearer ${td.access_token}`,Accept:'application/vnd.github+json','User-Agent':'Team-ZyvoraX'}});const es=await er.json();email=es.find(x=>x.primary&&x.verified)?.email||es.find(x=>x.verified)?.email;}
    if(!email)throw Error('GitHub account needs a verified email'); return {id:String(u.id),email:email.toLowerCase()};
  }
  const t=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.id,client_secret:cfg.secret,code,redirect_uri,grant_type:'authorization_code'})});
  const td=await t.json(); if(!t.ok||!td.access_token)throw Error(td.error_description||'Discord token exchange failed');
  const r=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${td.access_token}`}});const u=await r.json();if(!r.ok||!u.id||!u.email||u.verified!==true)throw Error('Discord account must provide a verified email');return {id:String(u.id),email:u.email.toLowerCase()};
}

app.get('/api/auth/:provider/callback',async(req,res)=>{
  const {provider}=req.params; try { if(!providers[provider])throw Error('Unsupported OAuth provider'); verifyOAuthState(cookie(req,'zyvorax_oauth_state'),String(req.query.state||''),provider,JWT_SECRET); clearCookie(res,'zyvorax_oauth_state'); const p=await oauthUser(provider,String(req.query.code||''),req); let account=(await query('SELECT user_id FROM auth_accounts WHERE provider=$1 AND provider_user_id=$2',[provider,p.id])).rows[0]; let user;
    if(account) user=(await query('SELECT id,email,created_at FROM users WHERE id=$1',[account.user_id])).rows[0];
    if(!user){ user=(await query('SELECT id,email,created_at FROM users WHERE email=$1',[p.email])).rows[0]; if(!user) user=(await query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,created_at',[p.email,await bcrypt.hash(crypto.randomBytes(32).toString('hex'),12)])).rows[0]; await query('INSERT INTO auth_accounts(user_id,provider,provider_user_id,email) VALUES($1,$2,$3,$4) ON CONFLICT(provider,provider_user_id) DO UPDATE SET email=EXCLUDED.email',[user.id,provider,p.id,p.email]); }
    setCookie(res,'zyvorax_oauth_session',sign(user),60); res.redirect(`${origin(req)}/?oauth=success`);
  } catch(error){console.error('OAuth callback failed',error);clearCookie(res,'zyvorax_oauth_state');res.redirect(`${origin(req)}/?oauth=error&message=${encodeURIComponent('Social sign-in failed. Check provider configuration and try again.')}`);}
});
app.get('/api/auth/oauth-session',async(req,res)=>{const token=cookie(req,'zyvorax_oauth_session');if(!token)return res.status(401).json({error:'No OAuth session'});clearCookie(res,'zyvorax_oauth_session');try{const payload=jwt.verify(token,JWT_SECRET);const user=(await query('SELECT id,email,created_at FROM users WHERE id=$1',[payload.sub])).rows[0];if(!user)return res.status(401).json({error:'Account not found'});await createSession(user,req);res.json({user});}catch{res.status(401).json({error:'OAuth session expired'});}});

app.post('/api/auth/logout',auth,async(req,res)=>{await query('UPDATE sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[req.sessionId,req.user.sub]);sessionCookieClear(res);res.status(204).end();});
app.get('/api/auth/sessions',auth,async(req,res)=>{const result=await query('SELECT id,user_agent,ip_address,label,created_at,last_seen_at,expires_at,(id=$1) AS current FROM sessions WHERE user_id=$2 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY last_seen_at DESC',[req.sessionId,req.user.sub]);res.json({sessions:result.rows});});
app.delete('/api/auth/sessions/:id',auth,async(req,res)=>{const result=await query('UPDATE sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',[req.params.id,req.user.sub]);if(!result.rowCount)return res.status(404).json({error:'Session not found'});res.status(204).end();});
app.post('/api/auth/sessions/revoke-all',auth,async(req,res)=>{await query('UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL AND id<>$2',[req.user.sub,req.sessionId]);res.status(204).end();});
app.get('/api/intents',auth,async(req,res)=>{const result=await query('SELECT id,input,intent,created_at FROM intents WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[req.user.sub]);res.json({intents:result.rows});});
app.post('/api/intents',auth,async(req,res)=>{const parsed=intentSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid intent payload'});const result=await query('INSERT INTO intents(user_id,input,intent) VALUES($1,$2,$3) RETURNING id,input,intent,created_at',[req.user.sub,parsed.data.input,parsed.data.intent]);res.status(201).json({intent:result.rows[0]});});
app.delete('/api/intents',auth,async(req,res)=>{await query('DELETE FROM intents WHERE user_id=$1',[req.user.sub]);res.status(204).end();});
app.get('/api/projects',auth,async(req,res)=>{const result=await query(`SELECT p.id,p.name,p.description,p.status,p.created_at,p.updated_at,COUNT(t.id)::int task_count,COUNT(t.id) FILTER(WHERE t.status='done')::int done_count FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.user_id=p.user_id WHERE p.user_id=$1 GROUP BY p.id ORDER BY p.updated_at DESC`,[req.user.sub]);res.json({projects:result.rows});});
app.post('/api/projects',auth,async(req,res)=>{const parsed=projectSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Project name is required'});const result=await query('INSERT INTO projects(user_id,name,description) VALUES($1,$2,$3) RETURNING *',[req.user.sub,parsed.data.name,parsed.data.description||'']);res.status(201).json({project:result.rows[0]});});
app.patch('/api/projects/:id',auth,async(req,res)=>{const parsed=projectSchema.partial().extend({status:z.enum(['active','paused','done']).optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid project update'});const result=await query('UPDATE projects SET name=COALESCE($1,name),description=COALESCE($2,description),status=COALESCE($3,status),updated_at=NOW() WHERE id=$4 AND user_id=$5 RETURNING *',[parsed.data.name??null,parsed.data.description??null,parsed.data.status??null,req.params.id,req.user.sub]);if(!result.rowCount)return res.status(404).json({error:'Project not found'});res.json({project:result.rows[0]});});
app.delete('/api/projects/:id',auth,async(req,res)=>{const result=await query('DELETE FROM projects WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub]);if(!result.rowCount)return res.status(404).json({error:'Project not found'});res.status(204).end();});
app.get('/api/projects/:id/tasks',auth,async(req,res)=>{const result=await query('SELECT t.* FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.project_id=$1 AND t.user_id=$2 AND p.user_id=$2 ORDER BY t.created_at',[req.params.id,req.user.sub]);res.json({tasks:result.rows});});
app.post('/api/projects/:id/tasks',auth,async(req,res)=>{const parsed=taskSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Task title is required'});if(!(await query('SELECT id FROM projects WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub])).rowCount)return res.status(404).json({error:'Project not found'});const result=await query('INSERT INTO tasks(project_id,user_id,title) VALUES($1,$2,$3) RETURNING *',[req.params.id,req.user.sub,parsed.data.title]);await query('UPDATE projects SET updated_at=NOW() WHERE id=$1',[req.params.id]);res.status(201).json({task:result.rows[0]});});
app.patch('/api/tasks/:id',auth,async(req,res)=>{const parsed=z.object({status:z.enum(['todo','doing','done']).optional(),title:z.string().trim().min(1).max(300).optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid task update'});const result=await query('UPDATE tasks SET status=COALESCE($1,status),title=COALESCE($2,title),updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING *',[parsed.data.status??null,parsed.data.title??null,req.params.id,req.user.sub]);if(!result.rowCount)return res.status(404).json({error:'Task not found'});const project=(await query('SELECT project_id FROM tasks WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub])).rows[0];if(project)await query('UPDATE projects SET updated_at=NOW() WHERE id=$1',[project.project_id]);res.json({task:result.rows[0]});});
app.delete('/api/tasks/:id',auth,async(req,res)=>{const result=await query('DELETE FROM tasks WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub]);if(!result.rowCount)return res.status(404).json({error:'Task not found'});res.status(204).end();});
app.use(express.static(DIST_DIR,{index:'index.html'}));
app.get(/^\/(?!api(?:\/|$)).*/, (req,res,next)=>{if(req.method!=='GET')return next();res.sendFile(path.join(DIST_DIR,'index.html'),error=>error&&next(error));});
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:'Internal server error'});});
initDb().then(()=>app.listen(PORT,()=>console.log(`Team ZyvoraX API listening on ${PORT}`))).catch(error=>{console.error('Database initialization failed:',error);process.exit(1);});

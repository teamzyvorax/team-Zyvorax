// Secure session migration runner. CI validates this script before applying it.
import fs from 'node:fs';
import crypto from 'node:crypto';

const file = 'server/index.js';
let s = fs.readFileSync(file, 'utf8');

const oldAuth = `function auth(req, res, next) {\n  const header = req.headers.authorization || '';\n  const token = header.startsWith('Bearer ') ? header.slice(7) : null;\n  if (!token || !JWT_SECRET) return res.status(401).json({ error: 'Authentication required' });\n  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Invalid or expired session' }); }\n}`;
const newAuth = `async function auth(req, res, next) {\n  try {\n    const bearer = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';\n    const raw = cookie(req, '__Host-zyvorax_session') || bearer;\n    if (!raw) return res.status(401).json({ error: 'Authentication required' });\n    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');\n    const result = await query('SELECT s.id,s.user_id,s.expires_at,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()',[tokenHash]);\n    if (!result.rowCount) return res.status(401).json({ error: 'Invalid or expired session' });\n    await query('UPDATE sessions SET last_seen_at=NOW() WHERE id=$1',[result.rows[0].id]);\n    req.sessionId=result.rows[0].id;\n    req.user={sub:result.rows[0].user_id,email:result.rows[0].email};\n    next();\n  } catch { return res.status(401).json({ error: 'Invalid or expired session' }); }\n}`;
if (!s.includes(oldAuth)) throw new Error('auth function pattern not found');
s=s.replace(oldAuth,newAuth);

const marker = `function origin(req) { return CLIENT_ORIGIN || \`${'${req.protocol}'}://${'${req.get(\'host\')}' }\`; }`;
const insertAfter = `function verifyState(value, provider) { const s=jwt.verify(value, JWT_SECRET); if(s.provider!==provider) throw Error('Invalid OAuth state'); return s; }`;
const sessionFns = `${insertAfter}\nfunction newSessionToken(){return crypto.randomBytes(32).toString('base64url');}\nasync function createSession(user,req){const raw=newSessionToken();const hash=crypto.createHash('sha256').update(raw).digest('hex');await query('INSERT INTO sessions(user_id,token_hash,user_agent,ip_address,label,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL \'30 days\')',[user.id,hash,String(req.get('user-agent')||'').slice(0,500),String(req.ip||'').slice(0,100),'Browser session']);setCookie(req.res,'__Host-zyvorax_session',raw,60*60*24*30);return raw;}\nfunction sessionCookieClear(res){clearCookie(res,'__Host-zyvorax_session');}`;
if (!s.includes(insertAfter)) throw new Error('state function marker not found');
s=s.replace(insertAfter,sessionFns);

s=s.replace(`res.status(201).json({user,token:sign(user)});`, `await createSession(user,req); res.status(201).json({user});`);
s=s.replace(`res.json({user:{id:user.id,email:user.email,created_at:user.created_at},token:sign(user)});`, `await createSession(user,req); res.json({user:{id:user.id,email:user.email,created_at:user.created_at}});`);

const oldOAuthSession = `app.get('/api/auth/oauth-session',(req,res)=>{const token=cookie(req,'zyvorax_oauth_session');if(!token)return res.status(401).json({error:'No OAuth session'});clearCookie(res,'zyvorax_oauth_session');try{const payload=jwt.verify(token,JWT_SECRET);res.json({token});}catch{res.status(401).json({error:'OAuth session expired'});}});`;
const newOAuthSession = `app.get('/api/auth/oauth-session',async(req,res)=>{const token=cookie(req,'zyvorax_oauth_session');if(!token)return res.status(401).json({error:'No OAuth session'});clearCookie(res,'zyvorax_oauth_session');try{const payload=jwt.verify(token,JWT_SECRET);const user=(await query('SELECT id,email,created_at FROM users WHERE id=$1',[payload.sub])).rows[0];if(!user)return res.status(401).json({error:'Account not found'});await createSession(user,req);res.json({user});}catch{res.status(401).json({error:'OAuth session expired'});}});`;
if (!s.includes(oldOAuthSession)) throw new Error('OAuth session endpoint pattern not found');
s=s.replace(oldOAuthSession,newOAuthSession);

const apiMarker = `app.get('/api/intents',auth,async(req,res)=>`;
const sessionRoutes = `app.post('/api/auth/logout',auth,async(req,res)=>{await query('UPDATE sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[req.sessionId,req.user.sub]);sessionCookieClear(res);res.setHeader('Clear-Site-Data','"cache", "cookies", "storage"');res.status(204).end();});\napp.get('/api/auth/sessions',auth,async(req,res)=>{const result=await query('SELECT id,user_agent,ip_address,label,created_at,last_seen_at,expires_at,(id=$1) AS current FROM sessions WHERE user_id=$2 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY last_seen_at DESC',[req.sessionId,req.user.sub]);res.json({sessions:result.rows});});\napp.delete('/api/auth/sessions/:id',auth,async(req,res)=>{const result=await query('UPDATE sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',[req.params.id,req.user.sub]);if(!result.rowCount)return res.status(404).json({error:'Session not found'});res.status(204).end();});\napp.post('/api/auth/sessions/revoke-all',auth,async(req,res)=>{await query('UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL AND id<>$2',[req.user.sub,req.sessionId]);res.status(204).end();});\n${apiMarker}`;
if (!s.includes(apiMarker)) throw new Error('API marker not found');
s=s.replace(apiMarker,sessionRoutes);

fs.writeFileSync(file,s);
console.log('Secure session migration applied');

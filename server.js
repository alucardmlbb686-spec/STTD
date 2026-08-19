const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const db = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

const SESSION_COOKIE = 'starcurrency_session';
const SESSION_DAYS = 7;
const allowedMethods = new Set(['venmo', 'paypal', 'zelle', 'cashapp']);
const allowedStatuses = new Set(['draft', 'awaiting_deposit', 'deposit_confirming', 'open', 'accepted', 'in_progress', 'awaiting_confirmation', 'under_admin_review', 'completed', 'disputed', 'cancelled']);

async function query(text, values){
  if (!db) throw new Error('DATABASE_URL is required for API access');
  return db.query(text, values);
}

function hashToken(token){ return crypto.createHash('sha256').update(token).digest('hex'); }
function setSessionCookie(res, token){
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}
function clearSessionCookie(res){ res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`); }
function publicUser(row){ return { id: row.id, name: row.full_name, email: row.email, role: row.role, completedRequests: row.completed_requests }; }
function publicRequest(row, viewerId, viewerRole){
  const isOwner = viewerId === row.requester_id;
  const isFulfiller = viewerId === row.fulfiller_id;
  const canViewPrivate = isOwner || isFulfiller || viewerRole === 'admin';
  return {
    id: row.id, requester: row.requester_name, requesterId: row.requester_id, fulfiller: row.fulfiller_name,
    recipientName: canViewPrivate ? row.recipient_name : undefined,
    recipient: canViewPrivate ? row.recipient_contact : 'Hidden until acceptance',
    method: row.method, amount: Number(row.amount), reward: Number(row.reward), fee: Number(row.fee), total: Number(row.total),
    reason: row.reason, dueAt: row.due_at, note: row.note, escrowAsset: row.escrow_asset, escrowTxHash: canViewPrivate ? row.escrow_tx_hash : undefined,
    depositStatus: row.deposit_status, status: row.status, proof: row.proof_details ? { details: row.proof_details, submittedAt: row.proof_submitted_at } : null,
    dispute: row.dispute_reason ? { reason: row.dispute_reason } : null, reputation: row.requester_completed_requests, completedRequests: row.requester_completed_requests,
    createdAt: row.created_at, mine: row.requester_id === viewerId,
  };
}

async function requireUser(req, res, next){
  try{
    const token = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.split('=')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const result = await query(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashToken(token)]);
    if (!result.rows[0]) return res.status(401).json({ error: 'Session expired' });
    req.user = result.rows[0];
    next();
  }catch(error){ next(error); }
}

function requireAdmin(req, res, next){
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function createSession(user, res){
  const token = crypto.randomBytes(32).toString('hex');
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)', [hashToken(token), user.id, `${SESSION_DAYS} days`]);
  setSessionCookie(res, token);
}

app.post('/api/auth/register', async (req, res, next) => {
  try{
    const { name, email, password } = req.body;
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 8) return res.status(400).json({ error: 'Name, valid email, and an 8+ character password are required' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query('INSERT INTO users (full_name, email, password_hash) VALUES ($1, lower($2), $3) RETURNING *', [name.trim(), email.trim(), passwordHash]);
    await createSession(result.rows[0], res);
    res.status(201).json({ user: publicUser(result.rows[0]) });
  }catch(error){ if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' }); next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try{
    const result = await query('SELECT * FROM users WHERE email = lower($1)', [req.body.email?.trim()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    await createSession(user, res);
    res.json({ user: publicUser(user) });
  }catch(error){ next(error); }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try{
    const token = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.split('=')[1];
    if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    clearSessionCookie(res); res.status(204).end();
  }catch(error){ next(error); }
});
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/auth/me', requireUser, async (req, res, next) => {
  try{
    const { name, email } = req.body;
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Name and valid email are required' });
    const result = await query('UPDATE users SET full_name = $1, email = lower($2) WHERE id = $3 RETURNING *', [name.trim(), email.trim(), req.user.id]);
    res.json({ user: publicUser(result.rows[0]) });
  }catch(error){ if (error.code === '23505') return res.status(409).json({ error: 'That email is already in use' }); next(error); }
});

const requestSelect = `SELECT r.*, requester.full_name AS requester_name, requester.completed_requests AS requester_completed_requests, fulfiller.full_name AS fulfiller_name FROM requests r JOIN users requester ON requester.id = r.requester_id LEFT JOIN users fulfiller ON fulfiller.id = r.fulfiller_id`;

app.get('/api/requests', requireUser, async (req, res, next) => {
  try{
    res.set('Cache-Control', 'no-store');
    const params = [];
    let where = '';
    if (req.query.mine === '1'){ params.push(req.user.id); where = ` WHERE r.requester_id = $1 OR r.fulfiller_id = $1`; }
    else where = ` WHERE r.status = 'open' AND r.deposit_status = 'confirmed'`;
    const result = await query(`${requestSelect}${where} ORDER BY r.created_at DESC`, params);
    res.json({ requests: result.rows.map(row => publicRequest(row, req.user.id, req.user.role)) });
  }catch(error){ next(error); }
});

app.post('/api/requests', requireUser, async (req, res, next) => {
  try{
    const { method, recipientName, recipient, amount, reward, reason, dueAt, note, escrowAsset } = req.body;
    const amountNumber = Number(amount); const rewardNumber = Number(reward || 0); const fee = Math.round(amountNumber * 0.025 * 100) / 100;
    if (!allowedMethods.has(method) || !recipientName?.trim() || !recipient?.trim() || !amountNumber || amountNumber <= 0 || rewardNumber < 0 || !reason?.trim() || !dueAt || !['BTC','USDT'].includes(escrowAsset)) return res.status(400).json({ error: 'Complete all request fields with valid values' });
    const result = await query(`INSERT INTO requests (requester_id, method, recipient_name, recipient_contact, amount, reward, fee, total, reason, due_at, note, escrow_asset) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [req.user.id, method, recipientName.trim(), recipient.trim(), amountNumber, rewardNumber, fee, amountNumber + rewardNumber + fee, reason.trim(), dueAt, note?.trim() || null, escrowAsset]);
    const created = await query(`${requestSelect} WHERE r.id = $1`, [result.rows[0].id]);
    res.status(201).json({ request: publicRequest(created.rows[0], req.user.id) });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/deposit', requireUser, async (req, res, next) => {
  try{
    if (!req.body.txHash?.trim()) return res.status(400).json({ error: 'A blockchain transaction hash is required' });
    const result = await query(`UPDATE requests SET escrow_tx_hash = $1, deposit_status = 'confirming', status = 'deposit_confirming' WHERE id = $2 AND requester_id = $3 AND status = 'awaiting_deposit' RETURNING id`, [req.body.txHash.trim(), req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request cannot accept a deposit in its current state' });
    res.json({ status: 'deposit_confirming' });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/accept', requireUser, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET fulfiller_id = $1, status = 'accepted' WHERE id = $2 AND status = 'open' AND deposit_status = 'confirmed' AND requester_id <> $1 RETURNING id`, [req.user.id, req.params.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request is no longer available' });
    res.json({ status: 'accepted' });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/proof', requireUser, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET proof_details = $1, proof_submitted_at = now(), status = 'awaiting_confirmation' WHERE id = $2 AND fulfiller_id = $3 AND status IN ('accepted','in_progress') RETURNING id`, [req.body.details?.trim(), req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Proof cannot be submitted in this state' });
    res.json({ status: 'awaiting_confirmation' });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/confirm', requireUser, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET status = 'under_admin_review', completed_at = now() WHERE id = $1 AND requester_id = $2 AND status = 'awaiting_confirmation' RETURNING id`, [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request is not awaiting confirmation' });
    res.json({ status: 'under_admin_review' });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/dispute', requireUser, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET status = 'disputed', dispute_reason = $1 WHERE id = $2 AND (requester_id = $3 OR fulfiller_id = $3) AND status IN ('awaiting_confirmation','under_admin_review') RETURNING id`, [req.body.reason?.trim() || 'Issue reported by user', req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request cannot be disputed in this state' });
    res.json({ status: 'disputed' });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/cancel', requireUser, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET status = 'cancelled' WHERE id = $1 AND requester_id = $2 AND status IN ('draft','awaiting_deposit','deposit_confirming','open') RETURNING id`, [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request cannot be cancelled in this state' });
    res.json({ status: 'cancelled' });
  }catch(error){ next(error); }
});

app.get('/api/admin/requests', requireUser, requireAdmin, async (req, res, next) => {
  try{ const result = await query(`${requestSelect} ORDER BY r.created_at DESC`); res.json({ requests: result.rows.map(row => publicRequest(row, req.user.id, req.user.role)) }); }catch(error){ next(error); }
});
app.post('/api/admin/requests/:id/review', requireUser, requireAdmin, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET status = CASE WHEN status = 'deposit_confirming' THEN 'open' WHEN status = 'under_admin_review' THEN 'completed' ELSE status END, deposit_status = CASE WHEN status = 'deposit_confirming' THEN 'confirmed' ELSE deposit_status END, released_at = CASE WHEN status = 'under_admin_review' THEN now() ELSE released_at END, released_by = CASE WHEN status = 'under_admin_review' THEN $1 ELSE released_by END WHERE id = $2 AND status IN ('deposit_confirming','under_admin_review') RETURNING status`, [req.user.id, req.params.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request is not ready for this admin action' });
    res.json({ status: result.rows[0].status });
  }catch(error){ next(error); }
});

app.get('/health', async (req, res) => {
  if (!db) return res.json({ ok: true, database: 'not configured' });
  try {
    await db.query('SELECT 1');
    const tables = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'sessions', 'requests') ORDER BY table_name`);
    const requiredTables = ['requests', 'sessions', 'users'];
    const ready = requiredTables.every(table => tables.rows.some(row => row.table_name === table));
    res.status(ready ? 200 : 503).json({ ok: ready, database: 'connected', tables: tables.rows.map(row => row.table_name), message: ready ? 'schema ready' : 'schema incomplete' });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

async function initializeDatabase(){
  if (!db) return;
  await db.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.query(`INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, lower($2), $3, 'admin') ON CONFLICT (email) DO NOTHING`, [process.env.ADMIN_NAME || 'Platform Administrator', process.env.ADMIN_EMAIL, passwordHash]);
  }
}

// Clean URL routes -> matching html file
const routes = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/dashboard': 'dashboard.html',
  '/create-request': 'create-request.html',
  '/browse-requests': 'browse-requests.html',
  '/my-requests': 'my-requests.html',
  '/admin': 'admin-login.html',
  '/admin-login': 'admin-login.html',
  '/admin-dashboard': 'admin-dashboard.html',
};

Object.entries(routes).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
});

// 404 fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.code === '23505' ? 409 : 500).json({ error: 'Unexpected server error' });
});

initializeDatabase().then(() => app.listen(PORT, () => console.log(`StarCurrency running at http://localhost:${PORT}`))).catch(error => { console.error('Database initialization failed:', error.message); process.exit(1); });

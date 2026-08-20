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
function depositAddress(asset){
  const address = asset === 'BTC' ? process.env.ESCROW_BTC_ADDRESS : process.env.ESCROW_USDT_ADDRESS;
  if (!address) throw new Error(`ESCROW_${asset}_ADDRESS is required before creating deposit requests`);
  return address;
}
function depositMemo(requestId){ return `SC-${requestId.replaceAll('-', '').slice(0, 16).toUpperCase()}`; }
function assetAmount(asset, usdTotal){
  if (asset === 'USDT') return Number(usdTotal.toFixed(6));
  const rate = Number(process.env.BTC_USD_RATE);
  if (!rate || rate <= 0) throw new Error('BTC_USD_RATE is required before creating BTC deposit requests');
  return Number((usdTotal / rate).toFixed(8));
}
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
    recipientName: row.recipient_name,
    recipient: canViewPrivate ? row.recipient_contact : 'Hidden until acceptance',
    method: row.method, amount: Number(row.amount), reward: Number(row.reward), fee: Number(row.fee), total: Number(row.total),
    reason: row.reason, dueAt: row.due_at, note: row.note, escrowAsset: row.escrow_asset, escrowTxHash: canViewPrivate ? row.escrow_tx_hash : undefined,
    depositAddress: canViewPrivate ? row.deposit_address : undefined, depositMemo: canViewPrivate ? row.deposit_memo : undefined, depositAmount: canViewPrivate ? Number(row.deposit_amount || 0) : undefined,
    requiredConfirmations: row.required_confirmations, confirmations: row.confirmations,
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
    const amountNumber = Number(amount); const rewardNumber = Number(reward || 0); const fee = Math.round((amountNumber + rewardNumber) * 0.025 * 100) / 100;
    if (!allowedMethods.has(method) || !recipientName?.trim() || !recipient?.trim() || !amountNumber || amountNumber <= 0 || rewardNumber < 0 || !reason?.trim() || !dueAt || !['BTC','USDT'].includes(escrowAsset)) return res.status(400).json({ error: 'Complete all request fields with valid values' });
    const client = await db.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await client.query(`INSERT INTO requests (requester_id, method, recipient_name, recipient_contact, amount, reward, fee, total, reason, due_at, note, escrow_asset) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [req.user.id, method, recipientName.trim(), recipient.trim(), amountNumber, rewardNumber, fee, amountNumber + rewardNumber + fee, reason.trim(), dueAt, note?.trim() || null, escrowAsset]);
      const id = result.rows[0].id;
      const address = depositAddress(escrowAsset); const memo = depositMemo(id);
      const depositAmount = assetAmount(escrowAsset, amountNumber + rewardNumber + fee);
      await client.query('UPDATE requests SET deposit_address = $1, deposit_memo = $2, deposit_amount = $3 WHERE id = $4', [address, memo, depositAmount, id]);
      await client.query('INSERT INTO deposit_addresses (user_id, request_id, asset, address, memo) VALUES ($1,$2,$3,$4,$5)', [req.user.id, id, escrowAsset, address, memo]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const created = await query(`${requestSelect} WHERE r.id = $1`, [result.rows[0].id]);
    res.status(201).json({ request: { ...publicRequest(created.rows[0], req.user.id), depositAddress: created.rows[0].deposit_address, depositMemo: created.rows[0].deposit_memo, requiredConfirmations: created.rows[0].required_confirmations, confirmations: created.rows[0].confirmations } });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/deposit', requireUser, async (req, res, next) => {
  try{
    if (!req.body.txHash?.trim()) return res.status(400).json({ error: 'A blockchain transaction hash is required' });
    const result = await query(`UPDATE requests SET escrow_tx_hash = $1, deposit_status = 'confirming', status = 'deposit_confirming' WHERE id = $2 AND requester_id = $3 AND status = 'awaiting_deposit' RETURNING id, escrow_asset, total`, [req.body.txHash.trim(), req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request cannot accept a deposit in its current state' });
    const amount = await query('SELECT deposit_amount FROM requests WHERE id = $1', [req.params.id]);
    await query(`INSERT INTO ledger_entries (user_id, request_id, asset, entry_type, amount, tx_hash, status, metadata) VALUES ($1,$2,$3,'deposit',$4,$5,'pending',$6)`, [req.user.id, req.params.id, result.rows[0].escrow_asset, amount.rows[0].deposit_amount, req.body.txHash.trim(), JSON.stringify({ source: 'user-submitted', requiredConfirmations: 3 })]);
    res.json({ status: 'deposit_confirming' });
  }catch(error){ next(error); }
});

app.post('/api/webhooks/blockchain', async (req, res, next) => {
  try{
    if (!process.env.BLOCKCHAIN_WEBHOOK_SECRET || req.headers['x-blockchain-secret'] !== process.env.BLOCKCHAIN_WEBHOOK_SECRET) return res.status(401).json({ error: 'Unauthorized webhook' });
    const { txHash, confirmations, amount, asset } = req.body;
    if (!txHash || !Number.isFinite(Number(confirmations))) return res.status(400).json({ error: 'txHash and confirmations are required' });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT r.*, le.id AS ledger_id FROM requests r JOIN ledger_entries le ON le.request_id = r.id AND le.entry_type = 'deposit' WHERE r.escrow_tx_hash = $1 AND r.deposit_status = 'confirming' FOR UPDATE`, [txHash]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return res.json({ received: true, matched: false }); }
      const row = result.rows[0]; const count = Number(confirmations); const required = Number(row.required_confirmations || 3);
      if (asset && asset !== row.escrow_asset) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Deposit asset does not match request escrow asset' }); }
      if (amount !== undefined && Number(amount) < Number(row.deposit_amount)) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Deposit amount is below the required escrow amount' }); }
      await client.query(`UPDATE ledger_entries SET confirmations = $1, status = CASE WHEN $1 >= $2 THEN 'confirmed' ELSE 'pending' END WHERE id = $3`, [count, required, row.ledger_id]);
      if (count >= required) {
        await client.query(`UPDATE requests SET deposit_status = 'confirmed', status = 'open', confirmations = $1, deposit_amount = COALESCE(deposit_amount, $2) WHERE id = $3`, [count, amount || row.deposit_amount, row.id]);
        await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, entry_type, amount, status, confirmations, metadata) SELECT requester_id, id, escrow_asset, 'escrow_lock', COALESCE(deposit_amount, $1), 'confirmed', $2, '{"source":"blockchain-webhook"}' FROM requests WHERE id = $3 AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE request_id = $3 AND entry_type = 'escrow_lock')`, [amount || row.deposit_amount, count, row.id]);
        await client.query(`INSERT INTO wallets (user_id, asset, locked_balance) SELECT requester_id, escrow_asset, COALESCE(deposit_amount, $1) FROM requests WHERE id = $2 ON CONFLICT (user_id, asset) DO UPDATE SET locked_balance = wallets.locked_balance + EXCLUDED.locked_balance`, [amount || row.deposit_amount, row.id]);
      } else {
        await client.query(`UPDATE requests SET confirmations = $1 WHERE id = $2`, [count, row.id]);
      }
      await client.query('COMMIT');
      res.json({ received: true, matched: true, status: count >= required ? 'open' : 'deposit_confirming', confirmations: count });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/accept', requireUser, async (req, res, next) => {
  try{
    if (!req.body.walletAddress?.trim()) return res.status(400).json({ error: 'Your BTC or USDT payout wallet address is required' });
    const result = await query(`UPDATE requests SET fulfiller_id = $1, fulfiller_wallet = $2, status = 'accepted' WHERE id = $3 AND status = 'open' AND deposit_status = 'confirmed' AND requester_id <> $1 RETURNING id`, [req.user.id, req.body.walletAddress.trim(), req.params.id]);
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
app.get('/api/wallet', requireUser, async (req, res, next) => {
  try{
    const wallets = await query(`SELECT asset, available_balance, locked_balance FROM wallets WHERE user_id = $1 ORDER BY asset`, [req.user.id]);
    const ledger = await query(`SELECT id, request_id, asset, entry_type, amount, tx_hash, status, confirmations, metadata, created_at FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
    res.json({ wallets: wallets.rows, ledger: ledger.rows });
  }catch(error){ next(error); }
});
app.post('/api/admin/deposits/:id/confirm', requireUser, requireAdmin, async (req, res, next) => {
  const client = await db.connect();
  try{
    await client.query('BEGIN');
    const deposit = await client.query(`SELECT r.*, le.id AS ledger_id FROM requests r JOIN ledger_entries le ON le.request_id = r.id AND le.entry_type = 'deposit' WHERE r.id = $1 AND r.status = 'deposit_confirming' FOR UPDATE`, [req.params.id]);
    if (!deposit.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Deposit is not awaiting confirmation' }); }
    const row = deposit.rows[0]; const confirmations = Math.max(3, Number(req.body.confirmations || 3));
    await client.query(`UPDATE requests SET deposit_status = 'confirmed', status = 'open', confirmations = $1 WHERE id = $2`, [confirmations, req.params.id]);
    await client.query(`UPDATE ledger_entries SET status = 'confirmed', confirmations = $1 WHERE id = $2`, [confirmations, row.ledger_id]);
    await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, entry_type, amount, status, confirmations, metadata) VALUES ($1,$2,$3,'escrow_lock',$4,'confirmed',$5,'{"source":"deposit-confirmation"}')`, [row.requester_id, row.id, row.escrow_asset, row.deposit_amount, confirmations]);
    await client.query(`INSERT INTO wallets (user_id, asset, locked_balance) VALUES ($1,$2,$3) ON CONFLICT (user_id, asset) DO UPDATE SET locked_balance = wallets.locked_balance + EXCLUDED.locked_balance`, [row.requester_id, row.escrow_asset, row.deposit_amount]);
    await client.query('COMMIT');
    res.json({ status: 'open', confirmations });
  }catch(error){ await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});
app.post('/api/admin/requests/:id/review', requireUser, requireAdmin, async (req, res, next) => {
  const client = await db.connect();
  try{
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM requests WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const row = result.rows[0];
    if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Request not found' }); }
    if (row.status === 'deposit_confirming') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Confirm the blockchain deposit before opening this request' }); }
    if (row.status !== 'under_admin_review') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Request is not ready for escrow release' }); }
    if (!row.fulfiller_id || row.deposit_status !== 'confirmed' || !row.deposit_amount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Escrow is not locked' }); }
    const destination = (req.body.destinationAddress || row.fulfiller_wallet)?.trim();
    if (!destination) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Fulfiller withdrawal address is required' }); }
    await client.query(`UPDATE requests SET status = 'completed', released_at = now(), released_by = $1 WHERE id = $2`, [req.user.id, req.params.id]);
    const releaseAmount = assetAmount(row.escrow_asset, Number(row.amount) + Number(row.reward));
    await client.query(`UPDATE wallets SET locked_balance = GREATEST(locked_balance - $1, 0) WHERE user_id = $2 AND asset = $3`, [row.deposit_amount, row.requester_id, row.escrow_asset]);
    await client.query(`INSERT INTO withdrawals (request_id, user_id, asset, destination_address, amount) VALUES ($1,$2,$3,$4,$5)`, [row.id, row.fulfiller_id, row.escrow_asset, destination, releaseAmount]);
    await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, entry_type, amount, status, metadata) VALUES ($1,$2,$3,'escrow_release',$4,'completed',$5)`, [row.requester_id, row.id, row.escrow_asset, releaseAmount, JSON.stringify({ releasedBy: req.user.id })]);
    await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, entry_type, amount, status, metadata) VALUES ($1,$2,$3,'withdrawal',$4,'pending',$5)`, [row.fulfiller_id, row.id, row.escrow_asset, releaseAmount, JSON.stringify({ destinationAddress: destination })]);
    await client.query('COMMIT');
    res.json({ status: 'completed', withdrawalStatus: 'pending' });
  }catch(error){ await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});
app.post('/api/admin/withdrawals/:id/confirm', requireUser, requireAdmin, async (req, res, next) => {
  const client = await db.connect();
  try{
    if (!req.body.txHash?.trim()) return res.status(400).json({ error: 'Withdrawal transaction hash is required' });
    await client.query('BEGIN');
    const result = await client.query(`SELECT w.*, r.escrow_asset FROM withdrawals w JOIN requests r ON r.id = w.request_id WHERE w.id = $1 AND w.status = 'pending' FOR UPDATE`, [req.params.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Withdrawal is not pending' });
    const withdrawal = result.rows[0];
    await client.query(`UPDATE withdrawals SET status = 'confirmed', tx_hash = $1, completed_at = now() WHERE id = $2`, [req.body.txHash.trim(), withdrawal.id]);
    await client.query(`UPDATE ledger_entries SET status = 'completed', tx_hash = $1 WHERE request_id = $2 AND user_id = $3 AND entry_type = 'withdrawal' AND status = 'pending'`, [req.body.txHash.trim(), withdrawal.request_id, withdrawal.user_id]);
    await client.query(`INSERT INTO wallets (user_id, asset, available_balance) VALUES ($1,$2,$3) ON CONFLICT (user_id, asset) DO UPDATE SET available_balance = wallets.available_balance + EXCLUDED.available_balance`, [withdrawal.user_id, withdrawal.asset, withdrawal.amount]);
    await client.query('COMMIT');
    res.json({ status: 'confirmed', txHash: req.body.txHash.trim() });
  }catch(error){ await client.query('ROLLBACK'); next(error); } finally { client.release(); }
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
  await db.query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS deposit_address TEXT, ADD COLUMN IF NOT EXISTS deposit_memo TEXT, ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(28,8), ADD COLUMN IF NOT EXISTS required_confirmations INTEGER NOT NULL DEFAULT 3, ADD COLUMN IF NOT EXISTS confirmations INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS fulfiller_wallet TEXT`);
  await db.query(`UPDATE requests SET fee = ROUND((amount + reward) * 0.025, 2), total = amount + reward + ROUND((amount + reward) * 0.025, 2) WHERE fee <> ROUND((amount + reward) * 0.025, 2) OR total <> amount + reward + ROUND((amount + reward) * 0.025, 2)`);
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

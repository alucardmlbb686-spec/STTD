const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const createWalletRouter = require('./routes/wallet');
const coinbase = require('./services/coinbaseService');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROOF_DIR = path.join(__dirname, 'uploads', 'proofs');
const CHAT_DIR = path.join(__dirname, 'uploads', 'chat');
const db = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));
fs.mkdirSync(PROOF_DIR, { recursive: true });
fs.mkdirSync(CHAT_DIR, { recursive: true });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false });
const proofUpload = multer({
  storage: multer.diskStorage({
    destination: PROOF_DIR,
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => callback(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
});
const chatUpload = multer({
  storage: multer.diskStorage({
    destination: CHAT_DIR,
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => callback(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
});
const SESSION_COOKIE = 'starcurrency_session';
const SESSION_DAYS = 7;
const allowedMethods = new Set(['venmo', 'paypal', 'zelle', 'cashapp']);

async function query(text, values){
  if (!db) throw new Error('DATABASE_URL is required for API access');
  return db.query(text, values);
}

function hashToken(token){ return crypto.createHash('sha256').update(token).digest('hex'); }
function isSandbox(){ return process.env.ESCROW_MODE === 'sandbox'; }
function sandboxAssets(){ return ['USDC', 'USDT']; }
function depositAddress(asset){
  if (isSandbox()) return null;
  const address = asset === 'BTC' ? process.env.ESCROW_BTC_ADDRESS : process.env.ESCROW_USDT_ADDRESS;
  if (!address || address.startsWith('your-') || address.includes('PASTE_')) {
    const error = new Error(`Set ESCROW_${asset}_ADDRESS in Render before creating ${asset} deposit requests`);
    error.statusCode = 503;
    throw error;
  }
  return address;
}
function depositMemo(requestId){ return `SC-${requestId.replaceAll('-', '').slice(0, 16).toUpperCase()}`; }
function assetAmount(asset, usdTotal){
  if (asset === 'USDT' || asset === 'USDC') return Number(usdTotal.toFixed(6));
  const rate = Number(process.env.BTC_USD_RATE);
  if (!rate || rate <= 0) {
    const error = new Error('Set BTC_USD_RATE in Render before creating BTC deposit requests');
    error.statusCode = 503;
    throw error;
  }
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
    escrowMode: row.escrow_mode, cdpAccountId: canViewPrivate ? row.cdp_account_id : undefined, cdpTransactionId: canViewPrivate ? row.cdp_transaction_id : undefined,
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

async function getParticipantRequest(requestId, userId){
  const result = await query(`SELECT id, requester_id, fulfiller_id FROM requests WHERE id = $1 AND (requester_id = $2 OR fulfiller_id = $2)`, [requestId, userId]);
  return result.rows[0];
}

function publicChatMessage(row, userId){
  return { id: row.id, requestId: row.request_id, senderId: row.sender_id, mine: row.sender_id === userId, body: row.body, attachment: row.attachment_path ? { name: row.attachment_name, mime: row.attachment_mime, size: row.attachment_size, url: `/api/requests/${row.request_id}/chat/attachment/${row.id}` } : null, createdAt: row.created_at, senderName: row.sender_name };
}

async function createSession(user, res){
  const token = crypto.randomBytes(32).toString('hex');
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)', [hashToken(token), user.id, `${SESSION_DAYS} days`]);
  setSessionCookie(res, token);
}

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try{
    const { name, email, password } = req.body;
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 8) return res.status(400).json({ error: 'Name, valid email, and an 8+ character password are required' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query('INSERT INTO users (full_name, email, password_hash) VALUES ($1, lower($2), $3) RETURNING *', [name.trim(), email.trim(), passwordHash]);
    await createSession(result.rows[0], res);
    res.status(201).json({ user: publicUser(result.rows[0]) });
  }catch(error){ if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' }); next(error); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
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

app.use('/api/wallet', createWalletRouter({ requireUser, requireAdmin, query: (...args) => query(...args) }));

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
    const allowedAssets = isSandbox() ? sandboxAssets() : ['BTC', 'USDT'];
    if (!allowedMethods.has(method) || !recipientName?.trim() || !recipient?.trim() || !amountNumber || amountNumber <= 0 || rewardNumber < 0 || !reason?.trim() || !dueAt || !allowedAssets.includes(escrowAsset)) return res.status(400).json({ error: `Complete all request fields. Supported escrow assets: ${allowedAssets.join(', ')}` });
    const client = await db.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await client.query(`INSERT INTO requests (requester_id, method, recipient_name, recipient_contact, amount, reward, fee, total, reason, due_at, note, escrow_asset, escrow_mode, cdp_account_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [req.user.id, method, recipientName.trim(), recipient.trim(), amountNumber, rewardNumber, fee, amountNumber + rewardNumber + fee, reason.trim(), dueAt, note?.trim() || null, escrowAsset, isSandbox() ? 'sandbox' : 'real', isSandbox() ? process.env.CDP_ACCOUNT_ID : null]);
      const id = result.rows[0].id;
      const address = depositAddress(escrowAsset); const memo = depositMemo(id);
      const depositAmount = assetAmount(escrowAsset, amountNumber + rewardNumber + fee);
      await client.query('UPDATE requests SET deposit_address = $1, deposit_memo = $2, deposit_amount = $3 WHERE id = $4', [address, memo, depositAmount, id]);
      if (!isSandbox()) await client.query('INSERT INTO deposit_addresses (user_id, request_id, asset, address, memo) VALUES ($1,$2,$3,$4,$5)', [req.user.id, id, escrowAsset, address, memo]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const created = await query(`${requestSelect} WHERE r.id = $1`, [result.rows[0].id]);
    res.status(201).json({ request: { ...publicRequest(created.rows[0], req.user.id), escrowMode: created.rows[0].escrow_mode, cdpAccountId: created.rows[0].cdp_account_id, depositAddress: created.rows[0].deposit_address, depositMemo: created.rows[0].deposit_memo, requiredConfirmations: created.rows[0].required_confirmations, confirmations: created.rows[0].confirmations, supportedAssets: isSandbox() ? sandboxAssets() : ['BTC', 'USDT'] } });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/deposit', requireUser, async (req, res, next) => {
  try{
    if (isSandbox()) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(`SELECT * FROM requests WHERE id = $1 AND requester_id = $2 AND status = 'awaiting_deposit' FOR UPDATE`, [req.params.id, req.user.id]);
        if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Request is not awaiting sandbox funding' }); }
        const row = result.rows[0];
        const cdpTransactionId = `sandbox_cdp_${crypto.randomUUID()}`;
        await client.query(`UPDATE requests SET status = 'funded', deposit_status = 'confirmed', confirmations = required_confirmations, cdp_transaction_id = $1 WHERE id = $2`, [cdpTransactionId, row.id]);
        await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, amount, entry_type, status, confirmations, metadata) VALUES ($1,$2,$3,$4,'deposit','confirmed',$5,$6)`, [row.requester_id, row.id, row.escrow_asset, row.deposit_amount, row.required_confirmations, JSON.stringify({ mode: 'sandbox', cdpAccountId: process.env.CDP_ACCOUNT_ID, simulated: true })]);
        await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, amount, entry_type, status, confirmations, metadata) VALUES ($1,$2,$3,$4,'escrow_lock','confirmed',$5,$6)`, [row.requester_id, row.id, row.escrow_asset, row.deposit_amount, row.required_confirmations, JSON.stringify({ mode: 'sandbox', cdpTransactionId })]);
        await client.query(`INSERT INTO wallets (user_id, asset, locked_balance) VALUES ($1,$2,$3) ON CONFLICT (user_id, asset) DO UPDATE SET locked_balance = wallets.locked_balance + EXCLUDED.locked_balance`, [row.requester_id, row.escrow_asset, row.deposit_amount]);
        await client.query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1,'awaiting_deposit','funded',$2),($1,'funded','open',$2)`, [row.id, req.user.id]);
        await client.query(`UPDATE requests SET status = 'open' WHERE id = $1`, [row.id]);
        await client.query('COMMIT');
        return res.json({ status: 'open', fundingStatus: 'funded', simulated: true, cdpAccountId: process.env.CDP_ACCOUNT_ID, cdpTransactionId });
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
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
    const result = await query(`UPDATE requests SET fulfiller_id = $1, fulfiller_wallet = $2, status = 'payment_pending' WHERE id = $3 AND status = 'open' AND deposit_status = 'confirmed' AND requester_id <> $1 RETURNING id`, [req.user.id, req.body.walletAddress.trim(), req.params.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request is no longer available' });
    await query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1, 'open', 'accepted', $2),($1, 'accepted', 'payment_pending', $2)`, [req.params.id, req.user.id]);
    res.json({ status: 'payment_pending' });
  }catch(error){ next(error); }
});

function validImageSignature(filePath, mimeType){
  const bytes = fs.readFileSync(filePath);
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mimeType === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from([255,216,255]));
  if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}

app.post('/api/requests/:id/payment-proof', requireUser, proofUpload.single('proof'), async (req, res, next) => {
  try{
    if (!req.file) return res.status(400).json({ error: 'A PNG, JPG, JPEG, or WEBP proof image is required' });
    if (!validImageSignature(req.file.path, req.file.mimetype)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Uploaded file content does not match a supported image type' }); }
    const result = await query(`UPDATE requests SET proof_details = $1, proof_submitted_at = now(), status = 'payment_proof_submitted' WHERE id = $2 AND fulfiller_id = $3 AND status IN ('accepted','payment_pending','in_progress') RETURNING id`, [req.file.filename, req.params.id, req.user.id]);
    if (!result.rows[0]) { fs.unlinkSync(req.file.path); return res.status(409).json({ error: 'Only the accepted fulfiller can submit proof for an in-progress request' }); }
    await query(`INSERT INTO payment_proofs (request_id, user_id, file_path, file_name, mime_type, file_size) VALUES ($1,$2,$3,$4,$5,$6)`, [req.params.id, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]);
    await query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1, 'payment_pending', 'payment_proof_submitted', $2)`, [req.params.id, req.user.id]);
    res.status(201).json({ status: 'payment_proof_submitted', proof: { fileName: req.file.originalname, uploadedAt: new Date().toISOString() } });
  }catch(error){ if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); next(error); }
});

app.get('/api/requests/:id/chat', requireUser, async (req, res, next) => {
  try{
    const request = await getParticipantRequest(req.params.id, req.user.id);
    if (!request) return res.status(403).json({ error: 'Only the requester and accepted fulfiller can access this chat' });
    const result = await query(`SELECT m.*, u.full_name AS sender_name FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.request_id = $1 ORDER BY m.created_at ASC LIMIT 200`, [req.params.id]);
    res.json({ messages: result.rows.map(row => publicChatMessage(row, req.user.id)) });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/chat', requireUser, async (req, res, next) => {
  try{
    const request = await getParticipantRequest(req.params.id, req.user.id);
    if (!request) return res.status(403).json({ error: 'Only the requester and accepted fulfiller can send chat messages' });
    const body = req.body.body?.trim();
    if (!body || body.length > 4000) return res.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
    const result = await query(`INSERT INTO chat_messages (request_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *`, [req.params.id, req.user.id, body]);
    const sender = await query('SELECT full_name AS sender_name FROM users WHERE id = $1', [req.user.id]);
    res.status(201).json({ message: publicChatMessage({ ...result.rows[0], sender_name: sender.rows[0].sender_name }, req.user.id) });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/chat/upload', requireUser, chatUpload.single('attachment'), async (req, res, next) => {
  try{
    const request = await getParticipantRequest(req.params.id, req.user.id);
    if (!request) { if (req.file) fs.unlinkSync(req.file.path); return res.status(403).json({ error: 'Only the requester and accepted fulfiller can upload chat images' }); }
    if (!req.file || !validImageSignature(req.file.path, req.file.mimetype)) { if (req.file) fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Choose a valid PNG, JPG, JPEG, or WEBP image up to 8 MB' }); }
    const body = req.body.body?.trim() || null;
    const result = await query(`INSERT INTO chat_messages (request_id, sender_id, body, attachment_path, attachment_name, attachment_mime, attachment_size) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.params.id, req.user.id, body, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]);
    const sender = await query('SELECT full_name AS sender_name FROM users WHERE id = $1', [req.user.id]);
    res.status(201).json({ message: publicChatMessage({ ...result.rows[0], sender_name: sender.rows[0].sender_name }, req.user.id) });
  }catch(error){ if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); next(error); }
});

app.get('/api/requests/:id/chat/attachment/:messageId', requireUser, async (req, res, next) => {
  try{
    const request = await getParticipantRequest(req.params.id, req.user.id);
    if (!request) return res.status(403).json({ error: 'Chat access denied' });
    const result = await query(`SELECT attachment_path FROM chat_messages WHERE id = $1 AND request_id = $2`, [req.params.messageId, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = path.join(CHAT_DIR, path.basename(result.rows[0].attachment_path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment file unavailable' });
    res.sendFile(filePath);
  }catch(error){ next(error); }
});

app.get('/api/requests/:id/payment-proof', requireUser, async (req, res, next) => {
  try{
    const result = await query(`SELECT pp.file_path, pp.file_name, r.requester_id, r.fulfiller_id FROM payment_proofs pp JOIN requests r ON r.id = pp.request_id WHERE pp.request_id = $1 ORDER BY pp.created_at DESC LIMIT 1`, [req.params.id]);
    const proof = result.rows[0];
    if (!proof || (req.user.id !== proof.requester_id && req.user.id !== proof.fulfiller_id && req.user.role !== 'admin')) return res.status(404).json({ error: 'Payment proof not found' });
    const filePath = path.join(PROOF_DIR, path.basename(proof.file_path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Payment proof file unavailable' });
    res.type(path.extname(filePath)).sendFile(filePath);
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/proof', requireUser, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET proof_details = $1, proof_submitted_at = now(), status = 'payment_proof_submitted' WHERE id = $2 AND fulfiller_id = $3 AND status IN ('accepted','payment_pending','in_progress') RETURNING id`, [req.body.details?.trim(), req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Proof cannot be submitted in this state' });
    res.json({ status: 'payment_proof_submitted' });
  }catch(error){ next(error); }
});

app.post('/api/requests/:id/confirm', requireUser, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET status = 'confirmed', completed_at = now() WHERE id = $1 AND requester_id = $2 AND status = 'payment_proof_submitted' RETURNING id`, [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request is not awaiting payment confirmation' });
    await query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1, 'payment_proof_submitted', 'confirmed', $2)`, [req.params.id, req.user.id]);
    res.json({ status: 'confirmed' });
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
app.get('/api/admin/requests/review', requireUser, requireAdmin, async (req, res, next) => {
  try{
    const result = await query(`${requestSelect} WHERE r.status IN ('payment_proof_submitted','confirmed','awaiting_confirmation','under_admin_review','disputed') ORDER BY r.created_at ASC`);
    const proofs = await query(`SELECT id, request_id, file_path, file_name, mime_type, file_size, status, created_at FROM payment_proofs WHERE status = 'submitted' ORDER BY created_at ASC`);
    res.json({ requests: result.rows.map(row => publicRequest(row, req.user.id, req.user.role)), proofs: proofs.rows });
  }catch(error){ next(error); }
});
app.post('/api/admin/requests/:id/approve', requireUser, requireAdmin, async (req, res, next) => {
  try{
    const client = await db.connect();
    try{
      await client.query('BEGIN');
      const result = await client.query(`SELECT r.*, pp.id AS proof_id FROM requests r JOIN payment_proofs pp ON pp.request_id = r.id AND pp.status = 'submitted' WHERE r.id = $1 AND r.status IN ('payment_proof_submitted','confirmed') FOR UPDATE`, [req.params.id]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Request must have submitted proof and be confirmed for admin review' }); }
      const row = result.rows[0];
      // Coinbase Base Sepolia developer wallets support test ETH/USDC transfers. BTC/USDT requests use the PostgreSQL escrow ledger until a custody/network adapter is configured.
      await client.query(`UPDATE requests SET status = 'confirmed' WHERE id = $1`, [row.id]);
      await client.query(`UPDATE payment_proofs SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2`, [req.user.id, row.proof_id]);
      await client.query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1, 'payment_proof_submitted', 'confirmed', $2)`, [row.id, req.user.id]);
      await client.query('COMMIT');
      res.json({ status: 'confirmed', release: 'Use the admin release endpoint after review.' });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }catch(error){ next(error); }
});
app.post('/api/admin/requests/:id/reject', requireUser, requireAdmin, async (req, res, next) => {
  try{
    const result = await query(`UPDATE requests SET status = 'disputed', dispute_reason = $1 WHERE id = $2 AND status IN ('awaiting_confirmation','under_admin_review') RETURNING id`, [req.body.reason?.trim() || 'Payment proof rejected by admin', req.params.id]);
    if (!result.rows[0]) return res.status(409).json({ error: 'Request is not awaiting admin review' });
    await query(`UPDATE payment_proofs SET status = 'rejected', reviewed_by = $1, reviewed_at = now() WHERE request_id = $2 AND status = 'submitted'`, [req.user.id, req.params.id]);
    await query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1, 'under_review', 'disputed', $2)`, [req.params.id, req.user.id]);
    res.json({ status: 'disputed' });
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
    if (['payment_proof_submitted', 'awaiting_confirmation'].includes(row.status)) {
      const proof = await client.query(`SELECT id FROM payment_proofs WHERE request_id = $1 AND status = 'submitted' LIMIT 1`, [row.id]);
      if (!proof.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Payment proof must be submitted before review' }); }
      await client.query(`UPDATE requests SET status = 'confirmed' WHERE id = $1`, [row.id]);
      await client.query(`UPDATE payment_proofs SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2`, [req.user.id, proof.rows[0].id]);
      await client.query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1, $2, 'confirmed', $3)`, [row.id, row.status, req.user.id]);
      await client.query('COMMIT');
      return res.json({ status: 'confirmed', message: 'Payment proof approved. Escrow is ready for release.' });
    }
    if (!['confirmed', 'under_admin_review'].includes(row.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: `Request is not ready for escrow release. Current status: ${row.status}` }); }
    if (!row.fulfiller_id || row.deposit_status !== 'confirmed' || !row.deposit_amount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Escrow is not locked' }); }
    const destination = (req.body.destinationAddress || row.fulfiller_wallet)?.trim();
    if (!destination) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Fulfiller withdrawal address is required' }); }
    const externalTransactionId = null;
    const settlementMode = 'ledger_only_simulation';
    await client.query(`UPDATE requests SET status = 'released', released_at = now(), released_by = $1 WHERE id = $2`, [req.user.id, req.params.id]);
    const releaseAmount = assetAmount(row.escrow_asset, Number(row.amount) + Number(row.reward));
    await client.query(`UPDATE wallets SET locked_balance = GREATEST(locked_balance - $1, 0) WHERE user_id = $2 AND asset = $3`, [row.deposit_amount, row.requester_id, row.escrow_asset]);
    await client.query(`INSERT INTO withdrawals (request_id, user_id, asset, destination_address, amount, tx_hash, status, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $6 IS NULL THEN NULL ELSE now() END)`, [row.id, row.fulfiller_id, row.escrow_asset, destination, releaseAmount, externalTransactionId, externalTransactionId ? 'confirmed' : 'pending']);
    await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, entry_type, amount, tx_hash, status, metadata) VALUES ($1,$2,$3,'escrow_release',$4,$5,'completed',$6)`, [row.requester_id, row.id, row.escrow_asset, releaseAmount, externalTransactionId, JSON.stringify({ releasedBy: req.user.id, settlementMode })]);
    await client.query(`INSERT INTO ledger_entries (user_id, request_id, asset, entry_type, amount, tx_hash, status, metadata) VALUES ($1,$2,$3,'withdrawal',$4,$5,$6,$7)`, [row.fulfiller_id, row.id, row.escrow_asset, releaseAmount, externalTransactionId, externalTransactionId ? 'completed' : 'pending', JSON.stringify({ destinationAddress: destination, settlementMode })]);
    await client.query(`UPDATE requests SET status = 'completed' WHERE id = $1`, [req.params.id]);
    await client.query(`INSERT INTO request_status_history (request_id, old_status, new_status, changed_by) VALUES ($1, 'confirmed', 'released', $2),($1, 'released', 'completed', $2)`, [req.params.id, req.user.id]);
    await client.query('COMMIT');
    res.json({ status: 'completed', withdrawalStatus: externalTransactionId ? 'confirmed' : 'pending', settlementMode, externalTransactionId });
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
    const requiredTables = ['deposit_addresses', 'ledger_entries', 'payment_proofs', 'request_status_history', 'requests', 'sessions', 'users', 'wallets', 'withdrawals'];
    const tables = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`, [requiredTables]);
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
  await db.query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS deposit_address TEXT, ADD COLUMN IF NOT EXISTS deposit_memo TEXT, ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(28,8), ADD COLUMN IF NOT EXISTS required_confirmations INTEGER NOT NULL DEFAULT 3, ADD COLUMN IF NOT EXISTS confirmations INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS fulfiller_wallet TEXT, ADD COLUMN IF NOT EXISTS escrow_mode TEXT NOT NULL DEFAULT 'real', ADD COLUMN IF NOT EXISTS cdp_account_id TEXT, ADD COLUMN IF NOT EXISTS cdp_transaction_id TEXT`);
  await db.query(`ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_escrow_asset_check, DROP CONSTRAINT IF EXISTS requests_status_check`);
  await db.query(`ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_asset_check`);
  await db.query(`ALTER TABLE deposit_addresses DROP CONSTRAINT IF EXISTS deposit_addresses_asset_check`);
  await db.query(`ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_asset_check`);
  await db.query(`ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_asset_check`);
  await db.query(`ALTER TABLE requests ADD CONSTRAINT requests_escrow_asset_check CHECK (escrow_asset IN ('USDC','USDT','BTC')), ADD CONSTRAINT requests_status_check CHECK (status IN ('draft','awaiting_deposit','deposit_confirming','funded','open','accepted','payment_pending','payment_proof_submitted','confirmed','released','in_progress','awaiting_confirmation','under_admin_review','completed','disputed','cancelled'))`);
  await db.query(`UPDATE requests SET fee = ROUND((amount + reward) * 0.025, 2), total = amount + reward + ROUND((amount + reward) * 0.025, 2) WHERE fee <> ROUND((amount + reward) * 0.025, 2) OR total <> amount + reward + ROUND((amount + reward) * 0.025, 2)`);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.query(`INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, lower($2), $3, 'admin') ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash, role = 'admin'`, [process.env.ADMIN_NAME || 'Platform Administrator', process.env.ADMIN_EMAIL, passwordHash]);
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
  if (error instanceof multer.MulterError || error.message === 'Unexpected field') return res.status(400).json({ error: 'Invalid proof upload. Use one PNG, JPG, JPEG, or WEBP file up to 8 MB.' });
  if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
  res.status(error.code === '23505' ? 409 : 500).json({ error: 'Unexpected server error' });
});

initializeDatabase().then(() => app.listen(PORT, () => console.log(`StarCurrency running at http://localhost:${PORT}`))).catch(error => { console.error('Database initialization failed:', error.message); process.exit(1); });

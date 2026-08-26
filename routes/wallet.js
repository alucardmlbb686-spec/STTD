const express = require('express');
const coinbase = require('../services/coinbaseService');

function createWalletRouter({ requireUser, requireAdmin, query, db }){
  const router = express.Router();

  router.get('/', requireUser, async (req, res, next) => {
    try {
      const walletRows = await query(`SELECT asset, available_balance, locked_balance FROM wallets WHERE user_id = $1 ORDER BY asset`, [req.user.id]);
      const ledgerRows = await query(`SELECT id, request_id, asset, entry_type, amount, tx_hash, status, confirmations, metadata, created_at FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
      const withdrawalRows = await query(`SELECT id, asset, destination_address, amount, status, tx_hash, created_at, completed_at FROM wallet_withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
      res.json({ wallets: walletRows.rows, ledger: ledgerRows.rows, withdrawals: withdrawalRows.rows });
    } catch (error) { next(error); }
  });

  router.post('/withdraw', requireUser, async (req, res, next) => {
    const asset = String(req.body.asset || '').toUpperCase();
    const amount = Number(req.body.amount);
    const destinationAddress = req.body.destinationAddress?.trim();
    if (!['USDC', 'USDT', 'BTC'].includes(asset) || !Number.isFinite(amount) || amount <= 0 || !destinationAddress || destinationAddress.length > 255) return res.status(400).json({ error: 'Enter a valid asset, amount, and destination address' });
    if (!db) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const wallet = await client.query(`SELECT available_balance FROM wallets WHERE user_id = $1 AND asset = $2 FOR UPDATE`, [req.user.id, asset]);
        if (!wallet.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: `No ${asset} wallet is available` }); }
        if (Number(wallet.rows[0].available_balance) < amount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Withdrawal amount exceeds your available balance' }); }
        const txHash = process.env.ESCROW_MODE === 'sandbox' ? `sandbox_wallet_withdrawal_${require('crypto').randomUUID()}` : null;
        const status = txHash ? 'confirmed' : 'pending';
        const result = await client.query(`UPDATE wallets SET available_balance = available_balance - $1 WHERE user_id = $2 AND asset = $3 RETURNING available_balance`, [amount, req.user.id, asset]);
        const withdrawal = await client.query(`INSERT INTO wallet_withdrawals (user_id, asset, destination_address, amount, status, tx_hash, completed_at) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $5 = 'confirmed' THEN now() ELSE NULL END) RETURNING id, asset, destination_address, amount, status, tx_hash, created_at, completed_at`, [req.user.id, asset, destinationAddress, amount, status, txHash]);
        await client.query(`INSERT INTO ledger_entries (user_id, asset, entry_type, amount, tx_hash, status, metadata) VALUES ($1,$2,'withdrawal',$3,$4,$5,$6)`, [req.user.id, asset, amount, txHash, status === 'confirmed' ? 'completed' : 'pending', JSON.stringify({ walletWithdrawalId: withdrawal.rows[0].id, destinationAddress })]);
        await client.query('COMMIT');
        res.status(201).json({ withdrawal: withdrawal.rows[0], remainingBalance: result.rows[0].available_balance });
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.get('/status', requireUser, async (req, res, next) => {
    try { res.json({ success: true, ...(await coinbase.status()) }); }
    catch (error) { next(error); }
  });

  router.get('/coinbase', requireUser, requireAdmin, async (req, res, next) => {
    try { res.json({ success: true, wallets: await coinbase.listWallets() }); }
    catch (error) { next(error); }
  });

  router.post('/coinbase/test-wallet', requireUser, requireAdmin, async (req, res, next) => {
    try { res.status(201).json({ success: true, ...(await coinbase.createTestWallet()) }); }
    catch (error) { next(error); }
  });

  router.get('/coinbase/:walletId/balances', requireUser, requireAdmin, async (req, res, next) => {
    try { res.json({ success: true, ...(await coinbase.walletBalances(req.params.walletId)) }); }
    catch (error) { next(error); }
  });

  router.post('/coinbase/:walletId/faucet', requireUser, requireAdmin, async (req, res, next) => {
    try { res.json({ success: true, ...(await coinbase.faucet(req.params.walletId, req.body.addressId)) }); }
    catch (error) { next(error); }
  });

  return router;
}

module.exports = createWalletRouter;

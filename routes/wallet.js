const express = require('express');
const coinbase = require('../services/coinbaseService');

function createWalletRouter({ requireUser, requireAdmin, query }){
  const router = express.Router();

  router.get('/', requireUser, async (req, res, next) => {
    try {
      const walletRows = await query(`SELECT asset, available_balance, locked_balance FROM wallets WHERE user_id = $1 ORDER BY asset`, [req.user.id]);
      const ledgerRows = await query(`SELECT id, request_id, asset, entry_type, amount, tx_hash, status, confirmations, metadata, created_at FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
      res.json({ wallets: walletRows.rows, ledger: ledgerRows.rows });
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

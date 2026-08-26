const crypto = require('crypto');

function platformDepositAddress(asset){
  const variable = asset === 'BTC' ? 'ESCROW_BTC_ADDRESS' : 'ESCROW_USDT_ADDRESS';
  const address = process.env[variable];
  if (!address || address.startsWith('your-') || address.includes('PASTE_')) {
    const error = new Error(`${variable} is required for real ${asset} deposits`);
    error.statusCode = 503;
    throw error;
  }
  return address;
}

async function createDepositForRequest(client, request){
  const existing = await client.query('SELECT * FROM escrow_deposits WHERE request_id = $1', [request.id]);
  if (existing.rows[0]) return existing.rows[0];
  const sandbox = request.escrow_mode === 'sandbox';
  const depositAddress = sandbox ? null : platformDepositAddress(request.escrow_asset);
  const network = sandbox ? (process.env.CDP_NETWORK_ID || 'coinbase-cdp-sandbox') : (process.env.ESCROW_NETWORK || 'configured-platform-network');
  const provider = sandbox ? 'coinbase-cdp-sandbox' : 'platform-escrow-address';
  const result = await client.query(`INSERT INTO escrow_deposits (request_id, user_id, deposit_address, wallet_provider, provider_account_id, asset, network, required_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (request_id) DO UPDATE SET updated_at = now() RETURNING *`, [request.id, request.requester_id, depositAddress, provider, request.cdp_account_id || null, request.escrow_asset, network, request.deposit_amount]);
  return result.rows[0];
}

async function getDepositDetails(client, requestId){
  const result = await client.query('SELECT * FROM escrow_deposits WHERE request_id = $1', [requestId]);
  return result.rows[0] || null;
}

async function checkDepositStatus(client, requestId){
  return getDepositDetails(client, requestId);
}

async function markFundsHeld(client, deposit, transactionId, receivedAmount, confirmations){
  const result = await client.query(`UPDATE escrow_deposits SET transaction_id = COALESCE(transaction_id, $1), received_amount = $2, confirmations = $3, transaction_status = 'funds_held', status = 'funds_held', updated_at = now() WHERE id = $4 AND status <> 'funds_held' RETURNING *`, [transactionId, receivedAmount, confirmations, deposit.id]);
  return result.rows[0] || (await getDepositDetails(client, deposit.request_id));
}

async function confirmDeposit(client, deposit, transactionId, receivedAmount, confirmations){
  return markFundsHeld(client, deposit, transactionId, receivedAmount, confirmations);
}

function releaseConfigured(request){
  return process.env.ESCROW_MODE === 'sandbox' || request?.escrow_mode === 'sandbox';
}

function validateReleaseEligibility(request){
  if (!request) return { eligible: false, error: 'Request not found' };
  if (!['payment_received', 'confirmed', 'under_admin_review'].includes(request.status)) return { eligible: false, error: `Requester confirmation is required before release. Current status: ${request.status}` };
  if (request.dispute_reason || request.status === 'disputed') return { eligible: false, error: 'Disputed requests cannot release funds' };
  if (['released', 'refunded'].includes(request.release_status) || request.released_at || request.provider_transaction_id) return { eligible: false, error: 'Funds have already been released or refunded' };
  if (!request.fulfiller_id || !request.fulfiller_wallet || request.deposit_status !== 'confirmed' || !request.deposit_amount) return { eligible: false, error: 'Escrow or receiver wallet is not ready' };
  return { eligible: true };
}

async function getEscrowStatus(client, requestId){
  const result = await client.query('SELECT escrow_status, release_status, provider_transaction_id, released_at FROM requests WHERE id = $1', [requestId]);
  return result.rows[0] || null;
}

async function getEscrowBalance(client, request){
  const result = await client.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE entry_type = 'escrow_lock' AND status IN ('confirmed', 'completed')), 0) - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'escrow_release' AND status = 'completed'), 0) AS balance FROM ledger_entries WHERE request_id = $1`, [request.id]);
  return Number(result.rows[0]?.balance || 0);
}

async function releaseEscrowFunds(client, request, adminId){
  const eligibility = validateReleaseEligibility(request);
  if (!eligibility.eligible) {
    const error = new Error(eligibility.error);
    error.statusCode = 409;
    throw error;
  }
  const balance = await getEscrowBalance(client, request);
  if (balance <= 0) {
    const error = new Error('No locked escrow balance is available');
    error.statusCode = 409;
    throw error;
  }
  const proof = await client.query(`SELECT status FROM payment_proofs WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`, [request.id]);
  if (proof.rows[0]?.status !== 'approved') {
    const error = new Error('Payment proof must be approved before release');
    error.statusCode = 409;
    throw error;
  }
  // Sandbox releases use the existing escrow ledger and a provider-shaped id.
  // A live custody adapter can replace this branch without changing the route contract.
  if (!releaseConfigured(request)) {
    const error = new Error('Escrow sandbox is not enabled');
    error.statusCode = 503;
    throw error;
  }
  const providerTransactionId = `sandbox_release_${crypto.randomUUID()}`;
  return { providerTransactionId, amount: balance, asset: request.escrow_asset, adminId, simulated: true };
}

async function refundEscrowFunds(client, request, adminId){
  if (!request) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }
  if (!['disputed', 'payment_pending', 'payment_proof_submitted'].includes(request.status)) {
    const error = new Error(`Request is not eligible for a refund. Current status: ${request.status}`);
    error.statusCode = 409;
    throw error;
  }
  if (request.release_status === 'released' || request.released_at || request.provider_transaction_id) {
    const error = new Error('Funds have already been released');
    error.statusCode = 409;
    throw error;
  }
  if (request.deposit_status !== 'confirmed' || !request.deposit_amount) {
    const error = new Error('No confirmed escrow deposit is available');
    error.statusCode = 409;
    throw error;
  }
  const balance = await getEscrowBalance(client, request);
  if (balance <= 0) {
    const error = new Error('No locked escrow balance is available');
    error.statusCode = 409;
    throw error;
  }
  if (!releaseConfigured()) {
    const error = new Error('Escrow sandbox is not enabled');
    error.statusCode = 503;
    throw error;
  }
  return { providerTransactionId: `sandbox_refund_${crypto.randomUUID()}`, amount: balance, asset: request.escrow_asset, adminId, simulated: true };
}

module.exports = { createDepositForRequest, getDepositDetails, checkDepositStatus, confirmDeposit, markFundsHeld, getEscrowBalance, getEscrowStatus, releaseEscrowFunds, refundEscrowFunds, validateReleaseEligibility };
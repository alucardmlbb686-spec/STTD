const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');

let configured = false;

function isConfigured(){
  return Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET);
}

function configure(){
  if (!isConfigured()) throw new Error('Coinbase sandbox credentials are not configured');
  if (!configured){
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n'),
    });
    configured = true;
  }
}

function safeWallet(wallet){
  return { id: wallet.getId(), network: wallet.getNetworkId() };
}

async function status(){
  if (!isConfigured()) return { environment: 'base-sepolia', configured: false, connected: false };
  configure();
  const response = await Wallet.listWallets(1);
  return { environment: 'base-sepolia', configured: true, connected: true, walletCount: response.data?.length || 0 };
}

async function listWallets(){
  configure();
  const response = await Wallet.listWallets();
  return (response.data || []).map(wallet => ({ id: wallet.id, network: wallet.network_id }));
}

async function createTestWallet(){
  configure();
  const wallet = await Wallet.create({ networkId: Coinbase.networks.BaseSepolia });
  const address = await wallet.getDefaultAddress();
  return { wallet: safeWallet(wallet), address: address.getId() };
}

async function walletBalances(walletId){
  configure();
  const wallet = await Wallet.fetch(walletId);
  const balances = await wallet.listBalances();
  return { wallet: safeWallet(wallet), balances: balances.data || balances };
}

async function faucet(walletId, addressId){
  configure();
  const wallet = await Wallet.fetch(walletId);
  const transaction = await wallet.faucet();
  return { walletId, addressId, transaction: String(transaction) };
}

async function transfer({ walletId, assetId, amount, destination, gasless = false }){
  configure();
  const wallet = await Wallet.fetch(walletId);
  const transfer = await wallet.createTransfer({ amount, assetId, destination, gasless });
  const completed = await transfer.wait();
  return { transfer: String(completed), walletId, assetId, amount, destination };
}

// The installed SDK's Base Sepolia transfer API requires a persisted wallet ID and
// asset-specific custody configuration. The requested CDP variables do not define
// a release wallet ID, so escrow release remains ledger-only until that wallet is
// provisioned through the admin test-wallet endpoint.
function releaseConfigured(){ return false; }

module.exports = { isConfigured, releaseConfigured, status, listWallets, createTestWallet, walletBalances, faucet, transfer };

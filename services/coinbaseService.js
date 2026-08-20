const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');

let configured = false;

function isConfigured(){
  return Boolean(process.env.COINBASE_API_KEY_NAME && process.env.COINBASE_API_PRIVATE_KEY);
}

function configure(){
  if (!isConfigured()) throw new Error('Coinbase sandbox credentials are not configured');
  if (!configured){
    Coinbase.configure({
      apiKeyName: process.env.COINBASE_API_KEY_NAME,
      privateKey: process.env.COINBASE_API_PRIVATE_KEY.replace(/\\n/g, '\n'),
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

function releaseConfigured(){ return isConfigured() && process.env.COINBASE_RELEASE_WALLET_ID && process.env.COINBASE_RELEASE_ASSET_ID; }

module.exports = { isConfigured, releaseConfigured, status, listWallets, createTestWallet, walletBalances, faucet, transfer };

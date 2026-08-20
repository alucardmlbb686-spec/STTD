# StarCurrency

A dark, premium fintech-style peer-to-peer payment request marketplace — front-end built with plain HTML/CSS/JS, served by a small Node.js/Express app.

## Getting started

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

## What's inside

- **Home** (`/`) — hero, how it works, benefits, supported payment methods.
- **Login** (`/login`) / **Register** (`/register`) — auth forms with validation, password strength meter, remember me, forgot password.
- **Dashboard** (`/dashboard`) — overview stats, active/accepted requests, recent activity.
- **Create request** (`/create-request`) — payment method picker, live summary, escrow deposit submission.
- **Browse requests** (`/browse-requests`) — card + table views, filters, search, sort, accept flow.
- **My requests** (`/my-requests`) — tabs by status, detail modal, cancel action.
- **Admin login** (`/admin-login`) / **Admin dashboard** (`/admin-dashboard`) — separate secure-feeling area with its own sidebar, stats, and request table.

## Production setup

- Data is persisted in PostgreSQL through the API in `server.js`; the browser does not generate or persist users and requests.
- Copy `.env.example` to your deployment environment and configure `DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. The schema in `schema.sql` is applied on startup.
- Deposits require a BTC or USDT transaction hash and remain `Deposit Confirming` until an authorized admin confirms the deposit. A blockchain indexer or custody provider should be connected to automate that confirmation before accepting production funds.
- Configure real `ESCROW_BTC_ADDRESS`, `ESCROW_USDT_ADDRESS`, and `BTC_USD_RATE` values. Each request receives a unique memo while funds are sent to the configured custody wallet.
- For Coinbase CDP Sandbox, set `ESCROW_MODE=sandbox`, `COINBASE_ENV=sandbox`, and `CDP_ACCOUNT_ID`. Sandbox requests support only `USDC` and `USDT`; no BTC/USDT deposit address is required.
- Sandbox funding is an explicit simulation tied to the configured CDP Account ID. It creates a `sandbox_cdp_*` transaction reference, ledger deposit, escrow lock, and then moves `awaiting_deposit -> funded -> open`. It does not claim that Coinbase broadcast a real blockchain transaction.
- The sandbox lifecycle is `draft -> awaiting_deposit -> funded -> open -> accepted -> payment_pending -> payment_proof_submitted -> confirmed -> released -> completed`.
- Configure `BLOCKCHAIN_WEBHOOK_SECRET` and have your blockchain provider call `POST /api/webhooks/blockchain` with `x-blockchain-secret`, `txHash`, `asset`, `amount`, and `confirmations`. The webhook records the deposit, waits for the required confirmations, and atomically locks the funds.
- Wallet balances and `ledger_entries` track deposits, escrow locks, releases, withdrawals, confirmations, and transaction hashes. Admin release creates a pending withdrawal; the custody provider or admin confirms it through `POST /api/admin/withdrawals/:id/confirm`.
- Coinbase testing uses the official `@coinbase/coinbase-sdk` on Base Sepolia. Configure `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET` from the Coinbase Developer Platform. The SDK uses the CDP API ID and secret for authentication; the wallet secret remains server-only and is never returned to clients. The SDK supports developer-custodied test wallets, balances, faucet requests, and ETH/USDC transfers. Coinbase does not provide StarCurrency escrow, and this SDK flow does not support BTC/USDT settlement; those assets remain in the PostgreSQL ledger-only simulation until a compatible custody/network adapter is installed.
- Payment proof uploads accept PNG, JPG/JPEG, and WEBP up to 8 MB. Files are stored outside `public/` and require authenticated access.
- Coinbase test endpoints: `GET /api/wallet/status`, admin-only `GET /api/wallet/coinbase`, `POST /api/wallet/coinbase/test-wallet`, `GET /api/wallet/coinbase/:walletId/balances`, and `POST /api/wallet/coinbase/:walletId/faucet`.
- Set `NODE_ENV=production` to enable secure session cookies. Use HTTPS in production.

## Coinbase sandbox setup

1. Install dependencies with `npm install`.
2. Create a Coinbase Developer Platform API key at `https://portal.cdp.coinbase.com/access/api` with the permissions required by the test wallet operations.
3. Copy `.env.example` to `.env` and set:

```env
CDP_API_KEY_ID=PASTE_YOUR_API_KEY_ID_HERE
CDP_API_KEY_SECRET=PASTE_YOUR_API_KEY_SECRET_HERE
CDP_WALLET_SECRET=PASTE_YOUR_WALLET_SECRET_HERE
```

4. Use the Coinbase SDK's Base Sepolia developer wallet endpoint to create a test wallet: `POST /api/wallet/coinbase/test-wallet` as an admin. The response contains only the wallet ID and public address.
5. Request test ETH with `POST /api/wallet/coinbase/:walletId/faucet`, then inspect balances with `GET /api/wallet/coinbase/:walletId/balances`.
6. Check the safe connection response with `GET /api/wallet/status`.
7. Start the app with `npm start` and test the request flow from `/create-request.html`.

Coinbase sandbox limitations: the official Node SDK documents Base Sepolia developer-custodied wallets, faucet funding, balances, and ETH/USDC transfers. It does not provide StarCurrency escrow and does not make BTC/USDT a supported Base Sepolia release asset. Therefore BTC/USDT requests use the PostgreSQL escrow/ledger state and can be released only through a configured custody/network adapter; the response labels this as `ledger_only_simulation` rather than claiming a Coinbase transaction.
- Shared layout pieces (navbar, footer, sidebar, admin sidebar, topbar) live in `public/partials/` and are injected at runtime via `data-include` attributes — see `public/js/main.js`.
- Design tokens (colors, type, spacing, radii, shadows) live in `public/css/tokens.css`; component styles are split across `base.css`, `components.css`, `landing.css`, `auth.css`, and `app.css`.

## Project structure

```
starcurrency/
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── login.html
    ├── register.html
    ├── dashboard.html
    ├── create-request.html
    ├── browse-requests.html
    ├── my-requests.html
    ├── admin-login.html
    ├── admin-dashboard.html
    ├── css/
    │   ├── tokens.css
    │   ├── base.css
    │   ├── components.css
    │   ├── landing.css
    │   ├── auth.css
    │   └── app.css
    ├── js/
    │   ├── main.js
    │   ├── store.js
    │   ├── auth.js
    │   ├── dashboard.js
    │   ├── create-request.js
    │   ├── browse-requests.js
    │   ├── my-requests.js
    │   └── admin.js
    └── partials/
        ├── navbar.html
        ├── footer.html
        ├── sidebar.html
        ├── admin-sidebar.html
        └── topbar.html
```

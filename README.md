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
- Set `NODE_ENV=production` to enable secure session cookies. Use HTTPS in production.
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

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
- **Create request** (`/create-request`) — payment method picker, live summary, mock submit.
- **Browse requests** (`/browse-requests`) — card + table views, filters, search, sort, accept flow.
- **My requests** (`/my-requests`) — tabs by status, detail modal, cancel action.
- **Admin login** (`/admin-login`) / **Admin dashboard** (`/admin-dashboard`) — separate secure-feeling area with its own sidebar, stats, and request table.

## Notes

- All data is mocked client-side in `public/js/store.js` and persisted to `localStorage` — there's no real backend, database, or payment processing. This is a UI/UX prototype.
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

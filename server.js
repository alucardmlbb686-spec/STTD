/**
 * StarCurrency — static Express server
 * Serves the public/ folder and exposes clean (extension-less)
 * routes for every page in addition to the plain .html paths.
 */
const express = require('express');
const path = require('path');
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

app.use(express.static(PUBLIC_DIR));

app.get('/health', async (req, res) => {
  if (!db) return res.json({ ok: true, database: 'not configured' });
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

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

app.listen(PORT, () => {
  console.log(`StarCurrency running at http://localhost:${PORT}`);
});

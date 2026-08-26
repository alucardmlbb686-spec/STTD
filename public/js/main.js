/* =========================================================
   StarCurrency — shared front-end utilities
   Loaded on every page. Handles partial includes (navbar,
   footer, sidebar, topbar), toast notifications, mobile nav,
   and small formatting helpers used across pages.
   ========================================================= */

const SC = (() => {

  const PAYMENT_METHODS = [
    { id: 'venmo',   label: 'Venmo',            sub: 'Username · Phone',  icon: 'venmo' },
    { id: 'paypal',  label: 'PayPal',           sub: 'Email · Username',  icon: 'paypal' },
    { id: 'zelle',   label: 'Zelle',            sub: 'Email · Phone',     icon: 'zelle' },
    { id: 'cashapp', label: 'Cash App',         sub: '$Cashtag · Phone',  icon: 'cashapp' },
  ];

  function fmtMoney(n, currency = 'USD'){
    const num = Number(n) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(num);
  }

  function timeAgo(iso){
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 86400*7) return `${Math.floor(diff/86400)}d ago`;
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  }

  function initials(name){
    return name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
  }

  function methodMeta(id){
    return PAYMENT_METHODS.find(m => m.id === id) || {
      card: { id: 'card', label: 'Debit / Credit', sub: 'Visa · Mastercard', icon: 'card' },
      wire: { id: 'wire', label: 'International wire', sub: 'SWIFT', icon: 'wire' },
    }[id] || PAYMENT_METHODS[0];
  }

  const ICONS = {
    bank: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 10l9-6 9 6M4.5 10v8M9 10v8M15 10v8M19.5 10v8M2.5 20h19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    paypal: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 4h6.2c3 0 4.8 1.7 4.3 4.6-.5 3.2-2.8 4.9-6 4.9H9.8L8.7 20H5l2-16Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10.5 8h6.2c3 0 4.5 1.7 4 4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5.5" width="19" height="13" rx="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 10h19" stroke="currentColor" stroke-width="1.6"/><path d="M6 14.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    crypto: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 8.5h3.6a2 2 0 010 4H9.5m0-4v8m0-4h4a2 2 0 010 4H9.5m0-8V7m0 9.5V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mobile: '<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="2.5" width="10" height="19" rx="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M11 18h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    wire: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const PAYMENT_BADGES = {
    venmo: 'https://cdn.simpleicons.org/venmo',
    cashapp: 'https://cdn.simpleicons.org/cashapp',
    bank: '/assets/icons8-bank-building-40.png',
    crypto: '/assets/icons8-crypto-48.png',
    zelle: 'https://cdn.simpleicons.org/zelle',
    paypal: '/assets/icons8-paypal-32.png',
  };
  function methodIcon(id){
    return PAYMENT_BADGES[id]
      ? `<img class="method-icon-image" src="${PAYMENT_BADGES[id]}" alt="${methodMeta(id).label} icon">`
      : (ICONS[id] || ICONS.bank);
  }

  function statusBadge(status){
    const map = {
      awaiting_deposit: { cls: 'badge-pending', label: 'Awaiting Deposit' },
      deposit_confirming: { cls: 'badge-pending', label: 'Deposit Confirming' },
      funded:    { cls: 'badge-open',      label: 'Funded' },
      open:      { cls: 'badge-open',      label: 'Open' },
      draft:     { cls: 'badge-pending',   label: 'Draft' },
      awaiting_funding: { cls: 'badge-pending', label: 'Awaiting funding' },
      available: { cls: 'badge-open',      label: 'Available' },
      pending:   { cls: 'badge-pending',   label: 'Pending' },
      accepted:  { cls: 'badge-accepted',  label: 'Accepted' },
      payment_pending: { cls: 'badge-accepted', label: 'Payment Pending' },
      in_progress: { cls: 'badge-accepted', label: 'In Progress' },
      payment_sent: { cls: 'badge-accepted', label: 'Payment sent' },
      awaiting_confirmation: { cls: 'badge-pending', label: 'Awaiting Confirmation' },
      payment_proof_submitted: { cls: 'badge-pending', label: 'Payment Proof Submitted' },
      payment_received: { cls: 'badge-completed', label: 'Completed' },
      confirmed: { cls: 'badge-pending', label: 'Confirmed' },
      released: { cls: 'badge-completed', label: 'Released' },
      verification: { cls: 'badge-pending', label: 'Verification' },
      under_admin_review: { cls: 'badge-pending', label: 'Under Admin Review' },
      completed: { cls: 'badge-completed', label: 'Completed' },
      disputed:  { cls: 'badge-failed',    label: 'Disputed' },
      cancelled: { cls: 'badge-cancelled', label: 'Cancelled' },
      failed:    { cls: 'badge-failed',    label: 'Failed' },
    };
    const m = map[status] || map.open;
    return `<span class="badge ${m.cls}">${m.label}</span>`;
  }

  function uid(prefix = 'SC'){
    return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  function qs(sel, ctx = document){ return ctx.querySelector(sel); }
  function qsa(sel, ctx = document){ return Array.from(ctx.querySelectorAll(sel)); }

  function toast(message, type = 'success'){
    let el = qs('.toast');
    if (!el){
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    const dot = type === 'success' ? 'var(--star-400)' : type === 'error' ? 'var(--red-400)' : 'var(--amber-400)';
    el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;"></span><span>${message}</span>`;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ---- Partial includes: <div data-include="navbar"></div> ----
  async function includePartials(){
    const nodes = qsa('[data-include]');
    await Promise.all(nodes.map(async node => {
      const name = node.getAttribute('data-include');
      try{
        const res = await fetch(`/partials/${name}.html`);
        node.innerHTML = await res.text();
      }catch(e){
        console.error('Failed to load partial', name, e);
      }
    }));
    if (typeof SCStore !== 'undefined') await SCStore.refreshSession();
    updateNavbarAuth();
    const protectedPage = ['dashboard', 'browse', 'create', 'my-requests'].includes(document.body.dataset.page);
    if (protectedPage) {
      const loggedIn = typeof SCStore !== 'undefined' && SCStore.isLoggedIn();
      document.body.classList.add(loggedIn ? 'auth-checked' : 'auth-denied');
      if (!loggedIn) showLoginRequiredDialog();
    }
    document.dispatchEvent(new CustomEvent('partials:loaded'));
  }

  function updateNavbarAuth(){
    const loggedIn = typeof SCStore !== 'undefined' && SCStore.isLoggedIn();
    ['navLoginLink', 'navRegisterLink', 'mobileNavLoginLink', 'mobileNavRegisterLink'].forEach(id => {
      const link = document.getElementById(id);
      if (link) link.hidden = loggedIn;
    });
    ['navDashboardLink', 'mobileNavDashboardLink'].forEach(id => {
      const link = document.getElementById(id);
      if (link) link.hidden = !loggedIn;
    });
  }

  function showLoginRequiredDialog(){
    const overlay = document.createElement('div');
    overlay.className = 'auth-required-overlay';
    overlay.innerHTML = `
      <div class="auth-required-dialog" role="dialog" aria-modal="true" aria-labelledby="authRequiredTitle">
        <div class="auth-required-icon" aria-hidden="true">!</div>
        <h2 id="authRequiredTitle">Please Log in to Continue</h2>
        <p>You need to be logged in to access this section.</p>
        <a class="btn btn-primary btn-block" href="/login.html">Log in</a>
        <a class="auth-required-register" href="/register.html">Create an account</a>
      </div>`;
    document.body.appendChild(overlay);
  }

  function showLogoutConfirmation(){
    if (qs('#logoutConfirmOverlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'logoutConfirmOverlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle">
        <div class="eyebrow"><span class="dot"></span> Account</div>
        <h2 id="logoutConfirmTitle">Are you sure you want to log out?</h2>
        <p class="muted">You will need to log in again to access your dashboard and requests.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="logoutConfirmCancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="logoutConfirmSubmit">Log out</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = () => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 180);
    };
    overlay.querySelector('#logoutConfirmCancel').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', function handleEscape(event){
      if (event.key !== 'Escape') return;
      document.removeEventListener('keydown', handleEscape);
      close();
    });
    overlay.querySelector('#logoutConfirmSubmit').addEventListener('click', async event => {
      const button = event.currentTarget;
      SC.setLoading(button, true);
      await SCStore.clearUser();
      window.location.href = '/';
    });
    overlay.querySelector('#logoutConfirmCancel').focus();
  }

  function initLogoutConfirmation(){
    document.addEventListener('click', event => {
      const logoutTrigger = event.target.closest('.sidebar-footer .user-chip');
      if (!logoutTrigger) return;
      event.preventDefault();
      event.stopPropagation();
      showLogoutConfirmation();
    }, true);
  }

  function initMobileNav(){
    const toggle = qs('#navToggle');
    const menu = qs('#mobileMenu');
    if (toggle && menu){
      toggle.addEventListener('click', () => {
        menu.classList.toggle('open');
        const open = menu.classList.contains('open');
        toggle.setAttribute('aria-expanded', open);
      });
    }
    const sideToggle = qs('#sidebarToggle');
    const sidebar = qs('#appSidebar');
    if (sideToggle && sidebar){
      sideToggle.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
    }
  }

  function markActiveNav(){
    const page = document.body.getAttribute('data-page');
    if (!page) return;
    qsa('.side-nav a[data-page]').forEach(a => {
      if (a.getAttribute('data-page') === page) a.classList.add('active');
    });
    qsa('.nav-links a[data-page]').forEach(a => {
      if (a.getAttribute('data-page') === page) a.classList.add('active');
    });
  }

  function setLoading(btn, loading){
    if (!btn) return;
    if (loading){
      btn.classList.add('is-loading');
      if (!btn.querySelector('.spinner')){
        const s = document.createElement('span');
        s.className = 'spinner';
        s.style.cssText = 'position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);';
        btn.appendChild(s);
      }
      btn.disabled = true;
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await includePartials();
    initMobileNav();
    initLogoutConfirmation();
    markActiveNav();
  });

  return { PAYMENT_METHODS, fmtMoney, timeAgo, initials, methodMeta, methodIcon, statusBadge, uid, qs, qsa, toast, setLoading };
})();

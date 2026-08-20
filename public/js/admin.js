document.addEventListener('DOMContentLoaded', () => {
  SC.qsa('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-toggle-for'));
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
    });
  });

  // ---- Admin login ----
  const form = document.getElementById('adminLoginForm');
  if (form){
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email');
      const password = document.getElementById('password');
      const code = document.getElementById('code');
      let valid = true;

      if (!email.value.trim()){ document.getElementById('fEmail').classList.add('has-error'); valid = false; }
      else document.getElementById('fEmail').classList.remove('has-error');

      if (!password.value){ document.getElementById('fPassword').classList.add('has-error'); valid = false; }
      else document.getElementById('fPassword').classList.remove('has-error');

      if (code.value.trim() && code.value.trim().length !== 6){ document.getElementById('fCode').classList.add('has-error'); valid = false; }
      else document.getElementById('fCode').classList.remove('has-error');

      if (!valid) return;

      const btn = document.getElementById('adminLoginSubmit');
      SC.setLoading(btn, true);
      fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value.trim(), password: password.value }) })
        .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Sign in failed'); return payload; })
        .then(({ user }) => { if (user.role !== 'admin') throw new Error('Admin access required'); window.location.href = '/admin-dashboard.html'; })
        .catch(error => { SC.toast(error.message, 'error'); SC.setLoading(btn, false); });
    });
  }
});

// ---- Admin dashboard ----
document.addEventListener('partials:loaded', async () => {
  const statsGrid = document.getElementById('adminStats');
  if (!statsGrid) return; // not the admin dashboard page
  const admin = await SCStore.refreshSession();
  if (!admin || admin.role !== 'admin') {
    window.location.href = '/admin-login.html';
    return;
  }

  const section = new URLSearchParams(window.location.search).get('section') || 'overview';
  const sectionLinks = SC.qsa('.side-nav a[data-page]');
  sectionLinks.forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const nextSection = link.dataset.page.replace('admin-', '');
      if (nextSection === 'overview') {
        window.location.href = '/admin-dashboard.html';
        return;
      }
      window.history.pushState({}, '', `/admin-dashboard.html?section=${nextSection}`);
      sectionLinks.forEach(item => item.classList.toggle('active', item === link));
      renderSection(nextSection);
    });
  });

  const signOut = document.querySelector('.sidebar-footer .user-chip');
  signOut?.addEventListener('click', () => SCStore.clearUser());

  if (section !== 'overview') {
    renderSection(section);
    return;
  }

  statsGrid.innerHTML = Array.from({length:4}).map(() => `
    <div class="card"><div class="skeleton" style="height:14px;width:60%;margin-bottom:14px;"></div><div class="skeleton" style="height:28px;width:80%;"></div></div>
  `).join('');

  setTimeout(render, 600);

  async function render(){
    const all = (await SCStore.api('/api/admin/requests')).requests;
    const openCount = all.filter(r => r.status === 'open').length;
    const volume = all.reduce((s,r) => s + r.amount, 0);
    const completed = all.filter(r => r.status === 'completed').length;
    const disputes = all.filter(r => ['disputed','under_admin_review'].includes(r.status)).length;

    statsGrid.innerHTML = `
      ${statCard('Total requests', all.length, '+12% vs last week')}
      ${statCard('Open right now', openCount, 'Awaiting match')}
      ${statCard('Total volume', SC.fmtMoney(volume), 'Across all methods')}
      ${statCard('Open disputes', disputes, 'Needs review', true)}
    `;

    document.getElementById('tableMeta').textContent = `${all.length} total`;
    document.getElementById('adminTableBody').innerHTML = all.slice(0, 10).map(r => `
      <tr>
        <td class="cell-primary">${r.id}</td>
        <td>${r.requester}</td>
        <td>${SC.methodMeta(r.method).label}</td>
        <td class="mono">${SC.fmtMoney(r.amount)}</td>
        <td>${SC.statusBadge(r.status)}</td>
        <td class="cell-muted">${SC.timeAgo(r.createdAt)}</td>
        <td><div class="table-actions">
          <button class="btn btn-secondary btn-sm admin-review-btn" data-id="${r.id}">${r.status === 'deposit_confirming' ? 'Confirm deposit' : r.status === 'under_admin_review' ? 'Release escrow' : 'Review'}</button>
        </div></td>
      </tr>
    `).join('');

    document.querySelectorAll('.admin-review-btn').forEach(button => button.addEventListener('click', async () => {
      const request = all.find(item => item.id === button.dataset.id);
      if (!request) return;
      try {
        let result;
        if (request.status === 'deposit_confirming') {
          result = await SCStore.api(`/api/admin/deposits/${request.id}/confirm`, { method: 'POST', body: JSON.stringify({ confirmations: request.requiredConfirmations || 3 }) });
        } else if (request.status === 'under_admin_review') {
          const destinationAddress = window.prompt('Enter the fulfiller withdrawal wallet address:');
          if (!destinationAddress) return;
          result = await SCStore.api(`/api/admin/requests/${request.id}/review`, { method: 'POST', body: JSON.stringify({ destinationAddress }) });
        } else {
          result = await SCStore.api(`/api/admin/requests/${request.id}/review`, { method: 'POST' });
        }
        SC.toast(`${request.id} updated to ${result.status}.`, 'success'); render();
      }
      catch (error) { SC.toast(error.message, 'error'); }
    }));

    const methodCounts = {};
    all.forEach(r => methodCounts[r.method] = (methodCounts[r.method]||0)+1);
    const max = Math.max(...Object.values(methodCounts), 1);
    document.getElementById('methodDist').innerHTML = SC.PAYMENT_METHODS.map(m => {
      const count = methodCounts[m.id] || 0;
      const pct = Math.round((count/max)*100);
      return `
        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:6px;">
            <span style="color:var(--text-1); font-weight:600;">${m.label}</span>
            <span class="mono text-secondary">${count}</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
        </div>
      `;
    }).join('');

    const events = [
      'Reviewed and closed dispute #4821',
      'Suspended account for policy violation',
      'Approved manual payout for REQ-1042',
      'Updated crypto rail limits',
      'Verified new fulfiller identity',
    ];
    document.getElementById('adminActivity').innerHTML = events.map((e,i) => `
      <div class="activity-item">
        <div class="activity-dot" style="background:var(--amber-400); box-shadow:0 0 0 3px rgba(240,185,79,0.15);"></div>
        <div><div class="activity-text">${e}</div><div class="activity-time">${(i+1)*7}m ago</div></div>
      </div>
    `).join('');
  }

  function statCard(label, value, delta, warn){
    return `
      <div class="card stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value" style="${warn ? 'color:var(--amber-400);' : ''}">${value}</div>
        <div class="stat-delta ${warn ? '' : 'up'}" style="${warn ? 'color:var(--amber-400);' : ''}">${delta}</div>
      </div>
    `;
  }

  async function renderSection(name){
    const pageBody = document.querySelector('.page-body');
    const all = (await SCStore.api('/api/admin/requests')).requests;
    const title = {
      users: 'Users',
      requests: 'All requests',
      disputes: 'Disputes',
      transactions: 'Transactions',
      settings: 'Settings',
    }[name];
    if (!pageBody || !title) return;

    if (name === 'settings') {
      pageBody.innerHTML = `
        <div class="page-title-row"><div><h1>Settings</h1><div class="sub">Manage admin console preferences.</div></div></div>
        <div class="card" style="max-width:720px;">
          <div class="panel-head"><h3>Console settings</h3></div>
          <label class="checkbox-row"><input type="checkbox" checked> Email alerts for new disputes</label>
          <label class="checkbox-row"><input type="checkbox" checked> Daily transaction summary</label>
          <button class="btn btn-primary" id="saveAdminSettings" style="margin-top:16px;">Save settings</button>
        </div>`;
      document.getElementById('saveAdminSettings')?.addEventListener('click', () => SC.toast('Settings saved.', 'success'));
      return;
    }

    const users = [...new Set(all.map(request => request.requester))];
    const disputes = all.filter(request => ['disputed','under_admin_review'].includes(request.status)).slice(0, 10);
    const transactions = all.filter(request => ['accepted', 'completed'].includes(request.status)).slice(0, 20);
    const sectionRecords = name === 'disputes' ? disputes : name === 'transactions' ? transactions : all.slice(0, 20);
    const rows = name === 'users'
      ? users.map(user => `<tr><td class="cell-primary">${user}</td><td>${all.filter(request => request.requester === user).length}</td><td><span class="badge badge-accepted">Active</span></td><td><button class="btn btn-secondary btn-sm">View</button></td></tr>`).join('')
      : name === 'disputes'
        ? sectionRecords.map((request, index) => `<tr><td class="cell-primary">DSP-${4821 + index}</td><td>${request.id}</td><td>${request.requester}</td><td>Payment not received</td><td><span class="badge badge-pending">Needs review</span></td><td>${SC.timeAgo(request.createdAt)}</td></tr>`).join('')
        : name === 'transactions'
          ? sectionRecords.map((request, index) => `<tr><td class="cell-primary">TXN-${1042 + index}</td><td>${request.id}</td><td>${request.requester}</td><td>${SC.methodMeta(request.method).label}</td><td class="mono">${SC.fmtMoney(request.amount)}</td><td>${SC.statusBadge(request.status)}</td></tr>`).join('')
          : sectionRecords.map(request => `<tr><td class="cell-primary">${request.id}</td><td>${request.requester}</td><td>${SC.methodMeta(request.method).label}</td><td class="mono">${SC.fmtMoney(request.amount)}</td><td>${SC.statusBadge(request.status)}</td><td>${SC.timeAgo(request.createdAt)}</td></tr>`).join('');
    const headers = name === 'users'
      ? '<th>User</th><th>Requests</th><th>Status</th><th></th>'
      : name === 'disputes'
        ? '<th>Dispute</th><th>Request</th><th>User</th><th>Reason</th><th>Status</th><th>Opened</th>'
        : name === 'transactions'
          ? '<th>Transaction</th><th>Request</th><th>User</th><th>Method</th><th>Amount</th><th>Status</th>'
          : '<th>Request</th><th>User</th><th>Method</th><th>Amount</th><th>Status</th><th>Posted</th>';
    const recordCount = name === 'users' ? users.length : sectionRecords.length;
    pageBody.innerHTML = `
      <div class="page-title-row"><div><h1>${title}</h1><div class="sub">${name === 'disputes' ? 'Investigate requests reported by users.' : name === 'transactions' ? 'Track completed and accepted transfers.' : 'Review and manage platform activity.'}</div></div></div>
      <div class="card"><div class="panel-head"><h3>${recordCount} ${name === 'users' ? 'users' : name === 'disputes' ? 'open disputes' : name === 'transactions' ? 'transactions' : 'requests'}</h3></div>
        <div class="table-wrap" style="border:none;"><table class="data-table"><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="6" class="cell-muted">No ${name} found.</td></tr>`}</tbody></table></div>
      </div>`;
  }
});

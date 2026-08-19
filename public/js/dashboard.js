document.addEventListener('partials:loaded', () => {
  const user = SCStore.getUser();
  const greeting = document.getElementById('greeting');
  if (greeting) greeting.textContent = `Welcome back, ${user.name.split(' ')[0]}`;

  const nameEl = document.getElementById('sidebarUserName');
  const avatarEl = document.getElementById('sidebarAvatar');
  if (nameEl) nameEl.textContent = user.name;
  if (avatarEl) avatarEl.textContent = SC.initials(user.name);

  document.getElementById('userChipLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    SCStore.clearUser();
    SC.toast('Signed out. Redirecting to home…');
    setTimeout(() => window.location.href = '/', 700);
  });

  const requestedSection = new URLSearchParams(window.location.search).get('section');
  if (requestedSection === 'wallet' || requestedSection === 'settings') {
    document.querySelectorAll('.side-nav a[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === requestedSection);
    });
    renderAccountSection(requestedSection, user);
    return;
  }

  // ---- Skeleton loading, then render ----
  const statsGrid = document.getElementById('statsGrid');
  const activeList = document.getElementById('activeList');
  const acceptedList = document.getElementById('acceptedList');
  const activityList = document.getElementById('activityList');

  statsGrid.innerHTML = Array.from({length:4}).map(() => `
    <div class="card"><div class="skeleton" style="height:14px;width:60%;margin-bottom:14px;"></div><div class="skeleton" style="height:28px;width:80%;"></div></div>
  `).join('');
  activeList.innerHTML = skeletonRows(3);
  acceptedList.innerHTML = skeletonRows(3);
  activityList.innerHTML = skeletonRows(4);

  function skeletonRows(n){
    return Array.from({length:n}).map(() => `
      <div class="request-row"><div class="skeleton" style="width:42px;height:42px;border-radius:12px;"></div>
      <div style="flex:1;"><div class="skeleton" style="height:12px;width:50%;margin-bottom:8px;"></div><div class="skeleton" style="height:10px;width:30%;"></div></div></div>
    `).join('');
  }

  setTimeout(render, 550);

  function render(){
    const mine = SCStore.getMine();
    const active = mine.filter(r => ['open','pending'].includes(r.status));
    const accepted = mine.filter(r => ['accepted','completed'].includes(r.status));
    const completed = mine.filter(r => r.status === 'completed');
    const totalReward = completed.reduce((s,r) => s + r.reward, 0);

    statsGrid.innerHTML = `
      ${statCard('Active requests', active.length, 'up', '+2 this week', iconClock())}
      ${statCard('Accepted', accepted.length, 'up', 'In progress', iconCheck())}
      ${statCard('Completed', completed.length, 'up', 'All time', iconStar())}
      ${statCard('Rewards earned', SC.fmtMoney(totalReward), 'up', 'From completed requests', iconCoin())}
    `;

    activeList.innerHTML = active.length ? active.slice(0,4).map(rowHtml).join('') :
      emptyState('No active requests', 'Create a request to get it in front of the network.');

    acceptedList.innerHTML = accepted.length ? accepted.slice(0,4).map(rowHtml).join('') :
      emptyState('Nothing accepted yet', 'Once a peer accepts your request, it will show here.');

    const activity = [...mine].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0,6);
    activityList.innerHTML = activity.map(r => `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div>
          <div class="activity-text"><strong>${r.id}</strong> — ${statusVerb(r.status)} for ${SC.fmtMoney(r.total)}</div>
          <div class="activity-time">${SC.timeAgo(r.createdAt)}</div>
        </div>
      </div>
    `).join('') || emptyState('No recent activity', 'Your request history will appear here.');
  }

  function statusVerb(status){
    return { open: 'posted and awaiting a match', pending: 'pending confirmation', accepted: 'accepted by a peer',
      completed: 'completed successfully', cancelled: 'cancelled' }[status] || status;
  }

  function rowHtml(r){
    const meta = SC.methodMeta(r.method);
    return `
      <div class="request-row">
        <div class="req-icon">${SC.methodIcon(r.method)}</div>
        <div class="req-main">
          <div class="req-title">${r.id} · ${meta.label}</div>
          <div class="req-meta">To ${r.recipient} · ${SC.timeAgo(r.createdAt)}</div>
        </div>
        <div class="req-side">
          <div class="req-amt">${SC.fmtMoney(r.total)}</div>
          ${SC.statusBadge(r.status)}
        </div>
      </div>
    `;
  }

  function emptyState(title, sub){
    return `<div class="empty-state" style="padding: 32px 12px;"><h3 style="font-size:14px;">${title}</h3><p style="font-size:13px;">${sub}</p></div>`;
  }

  function statCard(label, value, dir, delta, icon){
    return `
      <div class="card stat-card">
        <div class="stat-label">${label} <span class="stat-icon">${icon}</span></div>
        <div class="stat-value">${value}</div>
        <div class="stat-delta ${dir}">${delta}</div>
      </div>
    `;
  }

  function iconClock(){ return '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l2.6 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'; }
  function iconCheck(){ return '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.5"/><path d="M7 10.2l2 2 4-4.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function iconStar(){ return '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.3 5.2 5.6.6-4.2 3.8 1.2 5.6L10 14.2 5.1 17.2l1.2-5.6-4.2-3.8 5.6-.6L10 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'; }
  function iconCoin(){ return '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.5v7M8 8.3h2.8a1.4 1.4 0 010 2.8H9M8 11.1h2.6a1.5 1.5 0 010 3H8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'; }

  function renderAccountSection(section, user){
    const pageBody = document.querySelector('.page-body');
    if (section === 'wallet') {
      const completed = SCStore.getMine().filter(request => request.status === 'completed');
      const rewards = completed.reduce((total, request) => total + request.reward, 0);
      const pendingRewards = SCStore.getMine().filter(request => ['accepted', 'payment_sent', 'verification'].includes(request.status)).reduce((total, request) => total + request.reward, 0);
      pageBody.innerHTML = `
        <div class="wallet-header page-title-row"><div><h1>Wallet</h1><div class="sub">Your rewards, deposits, and transaction activity in one place.</div></div><div class="title-actions"><a href="/browse-requests.html" class="btn btn-secondary">Earn rewards</a><a href="/create-request.html" class="btn btn-primary">+ New request</a></div></div>
        <div class="wallet-balance-card">
          <div><div class="wallet-eyebrow">Available balance</div><div class="wallet-balance">${SC.fmtMoney(rewards)}</div><div class="wallet-balance-note">Ready from completed requests</div></div>
          <div class="wallet-balance-side"><span class="wallet-status-dot"></span><span>Wallet active</span><div class="wallet-balance-mark">$</div></div>
        </div>
        <div class="wallet-metrics">
          <div class="card wallet-metric"><span class="wallet-metric-label">Total earned</span><strong>${SC.fmtMoney(rewards)}</strong><span class="wallet-metric-meta">Completed rewards</span></div>
          <div class="card wallet-metric"><span class="wallet-metric-label">Pending rewards</span><strong>${SC.fmtMoney(pendingRewards)}</strong><span class="wallet-metric-meta">Awaiting completion</span></div>
          <div class="card wallet-metric"><span class="wallet-metric-label">Completed requests</span><strong>${completed.length}</strong><span class="wallet-metric-meta">All time</span></div>
        </div>
        <div class="card wallet-activity-card"><div class="panel-head"><div><h3>Wallet activity</h3><div class="wallet-panel-sub">Recent completed reward deposits</div></div><span class="pill-tag">${completed.length} completed</span></div>
          ${completed.length ? `<div class="wallet-ledger">${completed.slice(0,8).map(request => `<div class="wallet-ledger-row"><div class="wallet-ledger-icon">${SC.methodIcon(request.method)}</div><div class="req-main"><div class="req-title">Reward from ${request.id}</div><div class="req-meta">${SC.methodMeta(request.method).label} · ${SC.timeAgo(request.createdAt)}</div></div><div class="wallet-ledger-amount"><strong>+${SC.fmtMoney(request.reward)}</strong><span>Deposited</span></div></div>`).join('')}</div>` : '<div class="empty-state wallet-empty"><h3>No wallet activity yet</h3><p>Complete a request to receive rewards in your wallet.</p><a href="/browse-requests.html" class="btn btn-secondary btn-sm">Browse requests</a></div>'}
        </div>`;
      return;
    }

    pageBody.innerHTML = `
      <div class="page-title-row"><div><h1>Settings</h1><div class="sub">Manage your account preferences.</div></div></div>
      <div class="card" style="max-width:720px;"><div class="panel-head"><h3>Profile</h3></div>
        <div class="form-row-split"><div class="field"><label for="settingsName">Full name</label><input class="input" id="settingsName" value="${user.name}"></div><div class="field"><label for="settingsEmail">Email address</label><input class="input" id="settingsEmail" type="email" value="${user.email}"></div></div>
        <div class="divider"></div><label class="checkbox-row"><input type="checkbox" id="settingsAlerts" checked> Email notifications for request updates</label>
        <label class="checkbox-row"><input type="checkbox" id="settingsOffers" checked> Notifications for matching requests</label>
        <button class="btn btn-primary" id="saveSettings" style="margin-top:18px;">Save settings</button>
      </div>`;
    document.getElementById('saveSettings').addEventListener('click', () => {
      const name = document.getElementById('settingsName').value.trim();
      const email = document.getElementById('settingsEmail').value.trim();
      if (!name || !email) return SC.toast('Enter your name and email.', 'error');
      SCStore.setUser({ name, email });
      document.getElementById('sidebarUserName').textContent = name;
      document.getElementById('sidebarAvatar').textContent = SC.initials(name);
      SC.toast('Settings saved.', 'success');
    });
  }
});

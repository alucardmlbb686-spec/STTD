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
    SC.toast('Signed out. Redirecting to home…');
    setTimeout(() => window.location.href = '/', 700);
  });

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
});

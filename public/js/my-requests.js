document.addEventListener('partials:loaded', () => {
  const user = SCStore.getUser();
  document.getElementById('sidebarUserName').textContent = user.name;
  document.getElementById('sidebarAvatar').textContent = SC.initials(user.name);
  document.getElementById('userChipLogout')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/'; });

  const tableBody = document.getElementById('myTableBody');
  let activeTab = 'all';
  let pendingCancelId = null;

  setTimeout(render, 500);

  document.getElementById('tabsRow').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    SC.qsa('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });

  function render(){
    const all = SCStore.getMine().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    document.getElementById('cAll').textContent = all.length;
    document.getElementById('cOpen').textContent = all.filter(r => r.status === 'open' || r.status === 'pending').length;
    document.getElementById('cAccepted').textContent = all.filter(r => r.status === 'accepted').length;
    document.getElementById('cCompleted').textContent = all.filter(r => r.status === 'completed').length;
    document.getElementById('cCancelled').textContent = all.filter(r => r.status === 'cancelled').length;

    let data = all;
    if (activeTab === 'open') data = all.filter(r => r.status === 'open' || r.status === 'pending');
    else if (activeTab !== 'all') data = all.filter(r => r.status === activeTab);

    if (!data.length){
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:56px 0; color:var(--text-3);">
        No requests in this view yet. <a href="/create-request.html" style="color:var(--star-400); font-weight:600;">Create one →</a></td></tr>`;
      return;
    }

    tableBody.innerHTML = data.map(r => {
      const meta = SC.methodMeta(r.method);
      return `
        <tr>
          <td class="cell-primary">${r.id}</td>
          <td>${meta.label}</td>
          <td class="cell-muted">${r.recipient}</td>
          <td class="mono">${SC.fmtMoney(r.amount)}</td>
          <td class="mono text-green">+${SC.fmtMoney(r.reward)}</td>
          <td>${SC.statusBadge(r.status)}</td>
          <td class="cell-muted">${SC.timeAgo(r.createdAt)}</td>
          <td><div class="table-actions"><button class="icon-btn view-btn" data-id="${r.id}" aria-label="View details">
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="9" r="2.3" stroke="currentColor" stroke-width="1.4"/></svg>
          </button></div></td>
        </tr>
      `;
    }).join('');

    SC.qsa('.view-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
  }

  const detailModal = document.getElementById('detailModal');
  function openDetail(id){
    const r = SCStore.getAll().find(x => x.id === id);
    if (!r) return;
    pendingCancelId = id;
    document.getElementById('detailId').textContent = r.id;
    document.getElementById('detailBadge').innerHTML = SC.statusBadge(r.status);
    document.getElementById('detailKv').innerHTML = `
      <div class="kv-row"><span class="k">Method</span><span class="v">${SC.methodMeta(r.method).label}</span></div>
      <div class="kv-row"><span class="k">Recipient</span><span class="v">${r.recipient}</span></div>
      <div class="kv-row"><span class="k">Amount</span><span class="v">${SC.fmtMoney(r.amount)}</span></div>
      <div class="kv-row"><span class="k">Reward</span><span class="v">${SC.fmtMoney(r.reward)}</span></div>
      <div class="kv-row"><span class="k">Total funded</span><span class="v">${SC.fmtMoney(r.total)}</span></div>
      <div class="kv-row"><span class="k">Posted</span><span class="v">${SC.timeAgo(r.createdAt)}</span></div>
      <div class="kv-row"><span class="k">Note</span><span class="v" style="max-width:220px; text-align:right;">${r.note || '—'}</span></div>
    `;
    const cancelBtn = document.getElementById('detailCancelReq');
    cancelBtn.style.display = (r.status === 'open' || r.status === 'pending') ? 'inline-flex' : 'none';
    detailModal.classList.add('show');
  }

  document.getElementById('detailClose').addEventListener('click', () => detailModal.classList.remove('show'));
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.classList.remove('show'); });

  document.getElementById('detailCancelReq').addEventListener('click', function(){
    SC.setLoading(this, true);
    setTimeout(() => {
      SCStore.updateStatus(pendingCancelId, 'cancelled');
      SC.setLoading(this, false);
      detailModal.classList.remove('show');
      SC.toast('Request cancelled.', 'success');
      render();
    }, 700);
  });
});

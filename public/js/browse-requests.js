document.addEventListener('partials:loaded', () => {
  const user = SCStore.getUser();
  document.getElementById('sidebarUserName').textContent = user.name;
  document.getElementById('sidebarAvatar').textContent = SC.initials(user.name);
  document.getElementById('userChipLogout')?.addEventListener('click', (e) => { e.preventDefault(); SCStore.clearUser(); window.location.href = '/'; });

  const methodFilter = document.getElementById('methodFilter');
  methodFilter.innerHTML += SC.PAYMENT_METHODS.map(m => `<option value="${m.id}">${m.label}</option>`).join('');

  const cardsView = document.getElementById('cardsView');
  const tableBody = document.getElementById('tableBody');
  const resultCount = document.getElementById('resultCount');
  const pagination = document.getElementById('pagination');
  const PAGE_SIZE = 9;
  let currentPage = 1;
  let currentData = [];

  cardsView.innerHTML = Array.from({length:6}).map(() => `
    <div class="card"><div class="skeleton" style="height:34px;width:34px;border-radius:9px;margin-bottom:14px;"></div>
    <div class="skeleton" style="height:12px;width:70%;margin-bottom:10px;"></div>
    <div class="skeleton" style="height:12px;width:40%;"></div></div>
  `).join('');

  setTimeout(() => { init(); }, 500);

  async function init(){
    document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; refresh(); });
    methodFilter.addEventListener('change', () => { currentPage = 1; refresh(); });
    document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; refresh(); });
    document.getElementById('sortFilter').addEventListener('change', refresh);

    const cardsBtn = document.getElementById('viewCards');
    const tableBtn = document.getElementById('viewTable');
    cardsBtn.addEventListener('click', () => setView('cards'));
    tableBtn.addEventListener('click', () => setView('table'));

    function setView(mode){
      cardsBtn.classList.toggle('active', mode === 'cards');
      tableBtn.classList.toggle('active', mode === 'table');
      document.getElementById('cardsView').style.display = mode === 'cards' ? 'grid' : 'none';
      document.getElementById('tableView').style.display = mode === 'table' ? 'block' : 'none';
    }

    await refresh();
    window.setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  }

  async function getFiltered(){
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const method = methodFilter.value;
    const status = document.getElementById('statusFilter').value;
    const sort = document.getElementById('sortFilter').value;

    let data = await SCStore.getAll();
    if (q) data = data.filter(r => r.id.toLowerCase().includes(q) || r.requester.toLowerCase().includes(q));
    if (method) data = data.filter(r => r.method === method);
    if (status) data = data.filter(r => r.status === status);
    else data = data.filter(r => r.status === 'open' && r.depositStatus === 'confirmed');

    if (sort === 'reward') data.sort((a,b) => b.reward - a.reward);
    else if (sort === 'amount') data.sort((a,b) => b.amount - a.amount);
    else data.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

    return data;
  }

  async function refresh(){
    currentData = getFiltered();
    currentData = await currentData;
    resultCount.textContent = currentData.length;
    renderPage();
  }

  function renderPage(){
    const totalPages = Math.max(1, Math.ceil(currentData.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const pageItems = currentData.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

    if (!pageItems.length){
      cardsView.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M21 21l-4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <h3>No requests match your filters</h3><p>Try widening your search or clearing a filter.</p></div>`;
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 48px 0; color: var(--text-3);">No requests match your filters.</td></tr>`;
    } else {
      cardsView.innerHTML = pageItems.map(cardHtml).join('');
      tableBody.innerHTML = pageItems.map(rowHtml).join('');
    }

    renderPagination(totalPages);
    bindAcceptButtons();
  }

  function renderPagination(totalPages){
    if (totalPages <= 1){ pagination.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= totalPages; i++){
      html += `<button class="${i === currentPage ? 'active' : ''}" data-p="${i}">${i}</button>`;
    }
    pagination.innerHTML = html;
    SC.qsa('button', pagination).forEach(b => b.addEventListener('click', () => {
      currentPage = parseInt(b.dataset.p, 10);
      renderPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  }

  function cardHtml(r){
    const meta = SC.methodMeta(r.method);
    const canAccept = r.status === 'open' && r.depositStatus === 'confirmed';
    const isFulfiller = r.fulfiller === SCStore.getUser().name;
    return `
      <div class="card card-hover request-card">
        <div class="rc-top">
          <div class="rc-method">
            <div class="m-icon-sm">${SC.methodIcon(r.method)}</div>
            <div><div class="m-label">${meta.label}</div><div class="m-sub">${meta.sub}</div></div>
          </div>
          ${SC.statusBadge(r.status)}
        </div>
        <div class="request-card-title">Send ${SC.fmtMoney(r.amount)} via ${meta.label}</div>
        <div class="request-card-recipient">Recipient: <span>${r.recipientName || 'Recipient'}</span></div>
        <div class="request-card-recipient">Reason: <span>${r.reason || 'Payment request'}</span></div>
        <div class="request-card-recipient">Due: <span>${r.dueAt ? new Date(r.dueAt).toLocaleString() : 'Not specified'}</span></div>
        <div class="request-card-recipient">Requester: <span>${r.requester} · ${r.completedRequests || 0} completed</span></div>
        <div class="rc-amounts">
          <div class="rc-amt-block reward"><div class="a-label">Earn</div><div class="a-value">${SC.fmtMoney(r.reward)} reward</div></div>
        </div>
        <div class="rc-foot">
          <div><div class="rc-id">${r.id}</div><div class="cell-muted">${r.requester} · ${SC.timeAgo(r.createdAt)}</div></div>
          <button class="btn ${canAccept ? 'btn-primary' : 'btn-secondary'} btn-sm ${isFulfiller && r.status === 'accepted' ? 'proof-btn' : 'accept-btn'}" data-id="${r.id}" ${canAccept || (isFulfiller && r.status === 'accepted') ? '' : 'disabled'}>
            ${canAccept ? 'Accept Request' : isFulfiller && r.status === 'accepted' ? 'Submit proof' : statusLabel(r.status)}
          </button>
        </div>
      </div>
    `;
  }

  function rowHtml(r){
    const meta = SC.methodMeta(r.method);
    const canAccept = r.status === 'open' && r.depositStatus === 'confirmed';
    return `
      <tr>
        <td class="cell-primary">${r.id}<div class="cell-muted">${r.requester}</div></td>
        <td>${meta.label}</td>
        <td class="mono">${SC.fmtMoney(r.amount)}</td>
        <td class="mono text-green">+${SC.fmtMoney(r.reward)}</td>
        <td>${SC.statusBadge(r.status)}</td>
        <td class="cell-muted">${SC.timeAgo(r.createdAt)}</td>
        <td>
          <div class="table-actions">
            <button class="btn ${canAccept ? 'btn-primary' : 'btn-secondary'} btn-sm accept-btn" data-id="${r.id}" ${canAccept ? '' : 'disabled'}>
              ${canAccept ? 'Accept Request' : statusLabel(r.status)}
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function statusLabel(status){
    return { draft: 'Draft', awaiting_deposit: 'Awaiting Deposit', deposit_confirming: 'Deposit Confirming', open: 'Open', accepted: 'Accepted', in_progress: 'In Progress', awaiting_confirmation: 'Awaiting Confirmation', under_admin_review: 'Under Admin Review', completed: 'Completed', disputed: 'Disputed', cancelled: 'Cancelled' }[status] || 'Closed';
  }

  function maskRecipient(value){
    if (!value) return 'Hidden';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${value.slice(0, 2)}***${value.slice(value.indexOf('@'))}`;
    if (value.length <= 4) return `${value.slice(0, 1)}***`;
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  // ---- Accept flow ----
  const acceptModal = document.getElementById('acceptModal');
  let pendingId = null;

  function bindAcceptButtons(){
    SC.qsa('.proof-btn').forEach(btn => btn.addEventListener('click', () => {
      pendingId = btn.dataset.id;
      document.getElementById('proofFile').value = '';
      document.getElementById('proofDetails').value = '';
      document.getElementById('proofModal').classList.add('show');
    }));
    SC.qsa('.accept-btn').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', async () => {
        pendingId = btn.dataset.id;
        const r = (await SCStore.getAll()).find(x => x.id === pendingId);
        document.getElementById('acceptModalSub').textContent = `You're about to accept ${r.id} from ${r.requester}. You'll send funds via ${SC.methodMeta(r.method).label}.`;
        document.getElementById('acceptModalDetails').innerHTML = `
          <div class="kv-row"><span class="k">Amount to send</span><span class="v">${SC.fmtMoney(r.amount)}</span></div>
          <div class="kv-row"><span class="k">Your reward</span><span class="v text-green">+${SC.fmtMoney(r.reward)}</span></div>
          <div class="kv-row"><span class="k">Recipient</span><span class="v">Contact shared after acceptance</span></div>
          <div class="kv-row"><span class="k">Your sender identity</span><span class="v">${SCStore.getUser().name} · ${SCStore.getUser().email}</span></div>
        `;
        acceptModal.classList.add('show');
      });
    });
  }

  document.getElementById('acceptCancel').addEventListener('click', () => acceptModal.classList.remove('show'));
  acceptModal.addEventListener('click', (e) => { if (e.target === acceptModal) acceptModal.classList.remove('show'); });

  document.getElementById('acceptConfirm').addEventListener('click', async function(){
    const btn = this;
    const walletAddress = document.getElementById('fulfillerWallet').value.trim();
    if (!walletAddress){ SC.toast('Enter your payout wallet address first.', 'error'); return; }
    SC.setLoading(btn, true);
    try {
      await SCStore.update(pendingId, { status: 'accepted', walletAddress });
      acceptModal.classList.remove('show');
      SC.toast(`${pendingId} accepted — recipient will be notified.`, 'success');
      await refresh();
    } catch (error) {
      SC.toast(error.message, 'error');
    } finally {
      SC.setLoading(btn, false);
    }
  });

  const proofModal = document.getElementById('proofModal');
  document.getElementById('proofCancel').addEventListener('click', () => proofModal.classList.remove('show'));
  document.getElementById('proofSubmit').addEventListener('click', async function(){
    const file = document.getElementById('proofFile').files[0];
    const details = document.getElementById('proofDetails').value.trim();
    if (!file){ SC.toast('Choose a payment proof image first.', 'error'); return; }
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)){ SC.toast('Use a PNG, JPG, JPEG, or WEBP image up to 8 MB.', 'error'); return; }
    SC.setLoading(this, true);
    try {
      await SCStore.uploadProof(pendingId, file);
      proofModal.classList.remove('show');
      SC.toast(`${pendingId} is awaiting requester confirmation.`, 'success');
      await refresh();
    } catch (error) {
      SC.toast(error.message, 'error');
    } finally {
      SC.setLoading(this, false);
    }
  });
});

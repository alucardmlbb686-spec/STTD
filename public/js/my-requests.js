document.addEventListener('partials:loaded', () => {
  const user = SCStore.getUser();
  document.getElementById('sidebarUserName').textContent = user.name;
  document.getElementById('sidebarAvatar').textContent = SC.initials(user.name);
  document.getElementById('userChipLogout')?.addEventListener('click', (e) => { e.preventDefault(); SCStore.clearUser(); window.location.href = '/'; });

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

  async function render(){
    const all = (await SCStore.getMine()).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    document.getElementById('cAll').textContent = all.length;
    document.getElementById('cOpen').textContent = all.filter(r => ['awaiting_deposit','deposit_confirming','funded','open'].includes(r.status)).length;
    document.getElementById('cAccepted').textContent = all.filter(r => ['accepted','payment_pending','payment_proof_submitted','payment_received','confirmed','released','in_progress','awaiting_confirmation','under_admin_review'].includes(r.status)).length;
    document.getElementById('cCompleted').textContent = all.filter(r => ['payment_received', 'completed'].includes(r.status)).length;
    document.getElementById('cCancelled').textContent = all.filter(r => r.status === 'cancelled').length;

    let data = all;
    if (activeTab === 'open') data = all.filter(r => ['awaiting_deposit','deposit_confirming','funded','open'].includes(r.status));
    else if (activeTab === 'accepted') data = all.filter(r => ['accepted','payment_pending','payment_proof_submitted','payment_received','confirmed','released','in_progress','awaiting_confirmation','under_admin_review'].includes(r.status));
    else if (activeTab === 'completed') data = all.filter(r => ['payment_received', 'completed'].includes(r.status));
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
          <td><div class="table-actions">${requesterAction(r)}<button class="btn btn-secondary btn-sm chat-btn" data-id="${r.id}">Chat</button><button class="icon-btn view-btn" data-id="${r.id}" aria-label="View details">
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="9" r="2.3" stroke="currentColor" stroke-width="1.4"/></svg>
          </button></div></td>
        </tr>
      `;
    }).join('');

    SC.qsa('.view-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
    SC.qsa('.review-proof-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
    SC.qsa('.chat-btn').forEach(btn => btn.addEventListener('click', () => openChat(btn.dataset.id)));
  }

  function requesterAction(request){
    if (!request.canReviewProof && request.requesterId !== user.id) return '';
    if (request.status === 'accepted') return '<span class="cell-muted">Waiting for receiver to complete payment.</span>';
    if (request.status === 'payment_proof_submitted' && (request.canReviewProof || request.requesterId === user.id)) return `<button class="btn btn-primary btn-sm review-proof-btn" data-id="${request.id}">Review Payment Proof</button>`;
    if (request.status === 'payment_received') return '<span class="badge badge-completed">Transaction Completed</span>';
    if (['released', 'completed'].includes(request.status)) return '<span class="badge badge-completed">Transaction Completed</span>';
    if (request.status === 'disputed') return '<span class="badge badge-failed">Transaction Under Review</span>';
    return '';
  }

  const chatModal = document.getElementById('chatModal');
  let chatRequestId = null;
  let chatRefreshTimer = null;
  async function openChat(id){
    chatRequestId = id;
    document.getElementById('chatTitle').textContent = `Chat · ${id}`;
    chatModal.classList.add('show');
    await renderChat();
    clearInterval(chatRefreshTimer);
    chatRefreshTimer = setInterval(() => { if (!document.hidden && chatModal.classList.contains('show')) renderChat(); }, 5000);
  }
  async function renderChat(){
    const container = document.getElementById('chatMessages');
    try {
      const payload = await SCStore.api(`/api/requests/${chatRequestId}/chat`);
      container.innerHTML = payload.messages.length ? payload.messages.map(message => `<div style="align-self:${message.mine ? 'flex-end' : 'flex-start'}; max-width:82%;"><div style="font-size:11px;color:var(--text-3);margin-bottom:3px;">${message.mine ? 'You' : message.senderName} · ${SC.timeAgo(message.createdAt)}</div><div style="padding:10px 12px;border:1px solid var(--border-2);border-radius:10px;background:${message.mine ? 'rgba(0,255,0,.08)' : 'var(--surface-3)'};">${message.body ? `<div>${message.body}</div>` : ''}${message.attachment ? `<a href="${message.attachment.url}" target="_blank" rel="noreferrer" style="display:block;margin-top:${message.body ? '8px' : '0'};color:var(--star-400);">View screenshot: ${message.attachment.name}</a>` : ''}</div></div>`).join('') : '<div class="empty-state"><h3>No messages yet</h3><p>Start the conversation and share proof here.</p></div>';
      container.scrollTop = container.scrollHeight;
    } catch (error) { container.innerHTML = `<div class="empty-state"><p>${error.message}</p></div>`; }
  }
  function closeChat(){ clearInterval(chatRefreshTimer); chatRefreshTimer = null; chatModal.classList.remove('show'); }
  document.getElementById('chatClose').addEventListener('click', closeChat);
  chatModal.addEventListener('click', event => { if (event.target === chatModal) closeChat(); });
  document.getElementById('chatForm').addEventListener('submit', async event => {
    event.preventDefault();
    const sendButton = document.getElementById('chatSend');
    const body = document.getElementById('chatBody').value.trim();
    const file = document.getElementById('chatAttachment').files[0];
    if (!body && !file) { SC.toast('Write a message or attach an image.', 'error'); return; }
    if (file && (file.size > 8 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type))) { SC.toast('Use a PNG, JPG, JPEG, or WEBP image up to 8 MB.', 'error'); return; }
    SC.setLoading(sendButton, true);
    try {
      if (file) {
        const formData = new FormData(); formData.append('attachment', file); if (body) formData.append('body', body);
        const response = await fetch(`/api/requests/${chatRequestId}/chat/upload`, { method: 'POST', body: formData, credentials: 'same-origin' });
        const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Image upload failed');
      } else await SCStore.api(`/api/requests/${chatRequestId}/chat`, { method: 'POST', body: JSON.stringify({ body }) });
      document.getElementById('chatBody').value = ''; document.getElementById('chatAttachment').value = ''; await renderChat();
    } catch (error) { SC.toast(error.message, 'error'); }
    finally { SC.setLoading(sendButton, false); }
  });

  const detailModal = document.getElementById('detailModal');
  const disputeModal = document.getElementById('disputeModal');
  async function openDetail(id){
    const r = (await SCStore.getMine()).find(x => x.id === id);
    if (!r) return;
    pendingCancelId = id;
    document.getElementById('detailId').textContent = r.id;
    document.getElementById('detailBadge').innerHTML = SC.statusBadge(r.status);
    document.getElementById('detailKv').innerHTML = `
      <div class="kv-row"><span class="k">Method</span><span class="v">${SC.methodMeta(r.method).label}</span></div>
      <div class="kv-row"><span class="k">Recipient</span><span class="v">${r.recipient}</span></div>
      <div class="kv-row"><span class="k">Amount</span><span class="v">${SC.fmtMoney(r.amount)}</span></div>
      <div class="kv-row"><span class="k">Reward</span><span class="v">${SC.fmtMoney(r.reward)}</span></div>
      <div class="kv-row"><span class="k">Platform fee</span><span class="v">${SC.fmtMoney(r.fee || 0)}</span></div>
      <div class="kv-row"><span class="k">Total deposit</span><span class="v">${SC.fmtMoney(r.total)}</span></div>
      <div class="kv-row"><span class="k">Escrow</span><span class="v">${r.escrowAsset || 'USDT'} · ${r.depositStatus || 'pending'}</span></div>
      <div class="kv-row"><span class="k">Reason</span><span class="v">${r.reason || '—'}</span></div>
      <div class="kv-row"><span class="k">Due</span><span class="v">${r.dueAt ? new Date(r.dueAt).toLocaleString() : '—'}</span></div>
      <div class="kv-row"><span class="k">Payment proof</span><span class="v" style="max-width:220px; text-align:right;">${r.proof ? `<a href="${r.proof.url}" target="_blank" rel="noreferrer" style="color:var(--star-400);">View screenshot</a>` : 'Not submitted'}</span></div>
      <div class="kv-row"><span class="k">Transaction/reference</span><span class="v" style="max-width:220px; text-align:right;">${r.proof?.transactionReference || '—'}</span></div>
      <div class="kv-row"><span class="k">Receiver note</span><span class="v" style="max-width:220px; text-align:right;">${r.proof?.note || '—'}</span></div>
      <div class="kv-row"><span class="k">Proof submitted</span><span class="v">${r.proof?.submittedAt ? new Date(r.proof.submittedAt).toLocaleString() : '—'}</span></div>
      <div class="kv-row"><span class="k">Posted</span><span class="v">${SC.timeAgo(r.createdAt)}</span></div>
      <div class="kv-row"><span class="k">Note</span><span class="v" style="max-width:220px; text-align:right;">${r.note || '—'}</span></div>
    `;
    const cancelBtn = document.getElementById('detailCancelReq');
    cancelBtn.style.display = ['awaiting_deposit','deposit_confirming','open'].includes(r.status) ? 'inline-flex' : 'none';
    const isRequester = r.requesterId === user.id;
    document.getElementById('detailConfirmReq').style.display = isRequester && ['payment_proof_submitted','awaiting_confirmation'].includes(r.status) ? 'inline-flex' : 'none';
    document.getElementById('detailDisputeReq').style.display = isRequester && ['payment_proof_submitted','confirmed','awaiting_confirmation','payment_received','under_admin_review'].includes(r.status) ? 'inline-flex' : 'none';
    detailModal.classList.add('show');
  }

  document.getElementById('detailClose').addEventListener('click', () => detailModal.classList.remove('show'));
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.classList.remove('show'); });

  document.getElementById('detailCancelReq').addEventListener('click', async function(){
    SC.setLoading(this, true);
    try {
      await SCStore.updateStatus(pendingCancelId, 'cancelled');
      SC.setLoading(this, false);
      detailModal.classList.remove('show');
      SC.toast('Request cancelled.', 'success');
      render();
    } catch (error) { SC.setLoading(this, false); SC.toast(error.message, 'error'); }
  });

  document.getElementById('detailConfirmReq').addEventListener('click', async () => {
    if (!window.confirm('Confirm that you have received the payment from the receiver?')) return;
    const button = document.getElementById('detailConfirmReq');
    SC.setLoading(button, true);
    try {
      await SCStore.update(pendingCancelId, { status: 'payment_received' });
      button.style.display = 'none';
      document.getElementById('detailDisputeReq').style.display = 'none';
      document.getElementById('detailBadge').innerHTML = SC.statusBadge('payment_received');
      SC.toast('Payment confirmed. Waiting for admin to release the escrow funds.', 'success');
    } catch (error) {
      SC.toast(error.message, 'error');
      SC.setLoading(button, false);
      return;
    }
    detailModal.classList.remove('show');
    render();
  });
  document.getElementById('detailDisputeReq').addEventListener('click', async () => {
    document.getElementById('disputeReason').value = '';
    document.getElementById('disputeDetails').value = '';
    disputeModal.classList.add('show');
  });
  document.getElementById('disputeCancel').addEventListener('click', () => disputeModal.classList.remove('show'));
  disputeModal.addEventListener('click', event => { if (event.target === disputeModal) disputeModal.classList.remove('show'); });
  document.getElementById('disputeSubmit').addEventListener('click', async function(){
    const reason = document.getElementById('disputeReason').value.trim();
    const details = document.getElementById('disputeDetails').value.trim();
    if (!reason) { SC.toast('Enter a problem reason first.', 'error'); return; }
    SC.setLoading(this, true);
    try {
      await SCStore.update(pendingCancelId, { status: 'disputed', dispute: { reason: details ? `${reason}\n${details}` : reason } });
      disputeModal.classList.remove('show');
      detailModal.classList.remove('show');
      SC.toast('A problem has been reported. Funds are locked for review.', 'success');
      render();
    } catch (error) { SC.toast(error.message, 'error'); }
    finally { SC.setLoading(this, false); }
  });
});

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
          <td><div class="table-actions">${requesterAction(r)}<button class="icon-btn view-btn" data-id="${r.id}" aria-label="View details">
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none"><path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="9" r="2.3" stroke="currentColor" stroke-width="1.4"/></svg>
          </button></div></td>
        </tr>
      `;
    }).join('');

    SC.qsa('.view-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
    SC.qsa('.fund-btn').forEach(btn => btn.addEventListener('click', () => openFunding(btn.dataset.id)));
    SC.qsa('.review-proof-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
  }

  function requesterAction(request){
    if (request.requesterId !== user.id) return '';
    if (request.status === 'awaiting_deposit') return `<button class="btn btn-primary btn-sm fund-btn" data-id="${request.id}">Fund Request</button>`;
    if (request.status === 'accepted') return '<span class="cell-muted">Accepted · Waiting for payment</span>';
    if (request.status === 'payment_pending') return '<span class="cell-muted">Proof pending</span>';
    if (request.status === 'payment_proof_submitted' && (request.canReviewProof || request.requesterId === user.id)) return `<button class="btn btn-primary btn-sm review-proof-btn" data-id="${request.id}">Review Payment Proof</button>`;
    if (request.status === 'payment_received') return '<span class="badge badge-completed">Transaction Completed</span>';
    if (['released', 'completed'].includes(request.status)) return '<span class="badge badge-completed">Transaction Completed</span>';
    if (request.status === 'disputed') return '<span class="badge badge-failed">Transaction Under Review</span>';
    return '';
  }

  async function openFunding(id){
    const request = (await SCStore.getMine()).find(item => item.id === id);
    if (!request) return;
    const existing = document.getElementById('fundingModal');
    existing?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'fundingModal';
    modal.innerHTML = `<div class="modal" style="width:460px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;"><h3>Fund Your Request</h3><span class="badge badge-pending">Awaiting Deposit</span></div>
      <div class="kv-list"><div class="kv-row"><span class="k">Request ID</span><span class="v mono">${request.id}</span></div><div class="kv-row"><span class="k">Amount required</span><span class="v mono">${SC.fmtMoney(request.depositAmount || request.total)} ${request.escrowAsset || ''}</span></div><div class="kv-row"><span class="k">Network</span><span class="v" id="fundingNetwork">Loading...</span></div><div class="kv-row"><span class="k">Deposit address</span><span class="v mono" id="fundingAddress">Loading...</span></div></div>
      <p class="hint" style="margin:18px 0;">Only send the exact supported asset and network to this destination. Sending an unsupported asset or network may result in loss of funds.</p>
      <div class="field" id="fundingTxField" hidden><label for="fundingTxHash">Transaction ID</label><input class="input mono" id="fundingTxHash" placeholder="Paste transaction hash"></div>
      <div class="modal-actions" style="margin-top:20px;"><button class="btn btn-secondary" id="fundingClose">Cancel</button><button class="btn btn-secondary" id="fundingCopy" disabled>Copy Address</button><button class="btn btn-primary" id="fundingSubmit">Fund with Test Balance</button></div>
    </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#fundingClose').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    try {
      const response = await SCStore.api(`/api/requests/${id}/fund`, { method: 'POST', body: JSON.stringify({}) });
      const deposit = response.deposit;
      const address = deposit?.deposit_address || deposit?.depositAddress;
      modal.querySelector('#fundingNetwork').textContent = deposit?.network || 'Coinbase CDP Sandbox';
      modal.querySelector('#fundingAddress').textContent = address || deposit?.provider_account_id || 'Sandbox test balance';
      modal.querySelector('#fundingCopy').disabled = !address;
      modal.querySelector('#fundingCopy').addEventListener('click', async () => { await navigator.clipboard.writeText(address); SC.toast('Deposit address copied.', 'success'); });
      const sandbox = response.deposit?.wallet_provider === 'coinbase-cdp-sandbox' || request.escrowMode === 'sandbox';
      if (!sandbox) { modal.querySelector('#fundingTxField').hidden = false; modal.querySelector('#fundingSubmit').textContent = 'Submit Transaction'; }
      modal.querySelector('#fundingSubmit').addEventListener('click', async function(){
        const txHash = modal.querySelector('#fundingTxHash')?.value.trim();
        if (!sandbox && !txHash) { SC.toast('Enter the transaction ID first.', 'error'); return; }
        SC.setLoading(this, true);
        try { await SCStore.update(id, sandbox ? { sandboxFund: true } : { txHash }); close(); await render(); SC.toast(sandbox ? 'Funds held. Your request is now open.' : 'Deposit submitted and awaiting confirmations.', 'success'); }
        catch (error) { SC.toast(error.message, 'error'); SC.setLoading(this, false); }
      });
    } catch (error) { modal.querySelector('#fundingAddress').textContent = error.message; modal.querySelector('#fundingSubmit').disabled = true; }
  }

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

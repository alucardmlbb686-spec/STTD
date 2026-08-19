document.addEventListener('partials:loaded', () => {
  const user = SCStore.getUser();
  document.getElementById('sidebarUserName').textContent = user.name;
  document.getElementById('sidebarAvatar').textContent = SC.initials(user.name);
  document.getElementById('userChipLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/';
  });

  const grid = document.getElementById('methodGrid');
  let selectedMethod = SC.PAYMENT_METHODS[0].id;

  grid.innerHTML = SC.PAYMENT_METHODS.map(m => `
    <div class="method-option ${m.id === selectedMethod ? 'selected' : ''}" data-method="${m.id}" role="button" tabindex="0">
      ${SC.methodIcon(m.id)}
      <div class="mo-label">${m.label}</div>
    </div>
  `).join('');

  function selectMethod(id){
    selectedMethod = id;
    SC.qsa('.method-option', grid).forEach(el => el.classList.toggle('selected', el.dataset.method === id));
    updateSummary();
  }
  grid.addEventListener('click', (e) => {
    const opt = e.target.closest('.method-option');
    if (opt) selectMethod(opt.dataset.method);
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' '){
      const opt = e.target.closest('.method-option');
      if (opt){ e.preventDefault(); selectMethod(opt.dataset.method); }
    }
  });

  const amountEl = document.getElementById('amount');
  const rewardEl = document.getElementById('reward');

  function updateSummary(){
    const amount = parseFloat(amountEl.value) || 0;
    const reward = parseFloat(rewardEl.value) || 0;
    document.getElementById('sumMethod').textContent = SC.methodMeta(selectedMethod).label;
    document.getElementById('sumAmount').textContent = SC.fmtMoney(amount);
    document.getElementById('sumReward').textContent = SC.fmtMoney(reward);
    document.getElementById('sumTotal').textContent = SC.fmtMoney(amount + reward);
  }
  amountEl.addEventListener('input', () => {
    if (!rewardEl.dataset.touched){
      const suggested = Math.round((parseFloat(amountEl.value) || 0) * 0.025 * 100) / 100;
      rewardEl.value = suggested || '';
    }
    updateSummary();
  });
  rewardEl.addEventListener('input', () => { rewardEl.dataset.touched = '1'; updateSummary(); });
  updateSummary();

  function setError(fieldId, hasError){
    document.getElementById(fieldId)?.classList.toggle('has-error', hasError);
  }

  const form = document.getElementById('createForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const recipient = document.getElementById('recipient');
    let valid = true;

    if (!amountEl.value || parseFloat(amountEl.value) <= 0){ setError('fAmount', true); valid = false; } else setError('fAmount', false);
    const recipientOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.value) || /^[+\d][\d\s-]{6,}$/.test(recipient.value);
    if (!recipientOk){ setError('fRecipient', true); valid = false; } else setError('fRecipient', false);
    if (!valid) return;

    const btn = document.getElementById('createSubmit');
    SC.setLoading(btn, true);

    setTimeout(() => {
      const amount = parseFloat(amountEl.value);
      const reward = parseFloat(rewardEl.value) || 0;
      const req = {
        id: SC.uid('REQ'),
        requester: 'You',
        recipient: recipient.value,
        method: selectedMethod,
        amount,
        reward,
        total: Math.round((amount + reward) * 100) / 100,
        status: 'open',
        createdAt: new Date().toISOString(),
        note: document.getElementById('note').value || 'No additional note provided.',
        mine: true,
      };
      SCStore.add(req);
      SC.setLoading(btn, false);

      document.getElementById('successSub').textContent = `${req.id} for ${SC.fmtMoney(req.total)} is now live to the network.`;
      document.getElementById('successModal').classList.add('show');
    }, 900);
  });
});

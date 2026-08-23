/* StarCurrency API client. Persistent state belongs to the server and Postgres. */
const SCStore = (() => {
  let currentUser = null;
  let requestCache = [];

  async function api(path, options = {}){
    const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    return payload;
  }

  async function refreshSession(){
    try { currentUser = (await api('/api/auth/me')).user; }
    catch (error) { currentUser = null; }
    return currentUser;
  }

  async function getAll(options = {}){
    const payload = await api(`/api/requests${options.mine ? '?mine=1' : ''}`);
    requestCache = payload.requests;
    return requestCache;
  }

  async function getMine(){ return getAll({ mine: true }); }

  async function add(request){
    const payload = await api('/api/requests', { method: 'POST', body: JSON.stringify(request) });
    requestCache.unshift(payload.request);
    return payload.request;
  }

  async function update(id, changes){
    let payload;
    if (changes.sandboxFund) payload = await api(`/api/requests/${id}/deposit`, { method: 'POST', body: JSON.stringify({ sandbox: true }) });
    else if (changes.txHash) payload = await api(`/api/requests/${id}/deposit`, { method: 'POST', body: JSON.stringify({ txHash: changes.txHash }) });
    else if (changes.proof) payload = await api(`/api/requests/${id}/proof`, { method: 'POST', body: JSON.stringify({ details: changes.proof.details }) });
    else if (changes.status === 'accepted') payload = await api(`/api/requests/${id}/accept`, { method: 'POST', body: JSON.stringify({ walletAddress: changes.walletAddress }) });
    else if (changes.status === 'under_admin_review') payload = await api(`/api/requests/${id}/confirm-payment`, { method: 'POST' });
    else if (changes.status === 'disputed') payload = await api(`/api/requests/${id}/report-problem`, { method: 'POST', body: JSON.stringify({ reason: changes.dispute?.reason }) });
    else if (changes.status === 'cancelled') payload = await api(`/api/requests/${id}/cancel`, { method: 'POST' });
    else payload = { status: changes.status };
    const record = requestCache.find(request => request.id === id);
    if (record) Object.assign(record, changes, payload || {});
    return record;
  }

  async function updateStatus(id, status){ return update(id, { status }); }
  async function uploadProof(id, file, metadata = {}){
    const formData = new FormData();
    formData.append('proof', file);
    if (metadata.transactionReference) formData.append('transactionReference', metadata.transactionReference);
    if (metadata.note) formData.append('note', metadata.note);
    const response = await fetch(`/api/requests/${id}/payment-proof`, { method: 'POST', body: formData, credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Payment proof upload failed');
    return payload;
  }
  async function updateProfile(profile){ const payload = await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify(profile) }); currentUser = payload.user; return currentUser; }
  async function clearUser(){ await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); currentUser = null; requestCache = []; }
  function getUser(){ return currentUser || { name: '', email: '', completedRequests: 0 }; }
  function isLoggedIn(){ return Boolean(currentUser); }
  function setUser(user){ currentUser = user; }

  return { api, refreshSession, getAll, getMine, add, update, updateStatus, uploadProof, updateProfile, getUser, isLoggedIn, setUser, clearUser };
})();

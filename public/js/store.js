/* =========================================================
   StarCurrency — mock data layer
   Everything here is client-side demo data persisted to
   localStorage, standing in for a real backend/API.
   ========================================================= */

const SCStore = (() => {
  const KEY = 'starcurrency_requests_v1';
  const USER_KEY = 'starcurrency_user_v1';

  const NAMES = ['Amara Okafor','Liam Chen','Priya Nair','Sofia Rossi','Kenji Watanabe','Elena Petrova','Marcus Webb','Fatima Al-Sayed','Noah Kim','Isabella Cruz'];

  function seedRequests(){
    const methods = ['venmo','paypal','zelle','cashapp'];
    const statuses = ['open','open','open','deposit_confirming','accepted','completed','completed','disputed'];
    const list = [];
    for (let i = 0; i < 18; i++){
      const amount = Math.round((30 + Math.random() * 1470) * 100) / 100;
      const rewardPct = 0.015 + Math.random() * 0.035;
      const reward = Math.round(amount * rewardPct * 100) / 100;
      const daysAgo = Math.random() * 9;
      list.push({
        id: `REQ-${(1000 + i)}`,
        requester: NAMES[Math.floor(Math.random() * NAMES.length)],
        recipient: `recipient${i}@example.com`,
        method: methods[Math.floor(Math.random() * methods.length)],
        amount,
        reward,
        fee: Math.round(amount * 0.025 * 100) / 100,
        total: Math.round((amount + reward + amount * 0.025) * 100) / 100,
        status: statuses[i % statuses.length],
        recipientName: NAMES[Math.floor(Math.random() * NAMES.length)],
        reason: 'Need a quick payment completed through a trusted method.',
        dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        escrowAsset: 'USDT',
        depositStatus: 'confirmed',
        depositId: `DEP-${1000 + i}`,
        fulfiller: i % 5 === 4 ? 'Taylor Reed' : null,
        proof: i % 5 === 4 ? { details: 'Transaction reference submitted for review.', submittedAt: new Date().toISOString() } : null,
        reputation: 98,
        createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        note: 'Need this settled quickly, standard verification is fine.',
        mine: false,
      });
    }

    // Seed a handful of "my" requests with a spread of statuses so the
    // dashboard / my-requests pages have something meaningful to show.
    const mineStatuses = ['awaiting_deposit','open','deposit_confirming','accepted','awaiting_confirmation','completed','cancelled'];
    mineStatuses.forEach((status, i) => {
      const amount = Math.round((50 + Math.random() * 900) * 100) / 100;
      const reward = Math.round(amount * 0.025 * 100) / 100;
      const daysAgo = i * 1.4 + Math.random();
      list.unshift({
        id: `REQ-${(2000 + i)}`,
        requester: 'You',
        recipient: `contact${i}@example.com`,
        method: methods[i % methods.length],
        amount,
        reward,
        fee: Math.round(amount * 0.025 * 100) / 100,
        total: Math.round((amount + reward + amount * 0.025) * 100) / 100,
        status,
        recipientName: 'You',
        reason: 'Personal transfer request.',
        dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        escrowAsset: 'USDT',
        depositStatus: ['open','accepted','awaiting_confirmation','completed'].includes(status) ? 'confirmed' : 'pending',
        depositId: status === 'awaiting_deposit' ? null : `DEP-${2000 + i}`,
        fulfiller: ['accepted','awaiting_confirmation','completed'].includes(status) ? 'Taylor Reed' : null,
        proof: status === 'awaiting_confirmation' || status === 'completed' ? { details: 'Payment reference TXN-DEMO-1042', submittedAt: new Date().toISOString() } : null,
        reputation: 100,
        createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        note: 'Personal transfer, please confirm once sent.',
        mine: true,
      });
    });

    return list;
  }

  function load(){
    const raw = localStorage.getItem(KEY);
    if (raw){
      try{
        const records = JSON.parse(raw);
        const normalized = records.map(request => {
          const fee = Number(request.fee ?? Math.round((Number(request.amount) || 0) * 0.025 * 100) / 100);
          let status = request.status;
          if (status === 'available') status = request.depositStatus === 'confirmed' ? 'open' : 'awaiting_deposit';
          if (status === 'pending') status = request.depositStatus === 'confirmed' ? 'deposit_confirming' : 'awaiting_deposit';
          return { ...request, fee, total: request.total || Math.round((Number(request.amount) + Number(request.reward) + fee) * 100) / 100, status, depositStatus: request.depositStatus || (status === 'open' ? 'confirmed' : 'pending') };
        });
        localStorage.setItem(KEY, JSON.stringify(normalized));
        return normalized;
      }catch(e){ /* fall through to reseed */ }
    }
    const seeded = seedRequests();
    localStorage.setItem(KEY, JSON.stringify(seeded));
    return seeded;
  }

  function save(list){
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function getAll(){ return load(); }

  function getMine(){ return load().filter(r => r.mine); }

  function add(request){
    const list = load();
    list.unshift(request);
    save(list);
    return request;
  }

  function updateStatus(id, status){
    const list = load();
    const idx = list.findIndex(r => r.id === id);
    if (idx > -1){ list[idx].status = status; save(list); }
    return list[idx];
  }

  function update(id, changes){
    const list = load();
    const idx = list.findIndex(r => r.id === id);
    if (idx > -1){ list[idx] = { ...list[idx], ...changes }; save(list); return list[idx]; }
    return null;
  }

  function getUser(){
    const raw = localStorage.getItem(USER_KEY);
    if (raw){ try{ return JSON.parse(raw); }catch(e){} }
    return { name: 'Jordan Diaz', email: 'jordan@example.com' };
  }

  function isLoggedIn(){ return Boolean(localStorage.getItem(USER_KEY)); }

  function setUser(user){
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearUser(){ localStorage.removeItem(USER_KEY); }

  return { getAll, getMine, add, update, updateStatus, getUser, isLoggedIn, setUser, clearUser };
})();

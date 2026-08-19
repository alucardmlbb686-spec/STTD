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
    const methods = ['venmo','cashapp','paypal','bank','mobile','crypto'];
    const statuses = ['open','open','open','pending','accepted','completed','completed','cancelled'];
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
        total: Math.round((amount + reward) * 100) / 100,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        note: 'Need this settled quickly, standard verification is fine.',
        mine: false,
      });
    }

    // Seed a handful of "my" requests with a spread of statuses so the
    // dashboard / my-requests pages have something meaningful to show.
    const mineStatuses = ['open','open','pending','accepted','completed','completed','cancelled'];
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
        total: Math.round((amount + reward) * 100) / 100,
        status,
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
      try{ return JSON.parse(raw); }catch(e){ /* fall through to reseed */ }
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

  return { getAll, getMine, add, updateStatus, getUser, isLoggedIn, setUser, clearUser };
})();
